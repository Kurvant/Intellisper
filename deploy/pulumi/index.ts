import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import { ApplicationLoadBalancer } from "@pulumi/awsx/lb/applicationLoadBalancer";
import { registerAutoTags } from './autotag';
import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";

const stack = pulumi.getStack();
const config = new pulumi.Config();

/**
 * APP CONFIGURATION FROM .env.production
 * ---------------------------------------
 * The container needs ~90 IB_* variables; the block further down only defines the handful Pulumi
 * itself derives (DB endpoint, Redis URL, image path). Everything else — Stripe, OpenRouter, S3,
 * email, execution mode — lives in `.env.production`, which is the single source of truth an
 * operator edits. Reading it here keeps one file authoritative instead of duplicating values.
 *
 * SECRETS ARE NOT PUT IN THE TASK DEFINITION. Anything whose NAME looks credential-bearing goes
 * into ONE AWS Secrets Manager entry (a single JSON blob ≈ $0.40/mo, versus ~$0.40 per-variable if
 * split), and the container references each key via `valueFrom`. That keeps plaintext secrets out
 * of the ECS task definition, out of the AWS console, and out of Pulumi's state file. Non-sensitive
 * settings stay as ordinary environment variables so they remain readable for debugging.
 */
// Matches credential-bearing NAMES. Note `SECRETS?` — `IB_APP_WEBHOOK_SECRETS` is plural and would
// otherwise slip into the plaintext task definition. `IB_S3_ACCESS_KEY_ID` is deliberately NOT
// matched: an access-key ID is a public identifier (the paired SECRET_ACCESS_KEY is the credential),
// and `AUTH_HEADER` is a header name, not a value.
const SECRET_NAME_PATTERN = /(SECRETS?|PASSWORD|TOKEN|_KEY|API_KEY|CREDENTIALS|AUTH_VALUE)$/;

function readDotEnvProduction(): Record<string, string> {
    const envPath = path.resolve(__dirname, "../../.env.production");
    if (!fs.existsSync(envPath)) {
        pulumi.log.warn(`.env.production not found at ${envPath} — deploying with Pulumi-derived vars only.`);
        return {};
    }
    const parsed: Record<string, string> = {};
    for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line === "" || line.startsWith("#")) {
            continue;
        }
        const eq = line.indexOf("=");
        if (eq === -1) {
            continue;
        }
        const key = line.slice(0, eq).trim();
        // Strip trailing inline comments (e.g. `IB_S3_ENDPOINT= #leave empty`) and surrounding quotes.
        const value = line.slice(eq + 1).replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
        // Skip unfilled placeholders so a forgotten CHANGE_ME never reaches production as a literal.
        if (value === "" || value === "CHANGE_ME" || value.startsWith("OBTAIN")) {
            continue;
        }
        parsed[key] = value;
    }
    return parsed;
}

// The RDS regional CA bundle (rds-ca.pem, fetched from truststore.pki.rds.amazonaws.com) is a
// multi-line PEM, so it cannot live in the line-based .env.production loader above. It is public
// (a trust anchor, not a secret) and therefore ships as a plain task-definition env var, escaped
// to a single line the way postgres-connection.ts expects.
function readRdsCaBundle(): string {
    const caPath = path.resolve(__dirname, "rds-ca.pem");
    if (!fs.existsSync(caPath)) {
        const region = new pulumi.Config("aws").get("region") ?? "us-east-1";
        throw new Error(
            `RDS CA bundle missing at ${caPath}. Re-download it with:\n` +
            `  curl -o deploy/pulumi/rds-ca.pem https://truststore.pki.rds.amazonaws.com/${region}/${region}-bundle.pem`
        );
    }
    return fs.readFileSync(caPath, "utf8").trim().replace(/\r?\n/g, "\\n");
}

const dotEnv = readDotEnvProduction();
const dotEnvSecretKeys = Object.keys(dotEnv).filter((k) => SECRET_NAME_PATTERN.test(k));
const dotEnvPlainKeys = Object.keys(dotEnv).filter((k) => !SECRET_NAME_PATTERN.test(k));

