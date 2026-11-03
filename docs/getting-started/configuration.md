# Configuration

You configure CHOps through a `.env` file in the project root. It holds your CHOps login credentials, the encryption secret, the server port, the address of the CHOps pages, and a few frontend build values. Your ClickHouse&reg; connection details do not go here.

Create your file by copying the shipped example, then edit it:

```bash
cp .env.example .env
```

> **What about ClickHouse® connection details?** You configure those in the browser, not in this file. After you log in, go to **Control panel > Cluster Management** to add your ClickHouse&reg; nodes. CHOps encrypts their passwords and stores them in its own database, not in `.env`.

## How CHOps reads configuration

Two things are worth knowing before you edit anything.

**The server reads backend variables at startup.** On boot, the server validates its environment and exits at once if a required value is missing, so a typo in a required variable stops CHOps from starting instead of causing a subtle failure later. A change to a backend variable takes effect on the next restart.

**Frontend variables (the `VITE_` ones) are baked in at build time.** Vite reads them when you run `bun run build` (or `bun run dev`) and compiles their values into the frontend bundle. If you change a `VITE_` value, you must rebuild the frontend for it to take effect. Changing it on an already-built server does nothing.

---

## Super admins (required)

These are the login accounts for CHOps itself, not your ClickHouse&reg; users. You must fully define at least the first super admin, and you can define up to three. Each account needs a username, a password, and an email address. The email is required: the server will not start if `SUPER_ADMIN_1_EMAIL` is missing.

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

CHOps seeds these accounts into its database on first startup, and you then use them for initial setup and emergency login.

**Example:**

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=MySecurePassword123
SUPER_ADMIN_1_EMAIL=admin@example.com
```

To define a second and third admin, fill in all three of their numbered variables. CHOps ignores a partially filled set (for example, a username with no email).

### Legacy single-admin format

Older installations used an unnumbered set, and CHOps still accepts it when the numbered variables are absent:

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
> Login tokens do not use this value. CHOps makes its own signing keys and
> changes them daily, so there is nothing to set for them. It stores the keys
> in its database, encrypted with this secret.

CHOps also makes a random salt file, `data/crypto.salt`, at the first start. The encryption key comes from the secret and the salt together. Keep the salt file with `chops.db`, and back up both. Without the same salt, CHOps cannot read stored passwords.

---

## Server

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `PORT` | No | `3000` | The port the backend listens on. |
| `NODE_ENV` | No | `development` | The runtime environment label. Set it to `production` when you deploy for real use. |
| `DB_PATH` | No | `data/chops.db` | The path of the SQLite database file. `data/crypto.salt` stays in the `data/` folder of the working directory. |
| `EXPORT_DIR` | No | `data/exports` | The folder for export files. |
| `LOG_LEVEL` | No | `info` | The lowest log level that CHOps writes: `debug`, `info`, `warn`, or `error`. |
| `TRUST_PROXY` | No | not set | The number of reverse proxies in front of CHOps. Set it behind a proxy, so that rate limits use the real client IP. Leave it unset when clients connect directly. |
| `NODE_EXTRA_CA_CERTS` | No | not set | The path of a PEM file with more certificate authorities. CHOps adds them to the trusted list for ClickHouse&reg; connections. You can also add authorities in **Control panel > Trusted CAs**. |

Run only one CHOps process for one database file. CHOps keeps reset codes, login failure counts, rate limits, and the alert scheduler in the memory of its process. Two processes on one database give wrong limits and duplicate alerts.

---

## Login fallback

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `DISABLE_ENV_LOGIN` | No | `false` (fallback enabled) | When set to exactly `true`, the `.env` super-admin login fallback is turned off, so only accounts in the CHOps database can sign in. |

The shipped `.env.example` sets `DISABLE_ENV_LOGIN=true`. This is safe from the start, because CHOps also seeds your first super admin into its database on first startup, and that account can log in through the normal database path. Leave it at `true` to keep the surface small, or set it to `false` (or remove it) if you want the `.env` credentials to work as a fallback during setup. Any value other than the exact string `true` leaves the fallback enabled.

---

## Email (SMTP, optional)

CHOps sends account emails through the system email server. A super admin sets it in the browser, in **Control panel > User Management > System Email**. The page has fields for the SMTP host, port, user name, password, and "from" address. It can test the connection and send a test email. CHOps encrypts the password before it stores it.

CHOps uses the system email for these messages:

- A new user gets a one-time link to set a password.
- After an admin resets a password, the user gets a new one-time link.
- A user who forgets a password gets a reset code.

CHOps never puts a password in an email. Without a system email server, CHOps does not send these emails. An admin can then copy the setup link from the User Management page and give it to the user.

Alert notifications do not use the system email. Each email notification channel has its own SMTP settings, in **Control panel > Notification Channels**.

---

## Password-reset link

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `FRONTEND_LINK` | No | the address of the request | The base URL of the CHOps pages. CHOps uses it to make the one-time links that set a password. Set it to the address that users open, for example `http://localhost:5173` in development or your public URL in production. |

A setup link is valid for 30 minutes, and it works one time only. When `FRONTEND_LINK` is not set, CHOps uses the address of the admin's request. Behind a reverse proxy, that address can be wrong, so set `FRONTEND_LINK`.

---

## Build and version metadata (optional)

These describe the running build, and the build pipeline normally fills them in. In local development you usually leave them blank. The canonical version of record lives in `version.json` at the project root, and both the `/api/version` endpoint and the startup log surface these values.

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

At the top of the app, a connection bar controls which ClickHouse&reg; node the pages talk to. It lists your configured nodes. Selecting one loads that node's saved credentials, and the connection status indicator shows whether CHOps can currently reach it. This is separate from the SQL Editor and Schema Studio, which connect with each user's own ClickHouse&reg; credentials, entered at connect time.

## Dark mode and light mode

Click the sun or moon icon in the top-right corner to switch themes. CHOps saves your preference in your browser.

## Date and time format

All dates and times in CHOps use the 24-hour format, for example `2026-05-13 14:30:00`, which matches the format ClickHouse&reg; expects.

## Settings on the App Config page

The **Control panel > App Config** page holds seventeen settings. An admin changes
them there, and they apply at once with no restart.

Seven of these settings also have an environment variable. CHOps uses the
variable when nothing is set on the page.

| Variable | Where it is on the page |
| --- | --- |
| `EXPORT_MAX_TOTAL_BYTES` | App Config, Exports |
| `EXPORT_MAX_JOB_BYTES` | App Config, Exports |
| `EXPORT_MAX_CONCURRENT` | App Config, Exports |
| `EXPORT_MAX_PER_USER` | App Config, Exports |
| `EXPORT_WARN_BYTES` | App Config, Exports |
| `EXPORT_IDLE_TTL_MS` | App Config, Exports |
| `MAX_RESULT_BYTES` | App Config, Queries |

The other ten settings have no environment variable: the Schema Studio
sample rows, the two lockout rules, the session length, the four Kubernetes
timings, and the two DB RBAC settings.

**These settings are on the server only**:

| Variable | Why |
| --- | --- |
| `ENCRYPTION_SECRET` | It must exist before CHOps can read a settings table |
| `SUPER_ADMIN_*` | The way in on first start, and the way back in if you are locked out |
| `DISABLE_ENV_LOGIN` | It closes a way in. A button that closes your own way in is a way to lock yourself out |
| `PORT`, `NODE_ENV`, `DB_PATH`, `EXPORT_DIR` | Facts about the deployment, not preferences |
| `TRUST_PROXY` | A wrong value breaks rate limiting |
