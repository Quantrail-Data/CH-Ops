# Administration

## User Management

CHOps has its own user system to control who can log in to the dashboard and what they can do once inside. These users are separate from your ClickHouse&reg; database users. A CHOps user governs access to the CHOps interface. A ClickHouse&reg; user (managed under Access Control) governs access to the database itself.

### How login works

When someone logs in, CHOps checks the username and password against its own database first. If there is no match, it falls back to the super admin credentials from the `.env` file, unless `DISABLE_ENV_LOGIN=true` is set.

Passwords are hashed with argon2id (a strong, one-way, memory-hard algorithm) before they are stored. Even if someone obtained the database file, they could not reverse a hash back into the original password. Older installations that stored SHA-256 hashes are transparently upgraded to argon2id the next time each user logs in.

### The four roles

Every CHOps user holds exactly one of four roles. The roles form a strict order. Each role can do everything the role below it can do, and adds more.

**Super Admin (level 3).** Full access to everything, including the actions no other role can perform: management of other super admins, and the App Data Backup of the CHOps database. Super admins are created from the `.env` file on first startup. After that, only another super admin can create one. A maximum of 3 super admins can exist at any time. Treat this role as being for initial setup, ownership, and emergency recovery.

**Admin (level 2).** The role for day-to-day administration. Admins can do almost everything a super admin can: manage clusters and nodes, storage profiles, alert rules and channels, notification channels, AI API keys, and other CHOps users. What they cannot do is act on super admins (create, change, or delete them) or reach the super-admin-only App Data Backup page.

**Editor (level 1).** A working role for people who build and query but do not administer. Editors can use everything in the Overview, Tools, Logs, Monitoring, and Schema areas, run any query in the SQL Editor, and create, edit, and delete dashboards and charts. They can view alert rules but cannot create, edit, or delete them, and they have no access to the administration or cluster-management functions.

**Readonly (level 0).** View-only access, and the default role for every new user. Readonly users can browse the overview pages, view dashboards and charts, read logs and monitoring, and view alert rules. They can open the SQL Editor, but the server forces every query they run to be read-only, so a readonly user can `SELECT` but never write, alter, or drop. They cannot create, edit, or delete anything in CHOps.

### What each role can do

| Capability | Super Admin | Admin | Editor | Readonly |
|------------|:-----------:|:-----:|:------:|:--------:|
| Log in; view overview, logs, monitoring, schema, and query tools | Yes | Yes | Yes | Yes |
| Run queries in the SQL Editor | Yes | Yes | Yes | Read-only queries only |
| View dashboards, charts, and alert rules | Yes | Yes | Yes | Yes |
| Create, edit, or delete dashboards and charts | Yes | Yes | Yes | No |
| Create, edit, delete, or test alert rules and channels | Yes | Yes | No | No |
| Manage clusters and nodes | Yes | Yes | No | No |
| Manage storage profiles | Yes | Yes | No | No |
| Manage notification channels | Yes | Yes | No | No |
| Manage AI (Qurioz) API keys | Yes | Yes | No | No |
| Open the User Management page | Yes | Yes | No | No |
| Create users | Yes (any role) | Yes (editor, readonly) | No | No |
| Reset another user's password | Yes | Yes (users below you) | No | No |
| Change a user's role | Yes (to admin, editor, or readonly) | Yes (editor, readonly) | No | No |
| Delete a user | Yes (not super admins) | Yes (editor, readonly) | No | No |
| App Data Backup of the CHOps database | Yes | No | No | No |
| Change your own password | Yes | Yes | Yes | Yes |

> Note on App Data Backup: the page is shown to super admins only. The backend endpoints behind it accept any admin-level caller, but through the interface it is a super-admin function.

### How access is actually enforced

It helps to know where CHOps enforces permissions, because it enforces them on the server, not by a hide of menu items.

- **The sidebar is the same for everyone.** All roles see every navigation entry, including the Admin section. Nothing is removed from the menu based on role.
- **Privileged pages gate themselves.** When a user without the required role opens an administration page (User Management, Cluster Management, Notification Channels, AI API Keys), the page shows an "only available for administrators" message instead of the controls. App Data Backup shows an "only available for super administrators" message.
- **The server is the final authority.** CHOps checks every write action again on the backend API, so a permission cannot be bypassed by a direct API call or an edit of the page. The rules below describe that server-side enforcement, which is the behavior you can rely on.

For readers who work at the API level, the guards map to routes as follows. Viewing (all `GET` list endpoints) is open to any logged-in user. Only the write actions are restricted.