const ibEncryptionKey = config.getSecret("ibEncryptionKey")?.apply(secretValue => {
    return secretValue || child_process.execSync("openssl rand -hex 16").toString().trim();
});
const ibJwtSecret = config.getSecret("ibJwtSecret")?.apply(secretValue => {
    return secretValue || child_process.execSync("openssl rand -hex 32").toString().trim();
});
const containerCpu = config.requireNumber("containerCpu");
const containerMemory = config.requireNumber("containerMemory");
const containerInstances = config.requireNumber("containerInstances");
const addIpToPostgresSecurityGroup = config.get("addIpToPostgresSecurityGroup");
const domain = config.get("domain");
const subDomain = config.get("subDomain");
const usePostgres = config.requireBoolean("usePostgres");
const useRedis = config.requireBoolean("useRedis");
const redisNodeType = config.require("redisNodeType");
const dbIsPublic = config.getBoolean("dbIsPublic");
const dbUsername = config.get("dbUsername");
const dbPassword = config.getSecret("dbPassword");
const dbInstanceClass = config.require("dbInstanceClass");

// Add tags for every resource that allows them, with the following properties.
// Useful to know who or what created the resource/service
registerAutoTags({
    "pulumi:Project": pulumi.getProject(),
    "pulumi:Stack": pulumi.getStack(),
    "Created by": config.get("author") || child_process.execSync("pulumi whoami").toString().trim().replace('\\', '/')
});

let imageName;

// `skipImageBuild` deploys the image ALREADY in ECR instead of rebuilding it. A full rebuild of
// this monorepo takes ~60 minutes and ~25GB of Docker cache, which is pure waste when the change
// is config-only (an env var, a secret, a task-definition tweak) -- nothing that is compiled into
// the image. Set it to "true" for config-only deploys, and back to "false" whenever application
// source or docker-entrypoint.sh changes, since those DO have to be baked into a new image.
const skipImageBuild = config.getBoolean("skipImageBuild") ?? false;
const deployLocalBuild = config.getBoolean("deployLocalBuild") ?? false;

// The ECR repository is declared OUTSIDE the build branch on purpose. If it were created only
// when the image is built, then flipping skipImageBuild to true would drop it from the desired
// state and Pulumi would try to DELETE the repository holding the very image we are deploying.
// (AWS refuses to delete a non-empty repository, which is the only reason that was survivable.)
// `protect` is a second, deliberate guard: this repo holds the deployable artifact, so it must
// never be destroyed as a side effect of a config toggle.
let repo: aws.ecr.Repository | undefined;
if (deployLocalBuild) {
    repo = new aws.ecr.Repository(config.require("repoName"), {
        name: config.require("repoName") // https://www.pulumi.com/docs/intro/concepts/resources/names/#autonaming
    }, { protect: true, retainOnDelete: true });
}

// Check if we're deploying a local build or direct from Docker Hub
if (deployLocalBuild && !skipImageBuild && repo) {

    const repoUrl = pulumi.interpolate`${repo.repositoryUrl}`; // Get registry info (creds and endpoint)
    const name = pulumi.interpolate`${repoUrl}:latest`;

    // Get the repository credentials we use to push the image to the repository
    const repoCreds = repo.registryId.apply(async (registryId) => {
        const credentials = await aws.ecr.getCredentials({
            registryId: registryId,
        });
        const decodedCredentials = Buffer.from(credentials.authorizationToken, "base64").toString();
        const [username, password] = decodedCredentials.split(":");
        return {
            server: credentials.proxyEndpoint,
            username,
            password
        };
    });

    // Build and publish the container image.
    const image = new docker.Image(stack, {
        build: {
            context: `../../`,
            dockerfile: `../../Dockerfile`,
            builderVersion: "BuilderBuildKit",
            args: {
                "BUILDKIT_INLINE_CACHE": "1"
            },
        },
        skipPush: pulumi.runtime.isDryRun(),
        imageName: name,
        registry: repoCreds
    });

    imageName = image.imageName;

    pulumi.log.info(`Finished pushing image to ECR`, image);
} else if (skipImageBuild && repo) {
    // Reuse the image already in ECR, referencing the same repository resource the build path
    // uses, so the repo stays in the desired state and is never proposed for deletion.
    imageName = pulumi.interpolate`${repo.repositoryUrl}:latest`;
    pulumi.log.info(`skipImageBuild=true -- reusing the existing ECR image (no rebuild).`);
} else {
    imageName = process.env.IMAGE_NAME || config.get("imageName") || "ghcr.io/kurvant/intellisper:latest";
}

