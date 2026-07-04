# Installation

This guide walks you through setting up CHOps from scratch.

## What You Need Before Starting

1. **Bun**: a fast JavaScript runtime (similar to Node.js). Install it by running this in your terminal: 

Recommended Version: 1.3.13

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

3. **A running Qdrant server** that CHOps can connect to. Follow one of the setup methods below based on your operating system.

### Linux Installation (System Service)

#### Step 1: Download the Qdrant Debian Package

Download the required Qdrant release package. Replace the version if you want to install a different release.

```bash
sudo wget https://github.com/qdrant/qdrant/releases/download/v1.17.0/qdrant_1.17.0-1_amd64.deb
```

#### Step 2: Install Qdrant

Install the downloaded package:

```bash
sudo dpkg -i qdrant_1.17.0-1_amd64.deb
```

If any dependency issues occur, resolve them by running:

```bash
sudo apt-get install -f
```

#### Step 3: Create a Systemd Service

Create a new systemd service file:

```bash
sudo nano /etc/systemd/system/qdrant.service
```

Add the following configuration:

```ini
[Unit]
Description=Qdrant Vector Database
After=network.target

[Service]
ExecStart=/usr/bin/qdrant --config-path /etc/qdrant/config.yaml
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```

> **Note:** Verify that the following paths exist after installation:
>
> * `/usr/bin/qdrant`
> * `/etc/qdrant/config.yaml`

#### Step 4: Reload the Systemd Daemon

```bash
sudo systemctl daemon-reload
```

#### Step 5: Enable the Service

```bash
sudo systemctl enable qdrant
```

#### Step 6: Start the Service

```bash
sudo systemctl start qdrant
```

#### Step 7: Verify the Installation

```bash
sudo systemctl status qdrant
```

If the service is running successfully, Qdrant is ready to use.

#### Step 8: View Service Logs

```bash
sudo journalctl -u qdrant -f
```

### macOS (Docker)

For macOS, or if you prefer a containerized setup, running Qdrant with Docker is the recommended approach.

Install and start one of the following container runtimes:

* Docker
* Podman

The examples below use Docker.

Pull the Qdrant image:

```bash
docker pull qdrant/qdrant
```

Run Qdrant:

```bash
docker run -p 6333:6333 \
    -v $(pwd)/path/to/data:/qdrant/storage \
    qdrant/qdrant
```

This command starts Qdrant with the default configuration and persists data in the mounted storage directory.

Once the container is running, Qdrant is available at:

```
http://localhost:6333
```

To override the default production configuration:

```bash
docker run -p 6333:6333 \
    -v $(pwd)/path/to/data:/qdrant/storage \
    -v $(pwd)/path/to/custom_config.yaml:/qdrant/config/production.yaml \
    qdrant/qdrant
```

Alternatively, specify a custom configuration file explicitly:

```bash
docker run -p 6333:6333 \
    -v $(pwd)/path/to/data:/qdrant/storage \
    -v $(pwd)/path/to/custom_config.yaml:/qdrant/config/custom_config.yaml \
    qdrant/qdrant \
    ./qdrant --config-path config/custom_config.yaml
```

### Docker Compose

Example `docker-compose.yml`:

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: qdrant
    restart: always

    ports:
      - "6333:6333"
      - "6334:6334"

    expose:
      - "6333"
      - "6334"
      - "6335"

    configs:
      - source: qdrant_config
        target: /qdrant/config/production.yaml

    volumes:
      - ./qdrant_data:/qdrant/storage

configs:
  qdrant_config:
    content: |
      log_level: INFO
```

Start the container:

```bash
docker compose up -d
```

#### Verify the Installation

After Qdrant starts successfully, open the following URL in your browser:

```
http://localhost:6333
```

A successful installation displays the Qdrant welcome message, indicating that the server is running and ready to accept requests.

# Getting Started with CHOps

## Step 1: Download CHOps

Clone the repository and install the required packages:

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
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

This creates a `data/chops.db` file in the project folder. You do not need to install SQLite separately.

## Step 4: Start CHOps

**For development** (auto-reloads when you change code):

```bash
bun run dev
```

This starts two servers:

* Backend API server on port 3000
* Frontend dev server on port 5173

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
