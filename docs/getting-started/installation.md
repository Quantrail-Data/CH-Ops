# Installation

CHOps installs in three ways. Use the one that fits you.

- **Docker** is the fastest way to a running instance. It needs no Bun on the host. You pull a published image and run it.
- **A prebuilt binary** is one file with no runtime dependencies. It is good for a server or to hand to a teammate.
- **From source with Bun** is for development or to run the latest code.

Every method needs the same four values. Every method uses the same first-login and connection steps. Read "Before you begin" and "Required configuration" first. Then go to the method you want.

---

## Before you begin

You need a reachable ClickHouse&reg; server for all methods. You need Bun for the source and binary methods. You need Docker for the Docker method.

**1. A reachable ClickHouse&reg; server.** CHOps talks to ClickHouse&reg; over its HTTP interface. The default HTTP port is **8123**, not the native port 9000. Confirm the server is reachable from the machine that runs CHOps:

```bash
curl http://your-clickhouse-host:8123/ping
```

If it prints `Ok.`, the server is reachable.

**2. Bun 1.3.13 (source and binary methods only).** Bun is the JavaScript runtime CHOps is built on. Install the tested version:

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.13"
```

Close and reopen your terminal. Then check the version:

```bash
bun --version
```

**3. Docker (Docker method only).** Install Docker Engine with the Compose plugin. You do not need Bun for this method.

---

## Required configuration

CHOps checks its environment at startup. It exits at once if a required value is missing. Four values are required in every method:

| Variable | Purpose |
|----------|---------|
| `SUPER_ADMIN_1` | The user name of the first super admin. This is your first login. |
| `SUPER_ADMIN_1_PASSWORD` | The password for that account. Use a strong one. |
| `SUPER_ADMIN_1_EMAIL` | The email for that account. The server does not start without it. |
| `SESSION_SECRET` | A random string of 32 characters or more. It signs login sessions and derives the key that encrypts stored ClickHouse&reg; passwords. Make one with `openssl rand -hex 32`. |

Everything else has a default. A minimal configuration looks like this:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=change_me_to_a_strong_password
SUPER_ADMIN_1_EMAIL=you@example.com
SESSION_SECRET=paste_output_of_openssl_rand_hex_32_here
```

> Do not change `SESSION_SECRET` after the first run. It is the encryption key for every stored ClickHouse&reg; password. If you change it, those saved credentials become unreadable, and you must enter them again.

The [Configuration](getting-started/configuration.md) page lists every variable.

---

## Method A: Run with Docker

The image is published to two registries. Both are public. Pull the image and run it. You do not build anything.

```bash
docker run -d --name chops -p 3000:3000 \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e SUPER_ADMIN_1=admin \
  -e SUPER_ADMIN_1_PASSWORD=change_me_to_a_strong_password \
  -e SUPER_ADMIN_1_EMAIL=you@example.com \
  -v chops-data:/app/data \
  quantrailadmin1/ch-ops:0.2.0
```

Then open **http://localhost:3000**. The image is also on GitHub Container Registry: `ghcr.io/quantrail-data/ch-ops:0.2.0`. The `latest` tag is available on both registries.

The container runs as a non-root user. It serves a health check at `/api/health`. It keeps the SQLite database in the `chops-data` volume across restarts.

---

## Method B: Run with Docker Compose

Make a file named `docker-compose.yml`. Put this content in it. Change the session secret and the admin password first.

```yaml
services:
  chops:
    image: quantrailadmin1/ch-ops:0.2.0
    container_name: chops
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - SESSION_SECRET=replace-with-a-long-random-value
      - SUPER_ADMIN_1=admin
      - SUPER_ADMIN_1_PASSWORD=change_me_to_a_strong_password
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

Then open **http://localhost:3000**. To stop CHOps, run `docker compose down`. Your data stays in the `chops-data` volume.

---

## Method C: Run a prebuilt binary

Prebuilt binaries for Linux, macOS, and Windows are on the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases). Download the file for your platform (`chops-linux-x64`, `chops-darwin-arm64`, or `chops-windows-x64.exe`). Then run it with the required variables:

```bash
chmod +x chops-linux-x64
SUPER_ADMIN_1=admin \
SUPER_ADMIN_1_PASSWORD=change_me_to_a_strong_password \
SUPER_ADMIN_1_EMAIL=you@example.com \
SESSION_SECRET=$(openssl rand -hex 32) \
./chops-linux-x64
```

The binary makes `data/chops.db` in its working directory at startup.

---

## Method D: Install from source

Use this method for development or to run the latest code.

### Step 1: Get the code and install dependencies

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
bun install
```

`bun install` downloads every library CHOps needs. The first run can take a minute.

### Step 2: Make your configuration file

Copy the example and edit it:

```bash
cp .env.example .env
```

