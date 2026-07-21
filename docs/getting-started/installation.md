# Installation

This guide walks you through setting up CHOps from scratch, connected to your ClickHouse® cluster. There are three ways to install it

- **From source with Bun** is the most flexible and is ideal for development or when you want to run the latest code directly.
- **Docker** is the fastest way to a running instance and needs no Bun installation on the host.
- **A standalone binary** is the cleanest way to deploy to a server, since it bundles everything into a single executable with no runtime dependencies. You can download a prebuilt binary from the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases) or build your own.

Whichever route you choose, the same four values are required for CHOps to start, and the same first-login and ClickHouse®-connection steps apply. Read the "Before you begin" and "Required configuration" sections first, then jump to the option you want.

---

## Before you begin

You need two things (three if you go the Docker route).

**1. A reachable ClickHouse® server.** CHOps talks to ClickHouse® over its HTTP interface, which is port **8123** by default (not the native protocol on 9000). Confirm the server is reachable from the machine that will run CHOps:

```bash
curl http://your-clickhouse-host:8123/ping
```

If it prints `Ok.`, you are set.

**2. Bun (for the source and binary routes).** Bun is the JavaScript runtime CHOps is built on. Pin the tested version, **1.3.13**, to match what the project builds and ships with:

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.13"
```

Close and reopen your terminal afterwards, then verify:

```bash
bun --version
```

**3. Docker (only for the Docker route).** Docker Engine with the Compose plugin. You do not need Bun installed on the host in this case.

---

## Required configuration

CHOps validates its environment on startup and exits immediately if anything required is missing. Exactly four values are required in every install method:

| Variable | Purpose |
|----------|---------|
| `SUPER_ADMIN_1` | Username of the first super admin (your first login). |
| `SUPER_ADMIN_1_PASSWORD` | Password for that account. Choose a strong one. |
| `SUPER_ADMIN_1_EMAIL` | Email address for that account. This is required; the server will not start without it. |
| `SESSION_SECRET` | A long random string (32+ characters) used to sign login sessions and to encrypt stored ClickHouse® passwords. Generate one with `openssl rand -hex 32`. |

Everything else has a sensible default and can be left alone at first. A minimal working configuration looks like this:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=change_me_to_a_strong_password
SUPER_ADMIN_1_EMAIL=you@example.com
SESSION_SECRET=paste_output_of_openssl_rand_hex_32_here
```

> Do not change `SESSION_SECRET` after your first run. It is the encryption key for every stored ClickHouse® password, so changing it makes those saved credentials unreadable and you will have to re-enter them.

The full list of variables (server port, email/SMTP for alerts, the `.env` login fallback toggle, and the frontend build variables) is documented on the [Configuration](getting-started/configuration.md) page.

---

## Option A: Install from source

### Step 1: Get the code and install dependencies

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
bun install
```

`bun install` downloads every library CHOps needs. It may take a minute the first time.

### Step 2: Create your configuration file

Copy the example and edit it:

```bash
cp .env.example .env
```

Open `.env` in any editor and set the four required values from the [Required configuration](#required-configuration) section above. The example file ships with `DISABLE_ENV_LOGIN=true`, which turns off the `.env` password fallback so that only accounts in the app database can log in. This is safe from the start, because your first super admin is seeded into the app database automatically on the first run (see Step 3), so it can log in through the normal path. If you would rather keep the `.env` fallback available during setup, set `DISABLE_ENV_LOGIN=false`.

### Step 3: Set up the database

CHOps stores its own settings (users, clusters, alerts, dashboards, and so on) in a small SQLite database. Create it with:

```bash
bun run db:migrate
```

You should see a message confirming the migration completed. This creates `data/chops.db` in the project folder and seeds your `SUPER_ADMIN_1` account. You do not need to install SQLite separately. (The server also runs this migration automatically on startup, so this explicit step is optional but makes the first run cleaner.)

### Step 4: Start CHOps

**Development mode** rebuilds automatically as you change code and runs two servers, the backend API on port 3000 and the Vite frontend on port 5173:

```bash
bun run dev
```

Open **http://localhost:5173**.

**Production mode** builds the frontend once and serves everything from a single backend process on port 3000:

```bash
bun run build
bun src/backend/server.js
```

Open **http://localhost:3000**. The production server serves the built frontend from `dist/`, so the `bun run build` step is required; without it the server responds with "Frontend not built."

---

## Option B: Docker

Docker needs no Bun on the host. `SESSION_SECRET` and the three super-admin values are still required, since the container validates its environment on startup exactly like the source install does.

### Option B1: Docker Compose (recommended)

The repository ships a `docker-compose.yml` that builds the image and runs it with a persistent named volume. Provide the required values, then bring it up:

```bash
export SESSION_SECRET=$(openssl rand -hex 32)
export SUPER_ADMIN_1=admin
export SUPER_ADMIN_1_PASSWORD=change_me_to_a_strong_password
export SUPER_ADMIN_1_EMAIL=you@example.com
docker compose up -d --build
```

The bundled compose file forwards `SESSION_SECRET`, `SUPER_ADMIN_1`, and `SUPER_ADMIN_1_PASSWORD` to the container. Because `SUPER_ADMIN_1_EMAIL` is also required, add it to the service's `environment:` list, or, more simply, point the service at your full `.env` file so every value is passed through:

```yaml
services:
  chops:
    # ...
    env_file: .env