const containerEnvironmentVars: awsx.types.input.ecs.TaskDefinitionKeyValuePairArgs[] = [];

// Allocate a new VPC with the default settings:
const vpc = new awsx.ec2.Vpc(`${stack}-vpc`, {
    numberOfAvailabilityZones: 2,
    natGateways: {
        strategy: "Single"
    },
    tags: {
        // For some reason, this is how you name a VPC with AWS:
        // https://github.com/pulumi/pulumi-terraform/issues/38#issue-262186406
        Name: `${stack}-vpc`
    },
    enableDnsHostnames: true,
    enableDnsSupport: true
});

const albSecGroup = new aws.ec2.SecurityGroup(`${stack}-alb-sg`, {
    name: `${stack}-alb-sg`,
    vpcId: vpc.vpcId,
    ingress: [{ // Allow only http & https traffic
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"]
    },
    {
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"]
    }],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"]
    }]
})

const fargateSecGroup = new aws.ec2.SecurityGroup(`${stack}-fargate-sg`, {
    name: `${stack}-fargate-sg`,
    vpcId: vpc.vpcId,
    ingress: [
        {
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            securityGroups: [albSecGroup.id]
        }
    ],
    egress: [ // allow all outbound traffic
        {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"]
        }
    ]
});

// Hoisted so the DB endpoint can be exported after the block — an operator needs it for
// IB_POSTGRES_HOST and for connecting once to run `CREATE EXTENSION vector`.
let postgresHostOutput: pulumi.Output<string> | undefined;

if (usePostgres) {
    const rdsSecurityGroupArgs: aws.ec2.SecurityGroupArgs = {
        name: `${stack}-db-sg`,
        vpcId: vpc.vpcId,
        ingress: [{
            protocol: "tcp",
            fromPort: 5432,
            toPort: 5432,
            securityGroups: [fargateSecGroup.id]  // The id of the Fargate security group
        }],
        egress: [ // allow all outbound traffic
            {
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                cidrBlocks: ["0.0.0.0/0"]
            }
        ]
    };

    // Optionally add the current outgoing public IP address to the CIDR block
    // so that they can connect directly to the Db during development
    if (addIpToPostgresSecurityGroup) {

        // @ts-ignore
        rdsSecurityGroupArgs.ingress.push({
            protocol: "tcp",
            fromPort: 5432,
            toPort: 5432,
            cidrBlocks: [`${addIpToPostgresSecurityGroup}/32`],
            description: `Public IP for local connection`
        });
    }

    const rdsSecurityGroup = new aws.ec2.SecurityGroup(`${stack}-db-sg`, rdsSecurityGroupArgs);

    const rdsSubnets = new aws.rds.SubnetGroup(`${stack}-db-subnet-group`, {
        name: `${stack}-db-subnet-group`,
        subnetIds: dbIsPublic ? vpc.publicSubnetIds : vpc.privateSubnetIds
    });

    const db = new aws.rds.Instance(stack, {
        allocatedStorage: 20,
        engine: "postgres",
        // 14.9 was retired by AWS ("Cannot find version 14.9 for postgres"). 16.x is current and
        // ships the pgvector extension the memory/knowledge-base features require.
        engineVersion: "16.14",
        identifier: stack, // In RDS
        dbName: "postgres", // When connected to the DB host
        instanceClass: dbInstanceClass,
        port: 5432,
        publiclyAccessible: dbIsPublic,
        skipFinalSnapshot: true,
        storageType: "gp2",
        username: dbUsername,
        password: dbPassword,
        dbSubnetGroupName: rdsSubnets.id,
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        backupRetentionPeriod: 0,
        applyImmediately: true,
        allowMajorVersionUpgrade: true,
        autoMinorVersionUpgrade: true
    }, {
        protect: dbIsPublic === false,
        deleteBeforeReplace: true
    });

    containerEnvironmentVars.push(
        {
            name: "IB_POSTGRES_DATABASE",
            value: db.dbName
        },
        {
            name: "IB_POSTGRES_HOST",
            value: (postgresHostOutput = db.address)
        },
        {
            name: "IB_POSTGRES_PORT",
            value: pulumi.interpolate`${db.port}`
        },
        {
            name: "IB_POSTGRES_USERNAME",
            value: db.username
        },
        {
            name: "IB_POSTGRES_PASSWORD",
            value: config.requireSecret("dbPassword")
        },
        {
            // RDS Postgres 16's default parameter group sets rds.force_ssl=1, so a plaintext
            // connection is rejected at auth time with:
            //   FATAL 28000: no pg_hba.conf entry for host "...", user "...", no encryption
            // Honour .env.production (which sets true) and only fall back to "true" — never
            // hardcode "false" here, or the app cannot reach the database at all.
            name: "IB_POSTGRES_USE_SSL",
            value: dotEnv.IB_POSTGRES_USE_SSL ?? "true"
        },
        {
            // RDS presents a certificate signed by Amazon's own root CA, which is NOT in Node's
            // bundled trust store — without this the TLS handshake fails with
            // SELF_SIGNED_CERT_IN_CHAIN. Ship the official regional bundle so the certificate is
            // genuinely verified (rejectUnauthorized stays on; we are not disabling validation).
            // postgres-connection.ts un-escapes "\n" back into real newlines.
            name: "IB_POSTGRES_SSL_CA",
            value: readRdsCaBundle()
        });

} else {
    containerEnvironmentVars.push(
        {
            name: "IB_DB_TYPE",
            value: "SQLITE3"
        });
}

