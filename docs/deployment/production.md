# Production Deployment

This guide walks you through a deployment of CHOps on a Linux server with automatic HTTPS (via Caddy) and automatic startup (via systemd). At the end, CHOps runs as a background service at `https://your-domain.com`, and restarts automatically if it crashes or the server reboots.

If you are new to Linux servers, read every step. Nothing is skipped.

---

## Prerequisites

You need:

- A Linux server (tested on Ubuntu 24.04 and 26.04, and Debian 13; other modern distributions should also work).
- A hostname for the server. Use a public domain (for example, `chops.example.com`) if you expose CHOps to the internet, or an internal DNS name or plain IP address if you run it on a private network. A domain is not required.
- SSH access to the server.
- If you expose CHOps publicly with automatic HTTPS: ports 80 and 443 reachable from the internet, which Let's Encrypt needs to issue certificates. On a private network this is not required. See the internal TLS options in Step 5.
- Port 8123 reachable from the server to your ClickHouse&reg; host (not from the internet).

---

## Step 1: Install Bun

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.13"
source ~/.bashrc
bun --version
```

If you build a binary instead, you only need Bun on your build machine, not on the production server.

---

## Step 2: Set Up CHOps

### Option A: Run from source

```bash
cd /opt
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
bun install
cp .env.example .env
```

Edit `/opt/chops/.env`:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=your_strong_password_here
SUPER_ADMIN_1_EMAIL=you@example.com
ENCRYPTION_SECRET=paste_a_64_char_random_string_here
PORT=3000
NODE_ENV=production
```

`SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `ENCRYPTION_SECRET` are all required. The server exits on startup if any is missing. See [Configuration](../getting-started/configuration.md) for the full list.

Generate a strong ENCRYPTION_SECRET (it must be at least 32 characters):

```bash
openssl rand -hex 32
```

Run the database migration and build the frontend:

```bash
bun run db:migrate
bun run build
```

Test that it starts:

```bash
bun src/backend/server.js
# Should print: CHOps v<version> listening on http://localhost:3000
# Press Ctrl+C to stop
```

### Option B: Run from binary

You can download a prebuilt binary instead of a build of your own. Prebuilt binaries for Linux, macOS, and Windows are published on the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases). Download `chops-linux-x64` and skip to "Copy the binary and `.env` to your server" below (the copy step already renames it to `/opt/chops/chops`).

To build it yourself, do so on your development machine. Run `bun install` first: it installs dependencies and applies the `@xenova/transformers` patch that keeps the compiled binary self-contained. A build without it produces a binary that crashes at startup on native modules. See [Building a Binary](../development/binary-build.md) for details.

```bash
bun install
bun run build:binary:linux
```

Copy the binary and `.env` to your server:

```bash
scp chops-linux-x64 your-server:/opt/chops/chops
scp .env your-server:/opt/chops/.env
```

On the server:

```bash
chmod +x /opt/chops/chops
cd /opt/chops
./chops
# Should print: CHOps v<version> listening on http://localhost:3000
# Press Ctrl+C to stop
```

---

## Step 3: Create a systemd Service

systemd is the process manager built into Linux. It starts CHOps automatically on boot, restarts it if it crashes, and lets you manage it with simple commands.

Create a dedicated system user (no login, no home directory, only to run the service):

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin chops
sudo chown -R chops:chops /opt/chops
```

Create the service file:

```bash
sudo nano /etc/systemd/system/chops.service
```

### For source installs:

```ini
[Unit]
Description=CHOps - ClickHouse® Administration Dashboard
Documentation=https://github.com/Quantrail-Data/CH-Ops
After=network.target

[Service]
Type=simple
User=chops
Group=chops
WorkingDirectory=/opt/chops
ExecStart=/home/chops/.bun/bin/bun src/backend/server.js
Restart=on-failure
RestartSec=5

# Environment file
EnvironmentFile=/opt/chops/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/chops/data
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=chops

[Install]
WantedBy=multi-user.target
```

### For binary installs:

```ini
[Unit]
Description=CHOps - ClickHouse® Administration Dashboard
Documentation=https://github.com/Quantrail-Data/CH-Ops
After=network.target

[Service]
Type=simple
User=chops
Group=chops
WorkingDirectory=/opt/chops
ExecStart=/opt/chops/chops
Restart=on-failure
RestartSec=5

# Environment file
EnvironmentFile=/opt/chops/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/chops/data
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=chops

[Install]
WantedBy=multi-user.target
```

