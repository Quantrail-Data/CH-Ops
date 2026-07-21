# Administration

## User Management

CHOps has its own user system for controlling who can log in to the dashboard and what they are allowed to do once inside. These users are separate from your ClickHouse® database users: a CHOps user governs access to the CHOps interface, while a ClickHouse® user (managed under Access Control) governs access to the database itself.

### How login works

When someone logs in, CHOps checks the username and password against its own database first. If there is no match, it falls back to the super admin credentials from the `.env` file, unless `DISABLE_ENV_LOGIN=true` is set.

Passwords are hashed with argon2id (a strong, one-way, memory-hard algorithm) before they are stored. Even if someone obtained the database file, they could not reverse a hash back into the original password. Older installations that stored SHA-256 hashes are transparently upgraded to argon2id the next time each user logs in.

### The four roles

Every CHOps user holds exactly one of four roles. They form a strict ladder, where each rung includes everything below it and adds more:

**Super Admin (level 3).** Full access to everything, including the actions no other role can perform: managing other super admins and running the App Data Backup of the CHOps database. Super admins are created from the `.env` file on first startup, and thereafter only another super admin can create one. A maximum of 3 super admins can exist at any time. Treat this role as being for initial setup, ownership, and emergency recovery.

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

> Note on App Data Backup: the page is presented to super admins only. The backend endpoints behind it accept any admin-level caller, but through the interface it is a super-admin function.

### How access is actually enforced

It is worth understanding where the walls are, because CHOps enforces permissions on the server, not by hiding menu items.

- **The sidebar is the same for everyone.** All roles see every navigation entry, including the Admin section. Nothing is removed from the menu based on role.
- **Privileged pages gate themselves.** When a user without the required role opens an administration page (User Management, Cluster Management, Notification Channels, AI API Keys), the page shows an "only available for administrators" message instead of the controls. App Data Backup shows an "only available for super administrators" message.
- **The server is the final authority.** Every write action is checked again on the backend API, so a permission cannot be bypassed by calling the API directly or by editing the page. The rules below describe that server-side enforcement, which is the behavior you can rely on.

For readers who work at the API level, the guards map to routes as follows. Viewing (all `GET` list endpoints) is open to any logged-in user; only the write actions are restricted.

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
| `/api/query` | `POST` | Any logged-in user; readonly role is forced to read-only queries |

### Rules for creating, changing, and deleting users

These rules exist to stop anyone from quietly escalating their own privileges, and they are applied by the server on every request.

**Creating a user.**

- A super admin can create a user with any role: super admin, admin, editor, or readonly.
- An admin can create editor and readonly users through the interface.
- Only a super admin can create a super admin, and only while fewer than 3 super admins exist.
- Editors and readonly users cannot create anyone.

**Changing a role.** Role changes obey two hard limits: you can never act on a user at or above your own level, and you can never grant a role at or above your own level.

- A super admin can change any admin, editor, or readonly user to admin, editor, or readonly.
- An admin can change editor and readonly users, and only to editor or readonly.
- Editors and readonly users cannot change anyone's role.
- **A super admin cannot be created by changing an existing user's role.** The only way to add a super admin is to create a brand-new user with that role, and only a super admin can do it. In other words, promoting an existing account to super admin is not possible; you create one from scratch instead.
- No one can change a super admin's role, not even another super admin.

**Resetting a password.** An admin or super admin can reset the password of a user below their own level. Resetting generates a new one-time random password and requires the user to change it at their next login. Users change their own password through the change-password flow, which any logged-in user can use.

**Deleting a user.**

- You cannot delete yourself.
- You cannot delete a user at your own level or above. In practice this means an admin can delete editors and readonly users, and a super admin can additionally delete admins.
- No one can delete a super admin, including another super admin. Remove a super admin by editing the `.env`-seeded accounts and the database directly during maintenance if you truly need to.
- Editors and readonly users cannot delete anyone.

### Creating a new user

1. Go to **Administration > User Management**.
2. Click **New User**.
3. Enter a username, an optional email address, and select a role.
4. CHOps generates a strong random password automatically.
5. The password is shown once. Copy it and pass it to the user securely.
6. If SMTP email is configured, the password is also emailed to the user.
7. The user is required to change this password on first login. Until they do, a still-valid token cannot be used to reach any other part of CHOps.

### Where users are stored

Users live in the `app_user` table in CHOps's SQLite database. The `role` column defaults to `readonly`, and `must_change_password` defaults to true, so a newly created account is always least-privileged and must set its own password before doing anything else. The initial super admin accounts are seeded from the `.env` file the first time you run `bun run db:migrate`.