if (useRedis) {

    const redisCluster = new aws.elasticache.Cluster(`${stack}-redis-cluster`, {
        clusterId: `${stack}-redis-cluster`,
        engine: "redis",
        engineVersion: '7.0',
        nodeType: redisNodeType,
        numCacheNodes: 1,
        parameterGroupName: "default.redis7",
        port: 6379,
        subnetGroupName: new aws.elasticache.SubnetGroup(`${stack}-redis-subnet-group`, {
            name: `${stack}-redis-subnet-group`,
            subnetIds: vpc.privateSubnetIds
        }).id,
        securityGroupIds: [
            new aws.ec2.SecurityGroup(`${stack}-redis-sg`, {
                name: `${stack}-redis-sg`,
                vpcId: vpc.vpcId,
                ingress: [{
                    protocol: "tcp",
                    fromPort: 6379, // The standard port for Redis
                    toPort: 6379,
                    securityGroups: [fargateSecGroup.id]
                }],
                egress: [{
                    protocol: "-1",
                    fromPort: 0,
                    toPort: 0,
                    cidrBlocks: ["0.0.0.0/0"]
                }]
            }).id
        ]
    });

    const redisUrl = pulumi.interpolate`${redisCluster.cacheNodes[0].address}:${redisCluster.cacheNodes[0].port}`;
    containerEnvironmentVars.push(
        {
            name: "IB_REDIS_URL",
            value: redisUrl
        });

} else {
    containerEnvironmentVars.push(
        {
            name: "IB_QUEUE_MODE",
            value: "MEMORY"
        });
}

let alb: ApplicationLoadBalancer;
// Export the URL so we can easily access it.
let frontendUrl;