| Route | Method(s) | Minimum role |
|-------|-----------|--------------|
| `/api/users` | `GET` (list) | Any logged-in user (the page itself is admin-gated in the UI) |
| `/api/users` | `POST` (create) | Admin |
| `/api/users/:id` | `PUT` (email, role, password reset) | Self for own email; Admin for others, with hierarchy checks |
| `/api/users/:id` | `DELETE` | Admin, with hierarchy checks |
| `/api/dashboards`, `/api/dashboards/charts` | `POST`/`PUT`/`DELETE` | Editor |
| `/api/alerts/rules`, `/api/alerts/channels` | `POST`/`PUT`/`DELETE`, channel test | Admin |
| `/api/cluster` | `POST`/`PUT`/`DELETE` | Admin |
| `/api/app-backup` | `POST`/`GET`/`PUT` | Admin (surfaced only to super admins in the UI) |
| `/api/qurioz/api-keys` | create/update/delete/select/read value | Admin |
| `/api/settings/:key` for `clusters`, `cluster.nodes`, `backup_profiles` | write/delete/read | Admin |
| `/api/query` | `POST` | Any logged-in user; the readonly role is forced to read-only queries |

### Rules for creating, changing, and deleting users

These rules exist to stop anyone from a quiet escalation of their own privileges, and the server applies them on every request.

**Creating a user.**

- A super admin can create a user with any role: super admin, admin, editor, or readonly.
- An admin can create editor and readonly users through the interface.
- Only a super admin can create a super admin, and only while fewer than 3 super admins exist.
- Editors and readonly users cannot create anyone.

**Changing a role.** Role changes obey two hard limits: you can never act on a user at or above your own level, and you can never grant a role at or above your own level.

- A super admin can change any admin, editor, or readonly user to admin, editor, or readonly.
- An admin can change editor and readonly users, and only to editor or readonly.
- Editors and readonly users cannot change anyone's role.
- **A super admin cannot be created by a change of an existing user's role.** The only way to add a super admin is to create a brand-new user with that role, and only a super admin can do it. In other words, a promotion of an existing account to super admin is not possible. You create one from scratch instead.
- No one can change a super admin's role, not even another super admin.

**Resetting a password.** An admin or super admin can reset the password of a user below their own level. A reset generates a new one-time random password and requires the user to change it at their next login. Users change their own password through the change-password flow, which any logged-in user can use.

**Deleting a user.**

- You cannot delete yourself.
- You cannot delete a user at your own level or above. In practice, an admin can delete editors and readonly users, and a super admin can also delete admins.
- No one can delete a super admin, including another super admin. Remove a super admin by an edit of the `.env`-seeded accounts and the database directly during maintenance, if you truly need to.
- Editors and readonly users cannot delete anyone.

### Creating a new user

1. Go to **Administration > User Management**.
2. Click **New User**.
3. Enter a username, an optional email address, and select a role.
4. CHOps generates a strong random password automatically.
5. The password is shown once. Copy it and pass it to the user securely.
6. If SMTP email is configured, CHOps also emails the password to the user.
7. The user must change this password on first login. Until they do, a still-valid token cannot reach any other part of CHOps.

### The first login password change

A newly created user, and any user whose password an administrator has reset, must set a new password before they can use CHOps. There is nothing to configure. CHOps sets the requirement automatically in both cases.

**What the user sees.** After they sign in with the password they were given, they land on a change-password screen instead of the dashboard. Nothing else in CHOps is reachable until they complete it. A token issued at that point cannot reach any other page, so this is a real gate, not a redirect somebody could skip.

The screen asks for three things:

| Field | Notes |
|---|---|
| Current password | The one they were given |
| New password | At least 8 characters, at most 256 |
| Confirm new password | Must match |

Each field has a show or hide control, which matters when someone types a generated password they cannot memorise.

**The new password must differ from the current one.** A re-entry of the generated password is rejected, because that would defeat the point.

**After it succeeds** they go straight into CHOps. They are not asked to sign in again, because CHOps simply updates the session they already hold.

### Helping a user through it

**They mistyped and got an error.** The message names the specific problem: passwords that do not match, too short, too long, or the same as the current one. Nothing is submitted until all four checks pass, so a failed attempt does not lock anything.

**They lost the password before first login.** Reset it from User Management. That generates a new one and sets the requirement again, so they get the same screen with a working password.

