# Deploying Intellisper on AWS (ECS Fargate) — Step-by-Step

**Audience:** a junior engineer doing this for the first time.
**Goal:** get the Cloud edition running: frontend + API + worker + database + cache + storage.
**Time:** ~half a day the first time.

> **Mental model before you start.** The whole product is **one Docker image**. That image can
> behave three ways depending on ONE environment variable, `IB_CONTAINER_TYPE`:
> - `WORKER_AND_APP` → does everything (start here).
> - `APP` → only serves the website + API (takes web traffic).
> - `WORKER` → only runs the automations/flows (no web traffic).
>
> We start with **one service** (`WORKER_AND_APP`). Splitting into two later is just running the
> same image a second time with a different value of that variable — no rebuild. This guide gets you
> to the single-service setup, then shows the split at the end.

---

## Part 0 — What you are building (the shopping list)

You will create these AWS resources. Each row is a service you'll set up below.

| # | AWS service | What it is, in plain words | Why we need it |
|---|---|---|---|
| 1 | **ECR** | A private place to store your Docker image | Fargate pulls the image from here |
| 2 | **RDS PostgreSQL** | Managed database | All app data. Must have the `pgvector` extension (for memory/search) |
| 3 | **ElastiCache Redis** *(or Redis Cloud)* | Managed cache + job queue | Flows/jobs run through this |
| 4 | **S3 bucket** | File storage | User-uploaded/generated files |
| 5 | **ECS Fargate** | Runs your container without you managing servers | This is where the app actually runs |
| 6 | **Application Load Balancer (ALB)** | The public front door + HTTPS | Sends internet traffic to your container |
| 7 | **ACM** (DNS at **Namecheap**) | TLS certificate; DNS records added at Namecheap | The domain + the padlock in the browser. **Not Route 53** — the domain is on Namecheap, so all DNS records are added there |
| 8 | **Secrets Manager** | Encrypted storage for passwords/keys | Never put secrets in plain text |

> **You have two ways to create all this:**
> - **(A) Pulumi (recommended)** — the repo already has infra-as-code in `deploy/pulumi/`. It builds
>   most of the above with a couple of commands. Fewer mistakes.
> - **(B) By hand in the AWS Console** — more clicking, more learning, more chances to slip.
>
> This guide covers **Part 1–3 by hand so you understand each piece**, then shows the **Pulumi
> shortcut** in Part 8. A first-timer should read 1–7 once, then actually deploy with Pulumi.

---

## Part 1 — One-time local setup

1. Install: **AWS CLI**, **Docker**, **bun**, and **Pulumi** (only if using the shortcut).
2. Create an AWS IAM user with admin access for now (tighten later). Run `aws configure` and paste
   its keys. Confirm with `aws sts get-caller-identity` — it should print your account id.
3. Pick a region and stick to it everywhere (e.g. `us-east-1`).

---

## Part 2 — Publish the blocks (DO THIS FIRST — easy to forget)

The workers download "blocks" (the integration steps flows use) from **GitHub Packages at runtime**,
NOT from the Docker image. If a block isn't published, flows that use it break — even though the
server code is fine.