if (subDomain && domain) {
    const fullDomain = `${subDomain}.${domain}`;

    // DNS for this domain is hosted at Namecheap, NOT Route 53. The original code created the
    // ACM certificate, its validation record, and the ALB alias record all in a Route 53 hosted
    // zone -- none of which exists here, so it would fail on `getZone`. Instead we consume the
    // certificate that was already requested and DNS-validated by hand, and the CNAME for
    // `cloud.intellisper.com` is maintained in Namecheap. Nothing in this stack manages DNS.
    const certificateArn = config.require("acmCertificateArn");

    // Creates an ALB associated with our custom VPC.
    alb = new awsx.lb.ApplicationLoadBalancer(`${stack}-alb`, {
        securityGroups: [albSecGroup.id],
        name: `${stack}-alb`,
        subnetIds: vpc.publicSubnetIds,
        listeners: [{
            port: 80, // port on the docker container
            protocol: "HTTP",
            defaultActions: [{
                type: "redirect",
                redirect: {
                    protocol: "HTTPS",
                    port: "443",
                    statusCode: "HTTP_301",
                },
            }]
        },
        {
            protocol: "HTTPS",
            port: 443,
            certificateArn
        }],
        defaultTargetGroup: {
            name: `${stack}-alb-tg`,
            port: 80, // port on the docker container
            protocol: "HTTP",
            // Same health check as the non-domain branch -- probe the API's real route rather
            // than "/", which the SPA can answer before the backend is ready. Keeping these two
            // branches identical is deliberate: switching to a custom domain must not silently
            // change how health is determined.
            healthCheck: {
                path: "/api/v1/health",
                matcher: "200",
                interval: 15,
                timeout: 5,
                healthyThreshold: 2,
                unhealthyThreshold: 5
            }
        }
    });

    frontendUrl = pulumi.interpolate`https://${subDomain}.${domain}`;

} else {

    // Creates an ALB associated with our custom VPC.
    alb = new awsx.lb.ApplicationLoadBalancer(`${stack}-alb`, {
        securityGroups: [albSecGroup.id],
        name: `${stack}-alb`,
        subnetIds: vpc.publicSubnetIds,
        listeners: [{
            port: 80, // exposed port from the docker file
            protocol: "HTTP"
        }],
        defaultTargetGroup: {
            name: `${stack}-alb-tg`,
            port: 80, // port on the docker container
            protocol: "HTTP",
            // Probe the API's real health route rather than "/" (which serves the SPA and can
            // answer before the backend is actually ready), and fail fast enough that a genuinely
            // broken task is replaced quickly instead of stalling the whole rollout.
            healthCheck: {
                path: "/api/v1/health",
                matcher: "200",
                interval: 15,
                timeout: 5,
                healthyThreshold: 2,
                unhealthyThreshold: 5
            }
        }
    });

    frontendUrl = pulumi.interpolate`http://${alb.loadBalancer.dnsName}`;
}

const environmentVariables = [
    ...containerEnvironmentVars,
    {
        name: "IB_ENGINE_EXECUTABLE_PATH",
        value: "dist/packages/engine/main.js"
    },
    {
        name: "IB_ENCRYPTION_KEY",
        value: ibEncryptionKey
    },
    {
        name: "IB_JWT_SECRET",
        value: ibJwtSecret
    },
    {
        name: "IB_ENVIRONMENT",
        value: "prod"
    },
    {
        name: "IB_FRONTEND_URL",
        value: frontendUrl
    },
    {
        name: "IB_TRIGGER_DEFAULT_POLL_INTERVAL",
        value: "5"
    },
    {
        // Honour .env.production, which selects SANDBOX_CODE_ONLY. UNSANDBOXED runs user code
        // with no isolation and must not be the silent default for a multi-tenant cloud deploy.
        name: "IB_EXECUTION_MODE",
        value: dotEnv.IB_EXECUTION_MODE ?? "SANDBOX_CODE_ONLY"
    },
    {
        name: "IB_REDIS_USE_SSL",
        value: "false"
    },
    {
        name: "IB_SANDBOX_RUN_TIME_SECONDS",
        value: "600"
    },
    {
        // Honour .env.production, which opts out of telemetry.
        name: "IB_TELEMETRY_ENABLED",
        value: dotEnv.IB_TELEMETRY_ENABLED ?? "true"
    },
    // NOTE: IB_TEMPLATES_SOURCE_URL is deliberately NOT set.
    //
    // It configures the COMMUNITY-MARKETPLACE loader (community-templates.service.ts), which fetches
    // templates FROM an external source. Our own GET /v1/templates is the CONSUMER of that loader —
    // pointing the source back at our own API would make the API call itself in a loop (see
    // template.controller.ts:267). The code treats an unset value as "no outbound request; the
    // community marketplace is simply empty", which is the correct, safe default. The platform's own
    // DB-seeded templates are unaffected. Only set this if you run a SEPARATE marketplace service.
];

// ── Secrets Manager ─────────────────────────────────────────────────────────────────────────────
// One secret holding every credential-bearing value as a JSON object. ECS resolves each key at task
// start via `valueFrom: <arn>:<key>::`, so the plaintext never appears in the task definition.
const appSecret = new aws.secretsmanager.Secret(`${stack}-app-secrets`, {
    name: `${stack}-app-secrets`,
    description: "Intellisper application secrets (resolved by ECS at task start, never stored in the task definition).",
    // Deleted secrets are normally quarantined for 7-30 days, which blocks recreating a stack with
    // the same name. Zero lets a teardown/redeploy cycle reuse the name immediately.
    recoveryWindowInDays: 0
});