**They cannot get past the screen at all.** The current password field is the usual cause. It wants the password they were given, not the new one they are choosing. If SMTP is configured, CHOps emailed the original to them, so check there before a reset.

**Nothing arrived by email.** SMTP may not be configured, in which case the password was shown once at creation and needs to be passed on securely. Reset the password if it was not captured.

### Resetting a user's password

From **User Management**, an administrator can reset another user's password. CHOps generates a new strong password, emails it if SMTP is configured, and sets the first-login requirement again, so the user chooses their own password immediately afterwards.

An administrator cannot reset their own password this way. Use the normal change-password route instead.

### Where users are stored

Users live in the `app_user` table in CHOps's SQLite database. The `role` column defaults to `readonly`, and `must_change_password` defaults to true, so a newly created account is always least-privileged and must set its own password before it does anything else. CHOps seeds the initial super admin accounts from the `.env` file the first time you run `bun run db:migrate`.

> The community edition records who can log in and what role they hold. If you need a full audit trail of what each user actually did (every DDL statement, every login, every configuration change, captured in a tamper-evident, searchable, exportable log for compliance), that is part of [CHOps Pro](chops-pro.md).

## System Email

CHOps sends email for two things: the code that lets a user reset a forgotten
password, and the message that tells a new user their account is ready.

To send email, CHOps needs an SMTP server. This page is where you give it one.
Only a super admin can open it.

### What this is not

This is **not** the same as the email channel under Notification Channels. That
one sends alerts. This one sends account email. They are separate on purpose:
your alerts can go to a team mailbox while account email comes from a different
address.

### Setting it up

1. Go to **Administration > User Management** and open the **System Email** tab.
2. Fill in the server address, the port, and the address the email comes from.
3. Fill in the user name and password, if your server needs them. Many internal
   relays do not.
4. Tick **Use TLS** if your server needs it. Port 465 usually does. Port 587
   usually does not, because it starts without TLS and upgrades.
5. Click **Test connection**. This checks that CHOps can reach the server and
   sign in. It sends nothing.
6. Click **Send test email**. This sends a real message to your own address.
   Do this one as well. A server can accept a sign in and still refuse to send.
7. Click **Save**.

### Where the settings come from

CHOps looks in two places, in this order:

1. The settings on this page.
2. The `SMTP_*` variables in the server environment.

The page always wins. The line under the form tells you which one is in use, so
you are never guessing.

To go back to the environment settings, click **Delete**. This removes what you
saved here. It does not change the environment.

### If you are locked out

Password reset needs email. If nobody can sign in and the email settings are
wrong, you have a problem.

The way out is the super admin in your `.env` file. That account signs in without
email, so use it to open this page and correct the settings.

If you have set `DISABLE_ENV_LOGIN=true`, that way out is closed. Only close it
once you have sent a test email and it arrived.

### The password field

Leave the password field empty to keep the one you saved before. CHOps never
shows a saved password back to you, so an empty field means "no change", not
"no password".

## Cluster Management

CHOps supports up to 3 ClickHouse&reg; clusters, with a combined maximum of 18 nodes. Each cluster has a name and a list of nodes. The navbar shows a cluster dropdown (to switch clusters) and a node dropdown (to switch nodes within the active cluster). To manage clusters and nodes is an admin-level action.

> Do you manage more than a handful of clusters, or fleets spread across regions? [CHOps Pro](chops-pro.md) extends this with sidecar-agent-based fleet management: rolling-restart orchestration, cross-cluster schema synchronization, and centralized configuration management across an unlimited number of clusters.

### How to add a cluster

1. Go to **Administration > Cluster Management** in the sidebar.
2. Click **New Cluster**.
3. Enter a cluster name (for example "Production", "Staging", "Analytics"). Names must be unique.
4. Add nodes with **Add Node** and fill in: Node Name, Host/IP, Port (default 8123), User, Password, and the HTTPS checkbox.
5. Click **Test** next to each node to check the connection.
6. Click **Create Cluster**. The navbar cluster dropdown updates automatically.

To edit or delete a cluster, use the Edit and Delete buttons on the cluster card.

### Switching clusters

Use the cluster dropdown in the navbar to switch between clusters. When you switch, the node dropdown updates to show the new cluster's nodes, and CHOps reconnects automatically. All pages (SQL editor, overview, logs, and so on) use the active cluster.

### Limits

- Maximum 3 clusters.
- Maximum 18 total nodes across all clusters.
- Node names must be unique within each cluster.

### Adding or removing nodes