> The community edition records who can log in and what role they hold. If you need a full audit trail of what each user actually did, every DDL statement, every login, every configuration change, captured in a tamper-evident, searchable, exportable log for compliance, that is part of [CHOps Pro](chops-pro.md).

## Cluster Management

CHOps supports up to 3 ClickHouse® clusters with a combined maximum of 18 nodes. Each cluster has a name and a list of nodes. The navbar shows a cluster dropdown (to switch clusters) and a node dropdown (to switch nodes within the active cluster). Managing clusters and nodes is an admin-level action.

> Managing more than a handful of clusters, or fleets spread across regions? [CHOps Pro](chops-pro.md) extends this with sidecar-agent-based fleet management: rolling-restart orchestration, cross-cluster schema synchronization, and centralized configuration management across an unlimited number of clusters.

### How to add a cluster

1. Go to **Administration > Cluster Management** in the sidebar.
2. Click **New Cluster**.
3. Enter a cluster name (for example "Production", "Staging", "Analytics"). Names must be unique.
4. Add nodes by clicking **Add Node** and filling in: Node Name, Host/IP, Port (default 8123), User, Password, and the HTTPS checkbox.
5. Click **Test** next to each node to verify the connection.
6. Click **Create Cluster**. The navbar cluster dropdown updates automatically.

To edit or delete a cluster, use the Edit and Delete buttons on the cluster card.

### Switching clusters

Use the cluster dropdown in the navbar to switch between clusters. When you switch, the node dropdown updates to show the new cluster's nodes, and CHOps reconnects automatically. All pages (SQL editor, overview, logs, and so on) use the active cluster.

### Limits

- Maximum 3 clusters
- Maximum 18 total nodes across all clusters
- Node names must be unique within each cluster

### Adding or removing nodes

Adding a new node to a cluster does not affect running alerts or backup schedules. They pick up the new node on their next tick. Removing a node is also safe: alerts and backups skip unreachable nodes silently.

### Where cluster config is stored

Cluster configuration is saved in CHOps's SQLite database (in the `app_setting` table under key `clusters`). ClickHouse® passwords are encrypted with AES-256-GCM before storage, and these credential-bearing settings are hidden from non-admin users and refused on non-admin writes. There are no ClickHouse® settings in the `.env` file. If upgrading from a single-cluster version, the old configuration is automatically migrated on first startup.

## Storage Profiles

Shared S3-compatible storage configuration used by both ClickHouse® backups (Data Lifecycle) and App Data Backup. Supports Amazon S3, Google Cloud Storage, and Azure Blob (any S3-compatible endpoint such as MinIO, Wasabi, or Cloudflare R2 works too). Creating or editing a profile is an admin-level action.

### Adding a storage profile

1. Go to **Administration > Storage Profiles**.
2. Click **New Profile**.
3. Fill in: name, type (S3/GCS/Azure), bucket, endpoint (for custom S3-compatible), region, access key ID, and secret key.
4. Click **Test** to verify the connection reaches the bucket.
5. Click **Save**.

Storage profiles are referenced by name in backup schedules. If you rename or delete a profile that is used by an active schedule, the schedule will fail with a "profile not found" error.

## App Data Backup

Backs up CHOps's SQLite database (all settings, alert rules, channels, dashboards, charts, users, and backup schedules) to S3-compatible storage. This page is available to super admins.

### How it works

1. CHOps creates a clean database snapshot using SQLite's built-in backup command (safe to run while the server is running).
2. The snapshot is uploaded to S3 via ClickHouse®'s `s3()` table function (requires at least one cluster node configured).
3. A JSON manifest is written alongside the backup with metadata: timestamp, app version, file size, and row counts per table.

S3 layout: `{bucket}/chops-app-backups/{timestamp}.db` and `{timestamp}.json`.

### Manual backup

Go to **Administration > App Data Backup**, select a storage profile, and click **Backup Now**.

### Restore

Restore is manual because the server must be stopped. Instructions are shown on the App Data Backup page under "Restore Instructions". The steps are:

1. Download the `.db` file from S3 (using `aws s3 cp` or any S3 client).
2. Stop the CHOps server.
3. Remove `data/chops.db-wal` and `data/chops.db-shm`.
4. Replace `data/chops.db` with the downloaded backup file.
5. Restart the server.

The backup file is self-contained. All app state is inside the single `.db` file.
