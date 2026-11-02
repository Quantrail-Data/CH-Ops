<div align="center">

# CHOps

### A ClickHouse&reg; GUI and admin tool. Self-hosting the ClickHouse&reg; database made easy.

CHOps works with clusters on bare metal, VMs, Docker, Kubernetes under an operator, cloud instances, and managed services.

[![Homepage](https://img.shields.io/badge/homepage-ch--ops.io-6366f1)](https://ch-ops.io)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](#license)

**[Homepage](https://ch-ops.io)** · **[Documentation](https://ch-ops.io/docs)** · **[Report a Bug](https://github.com/Quantrail-Data/CH-Ops/issues)**

If CHOps saves you time, please star this repository. It helps.

<img width="1920" height="1080" alt="CHOps" src="https://github.com/user-attachments/assets/391efbe8-abbe-43d0-b735-05878e0730f1" />

</div>

---

## What is CHOps?

CHOps is for the people who run ClickHouse&reg; themselves: data platform teams, DBAs, and the DevOps engineer who inherited the cluster. CHOps brings the daily work of operating ClickHouse&reg; into one browser UI. You find a slow query, stop a runaway, check replication, watch merges, or review access with a click, not a command.

ClickHouse® includes basic tools, such as the Play UI, a simple dashboard, and clickhouse-client. They are useful, but they are not enough to operate a cluster: you still write queries against the right system table, on the right node, and you have to know which table that is. CHOps brings this work into one UI, so cluster operations stop being the job of one or two specialists and the whole team can do them.

Point CHOps at your cluster and it reads everything it needs over HTTP, so you install nothing on your ClickHouse&reg; servers.

**What it does**

- Shows every query that runs right now. You sort by memory, runtime, or rows read, and you can kill queries.
- Searches query history. You find what was slow, when, and who ran it.
- Tracks merges, mutations, parts, replication lag, and the distributed DDL queue.
- Provides a SQL editor with autocomplete, tabs, cost estimates, and EXPLAIN.
- Saves queries with their parameter defaults. Tomorrow's check is one click.
- Exports results in 22 formats, such as CSV, JSON, Parquet, and ORC. Compression is optional.
- Builds charts and dashboards from your own queries. Filters drive every chart at once.
- Sends alerts when a threshold you define is crossed. Alerts go to email, Slack, Google Chat, Microsoft Teams, or PagerDuty.
- Runs BACKUP and RESTORE against S3-compatible storage. It lists what you already have.
- Manages ClickHouse&reg; users, roles, and grants on one screen.
- Reads clusters that run under a Kubernetes operator and keeps the host list current.

The [Feature Overview](#feature-overview) covers all of it in more detail.

**Why use it**

- Answers come in seconds, and you do not need to know where ClickHouse&reg; keeps the data.
- You get one place for the whole cluster, not one session per node.
- It runs as a single binary or a container that you host, so your credentials and query history stay with you.
- It is free and open source under the Apache License 2.0.
- It does not replace `clickhouse-client`. The SQL editor is there when you want to write queries yourself.

**Your ClickHouse&reg; deployment does not matter.** If CHOps can reach the HTTP endpoint, it works:

| Your ClickHouse® runs on | Connect via | Kubernetes Insights |
|---|---|---|
| Bare metal or a VM | Direct connection | no |
| Docker or Docker Compose | Direct connection | no |
| Kubernetes with the Altinity® operator (AKOC) | Kubernetes tab | yes |
| Kubernetes with the official ClickHouse® operator (OCKO) | Kubernetes tab | yes, early access |
| Kubernetes with no operator | Direct connection | no |
| ClickHouse® Cloud, Altinity.Cloud®, other managed services | Direct connection | no |

Clusters that run under a Kubernetes operator get more than a connection. You pick the installation instead of typing host names, and the host list stays correct as the cluster scales up or down. You also get ten extra screens for health, topology, storage, networking, events, logs, and more. See [ClickHouse® Running in Kubernetes](#clickhouse-running-in-kubernetes).

CHOps stores its own configuration (alerts, dashboards, users, cluster definitions, and so on) in a small SQLite file on disk. It does not touch your ClickHouse&reg; data or schema, and it changes data only when you run a query that does so.

CHOps is built on [Bun](https://bun.sh), with a React frontend and an Express backend. It compiles to a single self-contained binary with no runtime dependencies, so deploying means copying one file to a server.

---

## Feature Overview

CHOps groups its features into ten sidebar sections. Each item below is a page or a toolset. The list here is short, and the [full documentation](https://ch-ops.io/docs) covers every feature in depth.

A global page search is available everywhere. Open it from the navbar Search button, the floating bubble, or Ctrl/Cmd+K, then type a page name, a feature, a heading, or on-page text to jump straight there.

**Overview**: cluster health and a daily summary, plus a live query monitor with sortable columns, per-user memory and read-volume charts, a detail popup for any running query, and bulk kill by selection. This section also covers query analytics and the query log, tables and parts inspection, merges and mutations, replication and ingestion queues, the distributed DDL queue and read-only replicas, and Kubernetes Insights for clusters under the Altinity&reg; or the official ClickHouse&reg; operator.

**SQL Tools**: the SQL editor is a full IDE, with tabbed queries, schema-aware autocomplete, typed query parameters, and a configurable row ceiling. Every EXPLAIN type is a toggle (indexes, projections, distributed, sorting, actions, analyzer passes), so you do not have to remember the syntax. Save a query and it keeps its parameter defaults, ready to rerun. Each user has their own saved queries, which you can export and share. A cost estimate shows what a query will read before you run it. Comparison mode puts two runs side by side with their metrics. The export wizard writes results in 22 formats, with optional gzip, zstd, zip, or tar.gz compression, and it runs in the background so a large extract does not block the browser.

SQL Tools also has an interactive flame-graph query profiler, a processors profile view, a per-second query metrics timeline, Schema Studio for guided table creation, and Qurioz, an AI assistant that turns plain-English questions into ClickHouse&reg; SQL.

**Custom Dashboards**: a chart builder with 10 or more chart types, configurable grid dashboards, and a chart browser. Every chart has an HTML control toolbar (zoom, save as PNG, and full screen). Add a parameter to a chart's SQL and it becomes a dashboard filter by itself. The filter is shared with every chart that uses the same name, so one control updates them all.

**Schema Tools**: a schema visualizer, data-skipping indexes, projection management, and index management.

**Logs**: crash, error, text, and session log viewers with calendar heatmaps and filtered search.

**Monitoring**: many system charts, a DVR-style playback mode to replay historical metrics frame by frame, and a memory allocator view.

**Custom Alerts**: SQL-based alert rules with threshold evaluation and a live firing-alert marquee. A rule keeps a separate state for each node. Notification channels send to email, Slack, Google Chat, Microsoft Teams, or PagerDuty.

**DB RBAC**: ClickHouse&reg; user and role management, grant visualization, and settings-profile editing.

**Backups**: BACKUP and RESTORE to S3-compatible storage, backup discovery, and storage profile management.

**Control panel**: CHOps user management with four roles, system email settings, multi-cluster configuration, storage profiles, notification channels, trusted certificate authorities, runtime settings (App Config), application-data backup, and AI provider key management.

---

## Run CHOps

The fastest way to run CHOps is the Docker image, Docker Compose, or a prebuilt binary. You do not need Bun or a build step.

You need a ClickHouse&reg; server that you can reach over the network, along with its host name, its HTTP port (usually 8123), and its credentials. Confirm the server is reachable:

```bash
curl http://your-clickhouse-host:8123/ping
# Should print: Ok.
```

CHOps needs an encryption secret and one super-admin account. The `ENCRYPTION_SECRET` must be 32 characters or more. Make one with `openssl rand -hex 32`.

### Run with Docker

```bash
# 1. Make an encryption secret.
export ENCRYPTION_SECRET=$(openssl rand -hex 32)

# 2. Start the container.
docker run -d --name chops -p 3000:3000 \
  -e ENCRYPTION_SECRET="$ENCRYPTION_SECRET" \
  -e SUPER_ADMIN_1=admin \
  -e SUPER_ADMIN_1_PASSWORD=change-this-password \
  -e SUPER_ADMIN_1_EMAIL=you@example.com \
  -v chops-data:/app/data \
  quantrailadmin1/ch-ops:latest
```

Then open `http://localhost:3000`. Log in with the super-admin user name and password that you set.

The image is also on GitHub Container Registry: `ghcr.io/quantrail-data/ch-ops:latest`.

### Run with Docker Compose

Make a file named `docker-compose.yml` with the content below. Change the encryption secret and the admin password first.

```yaml
services:
  chops:
    image: quantrailadmin1/ch-ops:latest
    container_name: chops
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - ENCRYPTION_SECRET=replace-with-a-long-random-value
      - SUPER_ADMIN_1=admin
      - SUPER_ADMIN_1_PASSWORD=change-this-password
      - SUPER_ADMIN_1_EMAIL=you@example.com
    volumes:
      - chops-data:/app/data

volumes:
  chops-data:
```

Start it:

```bash
docker compose up -d
```

Then open `http://localhost:3000`. To stop CHOps, run `docker compose down`. Your data stays in the `chops-data` volume.

### Run a prebuilt binary

Prebuilt binaries for Linux, macOS, and Windows are on the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases). Download the file for your platform (`chops-linux-x64`, `chops-darwin-arm64`, or `chops-windows-x64.exe`). Then run it with the required variables:

```bash
chmod +x chops-linux-x64
SUPER_ADMIN_1=admin \
SUPER_ADMIN_1_PASSWORD=secret \
SUPER_ADMIN_1_EMAIL=you@example.com \
ENCRYPTION_SECRET=$(openssl rand -hex 32) \
./chops-linux-x64
```

At startup, the binary makes `data/chops.db` and `data/crypto.salt` in its working directory. Keep both files, because stored passwords need the salt file and the same `ENCRYPTION_SECRET`.

### Required configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENCRYPTION_SECRET` | Yes | Derives the key that encrypts stored passwords and keys. Use 32 characters or more. Keep it, and do not change it later, or stored ClickHouse&reg; passwords become unreadable. |
| `SUPER_ADMIN_1` | Yes | The first admin user name. |
| `SUPER_ADMIN_1_PASSWORD` | Yes | The first admin password. Change it. |
| `SUPER_ADMIN_1_EMAIL` | Yes | The first admin email. |

Everything else is optional. The docs list all variables: https://ch-ops.io/docs/getting-started/configuration

CHOps sends account emails (setup links and password reset codes) through the system email server. A super admin sets it in **Control panel > User Management > System Email**. Set `FRONTEND_LINK` to the address that users open, so that setup links point to the right place.

### Update to a new version

With Docker:

```bash
docker pull quantrailadmin1/ch-ops:latest
docker rm -f chops
# Then run the "docker run" command again.
```

With Docker Compose:

```bash
# 1. Change the image tag in docker-compose.yml.
# 2. Pull and restart:
docker compose pull
docker compose up -d
```

The `chops-data` volume keeps your settings across an update.

---

## Build from source

Build from source only if you want to change the code, or make your own image or binary.

### Before you begin

You need two things.

**1. Bun 1.4.2**, the JavaScript runtime CHOps is built on. We test CHOps with this version. Install it:

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.4.2"
```

Close and reopen your terminal. Then check the version:

```bash
bun --version
```

**2. A ClickHouse&reg; server** you can reach, as described in [Run CHOps](#run-chops).

### Install

**1. Get the code:**

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
```

**2. Install dependencies:**

```bash
bun install
```

**3. Make your configuration file.** CHOps reads its settings from a file named `.env`. Copy the example:

```bash
cp .env.example .env
```

**4. Edit `.env`.** Only four values are required to start. Set them:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=your_secure_password_here
SUPER_ADMIN_1_EMAIL=you@example.com
ENCRYPTION_SECRET=paste_a_random_string_here
```

Make the encryption secret with `openssl rand -hex 32`. It must be 32 characters or more. Keep it private and do not change it later, or stored ClickHouse&reg; passwords become unreadable.

**5. Optional: run the database migration** to make CHOps's internal SQLite tables. The server also runs it at each start.

```bash
bun run db:migrate
```

You should see "Database migration complete." The migration makes `data/chops.db`.

### Start in development

Development mode reloads on code changes:

```bash
bun run dev
```

This starts the backend API on port 3000 and the Vite frontend dev server on port 5173. Open `http://localhost:5173`.

### Start in production

```bash
bun run build
bun src/backend/server.js
```

Open `http://localhost:3000`.

### Build your own Docker image

The repository has a `Dockerfile` and a `docker-compose.yml` for a local build. The build itself does not need a `.env` file, but the repository compose reads run-time settings from `.env` through `env_file`, so make a `.env` with the four required variables first.

Build and run with Compose:

```bash
docker compose up -d --build
```

Run the same command to rebuild after you pull new code, and `docker compose down` to stop. Your data stays in the `chops-data` volume.

Or build and run by hand:

```bash
# Build the image.
docker build -t chops:latest .

# Run it (mount a volume so the data survives).
docker run -d --name chops -p 3000:3000 \
  --env-file .env \
  -v chops-data:/app/data \
  chops:latest
```

Open `http://localhost:3000`. A `VITE_*` change needs a rebuild, because the build compiles those values into the frontend. Everything else takes effect on the next restart.

### Build a standalone binary

CHOps compiles into a single executable with no runtime dependencies on the target machine.

```bash
# Build for your current platform
bun run build:binary

# Cross-compile for a specific platform
bun run build:binary:linux      # produces chops-linux-x64
bun run build:binary:mac        # produces chops-darwin-arm64
bun run build:binary:windows    # produces chops-windows-x64.exe
```

During the build, `vite build` compiles the React frontend into `dist/`, `bun run embed` writes `dist/` and `docs/` into `src/backend/embeddedAssets.js`, and `bun build --compile` bundles the backend, all dependencies, and the embedded files into one binary. Run the binary with the same variables shown in [Run a prebuilt binary](#run-a-prebuilt-binary).

---

## Logging In

Open CHOps in your browser. Sign in with the `SUPER_ADMIN_1` user name and password. You land on the Home page.

---

## Connecting to ClickHouse®

After you log in, CHOps does not yet know where your ClickHouse&reg; server is. Point it there:

1. Go to **Control panel > Cluster Management**.
2. On the **Direct connection** tab, click **New Cluster**. Type a cluster name.
3. Click **Add Node**. Fill in the node name (a unique friendly label), host or IP, port (usually 8123, the HTTP port, not the native 9000), user, and password. Check **HTTPS** if your server uses TLS.
4. Click the test button (plug icon) next to the node. On success you see the ClickHouse&reg; version and uptime.
5. Click **Create Cluster**.

The navigation bar updates at once with no re-login. You can configure up to 3 clusters, with a combined maximum of 18 nodes. Switch between them from the dropdown in the top bar.

### ClickHouse® Running in Kubernetes

If your ClickHouse&reg; runs in Kubernetes under an operator, use the **Kubernetes** tab instead of entering hosts by hand. CHOps reads the host list from the installation and keeps it current as the cluster scales.

CHOps supports both ClickHouse&reg; Kubernetes operators:

| Operator | Abbreviation | CRD group | Status |
|---|---|---|---|
| Altinity® Kubernetes Operator for ClickHouse® | AKOC | `clickhouse.altinity.com` | Supported |
| Official ClickHouse® Kubernetes Operator | OCKO | `clickhouse.com` | Early access |

OCKO support is new. The two operators describe a cluster differently, so CHOps handles each on its own terms rather than treating them as interchangeable. The Kubernetes screens look and behave the same whichever one you run.

OCKO is early access because its custom resources are at `v1alpha1`. By Kubernetes convention, that means the schema may change with no deprecation cycle. CHOps discovers the served API version instead of hardcoding it, so a version promotion needs no change, but a renamed field would.

CHOps runs outside your Kubernetes cluster and makes two separate connections: one to the Kubernetes API to read the shape of the cluster, and one to ClickHouse&reg; to run queries. The second connection needs an address that is reachable from outside the cluster, because internal Kubernetes addresses do not resolve from there. That is the step people miss.

`scripts/chops-k8s-setup.sh` makes a read-only service account for both operators and prints the three values the wizard asks for: the API address, the CA certificate, and the token. The account can read nodes and pod metrics when the cluster allows it. Add `-o <namespace>` to give read access to the operator pod and its logs in that namespace.

Full instructions:

- [Connecting a Kubernetes Cluster](docs/guide/kubernetes-connect.md) for AKOC
- [Connecting a Cluster Managed by OCKO](docs/guide/kubernetes-ocko.md)
- [The Kubernetes Page](docs/guide/kubernetes-page.md) for the ten insight screens

Kubernetes support is on by default. Set `app_setting['k8s.enabled']` to `false` to hide the tab.

Managed services such as ClickHouse&reg; Cloud and hosted Altinity.Cloud&reg; do not use this path, because they expose a database endpoint and no Kubernetes API. Add them under **Direct connection**, which gives everything except the Kubernetes screens.

### Setting Up a Dedicated ClickHouse® User
 
For production, do not connect CHOps as the ClickHouse® `default` user. Make a dedicated user and a role. Grant the role only the privileges CHOps needs.
 
Run this in your ClickHouse® client. Replace the password.
 
```sql
CREATE ROLE IF NOT EXISTS chops_admin;
 
GRANT SELECT ON *.* TO chops_admin;
GRANT SHOW ON *.* TO chops_admin;
GRANT KILL QUERY ON *.* TO chops_admin;
GRANT INTROSPECTION ON *.* TO chops_admin;
GRANT BACKUP ON *.* TO chops_admin;
GRANT ACCESS MANAGEMENT ON *.* TO chops_admin;
GRANT ALTER INDEX ON *.* TO chops_admin;
GRANT ALTER PROJECTION ON *.* TO chops_admin;
 
CREATE USER IF NOT EXISTS chops IDENTIFIED BY 'your_secure_password';
GRANT chops_admin TO chops;
SET DEFAULT ROLE ALL TO chops;
ALTER USER chops SETTINGS allow_introspection_functions = 1;
 
SHOW GRANTS FOR chops;
```

The same script ships as [`clickhouse-user-setup.sql`](clickhouse-user-setup.sql) in the project root.

---

## User Roles

CHOps has four application roles. They are separate from ClickHouse&reg;'s own users.

| Role | Capabilities |
| --- | --- |
| **Super Admin** | Full access. Can be seeded from `.env` for first-time setup or recovery, or created in the UI. Maximum of 3. |
| **Admin** | Same access as super admin but UI-created only. Cannot change or delete super admins. |
| **Editor** | All sections except user and cluster management. Can build dashboards and charts and use the SQL editor. Cannot manage alerts, backups, indexes, projections, or users. |
| **Readonly** | View-only across overview, SQL editor, dashboards, logs, monitoring, and alerts. Cannot create, edit, or delete anything. |

Role changes follow a strict order. Super admins can change admins, editors, and readonly users. Admins can change editors and readonly users. Nobody can change a super admin's role.

---

## Security

CHOps ships with several hardening measures. Here is what each does and why it matters.

**Password hashing (Argon2id)**: CHOps hashes account passwords with Argon2id before storage. Argon2id is a memory-hard algorithm and the current industry recommendation. Even with the SQLite file in hand, an attacker cannot reverse the hash. CHOps upgrades older SHA-256 hashes when each user next logs in.

**Encrypted credentials**: CHOps encrypts ClickHouse&reg; connection passwords, the system email password, notification channel secrets, storage profile keys, and AI provider keys with AES-256-GCM before it writes them to SQLite. The key comes from `ENCRYPTION_SECRET` and `data/crypto.salt`, so the database file alone is not enough to read them. At each start, CHOps encrypts any secret that is still in plain text.

**Login protection**: After 5 failed attempts for the same user name within 15 minutes, CHOps locks that account for a time. An admin can change both values in **Control panel > App Config**. Error messages stay vague ("Invalid credentials.") so an attacker cannot find valid user names.

**Session tokens**: Sessions use JWTs that expire after 2 hours by default, and an admin can change the session length in **Control panel > App Config**. CHOps makes its own signing keys, changes them every day, and stores them encrypted in its database. Each token carries a unique revocable ID. CHOps reads the account again on every request, so if you delete a user, their session ends at once, and a role change takes effect on the next request. CHOps holds revocations in memory, so a server restart clears the list.

**Disabling `.env` login**: By default, the `.env` super admin credentials work as a permanent login fallback. This is convenient for setup, but it acts as a backdoor. To close it after setup, set `DISABLE_ENV_LOGIN=true`. The `.env` credentials then seed the initial migration only.

**Password reset by an admin**: CHOps removes the old password and makes a one-time setup link that is valid for 30 minutes. The admin sees the link and can send it to the user, and if the system email is set, the user also gets the link by email. CHOps never puts a password in an email. The user can also ask for a reset code on the login page, but that needs the system email.

**HTTP security headers**: Every response carries a Content Security Policy, Strict Transport Security, clickjacking protection, and MIME-sniffing prevention.

**Request size limits**: CHOps caps SQL sent to `/api/query` and `/api/export` at 512KB, and other endpoints allow up to 2MB.

**One instance per database**: Run only one CHOps process for one database. CHOps keeps reset codes, login failure counts, rate limits, and the alert scheduler in the memory of its process. Two instances on one database give wrong limits and duplicate alerts.

**Reverse proxy**: Rate limiting is per client IP. Behind a proxy (such as the Caddy setup below), set `TRUST_PROXY` to the number of proxies in front of CHOps, or every client shares one bucket. Leave it unset when CHOps is exposed directly, so `X-Forwarded-For` cannot be spoofed.

---

## Running Tests

CHOps has an automated test suite for the backend and the frontend. The tests need no running ClickHouse&reg; server, no S3 bucket, and no external service, because they use mocks, static analysis, and a fake ClickHouse&reg; server.

```bash
# Everything (backend then frontend)
bun run test

# Backend suites only (Bun test runner)
bun run test:backend

# One backend folder
bun test tests/security

# Frontend only (Vitest)
bunx vitest run tests/frontend
```

The backend suites are in `tests/backend`, `tests/isolated`, `tests/no-mocks`, `tests/db`, `tests/net`, and `tests/security`. `bun run test:backend` runs each file in `tests/backend` in its own process (`scripts/test-each-file.mjs`), so a module mock in one file cannot change another file. The suites in `tests/security` start the real server and need `data/crypto.salt` in the repository root. Run `bun run dev:backend` one time to make it.

The frontend suites run under Vitest, not under Bun's test runner, because `vi.mock` needs Vite's transform pipeline and Bun's loader does not run it. Do not start Vitest with `bun --bun`, or the mocks do nothing.

Backend tests cover password hashing, JWT handling, AES-256-GCM encryption, rate limiting, security headers, alert scheduling, SQL formatting, the Drizzle schema, environment parsing, the four-tier RBAC system, and the role check on every API route. Frontend tests cover route definitions, chart types, the plugin architecture, heatmap color scales, tree-chart utilities, scrollbar behavior, and UI contracts.

Coverage runs are available too:

```bash
bun run test:coverage              # backend then frontend
bun run test:backend:coverage      # backend only
bun run test:frontend:coverage     # frontend only
```

Only the frontend run writes a coverage report (to `coverage/frontend`). The backend coverage script runs the same suites as `bun run test:backend`.

Most frontend tests are static analysis: they read source files as strings to verify structure, so runtime line coverage is low by design.

---

## Backing Up CHOps's Database

CHOps uses SQLite in WAL (Write-Ahead Logging) mode. Do not copy `chops.db` while the server runs, because the WAL file may hold data not yet flushed to the main file. Use the built-in command instead, which is safe while the server runs:

```bash
bun run db:backup
```

This writes two files to `data/backups/`: a database copy made with SQLite's `VACUUM INTO` (`chops-<timestamp>.db`), and a copy of the encryption salt (`chops-<timestamp>.salt`). To restore, stop the server. Replace `data/chops.db` with the database copy and delete any `-wal` and `-shm` files. Replace `data/crypto.salt` with the salt copy. Start the server with the same `ENCRYPTION_SECRET`.

---

## Deploying with Caddy and systemd

For production, run CHOps behind [Caddy](https://caddyserver.com) for automatic HTTPS, and as a systemd service for automatic startup and crash recovery.

**1.** Build CHOps (`bun run build` or `bun run build:binary:linux`).

**2.** Make `/etc/systemd/system/chops.service`:

```ini
[Unit]
Description=CHOps
After=network.target

[Service]
Type=simple
User=chops
WorkingDirectory=/opt/chops
ExecStart=/opt/chops/chops
Restart=on-failure
EnvironmentFile=/opt/chops/.env
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/chops/data

[Install]
WantedBy=multi-user.target
```

**3.** Configure Caddy at `/etc/caddy/Caddyfile`:

```
chops.example.com {
    reverse_proxy localhost:3000
}
```

**4.** Enable and start both:

```bash
sudo systemctl enable --now chops
sudo systemctl restart caddy
```

Caddy obtains and renews Let's Encrypt certificates automatically. The full guide, with security hardening, IP allowlisting, and automated backups, is at [ch-ops.io/docs](https://ch-ops.io/docs).

---

## Troubleshooting

**Cannot connect to ClickHouse&reg;**: In Control panel > Cluster Management, verify host, port, user, and password. Then test the node again. Make sure the HTTP port (8123) is open, not the native protocol port (9000).

**"Frontend not built" error**: Run `bun run build` before you start the server.

**"Invalid credentials" on login**: Recheck `.env`. The user name and password are case-sensitive.

**Backup listing shows "Unable to connect"**: Verify the S3 endpoint and credentials in Storage Profiles. The error message separates authentication, connectivity, and bucket problems.

**Empty monitoring charts**: Click "Load Charts" after you select a time range. Charts load only for the active tab. If charts fail instead of staying empty, check the grants of the `chops` user (see [Setting Up a Dedicated ClickHouse User](#setting-up-a-dedicated-clickhouse-user)).

**Read-only queries fail with "Cannot modify ... setting in readonly mode" (code 164)**: CHOps sends `readonly=1` with a result-size ceiling on read-only requests. If the ClickHouse user's own profile already pins `readonly` to 1 or 2, the two collide. Run `bun run check:readonly -- --host <host> --user <user> --password <pw>` to confirm and get the exact fix.

**DDL cards show zeros**: This is normal on single-node setups with no distributed DDL queue.

**Port already in use**: Set a different port in `.env` with `PORT=3001`.

**Binary crashes on startup**: Make sure `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `ENCRYPTION_SECRET` are set. The binary needs them, just like the dev server.

**Container starts then restarts in a loop**: Check `docker logs chops`. CHOps exits on startup if `SUPER_ADMIN_1_EMAIL` is missing or `ENCRYPTION_SECRET` is shorter than 32 characters, and the message names the value that is wrong.

**Password reset emails never arrive**: A super admin must set the email server in **Control panel > User Management > System Email**. Use **Send test email** there to check it. Without it, CHOps cannot send the reset code.

---

## Contributing

Pull requests are open. Bug reports and feature requests are always welcome.

- **Code.** Fork the repository, make your change, and open a pull request. Your first pull request asks you to sign our [Contributor License Agreement](CLA.md), a one-time step that takes a single comment. You keep the copyright, and the CLA lets us ship your work in the open core and in the commercial Pro edition.
- **Bug reports.** Open an issue with your CHOps version (from `version.json`), your ClickHouse&reg; database version, and clear steps to reproduce.
- **Feature requests.** Open an issue that describes the problem you want solved. Tell us the use case, not just the proposed solution, so we can find the best fit.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, and [SECURITY.md](SECURITY.md) to report vulnerabilities privately.

If you have read this far and like what you see, please star the repository. It helps.

---

## Acknowledgements

We use AI tools in our workflow, the way most engineering teams now do. The design, the architecture, and the hard parts (security, access control, correctness) are the work of the Quantrail team, and we own every line we ship. CHOps has an automated test suite across the backend and frontend, and we test and harden each release. It is actively maintained and built for the long run.

Found a bug or want a feature? Open an issue, and we will take a look. We want CHOps to work for your setup.

---

## Trademarks

ClickHouse® is a registered trademark of ClickHouse, Inc. Altinity® is a registered trademark of Altinity, Inc. Aiven is a trademark of Aiven Ltd. All uses of these marks in this document refer to the respective products and are used solely for identification and descriptive purposes under nominative fair use. CHOps is an independent open-source project and is not affiliated with, endorsed by, sponsored by, or otherwise associated with ClickHouse, Inc., Altinity, Inc., Aiven Ltd., or any other trademark holder mentioned. Any other product names, logos, and brands referenced are the property of their respective owners and are used for identification purposes only.

---

## License

CHOps follows an **open-core model**. The core (Community) edition is open source. Pro is commercial only.

| Edition | License | What it includes |
| --------------- | --------------------------- | ---------------- |
| **Community (core)** | **Apache License 2.0** | The core dashboard: SQL editor, query profiling, monitoring, schema tools, logs, RBAC viewing, custom dashboards, and more. |
| **Pro** | **Commercial only** | Advanced operational features on top of the core: scheduled archival to S3-compatible storage, extended alerting, audit logging, scheduled email reports, multi-cluster fleet management via sidecar agents, and priority support. |

**Community (core) uses the Apache License 2.0.** You can use, study, change, and redistribute it, also in commercial and closed-source products. Keep the license and the copyright notices. The full terms are in [`LICENSE`](LICENSE).

**Pro is commercial only.** The Pro features are not part of this repository and do not use the Apache License 2.0. We distribute them separately under a commercial license.

For Pro, visit [ch-ops.io](https://ch-ops.io) or contact Quantrail&trade; Data.

### Copyright

Copyright &copy; 2026 Quantrail&trade; Data Private Limited.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at [https://www.apache.org/licenses/LICENSE-2.0](https://www.apache.org/licenses/LICENSE-2.0).

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

---

<div align="center" >

**[ch-ops.io](https://ch-ops.io)**

Copyright &copy; 2026 Quantrail&trade; Data Private Limited.

</div>