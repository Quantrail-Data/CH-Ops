# Configuration

CHOps is configured through a `.env` file in the project root. It holds your CHOps login credentials, the session secret, the server port, optional email settings, and a few frontend build values. Your ClickHouse® connection details do not go here.

Create your file by copying the shipped example, then edit it:

```bash
cp .env.example .env
```

> **What about ClickHouse® connection details?** Those are configured in the browser, not in this file. After logging in, go to **Administration > Cluster Management** to add your ClickHouse® nodes. Their passwords are encrypted and stored in CHOps's database, not in `.env`.

## How CHOps reads configuration

Two things are worth knowing before you edit anything.

**Backend variables are read at startup.** On boot, the server validates its environment and exits immediately if a required value is missing, so a typo in a required variable stops CHOps from starting rather than causing a subtle failure later. Changing a backend variable takes effect on the next restart.

**Frontend variables (the `VITE_` ones) are baked in at build time.** Vite reads them when you run `bun run build` (or `bun run dev`) and compiles their values into the frontend bundle. Changing a `VITE_` value means rebuilding the frontend for it to take effect; changing it on a already-built server does nothing.

---

## Super admins (required)

These are the login accounts for CHOps itself, not your ClickHouse® users. At least the first super admin must be fully defined, and you can define up to three. Each account needs a username, a password, and an email address. The email is required: the server will not start if `SUPER_ADMIN_1_EMAIL` is missing.

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `SUPER_ADMIN_1` | Yes | none | Username of the first super admin |
| `SUPER_ADMIN_1_PASSWORD` | Yes | none | Password for the first super admin |
| `SUPER_ADMIN_1_EMAIL` | Yes | none | Email for the first super admin |
| `SUPER_ADMIN_2` | No | none | Username of a second super admin |
| `SUPER_ADMIN_2_PASSWORD` | No | none | Password for the second super admin |
| `SUPER_ADMIN_2_EMAIL` | No | none | Email for the second super admin |
| `SUPER_ADMIN_3` | No | none | Username of a third super admin |
| `SUPER_ADMIN_3_PASSWORD` | No | none | Password for the third super admin |
| `SUPER_ADMIN_3_EMAIL` | No | none | Email for the third super admin |

These accounts are seeded into CHOps's database on first startup, then used for initial setup and emergency login.

**Example:**

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=MySecurePassword123
SUPER_ADMIN_1_EMAIL=admin@example.com
```

A second and third admin are defined by filling in all three of their numbered variables. A partially filled set (for example a username with no email) is ignored.

### Legacy single-admin format

Older installations used an unnumbered set. It is still accepted when the numbered variables are absent:

```env
SUPER_ADMIN=admin
SUPER_ADMIN_PASSWORD=change_me
SUPER_ADMIN_EMAIL=admin@example.com
```

New installations should use the numbered `SUPER_ADMIN_1` form above.

---

## Session and authentication (required)

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `SESSION_SECRET` | Yes | none | A long random string (32+ characters) used to sign login sessions and to derive the key that encrypts stored ClickHouse® passwords. Generate one with `openssl rand -hex 32`. |

> Do not change `SESSION_SECRET` after your first run. It is the encryption key for every stored ClickHouse® password, so changing it makes those saved credentials unreadable and you will have to re-enter them.

---

## Server

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `PORT` | No | `3000` | The port the backend listens on. |
| `NODE_ENV` | No | `development` | The runtime environment label. Set to `production` when deploying for real use. |

---

## Login fallback

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `DISABLE_ENV_LOGIN` | No | `false` (fallback enabled) | When set to exactly `true`, the `.env` super-admin login fallback is turned off, so only accounts in the CHOps database can sign in. |

The shipped `.env.example` sets `DISABLE_ENV_LOGIN=true`. This is safe from the start, because your first super admin is also seeded into the CHOps database on first startup and can log in through the normal database path. Leave it at `true` to keep the surface small, or set it to `false` (or remove it) if you want the `.env` credentials to work as a fallback during setup. Any value other than the exact string `true` leaves the fallback enabled.

---

## Email (SMTP, optional)

Configure SMTP only if you want CHOps to send email. When configured, it is used for alert notifications, for emailing a generated password to a newly created user, and for password-reset messages. Without these values, those emails simply are not sent.

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `SMTP_HOST` | No | empty | Your email server address (for example `smtp.gmail.com`). Leave empty to disable email. |
| `SMTP_PORT` | No | `587` | The email server port. |
| `SMTP_USER` | No | empty | The SMTP login username. |
| `SMTP_PASS` | No | empty | The SMTP login password. |
| `SMTP_FROM` | No | `CHOps <noreply@chops>` | The "from" address shown on outgoing email. |

---

## Password-reset link

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `FRONTEND_LINK` | No | none | The base URL of your CHOps frontend, used to build the "return to login" link inside password-reset emails. Set this to the address users reach CHOps at, for example `http://localhost:5173` in development or your public URL in production. |

---

## Build and version metadata (optional)

These describe the running build and are normally populated by the build pipeline. In local development they are usually left blank. The canonical version of record lives in `version.json` at the project root, and the values here are surfaced by the `/api/version` endpoint and the startup log.

| Variable | What it does |
|----------|--------------|
| `CLICKHOUSEVERSION` | The ClickHouse® release CHOps is built and tested against (for example `26.3`). |
| `MAJOR` | Application major version. |
| `MINOR` | Application minor version. |
| `PATCH` | Application patch version. |
| `DISPLAY` | Human-readable version string. |
| `VERSION` | Full version string. |
| `CODENAME` | Build codename. |

---

## Frontend build variables

These are read by the frontend at build time and compiled into the bundle. They must be present when you build, and changing them requires a rebuild.

| Variable | Default | What it does |
|----------|---------|--------------|
| `VITE_SELECTEDAID_DBS` | `aiselectedid` | The browser localStorage key under which the SQL Editor and Qurioz remember which database you selected for AI. |
| `VITE_QURIOZ_KEY` | `quriozchatstorage` | The browser localStorage key under which Qurioz stores your chat history. |

The example file also lists `VITE_QUERYGENERATIONURL` and `VITE_TLS_REJECT_UNAUTHORIZED`. The current build does not read either of these, so setting them has no effect; they are retained in the example for compatibility and possible future use. Leave them as they are.

---

## The connection bar

At the top of the app, a connection bar controls which ClickHouse® node the pages talk to. It lists your configured nodes; selecting one loads that node's saved credentials, and the connection status indicator shows whether CHOps can currently reach it. This is separate from the SQL Editor and Schema Studio, which connect with each user's own ClickHouse® credentials entered at connect time.

## Dark mode and light mode

Click the sun or moon icon in the top-right corner to switch themes. Your preference is saved in your browser.

## Date and time format

All dates and times in CHOps use 24-hour format, for example `2026-05-13 14:30:00`, matching the format ClickHouse® expects.