**What each setting does:**

- `After=network.target`: wait for networking before start.
- `User=chops`: run as the dedicated user, not root.
- `Restart=on-failure`: restart automatically if CHOps crashes.
- `RestartSec=5`: wait 5 seconds between restarts.
- `EnvironmentFile`: loads your `.env` variables into the process.
- `NoNewPrivileges=true`: the process cannot gain extra permissions.
- `ProtectSystem=strict`: makes the filesystem read-only except for allowed paths.
- `ReadWritePaths=/opt/chops/data`: CHOps can only write to its data directory.
- `PrivateTmp=true`: gives the service its own /tmp (isolated from other processes).

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable chops
sudo systemctl start chops
```

Check that it runs:

```bash
sudo systemctl status chops
```

You should see `active (running)`. If it failed, check the logs:

```bash
sudo journalctl -u chops -f
```

### Useful systemd commands

```bash
sudo systemctl start chops      # Start the service
sudo systemctl stop chops       # Stop the service
sudo systemctl restart chops    # Restart after config changes
sudo systemctl status chops     # Check if it is running
sudo journalctl -u chops -n 50  # View last 50 log lines
sudo journalctl -u chops -f     # Follow logs in real time
```

### Logging

CHOps outputs structured JSON logs to stdout and stderr, which systemd's journald captures automatically. Each log entry is a single JSON line with timestamp, level, message, and context:

```json
{"ts":"2026-05-18T10:30:00.000Z","level":"info","msg":"GET /api/alerts/rules 200 12ms","ctx":{"method":"GET","path":"/api/alerts/rules","status":200,"duration":12,"user":"admin","ip":"::1"}}
```

**Viewing logs:**

```bash
# Human-readable (default)
sudo journalctl -u chops -f

# JSON output for piping to jq or a log aggregator
sudo journalctl -u chops -o json | jq '.MESSAGE | fromjson'

# Filter by log level (errors only)
sudo journalctl -u chops -f | grep '"level":"error"'

# Last hour of logs
sudo journalctl -u chops --since "1 hour ago"
```

**Log levels:** set `LOG_LEVEL=debug` in your `.env` file to enable debug-level logging. The default is `info`. Levels: debug, info, warn, error.

**What is logged:** every API request (method, path, status, duration, username, IP). Scheduler events (backup started, completed, failed, and alert notifications). Server startup. Errors.

**What is NOT logged by the request logger:** passwords, tokens, request bodies, or response bodies. Note that unhandled errors and some diagnostic output are still written directly to stdout and stderr, outside the structured logger, so treat the journal as content that may contain raw error detail.

---

## Step 4: Install Caddy

Caddy is a web server that handles HTTPS certificates automatically (via Let's Encrypt). You do not need to generate or renew SSL certificates by hand. Automatic public certificates require the server to be reachable from the internet. For a private-network deployment, Caddy can instead issue certificates from its own local certificate authority, or serve plain HTTP (see Step 5).

### Ubuntu/Debian

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Verify the installation:

```bash
caddy version
```

---

## Step 5: Configure Caddy

Edit the Caddyfile:

```bash
sudo nano /etc/caddy/Caddyfile
```

Replace the contents with:

```
chops.example.com {
    reverse_proxy localhost:3000
}
```

Replace `chops.example.com` with your actual domain name.

That is the entire configuration. Caddy will:

1. Obtain a free TLS certificate from Let's Encrypt.
2. Renew it automatically before it expires.
3. Redirect HTTP (port 80) to HTTPS (port 443).
4. Proxy all requests to CHOps on port 3000.

Restart Caddy to apply:

```bash
sudo systemctl restart caddy
```

Check that Caddy runs:

```bash
sudo systemctl status caddy
```

Open `https://chops.example.com` in your browser. You should see the CHOps login page with a valid HTTPS certificate.

### Running without a public domain (private networks)

If CHOps runs on a private network with no public domain, you do not need Let's Encrypt. Caddy can serve an internal DNS name or an IP address with a certificate from its own local certificate authority. Use `tls internal`:

```
chops.internal.example {
    tls internal
    reverse_proxy localhost:3000
}
```

Replace `chops.internal.example` with the internal DNS name your users resolve to the server. You can also use the server's IP directly:

