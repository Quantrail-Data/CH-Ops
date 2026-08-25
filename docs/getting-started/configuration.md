# Configuration

CHOps is configured through a `.env` file in the project root. It holds your CHOps login credentials, the session secret, the server port, optional email settings, and a few frontend build values. Your ClickHouse&reg; connection details do not go here.

Create your file by a copy of the shipped example, then edit it:

```bash
cp .env.example .env
```

> **What about ClickHouse® connection details?** Those are configured in the browser, not in this file. After you log in, go to **Administration > Cluster Management** to add your ClickHouse&reg; nodes. Their passwords are encrypted and stored in CHOps's database, not in `.env`.

## How CHOps reads configuration

Two things are worth knowing before you edit anything.

**Backend variables are read at startup.** On boot, the server validates its environment and exits at once if a required value is missing, so a typo in a required variable stops CHOps from a start, rather than a subtle failure later. To change a backend variable takes effect on the next restart.

**Frontend variables (the `VITE_` ones) are baked in at build time.** Vite reads them when you run `bun run build` (or `bun run dev`) and compiles their values into the frontend bundle. To change a `VITE_` value means a rebuild of the frontend for it to take effect. To change it on an already-built server does nothing.

---

## Super admins (required)

These are the login accounts for CHOps itself, not your ClickHouse&reg; users. At least the first super admin must be fully defined, and you can define up to three. Each account needs a username, a password, and an email address. The email is required: the server will not start if `SUPER_ADMIN_1_EMAIL` is missing.

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

You define a second and third admin by a fill of all three of their numbered variables. A partially filled set (for example, a username with no email) is ignored.

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
| `ENCRYPTION_SECRET` | Yes | none | A long random string (32+ characters). It makes the key that encrypts stored ClickHouse&reg; passwords, the system email password, and AI provider keys. Make one with `openssl rand -hex 32`. |

> **Never change `ENCRYPTION_SECRET` after your first run.** It makes the key for every stored password, so a new value makes them unreadable and they cannot be recovered. You would have to enter every one again.
>
> **Upgrading?** This was called `SESSION_SECRET`. Rename it in your `.env` file
> and keep the same value. CHOps refuses to start until you rename it, and the
> message says what to do.
>
> Login tokens no longer use this value. CHOps makes its own signing keys and
> changes them daily, so there is nothing to set for them.

---

## Server

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `PORT` | No | `3000` | The port the backend listens on. |
| `NODE_ENV` | No | `development` | The runtime environment label. Set it to `production` when you deploy for real use. |

---

## Login fallback

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `DISABLE_ENV_LOGIN` | No | `false` (fallback enabled) | When set to exactly `true`, the `.env` super-admin login fallback is turned off, so only accounts in the CHOps database can sign in. |

The shipped `.env.example` sets `DISABLE_ENV_LOGIN=true`. This is safe from the start, because your first super admin is also seeded into the CHOps database on first startup and can log in through the normal database path. Leave it at `true` to keep the surface small, or set it to `false` (or remove it) if you want the `.env` credentials to work as a fallback during setup. Any value other than the exact string `true` leaves the fallback enabled.

---

## Email (SMTP, optional)

Configure SMTP only if you want CHOps to send email. When configured, it is used for alert notifications, to email a generated password to a newly created user, and for password-reset messages. Without these values, those emails are simply not sent.

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `SMTP_HOST` | No | empty | Your email server address (for example, `smtp.gmail.com`). Leave it empty to disable email. |
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

These describe the running build and are normally populated by the build pipeline. In local development they are usually left blank. The canonical version of record lives in `version.json` at the project root, and the `/api/version` endpoint and the startup log surface these values.

| Variable | What it does |
|----------|--------------|
| `CLICKHOUSEVERSION` | The ClickHouse&reg; release CHOps is built and tested against (for example, `26.3`). |
| `MAJOR` | Application major version. |
| `MINOR` | Application minor version. |
| `PATCH` | Application patch version. |
| `DISPLAY` | Human-readable version string. |
| `VERSION` | Full version string. |
| `CODENAME` | Build codename. |

---

## Frontend build variables

The frontend reads these at build time and compiles them into the bundle. They must be present when you build, and a change to them needs a rebuild.

| Variable | Default | What it does |
|----------|---------|--------------|
| `VITE_SELECTEDAID_DBS` | `aiselectedid` | The browser localStorage key under which the SQL Editor and Qurioz remember which database you selected for AI. |
| `VITE_QURIOZ_KEY` | `quriozchatstorage` | The browser localStorage key under which Qurioz stores your chat history. |

These variables have safe defaults compiled into the code, so you do not need to set them. Set one only if you want to change the local-storage key it controls.

---

## The connection bar

At the top of the app, a connection bar controls which ClickHouse&reg; node the pages talk to. It lists your configured nodes. To select one loads that node's saved credentials, and the connection status indicator shows whether CHOps can currently reach it. This is separate from the SQL Editor and Schema Studio, which connect with each user's own ClickHouse&reg; credentials, entered at connect time.

## Dark mode and light mode

Click the sun or moon icon in the top-right corner to switch themes. CHOps saves your preference in your browser.

## Date and time format

All dates and times in CHOps use the 24-hour format, for example `2026-05-13 14:30:00`, which matches the format ClickHouse&reg; expects.

## Settings that moved into the interface

Fifteen settings that were once environment variables are now on the
**Administration > App Config** page. You change them there, and they apply at
once with no restart.

The variables still work. CHOps uses them when nothing is set on the page, so an
existing deployment needs no change.

| Variable | Where it is now |
| --- | --- |
| `EXPORT_MAX_TOTAL_BYTES` | App Config, Exports |
| `EXPORT_MAX_JOB_BYTES` | App Config, Exports |
| `EXPORT_MAX_CONCURRENT` | App Config, Exports |
| `EXPORT_MAX_PER_USER` | App Config, Exports |
| `EXPORT_WARN_BYTES` | App Config, Exports |
| `EXPORT_IDLE_TTL_MS` | App Config, Exports |
| `MAX_RESULT_BYTES` | App Config, Queries |

Eight more settings on that page were never environment variables. They were
fixed values in the code: the lockout rules, the session length, and the four
Kubernetes timings.

**These did not move**, and are still set on the server only:

| Variable | Why |
| --- | --- |
| `ENCRYPTION_SECRET` | It must exist before CHOps can read a settings table |
| `SUPER_ADMIN_*` | The way in on first start, and the way back in if you are locked out |
| `DISABLE_ENV_LOGIN` | It closes a way in. A button that closes your own way in is a way to lock yourself out |
| `DISABLE_ENV_SMTP` | The same reasoning |
| `PORT`, `NODE_ENV`, `DB_PATH`, `EXPORT_DIR` | Facts about the deployment, not preferences |
| `TRUST_PROXY` | A wrong value breaks rate limiting |