Set the four required values from the [Required configuration](#required-configuration) section. The example file ships with `DISABLE_ENV_LOGIN=true`. This turns off the `.env` password fallback, so only accounts in the app database can log in. This is safe from the start, because the first super admin is seeded into the app database on the first run (see Step 3). To keep the `.env` fallback during setup, set `DISABLE_ENV_LOGIN=false`.

### Step 3: Set up the database

CHOps stores its own settings in a small SQLite database. Make it:

```bash
bun run db:migrate
```

You see a message that confirms the migration. This makes `data/chops.db` and seeds your `SUPER_ADMIN_1` account. The server also runs this migration at startup, so this step is optional. It makes the first run cleaner.

### Step 4: Start CHOps

Development mode rebuilds on code changes. It runs the backend API on port 3000 and the Vite frontend on port 5173:

```bash
bun run dev
```

Open **http://localhost:5173**.

Production mode builds the frontend once and serves everything from one process on port 3000:

```bash
bun run build
bun src/backend/server.js
```

Open **http://localhost:3000**. The `bun run build` step is required. Without it, the server answers "Frontend not built."

---

## Build your own image or binary

Build only if you change the code, or make your own image or binary.

**Build a Docker image.** The build does not need a `.env` file. The repository `docker-compose.yml` builds the image and reads run-time settings from `.env` through `env_file`, so make a `.env` with the four required variables first, then:

```bash
docker compose up -d --build
```

Or build and run by hand:

```bash
docker build -t chops:latest .
docker run -d --name chops -p 3000:3000 --env-file .env -v chops-data:/app/data chops:latest
```

**Build a standalone binary.**

```bash
bun run build:binary          # your current platform
bun run build:binary:linux    # chops-linux-x64
bun run build:binary:mac      # chops-darwin-arm64
bun run build:binary:windows  # chops-windows-x64.exe
```

---

## Make a dedicated ClickHouse® user

For anything beyond local testing, do not connect CHOps as the ClickHouse&reg; `default` user. Make a dedicated user and a role. Grant only the privileges CHOps needs.

The project ships a complete, role-based grant script at [`clickhouse-user-setup.sql`](https://github.com/Quantrail-Data/CH-Ops/blob/main/clickhouse-user-setup.sql). Run it as a ClickHouse&reg; admin and change the password. The base grants are:

```sql
GRANT SELECT ON *.* TO chops_admin;   -- read system tables and user data
GRANT SHOW ON *.* TO chops_admin;     -- SHOW DATABASES, SHOW CREATE TABLE, and so on
```

Notes:

- The monitoring charts use the `merge()` table function on system tables. It needs only `SELECT`, so no extra grant is required.
- The query profiler needs `GRANT INTROSPECTION` and `ALTER USER chops SETTINGS allow_introspection_functions = 1`. The server must also have `system.trace_log` enabled.
- Add feature grants only if you use the feature: `KILL QUERY`, `BACKUP` and `S3` for backups and archival, `REMOTE` for cluster-wide views, `ACCESS MANAGEMENT` for the Access Control screens, and `ALTER INDEX` and `ALTER PROJECTION` for index management.
- `ACCESS MANAGEMENT` is powerful. A user with it can make a new superuser. Add it only if you use the CHOps Access Control screens.

The SQL Editor and Schema Studio use each person's own ClickHouse&reg; credentials, entered at connect time. This account does not affect them.

---

## First login and connecting to ClickHouse®

1. Open CHOps in your browser. The port is 5173 in development, or 3000 in every other method.
2. Log in with the `SUPER_ADMIN_1` user name and password. You land on the Cluster Overview page.
3. CHOps does not yet know where your ClickHouse&reg; server is. Go to **Administration > Cluster Management**.
4. Click **Add Node**. Enter a unique node name, the host or IP, the port (usually 8123, the HTTP port), the user (for example the `chops` user), and the password. Check **HTTPS** if your server uses TLS.
5. Click **Test** to verify. On success you see the ClickHouse&reg; version and uptime.
6. Click **Save**. The navigation bar updates at once with no re-login.

You can configure up to 3 clusters, with a combined maximum of 18 nodes. Switch between them from the top bar. CHOps encrypts cluster passwords with AES-256-GCM before it stores them.

---

## Verify it is working

- Open **Overview > Cluster Overview**. You should see your ClickHouse&reg; version and uptime.
- Check the health endpoint. It confirms the server is up, independent of ClickHouse&reg;:

  ```bash
  curl http://localhost:3000/api/health
  # {"ok":true,"ts":"...","version":"..."}
  ```

- `GET /api/version` returns the running CHOps version.

---

## Where your data lives

CHOps keeps all of its state in a SQLite database at `data/chops.db`. It also writes the WAL files (`data/chops.db-wal` and `data/chops.db-shm`) and a per-install `data/crypto.salt` for credential encryption. Back up the whole `data/` directory to keep users, clusters, alerts, dashboards, and saved credentials. Under Docker, this directory is the `chops-data` volume at `/app/data`. For an automated off-site copy, see App Data Backup under [Administration](../guide/admin.md#app-data-backup).

---

## Troubleshooting

**The server exits at once with "Missing required env."** One of the four required values is unset. Confirm `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `SESSION_SECRET` are all set. Under Docker, only variables in the service `environment:` or an `env_file:` reach the container.

**"Frontend not built."** You started the production server without a build. Run `bun run build`, then `bun src/backend/server.js`. In development, use `bun run dev`.

**"Cannot connect to ClickHouse&reg;."** Make sure the HTTP port (usually 8123) is reachable from the machine that runs CHOps. Use the HTTP port, not the native 9000. Test with `curl http://your-host:8123/ping`.

**"Invalid credentials" at login.** The user name and password must match `SUPER_ADMIN_1` and `SUPER_ADMIN_1_PASSWORD`. After 5 failed attempts for the same user name within 15 minutes, the account locks for a time. Wait and try again.

**Port already in use.** Set a different port in `.env`, for example `PORT=3001`, and restart. In Docker, change the port mapping, for example `-p 3001:3000`.

**Login worked before but stopped after a config change.** If you changed `SESSION_SECRET`, CHOps can no longer decrypt the stored ClickHouse&reg; passwords. Restore the original secret, or enter the affected credentials again.

**A `SESSION_SECRET` shorter than 32 characters exits at startup.** The encryption key derivation needs 32 characters or more. Make one with `openssl rand -hex 32`.

---

## Next steps

- [Configuration](getting-started/configuration.md) for every environment variable and the in-app connection bar.
- [Production deployment](deployment/production.md) to run behind Caddy with systemd.
- [Building a Binary](development/binary-build.md) to distribute a single executable.
