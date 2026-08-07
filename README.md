<div align="center">

# CHOps - Beta

### Admin tool and GUI for ClickHouse® database. Self-hosting ClickHouse® database made easy.

Works with clusters on bare metal, VMs, Docker, Kubernetes under an operator,
cloud instances, and managed services.

[![Homepage](https://img.shields.io/badge/homepage-ch--ops.io-6366f1)](https://ch-ops.io)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPLv3-blue)](#license)

**[Homepage](https://ch-ops.io)** · **[Documentation](https://ch-ops.io/docs)** · **[Report a Bug](https://github.com/Quantrail-Data/CH-Ops/issues)**

If CHOps saves you time or you find it useful, please consider **starring this repository**. It genuinely helps.

<img width="1920" height="1080" alt="CHOps" src="https://github.com/user-attachments/assets/391efbe8-abbe-43d0-b735-05878e0730f1" />


</div>

---

## What is CHOps?

Built for the people who run ClickHouse® themselves: data platform teams, DBAs, and the DevOps engineer who inherited the cluster. CHOps brings the day to day work of operating ClickHouse® into one browser UI, so finding a slow query, stopping a runaway, checking replication, watching merges or reviewing who has access is a click rather than a command. Self-hosted ClickHouse® ships without any of this, which today means writing a query against the right internal table, on the right node, and knowing which table that is. Remove that requirement and cluster operations stop being the preserve of one or two specialists and become something the whole team can do.

Point it at your cluster and it reads everything it needs over HTTP. Nothing to install on your ClickHouse® servers.

**What it does**

- Shows every query running right now, sortable by memory, runtime or rows read, with kill controls
- Searches query history so you can find what was slow, when, and who ran it
- Tracks merges, mutations, parts, replication lag and the distributed DDL queue
- Provides a SQL editor with autocomplete, tabs, cost estimates and EXPLAIN
- Saves queries with their parameter defaults, so tomorrow's check is one click
- Exports results in 22 formats including CSV, JSON, Parquet and ORC, compressed if you want
- Builds charts and dashboards from your own queries, with filters that drive every chart at once
- Sends email alerts when a threshold you define is crossed
- Runs BACKUP and RESTORE against S3-compatible storage and lists what you already have
- Manages ClickHouse® users, roles and grants on one screen
- Reads clusters running under a Kubernetes operator and keeps the host list current

The [Feature Overview](#feature-overview) below covers all of it in more detail.

**Why use it**

- Answers in seconds, without needing to know where ClickHouse® keeps them
- One place for the whole cluster, not one session per node
- Runs as a single binary or a container that you host, so your credentials and query history stay with you
- Free and open source under AGPLv3
- Does not replace `clickhouse-client`, the SQL editor is there whenever you want to write it yourself

**How you deployed the cluster does not matter.** If CHOps can reach the HTTP endpoint, it works:

| Your ClickHouse® runs on | Connect via | Kubernetes Insights |
|---|---|---|
| Bare metal or a VM | Direct connection | no |
| Docker or Docker Compose | Direct connection | no |
| Kubernetes with the Altinity® operator (AKOC) | Kubernetes tab | yes |
| Kubernetes with the official ClickHouse® operator (OCKO) | Kubernetes tab | yes, early access |
| Kubernetes with no operator | Direct connection | no |
| ClickHouse® Cloud, Altinity.Cloud®, other managed services | Direct connection | no |

Clusters running under either Kubernetes operator get more than a connection. You pick the installation instead of typing host names, the list stays right as the cluster is scaled up or down, and eight extra screens open up covering pods, storage, networking and events. See [ClickHouse® Running in Kubernetes](#clickhouse-running-in-kubernetes).

CHOps stores its own configuration (alerts, dashboards, users, cluster definitions, and so on) in a small SQLite file on disk. It does not touch your ClickHouse® data or schema unless you explicitly run a query that does.

The application is built on [Bun](https://bun.sh), with a React frontend and an Express backend. It compiles to a single self-contained binary with no runtime dependencies, so deployment is a matter of copying one file to a server.


---

## Feature Overview

CHOps organizes its functionality into ten sidebar sections. Each item below is a distinct page or toolset. The [full documentation](https://ch-ops.io/docs) covers every feature in depth; this list is intentionally brief.

A global page search is available everywhere: open it from the navbar Search button, the floating bubble, or Ctrl/Cmd+K, then type a page name, feature, section heading, or on-page text to jump straight there.

**Overview**: cluster health; a live query monitor with sortable columns, per-user memory and read-volume charts, a detail popup for any running query, and bulk kill by selection; query analytics and log; tables and parts inspection; merges and mutations; distributed DDL queue; and Kubernetes Insights for clusters running under the Altinity® or the official ClickHouse® operator.

**Tools**: the SQL editor has grown into a proper IDE. It has tabbed queries, schema-aware autocomplete, typed query parameters, a configurable row ceiling, and every EXPLAIN type with its modifiers (indexes, projections, distributed, sorting, actions, analyzer passes) as toggles rather than syntax you have to remember. Save a query and it keeps its parameter defaults, ready to rerun; saved queries can be exported and shared. A cost estimate tells you what a query will read before you run it, and comparison mode puts two runs side by side with their metrics. The export wizard writes results in 22 formats across text, JSON, columnar and interchange families, with optional gzip, zstd or zip, and runs in the background so a large extract does not tie up the browser.

Also under Tools: an interactive flame-graph query profiler, a per-second query metrics timeline, Schema Studio for guided table creation, and Qurioz, an AI assistant that turns plain-English questions into ClickHouse® SQL.

**Custom Dashboards**: a chart builder with 10+ chart types, configurable grid dashboards, and a chart browser. Every chart has an HTML control toolbar (zoom, save as PNG, and in-app full screen). Add a parameter to a chart's SQL and it turns into a filter on the dashboard by itself, shared with every other chart using the same name, so one control updates them all at once.

**Indexes**: data-skipping index visualization, projection management, and secondary index creation.

**Logs**: crash, error, and text log viewers with calendar heatmaps and filtered search.

**Monitoring**: Multiple system charts, plus a DVR-style playback mode for replaying historical metrics frame by frame.

**Alerting**: SQL-based alert rules with threshold evaluation, with email notification channel, and a live firing-alert marquee.

**Access Control**: ClickHouse® user and role management, grant visualization, and settings-profile editing.

**Backups**: BACKUP and RESTORE orchestration to S3-compatible storage, backup discovery, and storage profile management.

**Administration**: CHOps user management with four roles, multi-cluster configuration, application-data backup, and AI provider key management.

---

## Before You Begin

> The quickest way to run CHOps is to download a prebuilt binary from the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases), which needs neither Bun nor a build step. See [Building a Standalone Binary](#building-a-standalone-binary). The steps below are for running from source or building your own binary.

You need two things to run CHOps.

**1. Bun - 1.3.13**, the JavaScript runtime CHOps is built on. Install it by opening your terminal (Command Prompt on Windows, Terminal on macOS or Linux) and running:

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.13"
```

Close and reopen your terminal afterward, then verify:

```bash
bun --version
```

**2. A ClickHouse® server** you can reach over the network (localhost or remote). You need its hostname, HTTP port (usually 8123), and credentials. Confirm it is reachable:

```bash
curl http://your-clickhouse-host:8123/ping
# Should print: Ok.
```

---

## Installation

**1. Get the code:**

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
```

**2. Install dependencies:**

```bash
bun install
```

**3. Create your configuration file.** CHOps reads its settings from a file named `.env`. Copy the provided example to create your own:

```bash
cp .env.example .env
```

This gives you a `.env` file that already contains every setting with comments explaining each one. You only need to change a few of them.

**4. Edit `.env`** in any text editor (for example `nano .env`). Only **four** values are required to start the app; change these:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=your_secure_password_here
SUPER_ADMIN_1_EMAIL=you@example.com
SESSION_SECRET=paste_a_random_string_here
```

- `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, and `SUPER_ADMIN_1_EMAIL` are the username, password, and email of the first login account. All three are required. Pick a strong password.
- `SESSION_SECRET` must be a long random string. Generate one with:

  ```bash
  openssl rand -hex 32
  ```

  Copy the output and paste it as the value. This secret both signs your login sessions and encrypts the ClickHouse® passwords CHOps stores, so keep it private and do not change it later, or saved credentials become unreadable.

Everything else in `.env` is **optional** and can be left as-is for now:

- **SMTP_*** settings drive alert emails and the password reset code. Leave them blank and both stay unavailable. Nothing else is affected.

**5. Run the database migration** to create CHOps's internal SQLite tables:

```bash
bun run db:migrate
```

You should see "Database migration complete." This creates `data/chops.db`. (The database file keeps its original name for backward compatibility with existing installations.)

---

## Starting the App

**Development mode** (auto-reloads on code changes):

```bash
bun run dev
```

This starts the backend API on port 3000 and the Vite frontend dev server on port 5173. Open `http://localhost:5173`.

**Production mode** (optimized, single server):

```bash
bun run build
bun src/backend/server.js
```

Open `http://localhost:3000`.

**Docker** (no Bun installation needed).

Create `.env` before you build. The image build reads it, and stops immediately
with a clear message if it is missing rather than spending several minutes on a
build that would only crash on startup:

```bash
cp .env.example .env
# then set SESSION_SECRET, SUPER_ADMIN_1, SUPER_ADMIN_1_PASSWORD and SUPER_ADMIN_1_EMAIL
```

Two separate things read that file. Vite compiles the `VITE_*` values into the
frontend bundle during the build, and the container reads everything else at run
time.

*Option A - Docker Compose (recommended).* Builds the image and runs it with a
persistent named volume:

```bash
docker compose up -d --build
```

Compose hands the whole `.env` to the container through `env_file`, so every
setting you put there reaches the app, including the `SMTP_*` values password
reset needs. Rebuild after pulling new code with the same command. Stop with
`docker compose down`; your data survives in the `chops-data` volume.

*Option B - Build and run the image by hand:*

```bash
# Build the image (needs .env in the working directory)
docker build -t chops:latest .

# Run it (mount a volume so data/chops.db persists)
docker run -d --name chops -p 3000:3000 \
  --env-file .env \
  -v chops-data:/app/data \
  chops:latest
```

Open `http://localhost:3000`. Both options keep the SQLite database in the
`chops-data` volume across restarts and image rebuilds.

The first super admin is required, not optional. `SUPER_ADMIN_1`,
`SUPER_ADMIN_1_PASSWORD` and `SUPER_ADMIN_1_EMAIL` must all be set alongside a
`SESSION_SECRET` of at least 32 characters, or the container exits on startup.

Changing a `VITE_*` value needs a rebuild, since those are baked into the bundle.
Everything else takes effect on the next restart.

If you add a `.dockerignore` to trim the build context, do not exclude `.env` or
`patches/`. The build needs both.

---

## Building a Standalone Binary

> **Prefer a prebuilt binary?** Prebuilt binaries and builds for Linux, macOS, and Windows are published on the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases). If you just want to run CHOps, download the one for your platform (`chops-linux-x64`, `chops-darwin-arm64`, or `chops-windows-x64.exe`), make it executable, and skip to [Logging In](#logging-in). Build from source only when you need a custom build. Either way you still provide the required environment variables shown below.

CHOps compiles into a single executable with no runtime dependencies on the target machine. This is the recommended way to deploy to a server or distribute to teammates.

```bash
# Build for your current platform
bun run build:binary

# Cross-compile for a specific platform
bun run build:binary:linux      # produces chops-linux-x64
bun run build:binary:mac        # produces chops-darwin-arm64
bun run build:binary:windows    # produces chops-windows-x64.exe
```

During the build, `vite build` compiles the React frontend into static assets under `dist/`, then `bun build --compile` bundles the backend, all dependencies, and `dist/` into one binary.

Run it with the same environment variables the dev server uses:

```bash
chmod +x chops-linux-x64
SUPER_ADMIN_1=admin \
SUPER_ADMIN_1_PASSWORD=secret \
SUPER_ADMIN_1_EMAIL=you@example.com \
SESSION_SECRET=$(openssl rand -hex 32) \
./chops-linux-x64
```

Generate `SESSION_SECRET` once and reuse the same value on every start. It has to
be at least 32 characters, and changing it later makes stored ClickHouse®
passwords unreadable.

The binary creates `data/chops.db` in its working directory at startup.

---

## Logging In

Open CHOps in your browser and sign in with the `SUPER_ADMIN_1` username and password from your `.env`. You land on the Cluster Overview page.

---

## Connecting to ClickHouse®

After logging in, CHOps does not yet know where your ClickHouse® server lives. Point it there:

1. Go to **Administration > Cluster Management**.
2. Click **Add Node** and fill in the node name (a unique friendly label), host or IP, port (usually 8123, the HTTP port, not the native 9000), user, and password. Check **HTTPS** if your server uses TLS.
3. Click **Test** to verify. On success you see the ClickHouse® version and uptime.
4. Click **Save**.

The navigation bar updates immediately with no re-login. You can configure up to 3 clusters with a combined maximum of 18 nodes, and switch between them from the dropdown in the top bar.

### ClickHouse® Running in Kubernetes

If your ClickHouse® runs in Kubernetes under an operator, use the **Kubernetes**
tab instead of entering hosts by hand. CHOps reads the host list from the
installation and keeps it current as the cluster is scaled.

Both ClickHouse® Kubernetes operators are supported:

| Operator | Abbreviation | CRD group | Status |
|---|---|---|---|
| Altinity® Kubernetes Operator for ClickHouse® | AKOC | `clickhouse.altinity.com` | Supported |
| Official ClickHouse® Kubernetes Operator | OCKO | `clickhouse.com` | Early access |

OCKO support is new. The two operators describe a cluster differently, so CHOps
handles each on its own terms rather than treating them as interchangeable. The
Kubernetes screens look and behave the same whichever one you run.

OCKO is early access because its custom resources are at `v1alpha1`, which under
Kubernetes convention means the schema may change without a deprecation cycle.
CHOps discovers the served API version rather than hardcoding it, so a version
promotion needs no change, but a renamed field would.

CHOps runs outside your Kubernetes cluster and makes two separate connections:
one to the Kubernetes API to read the shape of the cluster, and one to
ClickHouse® to run queries. The second needs an address reachable from outside
the cluster, because internal Kubernetes addresses do not resolve from there.
That is the step people miss.

`scripts/chops-k8s-setup.sh` creates a read-only service account covering both
operators and prints the three values the wizard asks for.

Full instructions:

- [Connecting a Kubernetes Cluster](docs/guide/kubernetes-connect.md) for AKOC
- [Connecting a Cluster Managed by OCKO](docs/guide/kubernetes-ocko.md)
- [The Kubernetes Page](docs/guide/kubernetes-page.md) for the eight insight
  screens

Kubernetes support is on by default. Setting
`app_setting['k8s.enabled']` to `false` hides the tab.

Managed services such as ClickHouse® Cloud and hosted Altinity.Cloud® do not use
this path. They expose a database endpoint and no Kubernetes API, so add them
under **Direct connection**, which gives everything except the Kubernetes
screens.

### Setting Up a Dedicated ClickHouse® User

For production, do not connect CHOps as the ClickHouse® `default` user. Create a dedicated account with only the privileges CHOps needs. This follows the principle of least privilege: if the CHOps connection is compromised, the attacker can read system tables but cannot alter your data.

Run this in your ClickHouse® client, replacing the password:

```sql
-- Create the user
CREATE USER IF NOT EXISTS chops IDENTIFIED BY 'your_secure_password';

-- Read access to system tables (monitoring, logs, metadata)
GRANT SELECT ON system.* TO chops;

-- Read access to user databases (for the SQL editor)
GRANT SELECT ON *.* TO chops;

-- SHOW commands (SHOW CREATE TABLE, SHOW DATABASES, and so on)
GRANT SHOW ON *.* TO chops;

-- Monitoring charts use the merge() table function.
-- Grant only that source, not all of them: SOURCES also enables url(), s3()
-- and file(), which are readable from an ordinary SELECT. Anyone with SQL
-- editor access could then make the server fetch an arbitrary URL or read a
-- local file, which is a much larger grant than the charts need.
GRANT merge ON *.* TO chops;
```

Add optional privileges only as needed:

```sql
-- Kill running queries from the UI
GRANT KILL QUERY ON *.* TO chops;

-- Backup and restore
GRANT BACKUP ON *.* TO chops;

-- Manage ClickHouse® users and roles from the UI
GRANT ACCESS MANAGEMENT ON *.* TO chops;

-- Create and drop indexes and projections
GRANT ALTER INDEX ON *.* TO chops;
GRANT ALTER ADD PROJECTION ON *.* TO chops;
GRANT ALTER DROP PROJECTION ON *.* TO chops;
```

A complete grant script with comments ships at [`clickhouse-user-setup.sql`](clickhouse-user-setup.sql) in the project root.

---

## User Roles

CHOps has four application roles, separate from ClickHouse®'s own users.

| Role | Capabilities |
| --- | --- |
| **Super Admin** | Full access. Can be seeded from `.env` for first-time setup or recovery, or created in the UI. Maximum of 3. |
| **Admin** | Same access as super admin but UI-created only. Cannot change or delete super admins. |
| **Editor** | All sections except user and cluster management. Can build dashboards and charts and use the SQL editor. Cannot manage alerts, backups, indexes, projections, or users. |
| **Readonly** | View-only across overview, SQL editor, dashboards, logs, monitoring, and alerts. Cannot create, edit, or delete anything. |

Role changes follow a strict hierarchy: super admins can change admins, editors, and readonly users; admins can change editors and readonly users; nobody can change a super admin's role.

---

## Security

CHOps ships with several hardening measures. Here is what each does and why it matters.

**Password hashing (Argon2id)**: CHOps account passwords are hashed with Argon2id, a memory-hard algorithm and the current industry recommendation, before storage. Even with the SQLite file in hand, an attacker cannot reverse the hash. Older SHA-256 hashes upgrade automatically on each user's next login.

**Encrypted credentials**: ClickHouse® connection passwords are encrypted with AES-256-GCM (authenticated encryption) before being written to SQLite. The key is derived from `SESSION_SECRET`, so the database file alone is not enough to read them. Legacy plaintext values keep working and are encrypted on the next save.

**Login protection**: After 5 failed attempts for the same username within 15 minutes, that account is temporarily locked. Error messages stay deliberately vague ("Invalid credentials.") so an attacker cannot enumerate usernames.

**Session tokens**: Sessions use JWTs that expire after 2 hours, each carrying a unique revocable ID. Deleting a user ends their session at once, because every request re-reads the account. Changing a user's *role* is not immediate: the role travels in the token, so a demotion takes effect on their next login or when the token expires. Force a logout if you need it sooner. Revocations are held in memory, so restarting the server clears the list.

**Disabling .env login**: By default the `.env` super admin credentials work as a permanent login fallback, which is convenient for setup but acts as a backdoor. To close it after setup, set `DISABLE_ENV_LOGIN=true`. The `.env` credentials then seed the initial migration only.

**HTTP security headers**: Every response carries a Content Security Policy, Strict Transport Security, clickjacking protection, and MIME-sniffing prevention.

**Request size limits**: SQL sent to `/api/query` and `/api/export` is capped at 512KB; other endpoints allow up to 2MB.

**Reverse proxy**: rate limiting is per client IP. Behind a proxy (such as the Caddy setup below) set `TRUST_PROXY` to the number of proxies in front of CHOps, or every client shares one bucket. Leave it unset when CHOps is exposed directly, so `X-Forwarded-For` cannot be spoofed.

---

## Running Tests

CHOps has a comprehensive automated test suite covering backend and frontend. Tests need no running ClickHouse® server, S3 bucket, or external service; they exercise the application code in isolation with mocks and static analysis.

```bash
# Everything (backend then frontend), about 15 to 20 seconds
bun run test

# Backend suites (Bun test runner)
bun test tests/backend
bun test tests/isolated
bun test tests/no-mocks

# Frontend only (Vitest)
npx vitest run tests/frontend
```

`tests/no-mocks` holds suites written without any module mocking, so they run
under Bun's test runner rather than Vitest. That split is deliberate: `vi.mock`
works through Vite's transform pipeline, which Bun's loader does not run, so the
call quietly becomes a no-op and the real module loads instead. A handful of
frontend suites that genuinely need mocking are excluded from the Bun run for the
same reason and are documented in `vite.config.js`.

Backend tests cover password hashing, JWT handling, AES-256-GCM encryption, rate limiting, security headers, alert scheduling, SQL formatting, the Drizzle schema, environment parsing, and the four-tier RBAC system. Frontend tests cover route definitions, chart types, the plugin architecture, heatmap color scales, tree-chart utilities, scrollbar behavior, and UI contracts.

Coverage runs are available too:

```bash
bun run test:coverage              # backend then frontend
bun run test:backend:coverage      # backend only
bun run test:frontend:coverage     # frontend only
```

Most frontend tests are static analysis, reading source files as strings to verify structure, so runtime line coverage will be low by design.

---

## Backing Up CHOps's Database

CHOps uses SQLite in WAL (Write-Ahead Logging) mode. Do not copy `chops.db` while the server runs, because the WAL file may hold data not yet flushed to the main file. Use the built-in command instead, which is safe during operation:

```bash
bun run db:backup
```

This writes a self-contained file to `data/backups/` using SQLite's `VACUUM INTO`. To restore, stop the server, replace `data/chops.db` with the backup (delete any `-wal` and `-shm` files), and restart.

---

## Deploying with Caddy and systemd

For production, run CHOps behind [Caddy](https://caddyserver.com) for automatic HTTPS, as a systemd service for automatic startup and crash recovery.

**1.** Build CHOps (`bun run build` or `bun run build:binary:linux`).

**2.** Create `/etc/systemd/system/chops.service`:

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

Caddy obtains and renews Let's Encrypt certificates automatically. The full guide with security hardening, IP allowlisting, and automated backups lives at [ch-ops.io/docs](https://ch-ops.io/docs).

---

## Troubleshooting

**Cannot connect to ClickHouse®**: In Administration > Cluster Management, verify host, port, user, and password, then click Test. Make sure the HTTP port (8123) is open, not the native protocol port (9000).

**"Frontend not built" error**: Run `bun run build` before starting the server.

**"Invalid credentials" on login**: Recheck `.env`. Username and password are case-sensitive.

**Backup listing shows "Unable to connect"**: Verify the S3 endpoint and credentials in Storage Profiles. The error message distinguishes authentication, connectivity, and bucket problems.

**Empty monitoring charts**: Click "Load Charts" after selecting a time range. Charts load only for the active tab. If charts fail rather than sitting empty, check the `chops` user has `GRANT merge ON *.*` (see [Setting Up a Dedicated ClickHouse User](#setting-up-a-dedicated-clickhouse-user)).

**Read-only queries fail with "Cannot modify ... setting in readonly mode" (code 164)**: CHOps sends `readonly=1` alongside a result-size ceiling on read-only requests. If the ClickHouse user's own profile already pins `readonly` to 1 or 2, the two collide. Run `bun run check:readonly -- --host <host> --user <user> --password <pw>` to confirm and get the exact fix for your server.

**DDL cards show zeros**: Normal on single-node setups with no distributed DDL queue.

**Port already in use**: Set a different port in `.env` with `PORT=3001`.

**Binary crashes on startup**: Ensure `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `SESSION_SECRET` are set. The binary needs them just like the dev server does.

**`docker build` fails with `.env not found`**: The build deliberately stops there. Run `cp .env.example .env` and fill it in. If you added a `.dockerignore`, check it does not exclude `.env`.

**Container starts then restarts in a loop**: Check `docker logs chops`. A missing `SUPER_ADMIN_1_EMAIL` or a `SESSION_SECRET` shorter than 32 characters both exit on startup, and both report which value is wrong.

**Password reset emails never arrive**: Set the `SMTP_*` values in `.env` and restart. Without them the reset code cannot be sent.

---

## Contributing

We are not accepting external code contributions (pull requests) yet. Before we can merge community code, we need a Contributor License Agreement (CLA) in place, and we are still preparing it. Pull requests opened in the meantime may be closed without review, not because the work is unwelcome, but because we cannot legally incorporate it until the CLA exists.

What we **do** welcome right now:

- **Bug reports.** Open an issue with your CHOps version (from `version.json`), your ClickHouse® database version, and clear steps to reproduce.
- **Feature requests.** Open an issue describing the problem you want solved. Tell us the use case, not just the proposed solution, so we can find the best fit.
- **Questions and feedback.** If something is confusing or missing from the docs, let us know.

Once the CLA is ready, we will update this section with contribution guidelines and open the project to pull requests.

And if you have read this far and like what you see, **please consider starring the repository**. It genuinely helps.

---

## Acknowledgements

We used AI tools to scaffold the initial code, then our team designed, built, tested, and hardened the application from that foundation. CHOps is actively maintained and built for the long run. Found a bug or want a feature? Open an issue and we'll take a look; we're keen to make it work for your setup.

---

## Trademarks

ClickHouse® is a registered trademark of ClickHouse, Inc. All uses of the ClickHouse® mark in this document refer to the ClickHouse® database management system and are used solely for identification and descriptive purposes under nominative fair use. CHOps is an independent open-source project and is not affiliated with, endorsed by, sponsored by, or otherwise associated with ClickHouse, Inc. Any other product names, logos, and brands referenced are the property of their respective owners and are used for identification purposes only.

---

## License

CHOps follows an **open-core model**. The core (Community) edition is **dual
licensed**, and Pro is commercial only.

| Edition | License | What it includes |
| --------------- | --------------------------- | ---------------- |
| **Community (core)** | **AGPLv3 or Commercial** | The core dashboard: SQL editor, query profiling, monitoring, schema tools, logs, RBAC viewing, custom dashboards, and more. |
| **Pro** | **Commercial only** | Advanced operational features layered on the core: scheduled archival to S3-compatible storage, extended alerting, audit logging, scheduled email reports, multi-cluster fleet management via sidecar agents, and priority support. |

**Community (core) is dual licensed.** By default it is offered under the GNU
Affero General Public License, version 3.0 (AGPLv3); the copy in this repository
is AGPLv3 and you may use, study, modify, and redistribute it under those terms
(see [`LICENSE`](LICENSE)). If the AGPLv3 obligations do not fit your deployment,
the same core is also available under a separate **commercial license** with no
copyleft obligations.

**Pro is commercial only.** The Pro features are not part of this repository and
are not offered under the AGPLv3. They are distributed separately under a
commercial license permitting proprietary, non-source-disclosed use.

For a commercial license of the core, or for Pro, visit
[ch-ops.io](https://ch-ops.io) or contact Quantrail™ Data.

### Copyright

Copyright © 2026 Quantrail™ Data Private Limited. All rights reserved.

CHOps is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

CHOps is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with CHOps. If not, see [https://www.gnu.org/licenses/agpl-3.0.html](https://www.gnu.org/licenses/agpl-3.0.html).

---

<div align="center" >

**[ch-ops.io](https://ch-ops.io)**

Copyright © 2026 Quantrail™ Data Private Limited.

</div>
