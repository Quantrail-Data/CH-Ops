# Installation

This guide walks you through setting up CHOps from scratch.

## What You Need Before Starting

1. **Bun**: a fast JavaScript runtime (similar to Node.js). Install it by running this in your terminal:

```bash
curl -fsSL https://bun.sh/install | bash
```

After installing, close and reopen your terminal, then verify it works:

```bash
bun --version
```

2. **A running ClickHouse® server** that CHOps can connect to over HTTP (port 8123 by default). You can test if your ClickHouse® server is reachable:

```bash
curl http://your-clickhouse-host:8123/ping
```

If it prints `Ok.`, you're good to go.

## Step 1: Download CHOps

Clone the repository and install the required packages:

```bash
git clone https://github.com/quantrail/chops.git
cd chops
bun install
```

The `bun install` command downloads all the libraries CHOps needs. This may take a minute.

## Step 2: Configure Your Settings

Copy the example configuration file to create your own:

```bash
cp .env.example .env
```

Open the `.env` file in any text editor (VS Code, nano, vim, etc.) and fill in these required values:

```env
SUPER_ADMIN_1=admin                        # pick a username
SUPER_ADMIN_1_PASSWORD=your_password_here  # pick a strong password
SESSION_SECRET=some_long_random_string     # any random string, 32+ characters
```

You can generate a good random string for `SESSION_SECRET` with:

```bash
openssl rand -hex 32
```

See the [Configuration](getting-started/configuration.md) page for all available settings.

## Step 3: Set Up the Database

CHOps uses a small SQLite database to store its own settings (alerts, dashboards, users, etc.). Create it by running:

```bash
bun run db:migrate
```

This creates a `data/chadmin.db` file in the project folder. You do not need to install SQLite separately.

## Step 4: Start CHOps

**For development** (auto-reloads when you change code):

```bash
bun run dev
```

This starts two servers:
- Backend API server on port 3000
- Frontend dev server on port 5173

Open **http://localhost:5173** in your browser.

**For production** (optimized build):

```bash
bun run build
bun src/backend/server.js
```

Open **http://localhost:3000** in your browser.

## Step 5: First Login and Setup

1. Open CHOps in your browser.
2. Sign in with the username and password you set in `.env` (`SUPER_ADMIN_1` / `SUPER_ADMIN_1_PASSWORD`).
3. Go to **Administration > Cluster Management** in the left sidebar.
4. Click **Add Node** and enter your ClickHouse® server details (hostname, port, username, password).
5. Click **Test** to verify the connection, then **Save**.
6. Go to **Overview > Cluster Overview** in the sidebar. You should see your ClickHouse® version and uptime.

## Troubleshooting

**"Cannot connect to ClickHouse®"**: Make sure the ClickHouse® HTTP port (usually 8123) is open and accessible from the machine running CHOps. Try `curl http://your-host:8123/ping` to check.

**"Invalid credentials"**: Double-check the username and password in your `.env` file match what you typed on the login page.

**Port already in use**: If port 3000 is taken, set a different one in `.env`: `PORT=3001`
