# Configuration

CHOps is configured using a `.env` file in the project root folder. This file contains settings like your admin username, password, and server port.

To create your config file, copy the example:

```bash
cp .env.example .env
```

Then open `.env` in a text editor and change the values.

> **What about ClickHouse® connection details?** Those are configured in the browser UI, not in this file. After logging in, go to **Administration > Cluster Management** to add your ClickHouse® nodes.

## Environment Variables

### Super Admins (Required)

These are the login credentials for CHOps itself (not your ClickHouse® users). You need at least one super admin. You can have up to three.

| Variable | Required | Default | What it does |
|----------|----------|---------|-------------|
| `SUPER_ADMIN_1` | Yes | - | Username for the first admin account |
| `SUPER_ADMIN_1_PASSWORD` | Yes | - | Password for the first admin account |
| `SUPER_ADMIN_2` | No | - | Username for a second admin (optional) |
| `SUPER_ADMIN_2_PASSWORD` | No | - | Password for the second admin |
| `SUPER_ADMIN_3` | No | - | Username for a third admin (optional) |
| `SUPER_ADMIN_3_PASSWORD` | No | - | Password for the third admin |

**Example:**

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=MySecurePassword123
```

### Server Settings

| Variable | Required | Default | What it does |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Which port CHOps runs on |
| `NODE_ENV` | No | `development` | Set to `production` when deploying for real use |
| `SESSION_SECRET` | Yes | - | A random string used to secure login sessions and encrypt stored credentials. Generate one with: `openssl rand -hex 32`. **Important**: if you change this after setup, all stored ClickHouse® passwords will need to be re-entered (they are encrypted with this secret). |

### Security Settings

| Variable | Required | Default | What it does |
|----------|----------|---------|-------------|
| `DISABLE_ENV_LOGIN` | No | `false` | Set to `true` to disable the .env password fallback. When enabled, only database users can log in. Recommended after initial setup. |

### Email Settings (Optional)

These are only needed if you want CHOps to email passwords to new users when you create their accounts. If you skip these, you will need to share passwords manually.

| Variable | Required | Default | What it does |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | - | Your email server address (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | No | `587` | Your email server port |
| `SMTP_USER` | No | - | Email login username |
| `SMTP_PASS` | No | - | Email login password |
| `SMTP_FROM` | No | `CHOps <noreply@chops>` | The "from" address shown in emails |

## The Connection Bar

At the top of every page, you will see a connection bar with three fields:

- **Node**: A dropdown that lists your ClickHouse® servers. When you switch nodes, the username, password, and port automatically update to match that node's saved credentials. You can override them manually if needed.
- **User**: The ClickHouse® username to connect with.
- **Password**: The ClickHouse® password.

Click the plug icon to test the connection. A green dot means connected, red means disconnected.

## Dark Mode / Light Mode

Click the sun or moon icon in the top-right corner to switch themes. Your preference is saved in your browser.

## Date and Time Format

All dates and times in CHOps use 24-hour format: `2026-05-13 14:30:00`. This matches the format ClickHouse® expects.