```

Rebuild after pulling new code with `docker compose up -d --build`. Stop with `docker compose down`; your data survives because it lives in the `chops-data` volume.

### Option B2: Build and run the image by hand

```bash
# Build the image
docker build -t chops:latest .

# Run it, mounting a volume so data/chops.db persists
docker run -d --name chops -p 3000:3000 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -e SUPER_ADMIN_1=admin \
  -e SUPER_ADMIN_1_PASSWORD=change_me_to_a_strong_password \
  -e SUPER_ADMIN_1_EMAIL=you@example.com \
  -v chops-data:/app/data \
  chops:latest
```

Or pass a full env file with `--env-file .env` instead of the individual `-e` flags. Open **http://localhost:3000**. Both Docker options run as a non-root user, expose a health check at `/api/health`, and persist the SQLite database in the `chops-data` volume across restarts and rebuilds.

---

## Option C: Standalone binary

> **Prefer not to build?** Prebuilt binaries and builds for Linux, macOS, and Windows are published on the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases). Download the one for your platform (`chops-linux-x64`, `chops-darwin-arm64`, or `chops-windows-x64.exe`), make it executable, and run it with the required environment variables (see [First login and connecting to ClickHouse®](#first-login-and-connecting-to-clickhouse)). Building from source, described below, is only needed for a custom build.

For deploying to a server or handing to a teammate, CHOps compiles into a single executable with no runtime dependencies on the target machine:

```bash
# Build for your current platform
bun run build:binary

# Or cross-compile
bun run build:binary:linux      # chops-linux-x64
bun run build:binary:mac        # chops-darwin-arm64
bun run build:binary:windows    # chops-windows-x64.exe
```

The build compiles the React frontend into `dist/`, then bundles the backend, its dependencies, and the frontend assets into one file. Run it with the same required environment variables as any other method:

```bash
chmod +x chops-linux-x64
SUPER_ADMIN_1=admin \
SUPER_ADMIN_1_PASSWORD=change_me_to_a_strong_password \
SUPER_ADMIN_1_EMAIL=you@example.com \
SESSION_SECRET=$(openssl rand -hex 32) \
./chops-linux-x64
```

The binary creates `data/chops.db` in its working directory on first start. For a full production setup behind a reverse proxy with a service manager, see [Building a Binary](development/binary-build.md) and the [Production deployment](deployment/production.md) guide.

---

## Create a dedicated ClickHouse® user (recommended)

For anything beyond local testing, do not connect CHOps as the ClickHouse® `default` user. Create a dedicated account with only the privileges CHOps needs, so that a compromised connection cannot alter your data. This account is used for the dashboard's monitoring, logs, metadata, and Access Control pages. The SQL Editor and Schema Studio use each user's own separate ClickHouse® credentials, entered at connect time, so they are not affected by this account.

A minimal set of grants:

```sql
CREATE USER IF NOT EXISTS chops IDENTIFIED BY 'your_secure_password';

