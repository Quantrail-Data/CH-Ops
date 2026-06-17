# Production Deployment

This guide walks you through deploying CHOps on a Linux server with automatic HTTPS (via Caddy) and automatic startup (via systemd). By the end, CHOps will be running as a background service at `https://your-domain.com`, restarting automatically if it crashes or the server reboots.

If you are new to Linux servers, read every step - nothing is skipped.

---

## Prerequisites

You need:

- A Linux server (Ubuntu 22.04/24.04, Debian 12, or similar)
- A domain name pointing to your server's IP address (e.g., `chops.example.com`)
- SSH access to the server
- Port 80 and 443 open in your firewall (for HTTPS)
- Port 8123 accessible from the server to your ClickHouse® host (not from the internet)

---

## Step 1: Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

If you are building a binary instead, you only need Bun on your build machine, not on the production server.

---

## Step 2: Set Up CHOps

### Option A: Run from source

```bash
cd /opt
git clone https://github.com/quantrail/chops.git
cd chops
bun install
cp .env.example .env
```

Edit `/opt/chops/.env`:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=your_strong_password_here
SESSION_SECRET=paste_a_64_char_random_string_here
PORT=3000
NODE_ENV=production
```

Generate a strong SESSION_SECRET (must be at least 32 characters):

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

Build the binary on your development machine:

```bash
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

systemd is the process manager built into Linux. It will start CHOps automatically on boot, restart it if it crashes, and let you manage it with simple commands.

Create a dedicated system user (no login, no home directory - just for running the service):

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
Documentation=https://github.com/quantrail/chops
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
Documentation=https://github.com/quantrail/chops
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

- `After=network.target` - wait for networking before starting
- `User=chops` - run as the dedicated user, not root
- `Restart=on-failure` - restart automatically if CHOps crashes
- `RestartSec=5` - wait 5 seconds between restarts
- `EnvironmentFile` - loads your `.env` variables into the process
- `NoNewPrivileges=true` - process cannot gain extra permissions
- `ProtectSystem=strict` - makes the filesystem read-only except for allowed paths
- `ReadWritePaths=/opt/chops/data` - CHOps can only write to its data directory
- `PrivateTmp=true` - gives the service its own /tmp (isolated from other processes)

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable chops
sudo systemctl start chops
```

Check that it is running:

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

CHOps outputs structured JSON logs to stdout/stderr, which systemd's journald captures automatically. Each log entry is a single JSON line with timestamp, level, message, and context:

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

**Log levels:** Set `LOG_LEVEL=debug` in your `.env` file to enable debug-level logging. Default is `info`. Levels: debug, info, warn, error.

**What is logged:** Every API request (method, path, status, duration, username, IP). Scheduler events (backup started/completed/failed, alert notifications). Server startup. Errors.

**What is NOT logged:** Passwords, tokens, credentials, SQL queries, request bodies, response bodies. The only `console.error` remaining is the fatal config error at startup (before the logger is initialized).

---

## Step 4: Install Caddy

Caddy is a web server that automatically handles HTTPS certificates (via Let's Encrypt). You do not need to manually generate or renew SSL certificates.

### Ubuntu/Debian

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Verify installation:

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

1. Obtain a free TLS certificate from Let's Encrypt
2. Automatically renew it before it expires
3. Redirect HTTP (port 80) to HTTPS (port 443)
4. Proxy all requests to CHOps on port 3000

Restart Caddy to apply:

```bash
sudo systemctl restart caddy
```

Check that Caddy is running:

```bash
sudo systemctl status caddy
```

Open `https://chops.example.com` in your browser. You should see the CHOps login page with a valid HTTPS certificate.

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

Restrict access to specific IP addresses (e.g., your office network):

```
chops.example.com {
    @blocked not remote_ip 203.0.113.0/24 198.51.100.42
    respond @blocked 403

    reverse_proxy localhost:3000
}
```

### Custom headers

Add extra security headers or override ones set by CHOps:

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

Note: CHOps uses SQLite which does not support multiple writers. Only use this for read scaling or active/standby setups.

---

## Step 6: Verify the Deployment

Run through this checklist:

1. Open `https://chops.example.com` - should load with a valid HTTPS certificate (padlock icon)
2. Try `http://chops.example.com` - should redirect to HTTPS automatically
3. Log in with your super admin credentials
4. Go to Administration > Cluster Management, add a ClickHouse® node, test the connection
5. Reboot the server (`sudo reboot`) and verify CHOps comes back automatically

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

This runs `bun run db:backup` every day at 2:00 AM. Backups are saved to `/opt/chops/data/backups/`. For binary installs, replace the command with:

```
0 2 * * * cd /opt/chops && ./chops db:backup 2>/dev/null || true
```

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

The database migration is safe to run on an existing database - it only creates tables that do not already exist.

---

## Troubleshooting

**Caddy shows "connection refused"** - CHOps is not running. Check `sudo systemctl status chops` and `sudo journalctl -u chops -n 20`.

**Certificate errors** - Make sure your domain's DNS A record points to your server's public IP. Caddy needs ports 80 and 443 open to complete the ACME challenge.

**"SESSION_SECRET must be at least 32 characters"** - Your `.env` file has a SESSION_SECRET shorter than 32 characters. Generate a new one with `openssl rand -hex 32`.

**Permission denied errors** - Make sure the `chops` user owns the data directory: `sudo chown -R chops:chops /opt/chops/data`.

**Port 3000 already in use** - Change the `PORT` in `.env` to something else (e.g., 3001) and update the Caddyfile `reverse_proxy` line to match.

---

## Docker Deployment

CHOps ships with a Dockerfile and docker-compose.yml for containerized deployment. The image uses `oven/bun:1.1-alpine` (lightweight, ~150MB final image) with a multi-stage build.

### Quick Start

```bash
# Clone or extract the project
cd chops

# Set your secret (required)
export SESSION_SECRET=$(openssl rand -hex 32)

# Build and run
docker compose up -d

# Check it's running
docker compose logs -f
```

CHOps is now at `http://localhost:3000`. The SQLite database persists in the `chops-data` Docker volume.

### Build Only (without Compose)

```bash
docker build -t chops .
docker run -d \
  --name chops \
  -p 3000:3000 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  -v chops-data:/app/data \
  chops
```

### Environment Variables

Pass environment variables via `docker compose` environment section or `docker run -e`:

- `SESSION_SECRET` (required) - random string for JWT signing and credential encryption
- `ADMIN_USER` / `ADMIN_PASSWORD` (optional) - seed a super admin on first startup
- `DISABLE_ENV_LOGIN=true` (optional) - disable .env login fallback in production
- `PORT=3000` (default) - HTTP port inside the container
- `LOG_LEVEL=info` (default) - debug, info, warn, error

### Data Persistence

The SQLite database is stored at `/app/data/chadmin.db` inside the container. The `docker-compose.yml` maps this to a named volume (`chops-data`) so data survives container restarts and rebuilds.

To back up the database:

```bash
docker cp chops:/app/data/chadmin.db ./chops-backup.db
```

### Updating

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

The database volume is not deleted during rebuild. Your data, users, alerts, dashboards, and cluster config persist across updates.

### Health Check

The container has a built-in health check that pings `/api/health` every 30 seconds. Check status with:

```bash
docker inspect --format='{{.State.Health.Status}}' chops
```

### Image Details

- Base: `oven/bun:1.1-alpine` (Alpine Linux + Bun runtime)
- Multi-stage build: dependencies + frontend build in stage 1, slim runtime in stage 2
- Non-root user (`chops`) for security
- Final image size: ~150MB
- Includes: built React frontend, backend source, production node_modules, docs