1. Make sure every changed block's version is bumped (e.g. `@intelblocks/block-ai` is at **0.5.0**).
2. Publish them: from the repo root, `bun run publish-block` (per the repo's publish flow).
3. Note two values for later env vars:
   - `IB_BLOCKS_REGISTRY_URL` = your GitHub Packages npm registry URL.
   - `GITHUB_TOKEN` = a read token so the worker can pull private block packages.

---

## Part 3 — Build and push the Docker image (ECR)

1. Create the repository:
   ```bash
   aws ecr create-repository --repository-name intellisper --region us-east-1
   ```
   Copy the `repositoryUri` it prints (looks like `<acct>.dkr.ecr.us-east-1.amazonaws.com/intellisper`).
2. Log Docker in to ECR:
   ```bash
   aws ecr get-login-password --region us-east-1 \
     | docker login --username AWS --password-stdin <acct>.dkr.ecr.us-east-1.amazonaws.com
   ```
3. Build and push (run from the repo root, where the `Dockerfile` is):
   ```bash
   docker build -t intellisper:latest .
   docker tag intellisper:latest <repositoryUri>:latest
   docker push <repositoryUri>:latest
   ```
   The build compiles the frontend, API, worker, and engine into this one image.

---

## Part 4 — The database (RDS PostgreSQL + pgvector)

1. In the RDS console, **Create database** → PostgreSQL → **db.t4g.medium** → enable **Multi-AZ**
   (failover safety) → 50 GB storage → set a master password (**save it to Secrets Manager**).
2. Put it in **private subnets**. Its security group should allow inbound `5432` ONLY from the
   Fargate security group (you'll create that in Part 6). Never open the DB to the internet.
3. **Enable `pgvector`** — this is required (memory, knowledge base, copilot all use it):
   - Connect to the DB (via a bastion or a temporary allow-rule from your IP) and run:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
4. Note the endpoint host, port (5432), db name, username, password → these become the
   `IB_POSTGRES_*` env vars, and set `IB_POSTGRES_USE_SSL=true`.

> **You do NOT run migrations by hand.** The app runs them automatically when it boots (the same
> mechanism used throughout development). Just make sure only **one** app task starts the very first
> time so two containers don't run migrations at once (covered in Part 6).

---

## Part 5 — Cache/queue (Redis) and file storage (S3)

**Redis** — pick one:
- **ElastiCache** (`cache.t4g.small`, 1 replica, in the same private subnets), OR
- **Redis Cloud** (external managed). Either way you get ONE endpoint. Set `IB_REDIS_HOST/PORT/PASSWORD`
  and `IB_REDIS_USE_SSL=true`. **Leave `IB_REDIS_SENTINEL_*` unset** — the managed service handles
  failover behind that single endpoint.

**S3:**
1. Create a private bucket, e.g. `intellisper-files-prod`.
2. Create an IAM policy that allows read/write to just that bucket; attach it to the Fargate task
   role (Part 6). These map to `IB_S3_BUCKET`, `IB_S3_REGION`, `IB_S3_ACCESS_KEY_ID`,
   `IB_S3_SECRET_ACCESS_KEY` (or use IRSA/task-role and set `IB_S3_USE_IRSA=true` to skip keys).

---

## Part 6 — Run it on Fargate (the heart of it)

1. **Secrets Manager:** store each sensitive value (`IB_JWT_SECRET`, `IB_ENCRYPTION_KEY`, DB password,
   Redis password, `IB_STRIPE_SECRET_KEY`, `IB_OPENROUTER_PROVISION_KEY`, `GITHUB_TOKEN`, etc.).
   Generate the two keys once:
   ```bash
   openssl rand -hex 32   # IB_JWT_SECRET  (MUST be identical for app and worker)
   openssl rand -hex 16   # IB_ENCRYPTION_KEY
   ```
2. **ECS cluster:** create a cluster (Networking only / Fargate).
3. **Task definition** (`intellisper-app`):
   - Container image = your ECR `:latest`.
   - Port mapping = **80** (the image listens on 80).
   - CPU/memory = 0.5 vCPU / 1 GB to start (raise later).
   - **Environment variables:** the full `IB_*` set (see Part 7). Put secrets as
     "valueFrom Secrets Manager", plain config as literal values.
   - Set **`IB_CONTAINER_TYPE=WORKER_AND_APP`** for now.
   - Give the task an **execution role** (to pull from ECR + read secrets) and a **task role**
     (S3 access).
4. **Security group** `intellisper-fargate-sg`: allow inbound `80` from the ALB's security group only.
   Then go back and allow this SG into the RDS and Redis security groups.
5. **Service:** create an ECS **Service** from the task definition:
   - Launch type Fargate, **desired count = 1** for the FIRST deploy (so migrations run once).
   - Attach it to the ALB target group (Part 7).
   - After it's healthy, you can raise desired count to 2+.

---

## Part 7 — The public front door (ALB + HTTPS + DNS)

> **DNS lives at Namecheap, not AWS Route 53.** The domain was bought on Namecheap, so you manage all
> DNS records in **Namecheap → Domain List → Manage → Advanced DNS**. This changes only the DNS
> steps below; ACM and the ALB are unaffected — ACM validates a domain no matter where its DNS is
> hosted.
>
> **Use a subdomain, e.g. `cloud.intellisper.com`.** An AWS ALB has no fixed IP (only a DNS name), so it
> must be reached by a **CNAME** record — and a CNAME cannot sit on the bare root/apex
> (`intellisper.com`). A subdomain sidesteps that entirely. (If you truly need the apex later,
> Namecheap's "ALIAS"/URL-redirect features or CloudFront can bridge it — out of scope here.)

1. **ACM:** in the AWS Certificate Manager console, **Request a public certificate** for
   `cloud.intellisper.com`. ACM shows a **CNAME name + value** to prove you own the domain. Add that
   record **in Namecheap** (Advanced DNS → Add New Record → Type `CNAME`, paste the host + target
   ACM gave you). Wait a few minutes; the certificate flips to **Issued**.
   - Namecheap tip: it appends your domain automatically, so if ACM's host is
     `_abc123.cloud.intellisper.com`, enter only `_abc123.cloud` in the Host field.
2. **ALB:** create an Application Load Balancer in **public** subnets:
   - Listener on **443** using the ACM cert → forwards to a **target group** on port **80**
     (target type = IP, for Fargate).
   - Add a listener on **80** that redirects to 443.
   - Health check path: `/api/v1/flags` (a lightweight endpoint that returns 200 when the app is up).
   - ALB security group: allow `443`/`80` from the internet.
   - Copy the ALB's **DNS name** (e.g. `intellisper-alb-123456.us-east-1.elb.amazonaws.com`).
3. **Point the domain at the ALB (in Namecheap):** Advanced DNS → Add New Record →
   Type **`CNAME`**, Host **`cloud`**, Value = the ALB DNS name from step 2, TTL Automatic.
   Give it a few minutes to propagate.
4. Set `IB_FRONTEND_URL=https://cloud.intellisper.com` in the task env. Redeploy the service so it picks
   it up.

Open `https://cloud.intellisper.com` → you should get the sign-up page. (If the browser warns about the
certificate, DNS hasn't propagated yet — wait and retry.)

---

## Part 8 — The Pulumi shortcut (do this instead of 3/6/7 once you understand them)

The repo has infra-as-code that provisions VPC, ECR (build+push), Fargate, ALB, RDS, ElastiCache, and
S3 for you.

```bash
cd deploy/pulumi
bun install
pulumi login
pulumi stack select intellisper-prod          # config is in Pulumi.intellisper-prod.yaml
# set the secrets Pulumi needs:
pulumi config set --secret dbPassword <...>
pulumi config set --secret apJwtSecret <...>
pulumi config set --secret apEncryptionKey <...>
pulumi config set usePostgres true
pulumi config set useRedis true
pulumi up                                       # review the plan, then confirm
```

After `pulumi up`, you still do the app-specific bits: enable `pgvector` (Part 4.3), fill in the
`IB_*` env for the task, and do the DNS by hand **at Namecheap** — the ACM-validation CNAME and the
`app` → ALB CNAME (Part 7). Pulumi's own DNS/Route 53 automation does **not** apply here because the
domain is hosted at Namecheap, not AWS; ignore any Route 53 record resources in the Pulumi output and
add those two records in Namecheap instead. Pulumi handles the AWS plumbing; you handle the config
and the Namecheap DNS.

---

## Part 9 — Environment variables (the ones that matter)

Full template is `.env.production` in the repo (90 keys). The **must-set** ones:

| Variable | Value / note |
|---|---|
| `IB_EDITION` | `CLOUD` |
| `IB_CONTAINER_TYPE` | `WORKER_AND_APP` (single service) |
| `IB_PORT` | `80` |
| `IB_FRONTEND_URL` | `https://cloud.intellisper.com` |
| `IB_JWT_SECRET` | 32-byte hex — **identical on app and worker** (else engine tokens fail) |
| `IB_ENCRYPTION_KEY` | 16-byte hex |
| `IB_CLOUD_AUTH_ENABLED` | `true` |
| `IB_POSTGRES_*` | host / port / database / username / password + `USE_SSL=true` |
| `IB_REDIS_*` | host / port / password + `USE_SSL=true` (Sentinel vars unset) |
| `IB_S3_*` | bucket / region / creds (or `IB_S3_USE_IRSA=true`) |
| `IB_BLOCKS_REGISTRY_URL` + `GITHUB_TOKEN` | so workers can install blocks |
| `IB_STRIPE_SECRET_KEY` + `IB_STRIPE_WEBHOOK_SECRET` + `IB_STRIPE_PLAN_PRICE_IDS` | billing |
| `IB_OPENROUTER_PROVISION_KEY` | the managed AI key powering the credit pool |
| `IB_EXECUTION_MODE` | leave default (unsandboxed) unless you need strict isolation |

---

## Part 10 — Smoke test (prove it works)

1. **Web loads:** open the domain → sign-up page appears (frontend is served by the app).
2. **Sign up + verify:** create an account; confirm it lands you in the product (this exercises DB +
   email + auth + plan seeding).
3. **Run a flow:** build a tiny flow and run it → it succeeds. This proves worker + Redis + the block
   registry are all wired.
4. **Check logs:** CloudWatch → the app log group should show "listening" and the migration lines on
   first boot, with no repeating errors.

---

## Part 11 — Later: split app and worker (when flows get heavy)

You don't rebuild anything. You run the SAME image as a second service:

1. Change the existing service's env to `IB_CONTAINER_TYPE=APP` (it now only serves web/API).
2. Create a **second** ECS service from a copy of the task definition with
   `IB_CONTAINER_TYPE=WORKER`, **no** ALB attachment (workers take no web traffic), its own CPU/mem
   and its own scaling.
3. Both use the same image, same secrets, same DB/Redis. Only `IB_CONTAINER_TYPE` differs.

Now web traffic and flow execution scale independently, and a heavy flow can't slow the API.

---

## Common first-timer mistakes (read this)

- **Forgot to publish blocks** → flows fail with "block not found". Do Part 2 first.
- **`pgvector` not enabled** → app boot/migration errors about the `vector` type. Part 4.3.
- **Different `IB_JWT_SECRET` on app vs worker** → the worker can't authenticate to the API; flows
  silently don't run. Use the SAME value.
- **DB/Redis security group doesn't allow the Fargate SG** → the app hangs on boot ("can't connect").
- **Two app tasks on the very first deploy** → racing migrations. Start at desired count 1, then scale.
- **Health check path wrong** → the ALB kills healthy tasks in a loop. Use `/api/v1/flags`.
- **Namecheap: typed the full host into the record** → Namecheap auto-appends your domain, so entering
  `cloud.intellisper.com` in the Host field creates `cloud.intellisper.com.intellisper.com`. Enter just the
  left part (`cloud`, or `_abc123.cloud` for the ACM record).
- **Tried to point the bare root domain at the ALB** → a CNAME can't live on the apex. Use a
  subdomain like `cloud.` (as this guide does).
- **ACM stuck on "Pending validation"** → the validation CNAME isn't in Namecheap yet, or has the
  wrong host. Re-check Part 7 step 1; propagation can take a few minutes.