To add a new node to a cluster does not affect running alerts or backup schedules. They pick up the new node on their next tick. To remove a node is also safe: alerts and backups skip unreachable nodes silently.

### Where cluster config is stored

CHOps saves cluster configuration in its SQLite database (in the `app_setting` table under key `clusters`). ClickHouse&reg; passwords are encrypted with AES-256-GCM before storage, and these credential-bearing settings are hidden from non-admin users and refused on non-admin writes. There are no ClickHouse&reg; settings in the `.env` file. If you upgrade from a single-cluster version, CHOps migrates the old configuration automatically on first startup.

## Trusted CAs

### The problem this solves

You turn on TLS for ClickHouse&reg;, tick **Secure** in CHOps, and get this:

```
unable to verify the first certificate
```

Nothing you change on the cluster page fixes it. This page does.

### Why it happens

When two computers talk over HTTPS, the one connecting checks that the
certificate it is shown was signed by an authority it already trusts. Every
operating system ships with a list of public authorities.

If your company issues its own certificates, and most do for internal servers,
your authority is not on anybody's list. So the check fails, and CHOps refuses
the connection. That refusal is correct. CHOps cannot tell your authority from
somebody pretending to be your server.

The answer is to tell CHOps about your authority. That is all this page does.

### What you add here

**The certificate of the authority. Not the certificate of the server.**

This is the mistake people make, so it is worth being clear:

| File | Where it belongs |
| --- | --- |
| `ca.crt`, your authority | Here, in CHOps |
| `server.crt`, the certificate it signed | On the ClickHouse&reg; server only |
| Any `.key` file | Nowhere near CHOps |

CHOps checks this for you. Paste a server certificate and it refuses it, and
says why.

**One authority covers every server it signed.** Ten ClickHouse&reg; nodes signed
by the same authority need one entry here, not ten.

### Adding one

1. Go to **Administration > Trusted CAs**.
2. Click **Add**.
3. Give it a name you will recognise later, such as `Company internal CA`.
4. Paste the whole certificate, including the `-----BEGIN CERTIFICATE-----` and
   `-----END CERTIFICATE-----` lines.
5. Click **Add**.

It works at once. You do not restart CHOps.

### Which clusters use it

Click **Which clusters use this**. CHOps connects to each cluster and reads the
certificate it is shown.

Each cluster is then one of:

| Result | What it means |
| --- | --- |
| Uses this authority | This entry is what makes that cluster work |
| Uses a different one | Some other entry, or a public authority |
| Not using TLS | Plain HTTP, so no certificate is involved |
| Could not be reached | CHOps could not connect, so it does not know |

**"Could not be reached" does not mean "does not need this".** A cluster that is
down tells you nothing. Check it again when the cluster is up, before you remove
anything.

### Watch the expiry date

The list shows how long each authority has left, and turns red under 30 days.

This is worth watching. When an authority expires, **every** server it signed
stops working at the same moment, and the error does not say the word "expired".
You get the same "unable to verify" message as before.

### Removing one

Removing takes effect at once, with no restart. Any cluster whose certificate
came from that authority stops connecting.

Use **Which clusters use this** first if you are not sure.

### Your certificates are not secret

CHOps stores these as plain text, on purpose. An authority certificate is
public: it is what a server hands out to prove who signed it. There is nothing
in it to protect.

This also means it survives a change to `ENCRYPTION_SECRET`, which the stored
ClickHouse&reg; passwords do not.

### The older way still works

If you set `NODE_EXTRA_CA_CERTS` on the server, that still works and you need
change nothing.

This page is better for three reasons: it takes effect without a restart, it
shows you what is loaded, and somebody who only has access to the interface can
use it.

## Storage Profiles

Shared S3-compatible storage configuration, used by both ClickHouse&reg; backups (Data Lifecycle) and App Data Backup. It supports Amazon S3, Google Cloud Storage, and Azure Blob. Any S3-compatible endpoint, such as MinIO, Wasabi, or Cloudflare R2, works too. To create or edit a profile is an admin-level action.

### Adding a storage profile

1. Go to **Administration > Storage Profiles**.
2. Click **New Profile**.
3. Fill in: name, type (S3/GCS/Azure), bucket, endpoint (for a custom S3-compatible endpoint), region, access key ID, and secret key.
4. Click **Test** to check that the connection reaches the bucket.
5. Click **Save**.

Backup schedules reference storage profiles by name. If you rename or delete a profile that an active schedule uses, the schedule fails with a "profile not found" error.

## App Data Backup

