
<div align="center">

# CHOps - Beta

### A web-based administration and monitoring dashboard for ClickHouse® database clusters

[![Homepage](https://img.shields.io/badge/homepage-ch--ops.io-6366f1)](https://ch-ops.io)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPLv3-blue)](#license)

**[Homepage](https://ch-ops.io)** · **[Documentation](https://ch-ops.io/docs)** · **[Report a Bug](https://github.com/Quantrail-Data/CH-Ops/issues)**

If CHOps saves you time or you find it useful, please consider **starring this repository**. It genuinely helps.

[CHOps](https://github.com/user-attachments/assets/500f4237-5b82-46af-a49f-e6d8a20092cf)

</div>

---

## What is CHOps?

If you manage a ClickHouse® database, you probably interact with it through the `clickhouse-client` command line or the HTTP API. CHOps wraps that HTTP interface in a browser UI so you can run SQL, inspect slow queries, configure alerts, manage backups, and control access visually.

CHOps stores its own configuration (alerts, dashboards, users, cluster definitions, and so on) in a small SQLite file on disk. It does not touch your ClickHouse® data or schema unless you explicitly run a query that does.

The application is built on [Bun](https://bun.sh), with a React frontend and an Express backend. It compiles to a single self-contained binary with no runtime dependencies, so deployment is a matter of copying one file to a server.


---

## Feature Overview

CHOps organizes its functionality into ten sidebar sections. Each item below is a distinct page or toolset. The [full documentation](https://ch-ops.io/docs) covers every feature in depth; this list is intentionally brief.

A global page search is available everywhere: open it from the navbar Search button, the floating bubble, or Ctrl/Cmd+K, then type a page name, feature, section heading, or on-page text to jump straight there.

**Overview**: cluster health, live query monitor with kill controls, query analytics and log, tables and parts inspection, merges and mutations, distributed DDL queue.

**Tools**: a full SQL editor with autocomplete and nine EXPLAIN types, an interactive flame-graph query profiler, and a per-second query metrics timeline.

**Custom Dashboards**: a chart builder with 10+ chart types, configurable grid dashboards, and a chart browser. Every chart has an HTML control toolbar (zoom, save as PNG, and in-app full screen).

**Indexes**: data-skipping index visualization, projection management, and secondary index creation.

**Logs**: crash, error, and text log viewers with calendar heatmaps and filtered search.

**Monitoring**: Multiple system charts, plus a DVR-style playback mode for replaying historical metrics frame by frame.

**Alerting**: SQL-based alert rules with threshold evaluation, with email notification channel, and a live firing-alert marquee.

**Access Control**: ClickHouse® user and role management, grant visualization, and settings-profile editing.

**Backups**: BACKUP and RESTORE orchestration to S3-compatible storage, backup discovery, and storage profile management.

**Administration**: CHOps user management with four roles, multi-cluster configuration, and application-data backup.

---

## Before You Begin

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

**4. Edit `.env`** in any text editor (for example `nano .env`). Only **three** values are required to start the app; change these:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=your_secure_password_here
SESSION_SECRET=paste_a_random_string_here
```

- `SUPER_ADMIN_1` and `SUPER_ADMIN_1_PASSWORD` are the username and password you will use to log in the first time. Pick a strong password.
- `SESSION_SECRET` must be a long random string. Generate one with:

  ```bash
  openssl rand -hex 32
  ```

  Copy the output and paste it as the value. This secret both signs your login sessions and encrypts the ClickHouse® passwords CHOps stores, so keep it private and do not change it later, or saved credentials become unreadable.

Everything else in `.env` is **optional** and can be left as-is for now:

- **SMTP_*** settings are only needed if you want alert emails.

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

**Docker** (no Bun installation needed). `SESSION_SECRET` is required (used for
JWT signing and credential encryption); generate a strong random one.

*Option A - Docker Compose (recommended).* Builds the image and runs it with a
persistent named volume:

```bash
export SESSION_SECRET=$(openssl rand -hex 32)
docker compose up -d --build
```

Rebuild after pulling new code with `docker compose up -d --build`. Stop with
`docker compose down` (data survives; it lives in the `chops-data` volume).

*Option B - Build and run the image by hand:*

```bash
# Build the image
docker build -t chops:latest .

# Run it (mount a volume so data/chops.db persists)
docker run -d --name chops -p 3000:3000 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -v chops-data:/app/data \
  chops:latest
```

Open `http://localhost:3000`. Both options persist the SQLite database in the
`chops-data` volume across restarts and image rebuilds.

To seed a first super-admin on initial startup, also pass
`-e SUPER_ADMIN_1=you@example.com -e SUPER_ADMIN_1_PASSWORD=...` (or set them in
the compose environment / your `.env`).

---

## Building a Standalone Binary

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
SESSION_SECRET=abc123 \
./chops-linux-x64
```

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

-- Monitoring charts use merge() which needs SOURCES
GRANT SOURCES ON *.* TO chops;
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

## Version Scheme

Version strings follow the format `{clickhouseVersion}-{major}.{minor}.{patch}`, for example `26.3-1.4.0`.

The `clickhouseVersion` segment (such as `26.3`) is the ClickHouse® database release CHOps is tested against. CHOps may work with other versions, but this is the tested target. The `major.minor.patch` segment is the CHOps application version following standard semantic versioning.

[`version.json`](version.json) at the project root is the single source of truth for the backend, frontend, and `package.json`.

---

## Security

CHOps ships with several hardening measures. Here is what each does and why it matters.

**Password hashing (Argon2id)**: CHOps account passwords are hashed with Argon2id, a memory-hard algorithm and the current industry recommendation, before storage. Even with the SQLite file in hand, an attacker cannot reverse the hash. Older SHA-256 hashes upgrade automatically on each user's next login.

**Encrypted credentials**: ClickHouse® connection passwords are encrypted with AES-256-GCM (authenticated encryption) before being written to SQLite. The key is derived from `SESSION_SECRET`, so the database file alone is not enough to read them. Legacy plaintext values keep working and are encrypted on the next save.

**Login protection**: After 5 failed attempts for the same username within 15 minutes, that account is temporarily locked. Error messages stay deliberately vague ("Invalid credentials.") so an attacker cannot enumerate usernames.

**Session tokens**: Sessions use JWTs that expire after 2 hours. Each carries a unique revocable ID, so a deleted user's session ends within 2 hours at most.

**Disabling .env login**: By default the `.env` super admin credentials work as a permanent login fallback, which is convenient for setup but acts as a backdoor. To close it after setup, set `DISABLE_ENV_LOGIN=true`. The `.env` credentials then seed the initial migration only.

**HTTP security headers**: Every response carries a Content Security Policy, Strict Transport Security, clickjacking protection, and MIME-sniffing prevention.

**Request size limits**: SQL sent to `/api/query` is capped at 100KB; other endpoints allow up to 2MB.

---

## Running Tests

CHOps has a comprehensive automated test suite covering backend and frontend. Tests need no running ClickHouse® server, S3 bucket, or external service; they exercise the application code in isolation with mocks and static analysis.

```bash
# Everything (backend then frontend), about 15 to 20 seconds
bun run test

# Backend only (Bun test runner)
bun test tests/backend

# Frontend only (Vitest)
npx vitest run tests/frontend
```

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

**Empty monitoring charts**: Click "Load Charts" after selecting a time range. Charts load only for the active tab.

**DDL cards show zeros**: Normal on single-node setups with no distributed DDL queue.

**Port already in use**: Set a different port in `.env` with `PORT=3001`.

**Binary crashes on startup**: Ensure `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, and `SESSION_SECRET` are set. The binary needs them just like the dev server does.

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
| **Pro** | **Commercial only** | Advanced operational features layered on the core: extended alerting, audit logging, scheduled email reports, multi-cluster fleet management via sidecar agents, and priority support. |

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