```
10.0.0.5 {
    tls internal
    reverse_proxy localhost:3000
}
```

With `tls internal`, Caddy generates its own root CA and issues the certificate locally. Browsers warn that the certificate is untrusted until you distribute and trust Caddy's root CA on client machines. It lives under Caddy's data directory, typically at `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`.

On a trusted internal network where TLS is not needed, you can have Caddy serve plain HTTP. Prefix the address with `http://` (this also disables the automatic HTTP-to-HTTPS redirect):

```
http://chops.internal.example {
    reverse_proxy localhost:3000
}
```

You can also skip Caddy entirely and expose CHOps directly on its port (`http://server-ip:3000`), though a reverse proxy is still useful for TLS and access control. For browser-trusted certificates on an internal domain without open ports 80 and 443, use a DNS-challenge certificate, which requires a Caddy build that includes your DNS provider's plugin.

---

## Advanced Caddy Configurations

### Basic authentication in front of CHOps

Add a second layer of authentication at the reverse proxy level (in addition to CHOps's own login):

```
chops.example.com {
    basicauth {
        admin $2a$14$yourhashedpasswordhere
    }
    reverse_proxy localhost:3000
}
```

Generate a bcrypt hash for the password:

```bash
caddy hash-password --plaintext 'your-password'
```

### IP allowlisting

Restrict access to specific IP addresses (for example, your office network):

```
chops.example.com {
    @blocked not remote_ip 203.0.113.0/24 198.51.100.42
    respond @blocked 403

    reverse_proxy localhost:3000
}
```

### Custom headers

Add extra security headers, or override ones set by CHOps:

```
chops.example.com {
    header {
        X-Robots-Tag "noindex, nofollow"
    }
    reverse_proxy localhost:3000
}
```

### Rate limiting at the reverse proxy

Caddy can rate-limit before requests reach CHOps:

```
chops.example.com {
    rate_limit {
        zone dynamic_zone {
            key {remote_host}
            events 100
            window 1m
        }
    }
    reverse_proxy localhost:3000
}
```

Note: the `rate_limit` directive requires the `caddy-ratelimit` plugin.

### Multiple CHOps instances behind load balancer

```
chops.example.com {
    reverse_proxy localhost:3000 localhost:3001 {
        lb_policy round_robin
        health_uri /api/health
        health_interval 10s
    }
}
```

Note: CHOps uses SQLite, which does not support multiple writers. Only use this for read scaling or active/standby setups.

---

## Step 6: Verify the Deployment

Run through this checklist:

1. Open your CHOps address (`https://chops.example.com`, an internal DNS name, or the server IP). It should load the login page. With a public domain you get a trusted certificate. With `tls internal` you see a certificate warning until Caddy's root CA is trusted on the client.
2. If you configured public HTTPS, `http://chops.example.com` should redirect to HTTPS automatically.
3. Log in with your super admin credentials.
4. Go to Administration > Cluster Management, add a ClickHouse&reg; node, and test the connection.
5. Reboot the server (`sudo reboot`) and check that CHOps comes back automatically.

---

## Automated Database Backups

Add a cron job to back up the SQLite database daily:

```bash
sudo crontab -u chops -e
```

Add this line:

```
0 2 * * * cd /opt/chops && /home/chops/.bun/bin/bun run db:backup
```

This runs `bun run db:backup` every day at 2:00 AM. Backups are saved to `/opt/chops/data/backups/` as `chops-<timestamp>.db`. The binary does not expose a `db:backup` subcommand (to run `./chops` only starts the server), so for binary installs use either the in-app **Administration > App Data Backup** (super admin), or a SQLite backup on a schedule:

```
0 2 * * * sqlite3 /opt/chops/data/chops.db ".backup '/opt/chops/data/backups/chops-$(date +\%Y\%m\%d).db'"
```

This needs `sqlite3` on the host, and `/opt/chops/data/backups/` to exist.

To keep only the last 30 backups, add a cleanup line:

```
5 2 * * * find /opt/chops/data/backups -name "chops-*.db" -mtime +30 -delete
```

---

## Updating CHOps

### Source install

```bash
sudo systemctl stop chops
cd /opt/chops
git pull
bun install
bun run db:migrate
bun run build
sudo systemctl start chops
```

### Binary install

```bash
sudo systemctl stop chops
# Copy new binary to /opt/chops/chops
sudo systemctl start chops
```

The database migration is safe to run on an existing database. It only creates tables that do not already exist.

---

## Troubleshooting

**Caddy shows "connection refused"**: CHOps is not running. Check `sudo systemctl status chops` and `sudo journalctl -u chops -n 20`.

**Certificate errors**: make sure your domain's DNS A record points to your server's public IP. Caddy needs ports 80 and 443 open to complete the ACME challenge.

**"ENCRYPTION_SECRET must be at least 32 characters"**: your `.env` file has a ENCRYPTION_SECRET shorter than 32 characters. Generate a new one with `openssl rand -hex 32`.

**"Missing required env" on startup**: one of `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, or `ENCRYPTION_SECRET` is unset. Under systemd, confirm they are in the `EnvironmentFile`. Under Docker, confirm they are passed to the container.

**Permission denied errors**: make sure the `chops` user owns the data directory: `sudo chown -R chops:chops /opt/chops/data`.

**Port 3000 already in use**: change the `PORT` in `.env` to something else (for example, 3001) and update the Caddyfile `reverse_proxy` line to match.

---

## Docker Deployment

CHOps ships with a Dockerfile and docker-compose.yml for a containerized deployment. The image uses `oven/bun:1.3.13-alpine` with a multi-stage build.

### Quick Start

The bundled docker-compose.yml reads your configuration from a `.env` file (through `env_file: .env`), so create that file first.

```bash
# Clone or extract the project
cd CH-Ops

# Create your .env file and edit it
cp .env.example .env
nano .env
# Set ENCRYPTION_SECRET (openssl rand -hex 32), SUPER_ADMIN_1,
# SUPER_ADMIN_1_PASSWORD, and SUPER_ADMIN_1_EMAIL

# Build and run
docker compose up -d

# Check that it runs
docker compose logs -f
```

CHOps is now at `http://localhost:3000`. The SQLite database persists in the `chops-data` Docker volume.

Because the compose file reads from `.env`, put your values in that file. To export them only in your shell does not pass them to the container.

### Build Only (without Compose)

```bash
docker build -t chops .
docker run -d \
  --name chops \
  -p 3000:3000 \
  -e ENCRYPTION_SECRET=$(openssl rand -hex 32) \
  -e SUPER_ADMIN_1=admin \
  -e SUPER_ADMIN_1_PASSWORD=your_strong_password_here \
  -e SUPER_ADMIN_1_EMAIL=you@example.com \
  -v chops-data:/app/data \
  chops
```

### Environment Variables

Pass environment variables through the `docker compose` env file or `docker run -e`:

- `ENCRYPTION_SECRET` (required): a random string that makes the key for stored credentials. It cannot be changed after the first start.
- `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL` (required): the first super admin, seeded on first startup.
- `DISABLE_ENV_LOGIN=true` (optional): disable the .env login fallback in production.
- `PORT=3000` (default): the HTTP port inside the container.
- `LOG_LEVEL=info` (default): debug, info, warn, error.

The bundled `docker-compose.yml` loads your whole `.env` with `env_file: .env`, so every variable in the file reaches the container, including `SUPER_ADMIN_1_EMAIL` and any `SMTP_*` settings. It then sets `NODE_ENV=production` and `PORT=3000` in its own `environment:` section, which override anything in `.env`. Because it reads from the file, put your values in `.env` rather than only in your shell.

### Data Persistence

The SQLite database is stored at `/app/data/chops.db` inside the container. The `docker-compose.yml` maps this to a named volume (`chops-data`), so the data survives container restarts and rebuilds.

To back up the database:

```bash
docker cp chops:/app/data/chops.db ./chops-backup.db
```

### Updating

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

The database volume is not deleted during a rebuild. Your data, users, alerts, dashboards, and cluster config persist across updates.

### Health Check

The container has a built-in health check that pings `/api/health` every 30 seconds. Check the status with:

```bash
docker inspect --format='{{.State.Health.Status}}' chops
```

### Image Details

- Base: `oven/bun:1.3.13-alpine` (Alpine Linux and the Bun runtime).
- Multi-stage build: dependencies and the frontend build in stage 1, a slim runtime in stage 2.
- Non-root user (`chops`) for security.
- Includes: the built React frontend, the backend source, production node_modules, and the docs.
