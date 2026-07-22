#!/usr/bin/env node
/**
 * Pre-deploy verifier for the Intellisper Fargate stack.
 *
 * Every check here exists because the corresponding mistake actually broke a deploy and cost
 * roughly an hour to discover from CloudWatch. They are cheap, local, and run in about a second,
 * so run this BEFORE `pulumi up` rather than learning the same lesson from a task that dies in
 * ECS twenty minutes later.
 *
 *   node deploy/pulumi/preflight.js
 *
 * Exit code 0 = safe to deploy. Exit code 1 = at least one blocking problem.
 */
const fs = require("fs");
const path = require("path");
const { X509Certificate } = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const problems = [];
const warnings = [];
const passes = [];

function fail(msg, fix) { problems.push({ msg, fix }); }
function warn(msg) { warnings.push(msg); }
function pass(msg) { passes.push(msg); }

function readEnvFile(file) {
    const out = {};
    if (!fs.existsSync(file)) return out;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
        if (v === "" || v === "CHANGE_ME" || v.startsWith("OBTAIN")) continue;
        out[k] = v;
    }
    return out;
}

const env = readEnvFile(path.join(ROOT, ".env.production"));
const indexTs = fs.readFileSync(path.join(__dirname, "index.ts"), "utf8");
const entrypoint = fs.readFileSync(path.join(ROOT, "docker-entrypoint.sh"), "utf8");
const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");