GRANT SELECT ON *.* TO chops;   -- system tables and user data (read)
GRANT SHOW ON *.* TO chops;     -- SHOW CREATE TABLE, SHOW DATABASES, and so on
```

Add optional privileges only for the features you use, for example `KILL QUERY` to stop queries from the UI, `BACKUP` and `S3` for backups and archival, `ACCESS MANAGEMENT` to manage ClickHouse® users and roles from the UI, and `ALTER INDEX` / `ALTER PROJECTION` for index and projection management. A complete, commented grant script ships at `clickhouse-user-setup.sql` in the project root; run it as a ClickHouse® admin and replace the placeholder password.

---

## First login and connecting to ClickHouse®

1. Open CHOps in your browser (port 5173 in development, 3000 otherwise).
2. Sign in with the `SUPER_ADMIN_1` username and password from your `.env`. You land on the Cluster Overview page.
3. CHOps does not yet know where your ClickHouse® server is. Go to **Administration > Cluster Management**.
4. Click **Add Node** and fill in a unique node name, the host or IP, the port (usually 8123, the HTTP port), the user (for example the `chops` user you created above), and the password. Check **HTTPS** if your server uses TLS.
5. Click **Test** to verify. On success you see the ClickHouse® version and uptime.
6. Click **Save**. The navigation bar updates immediately with no re-login.

You can configure up to 3 clusters with a combined maximum of 18 nodes and switch between them from the top bar. Cluster passwords are encrypted with AES-256-GCM before being stored.

---

## Verify it is working

- Open **Overview > Cluster Overview**. You should see your ClickHouse® version and uptime.
- The backend exposes a health endpoint you can curl to confirm the server itself is up, independent of ClickHouse®:

  ```bash
  curl http://localhost:3000/api/health
  # {"ok":true,"ts":"...","version":"..."}
  ```

- `GET /api/version` returns the running CHOps version if you need to confirm which build is deployed.

---

## Where your data lives

CHOps keeps all of its own state in a single SQLite database at `data/chops.db`, alongside its write-ahead-log files (`data/chops.db-wal` and `data/chops.db-shm`) and a per-install `data/crypto.salt` used for credential encryption. Back up the whole `data/` directory to preserve users, clusters, alerts, dashboards, and saved credentials. Under Docker, this directory is the `chops-data` volume mounted at `/app/data`. For an automated, off-site copy, see App Data Backup under [Administration](../guide/admin.md#app-data-backup).

---

## Troubleshooting

**Server exits immediately with "Missing required env" or a config error.** One of the four required values is unset. Confirm `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `SESSION_SECRET` are all present. Under Docker, remember that only variables listed in the service's `environment:` (or an `env_file:`) reach the container, so `SUPER_ADMIN_1_EMAIL` must be passed explicitly.

**"Frontend not built."** You started the production server without building first. Run `bun run build`, then `bun src/backend/server.js`. In development, use `bun run dev` instead.

**"Cannot connect to ClickHouse®."** Make sure the HTTP port (usually 8123) is reachable from the machine running CHOps, and that you used the HTTP port rather than the native 9000. Test with `curl http://your-host:8123/ping`.

**"Invalid credentials" at login.** The username and password on the login page must match `SUPER_ADMIN_1` and `SUPER_ADMIN_1_PASSWORD`. After five failed attempts for the same username within fifteen minutes, that account is temporarily locked; wait and try again.

**Port already in use.** Set a different port in `.env`, for example `PORT=3001`, and restart. In Docker, change the published port mapping (for example `-p 3001:3000`).

**Login worked before but stopped after a config change.** If you changed `SESSION_SECRET`, previously stored ClickHouse® passwords can no longer be decrypted. Restore the original secret, or re-enter the affected credentials.

---

## Next steps

- [Configuration](getting-started/configuration.md) for every environment variable and the in-app connection bar.
- [Production deployment](deployment/production.md) for running behind Caddy with systemd.
- [Building a Binary](development/binary-build.md) for distributing a single executable.