const appSecretVersion = new aws.secretsmanager.SecretVersion(`${stack}-app-secrets-version`, {
    secretId: appSecret.id,
    secretString: pulumi
        .all([ibJwtSecret, ibEncryptionKey, dbPassword])
        .apply(([jwt, encryption, dbPass]) => {
            const payload: Record<string, string> = {};
            for (const key of dotEnvSecretKeys) {
                payload[key] = dotEnv[key];
            }
            // Pulumi-managed secrets win over anything in the file: these are the values Pulumi
            // actually provisioned the infrastructure with, so they are authoritative.
            if (jwt) payload.IB_JWT_SECRET = jwt;
            if (encryption) payload.IB_ENCRYPTION_KEY = encryption;
            if (dbPass) payload.IB_POSTGRES_PASSWORD = dbPass;
            return JSON.stringify(payload);
        })
});

// The EXECUTION role (not the task role) is what pulls secrets before the container starts, so the
// read grant belongs here. Scoped to this one secret rather than a wildcard.
const executionRole = new aws.iam.Role(`${stack}-exec-role`, {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: { Service: "ecs-tasks.amazonaws.com" },
            Action: "sts:AssumeRole"
        }]
    })
});

new aws.iam.RolePolicyAttachment(`${stack}-exec-role-ecs`, {
    role: executionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
});

new aws.iam.RolePolicy(`${stack}-exec-role-secrets`, {
    role: executionRole.id,
    policy: appSecret.arn.apply((arn) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: ["secretsmanager:GetSecretValue"],
            Resource: arn
        }]
    }))
});

// Non-sensitive settings from .env.production, merged with the Pulumi-derived ones above. Pulumi's
// values take precedence: it knows the real DB endpoint and Redis URL, the file only has placeholders.
const pulumiManagedNames = new Set(environmentVariables.map((entry) => entry.name as string));
const plainEnvFromFile = dotEnvPlainKeys
    .filter((key) => !pulumiManagedNames.has(key))
    .map((key) => ({ name: key, value: dotEnv[key] }));

const containerSecrets = pulumi.all([appSecret.arn]).apply(([arn]) => {
    const names = new Set([...dotEnvSecretKeys, "IB_JWT_SECRET", "IB_ENCRYPTION_KEY", "IB_POSTGRES_PASSWORD"]);
    return Array.from(names).map((name) => ({ name, valueFrom: `${arn}:${name}::` }));
});

const fargateService = new awsx.ecs.FargateService(`${stack}-fg`, {
    name: `${stack}-fg`,
    cluster: (new aws.ecs.Cluster(`${stack}-cluster`, {
        name: `${stack}-cluster`
    })).arn,
    networkConfiguration: {
        subnets: vpc.publicSubnetIds,
        securityGroups: [fargateSecGroup.id],
        assignPublicIp: true
    },
    desiredCount: containerInstances,
    // First boot runs the entire migration set before the API binds its port. Without a grace
    // period the ALB starts probing immediately and ECS kills a task that was going to become
    // healthy, which shows up as an opaque 20-minute "timeout waiting for tfSTABLE" instead of a
    // real error. 600s comfortably covers a cold migration run.
    healthCheckGracePeriodSeconds: 600,
    taskDefinitionArgs: {
        family: `${stack}-fg-task-definition`,
        executionRole: { roleArn: executionRole.arn },
        container: {
            name: "intellisper",
            image: imageName,
            cpu: containerCpu,
            memory: containerMemory,
            portMappings: [{
                targetGroup: alb.defaultTargetGroup,
            }],
            // Plain settings inline; credentials resolved from Secrets Manager at start.
            environment: [
                ...environmentVariables.filter((entry) => !SECRET_NAME_PATTERN.test(entry.name as string)),
                ...plainEnvFromFile
            ],
            secrets: containerSecrets
        }
    }
}, { dependsOn: [appSecretVersion] });

pulumi.log.info("Finished running Pulumi");

export const _ = {
    intellisperUrl: frontendUrl,
    // The DB endpoint an operator needs for IB_POSTGRES_HOST and for enabling pgvector.
    postgresHost: postgresHostOutput,
    // Where the credentials live. Names only — the values are never exported, so `pulumi stack
    // output` cannot become a way to read production secrets.
    appSecretArn: appSecret.arn,
    managedSecretNames: containerSecrets.apply((entries) => entries.map((entry) => entry.name))
};