// ---------------------------------------------------------------------------
// 1. Port alignment. The single most destructive mismatch: if the app listens on
//    a port the ALB does not health-check, every task is killed as unhealthy no
//    matter how cleanly it boots.
// ---------------------------------------------------------------------------
const exposeMatch = dockerfile.match(/^EXPOSE\s+(\d+)/m);
const exposePort = exposeMatch ? exposeMatch[1] : null;
// Collect the port from every defaultTargetGroup block (there is one per ALB branch: the
// custom-domain path and the plain-ALB path). A nested healthCheck block means a naive
// [^}]* match stops early, so scan forward from each block header instead.
const tgPorts = [];
for (const m of indexTs.matchAll(/defaultTargetGroup:\s*\{/g)) {
    const after = indexTs.slice(m.index, m.index + 400);
    const p = after.match(/\bport:\s*(\d+)/);
    if (p) tgPorts.push(p[1]);
}
const tgPort = tgPorts.length && tgPorts.every(p => p === tgPorts[0]) ? tgPorts[0] : null;
if (tgPorts.length > 1 && tgPort === null) {
    fail(
        `ALB target groups disagree on port: ${tgPorts.join(" vs ")}.`,
        "Make every defaultTargetGroup use the same container port."
    );
}
const envPort = env.IB_PORT;

if (exposePort && tgPort && envPort) {
    if (exposePort === tgPort && tgPort === envPort) {
        pass(`port alignment: Dockerfile EXPOSE, ALB target group and IB_PORT all = ${envPort}`);
    } else {
        fail(
            `PORT MISMATCH -- Dockerfile EXPOSE=${exposePort}, ALB target group=${tgPort}, IB_PORT=${envPort}. ` +
            `The load balancer health-checks the target-group port; if the app listens elsewhere every task is killed as unhealthy.`,
            `Set IB_PORT=${tgPort} in .env.production so all three agree.`
        );
    }
} else {
    warn("could not determine all three ports (Dockerfile / target group / IB_PORT)");
}

// ---------------------------------------------------------------------------
// 2. Health check must target the API's real, public, unauthenticated route.
// ---------------------------------------------------------------------------
if (/healthCheck:\s*\{[^}]*path:\s*["']\/api\/v1\/health["']/s.test(indexTs)) {
    pass("ALB health check targets /api/v1/health");
} else if (/healthCheck:/.test(indexTs)) {
    warn("a healthCheck block exists but does not point at /api/v1/health -- confirm the path is public and backend-backed");
} else {
    warn("no explicit ALB healthCheck configured; defaults to '/', which the SPA can answer before the backend is ready");
}

// ---------------------------------------------------------------------------
// 3. Grace period for first-boot migrations.
// ---------------------------------------------------------------------------
const graceMatch = indexTs.match(/healthCheckGracePeriodSeconds:\s*(\d+)/);
if (!graceMatch) {
    fail(
        "no healthCheckGracePeriodSeconds on the Fargate service -- the ALB probes during first-boot migrations and ECS kills tasks that would have become healthy.",
        "Add healthCheckGracePeriodSeconds: 600 to the FargateService args."
    );
} else if (Number(graceMatch[1]) < 300) {
    warn(`healthCheckGracePeriodSeconds=${graceMatch[1]} may be short for a cold migration run`);
} else {
    pass(`healthCheckGracePeriodSeconds=${graceMatch[1]}`);
}

// ---------------------------------------------------------------------------
// 4. Worker/API port collision in WORKER_AND_APP mode. The worker only starts its
//    own health server when it believes it is a STANDALONE worker, and that server
//    binds IB_PORT -- the API's port.
// ---------------------------------------------------------------------------
if (/env:\s*\{\s*IB_CONTAINER_TYPE:\s*'WORKER'\s*\}/.test(entrypoint)) {
    fail(
        "docker-entrypoint.sh hardcodes IB_CONTAINER_TYPE:'WORKER' for the PM2 worker. In WORKER_AND_APP mode the worker then starts a health server on IB_PORT and races the API -> EADDRINUSE.",
        "Propagate the real type: env: { IB_CONTAINER_TYPE: '${IB_CONTAINER_TYPE}' }"
    );
} else if (/env:\s*\{\s*IB_CONTAINER_TYPE:\s*'\$\{IB_CONTAINER_TYPE\}'\s*\}/.test(entrypoint)) {
    pass("worker PM2 block propagates IB_CONTAINER_TYPE (no port race)");
}

// The heredoc that writes the PM2 config must be UNQUOTED or ${...} is emitted literally.
if (/<<\s*['"]ENDOFFILE['"]/.test(entrypoint)) {
    fail(
        "the PM2 ecosystem heredoc delimiter is quoted, so ${IB_CONTAINER_TYPE} is written literally instead of expanded.",
        "Use an unquoted delimiter: cat > /tmp/ecosystem.config.js << ENDOFFILE"
    );
} else {
    pass("PM2 ecosystem heredoc is unquoted (variables expand)");
}

// ---------------------------------------------------------------------------
// 4b. The ECR repository must not be conditional on the build running. If it is
//     declared inside the build branch, toggling skipImageBuild drops it from the
//     desired state and Pulumi tries to DELETE the repo holding the image being
//     deployed. It must also be protected against incidental destruction.
// ---------------------------------------------------------------------------
const repoDecl = indexTs.match(/new aws\.ecr\.Repository\([\s\S]{0,400}?\}\s*(?:,\s*\{[\s\S]{0,200}?\})?\s*\)/);
if (!repoDecl) {
    warn("could not locate the aws.ecr.Repository declaration to verify it is unconditional");
} else {
    const beforeRepo = indexTs.slice(0, indexTs.indexOf(repoDecl[0]));
    const insideBuildBranch = /if\s*\([^)]*!skipImageBuild[^)]*\)\s*\{[^{}]*$/s.test(beforeRepo);
    if (insideBuildBranch) {
        fail(
            "the ECR repository is declared inside the `!skipImageBuild` branch. Toggling skipImageBuild would remove it from the desired state and Pulumi would try to DELETE the repository containing the deployable image.",
            "Declare the repository outside the build branch, guarded only by deployLocalBuild."
        );
    } else if (!/protect:\s*true/.test(repoDecl[0])) {
        warn("the ECR repository is not marked `protect: true` -- it holds the deployable artifact and should not be destroyable by a config change");
    } else {
        pass("ECR repository is unconditional and protected from deletion");
    }
}

// ---------------------------------------------------------------------------
// 5. Postgres over TLS. RDS Postgres 16 ships rds.force_ssl=1, and Amazon's root
//    CA is not in Node's trust store, so BOTH the flag and the CA bundle matter.
// ---------------------------------------------------------------------------
if (/IB_POSTGRES_USE_SSL[\s\S]{0,200}?value:\s*"false"/.test(indexTs)) {
    fail(
        "Pulumi hardcodes IB_POSTGRES_USE_SSL=false. RDS Postgres 16 enforces rds.force_ssl=1 and rejects plaintext with 'no pg_hba.conf entry ... no encryption'.",
        'Use: value: dotEnv.IB_POSTGRES_USE_SSL ?? "true"'
    );
} else {
    pass("IB_POSTGRES_USE_SSL is not hardcoded to false");
}

const caPath = path.join(__dirname, "rds-ca.pem");
if (!/IB_POSTGRES_SSL_CA/.test(indexTs)) {
    fail(
        "IB_POSTGRES_SSL_CA is never set. Node does not trust Amazon's RDS root CA, so TLS fails with SELF_SIGNED_CERT_IN_CHAIN.",
        "Ship deploy/pulumi/rds-ca.pem and pass it as IB_POSTGRES_SSL_CA."
    );
} else if (!fs.existsSync(caPath)) {
    fail(
        `index.ts references the RDS CA bundle but ${caPath} is missing.`,
        "curl -o deploy/pulumi/rds-ca.pem https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem"
    );
} else {
    // Prove the bundle survives the exact escape/un-escape round trip the app performs,
    // and that every certificate in it genuinely parses.
    const raw = fs.readFileSync(caPath, "utf8").trim();
    const restored = raw.replace(/\r?\n/g, "\\n").replace(/\\n/g, "\n");
    const certs = restored.split(/(?<=-----END CERTIFICATE-----)/).map(s => s.trim()).filter(Boolean);
    try {
        certs.forEach(c => new X509Certificate(c));
        if (restored !== raw) throw new Error("round-trip altered the PEM");
        pass(`RDS CA bundle valid and round-trips exactly (${certs.length} certs)`);
    } catch (e) {
        fail(`RDS CA bundle is unusable: ${e.message}`, "Re-download the regional bundle.");
    }
}

// ---------------------------------------------------------------------------
// 6. Pulumi hardcodes that silently override .env.production. Task-definition env
//    wins over the file, so a divergence here means the file is a lie.
// ---------------------------------------------------------------------------
const hardcoded = [...indexTs.matchAll(/name:\s*["']([A-Z0-9_]+)["'],\s*\n\s*value:\s*["']([^"']*)["']/g)];
for (const [, key, val] of hardcoded) {
    if (env[key] !== undefined && env[key] !== val) {
        // IB_DB_TYPE lives in the non-Postgres branch and never executes for this stack.
        if (key === "IB_DB_TYPE") continue;
        warn(`${key}: Pulumi hardcodes "${val}" but .env.production says "${env[key]}" -- Pulumi wins. Confirm which is correct.`);
    }
}

// ---------------------------------------------------------------------------
// 7. Values that must be present and well-formed for the app to boot at all.
// ---------------------------------------------------------------------------
const required = {
    IB_JWT_SECRET: v => v.length >= 32 || "must be >= 32 chars",
    IB_ENCRYPTION_KEY: v => /^[0-9a-fA-F]{32}$/.test(v) || "must be exactly 32 hex characters",
    IB_FRONTEND_URL: v => /^https?:\/\//.test(v) || "must be an absolute URL",
    IB_POSTGRES_DATABASE: () => true,
    IB_POSTGRES_USERNAME: () => true,
    IB_POSTGRES_PASSWORD: v => !/[/@" ]/.test(v) || 'RDS forbids / @ " and space in the master password',
};
for (const [key, check] of Object.entries(required)) {
    if (env[key] === undefined) {
        fail(`${key} is missing from .env.production`, "Populate it before deploying.");
    } else {
        const r = check(env[key]);
        if (r !== true) fail(`${key} is invalid: ${r}`, "Correct the value in .env.production.");
    }
}
if (Object.keys(required).every(k => env[k] !== undefined)) pass("required env vars present and well-formed");

// ---------------------------------------------------------------------------
// 8. Enum-valued settings the server validates on startup.
// ---------------------------------------------------------------------------
const enums = {
    IB_SCIM_DEFAULT_PROJECT_ROLE: ["Admin", "Editor", "Viewer"],
    IB_EXECUTION_MODE: ["UNSANDBOXED", "SANDBOX_CODE_ONLY", "SANDBOX_PROCESS"],
    IB_CONTAINER_TYPE: ["APP", "WORKER", "WORKER_AND_APP"],
};
for (const [key, allowed] of Object.entries(enums)) {
    if (env[key] !== undefined && !allowed.includes(env[key])) {
        fail(`${key}="${env[key]}" is not one of: ${allowed.join(", ")}`, `Use one of the allowed values (they are case-sensitive).`);
    }
}

// ---------------------------------------------------------------------------
// 9. Redis TLS must match what ElastiCache actually has enabled.
// ---------------------------------------------------------------------------
if (env.IB_REDIS_USE_SSL === "true") {
    warn("IB_REDIS_USE_SSL=true -- ElastiCache only accepts TLS when TransitEncryptionEnabled is on. Verify, or Redis connections will hang.");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log("\n  Intellisper deploy preflight\n" + "  ".padEnd(32, "-"));
for (const p of passes) console.log(`  PASS  ${p}`);
for (const w of warnings) console.log(`  WARN  ${w}`);
for (const p of problems) {
    console.log(`\n  FAIL  ${p.msg}`);
    console.log(`        fix: ${p.fix}`);
}
console.log("");
if (problems.length) {
    console.log(`  ${problems.length} blocking problem(s). Fix these before running 'pulumi up'.\n`);
    process.exit(1);
}
console.log(`  All checks passed (${warnings.length} warning(s)). Safe to deploy.\n`);