Backs up CHOps's SQLite database (all settings, alert rules, channels, dashboards, charts, users, and backup schedules) to S3-compatible storage. This page is available to super admins.

### How it works

1. CHOps creates a clean database snapshot with SQLite's built-in backup command (safe to run while the server runs).
2. CHOps uploads the snapshot to S3 through ClickHouse&reg;'s `s3()` table function (this needs at least one cluster node configured).
3. CHOps writes a JSON manifest alongside the backup with metadata: timestamp, app version, file size, and row counts per table.

S3 layout: `{bucket}/chops-app-backups/{timestamp}.db` and `{timestamp}.json`.

### Manual backup

Go to **Administration > App Data Backup**, select a storage profile, and click **Backup Now**.

### Restore

Restore is manual, because the server must be stopped. The App Data Backup page shows the instructions under "Restore Instructions". The steps are:

1. Download the `.db` file from S3 (with `aws s3 cp` or any S3 client).
2. Stop the CHOps server.
3. Remove `data/chops.db-wal` and `data/chops.db-shm`.
4. Replace `data/chops.db` with the downloaded backup file.
5. Restart the server.

The backup file is self-contained. All app state is inside the single `.db` file.


## App Config

Limits on how CHOps behaves. Before this page, these were settings in a file on
the server, and changing one meant a restart. Now you change them here and they
apply at once.

Four tabs. Exports, Queries and Kubernetes are open to an admin. Security is for
super admins only.

### How a setting is found

Under each field is a line that says where the value in it came from:

| Line | What it means |
| --- | --- |
| set here | Somebody saved a value on this page |
| from EXPORT_MAX_TOTAL_BYTES in the server environment | It comes from a variable on the server |
| the built-in default | Nothing is set, so CHOps uses its own value |

CHOps looks in that order: this page first, then the environment, then its own
default.

**Read that line before you ask why a change did nothing.** It is the answer
most of the time.

### Reset

**Reset** removes what you saved. It does not save the default value.

The difference matters. If Reset saved the default, and a later version of CHOps
changed that default, your saved copy would hide the new one and nobody could
tell why. Removing the value means CHOps falls back, and keeps falling back.

Reset is only available on a setting that is set here. There is nothing to reset
otherwise.

### Exports

| Setting | What it does |
| --- | --- |
| Total export storage | All export files together. When this is reached, new exports are refused. |
| Largest single export | One export is stopped when it passes this. |
| Exports running at once | Across everybody. |
| Exports per user | How many one person may run at the same time. |
| Warn above | Shown to the user as a warning. It stops nothing. |
| Delete idle files after | An export nobody downloads is cleaned up after this. |

**Total export storage is bounded by the disk.** In Kubernetes that disk has a
size set in the deployment. Set this above it and the pod is evicted when the
disk fills, which is worse than an export being refused. Check the disk before
you raise this.

### Queries

| Setting | What it does |
| --- | --- |
| Maximum result size | A query that returns more than this to CHOps is stopped. Exports are not affected. |
| Schema Studio sample rows | How many rows column statistics are worked out from. |

The result size limit protects CHOps, not ClickHouse&reg;. A query that returns
a very large result can use all the memory CHOps has.

### Security

Super admins only.

| Setting | What it does |
| --- | --- |
| Failed logins before lockout | How many wrong passwords lock an account. |
| Lockout lasts | How long it stays locked, and the window failures are counted in. |
| Session length | How long a login lasts. |

**Session length also sets how long a saved ClickHouse&reg; credential lives.**
That is deliberate. A saved credential that outlives the login it belongs to is
of no use to anybody, and is one more thing to steal.

Each setting has a smallest and a largest value, shown under it. CHOps refuses
anything outside that range. This is checked on the server, not only in the
browser, so the range cannot be got around.

### Kubernetes

| Setting | What it does |
| --- | --- |
| Refresh the host list every | How often CHOps reads the pods again from the operator. |
| Missed refreshes before removing a host | How many refreshes a pod can be absent for before CHOps drops it. |
| Kubernetes API timeout | Per request to the Kubernetes API. |
| Pod address probe timeout | How long CHOps waits when it checks whether a pod answers on its own address. |

**Missed refreshes is a trade.** Too low, and a rolling restart drops nodes that
are only restarting. Too high, and a cluster you scaled down keeps pods in the
list that are gone. Three is a reasonable start.

**Changing the refresh interval restarts the timer.** Every other setting here
applies to the next thing that uses it. This one has to replace a running timer,
so CHOps does that when you save.
