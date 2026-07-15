# Administration

## User Management

CHOps has its own user system for controlling who can log in to the dashboard. These users are separate from your ClickHouse® database users.

### How Login Works

When someone logs in, CHOps checks the username and password against its own database first. If there is no match, it tries the super admin credentials from the `.env` file (unless `DISABLE_ENV_LOGIN=true` is set).

Passwords are securely hashed (scrambled one-way) before storing. Even if someone gets access to the database file, they cannot reverse the hash to find the original password.

### Four Roles

CHOps has four roles. Each one controls what the user can see and do:

**Super Admin** (level 3) - Full access to everything. Created from the `.env` file on first startup, or through the UI by another super admin. Maximum 3 super admins. This role is meant for initial setup and emergency recovery.

**Admin** (level 2) - Same access as super admin, but can only be created through the UI. Admins cannot change or delete super admin accounts. This is the recommended role for day-to-day administration.

**Editor** (level 1) - Can use all sections except user management and cluster management. Editors can create and manage dashboards, charts, and use the SQL editor. They can view alerts but cannot create, edit, or delete them. They cannot access backups or cluster settings.

**Readonly** (level 0) - View-only access. Can browse the overview pages, use the SQL editor, view existing dashboards and charts, view logs and monitoring, and see alert rules. Cannot create, edit, or delete anything. This is the default role for new users.

### What Each Role Can Do

| Action | Super Admin | Admin | Editor | Readonly |
|--------|-----------|-------|--------|----------|
| View all pages | Yes | Yes | Yes (except admin pages) | Most pages (no backups/admin) |
| Use SQL Editor | Yes | Yes | Yes | Yes |
| Create/edit dashboards and charts | Yes | Yes | Yes | No |
| Create/edit alert rules and channels | Yes | Yes | No | No |
| Create/edit backup schedules | Yes | Yes | No | No |
| Manage cluster nodes | Yes | Yes | No | No |
| Create new users | Yes | Yes(Editor, Read-only only) | No | No |
| Reset passwords | Yes | Yes | No | No |
| Delete users | Yes | Yes (not super admins) | No | No |
| Change user roles | Yes (admin, editor, readonly) | Yes (editor, readonly) | No | No |

### Role Change Rules

Role changes follow a strict hierarchy to prevent privilege escalation:

- A super admin can change the role of any admin, editor, or readonly user. But a super admin cannot change another super admin's role.
- An admin can change the role of any editor or readonly user. But an admin cannot change another admin's role, and cannot change a super admin's role.
- Editors and readonly users cannot change anyone's role.
- Only a super admin can promote someone to super admin.
- Nobody can demote a super admin (not even another super admin).

### Creating a New User

1. Go to **Administration > User Management**.
2. Click **New User**.
3. Enter a username, optional email address, and select a role.
4. CHOps generates a random password automatically.
5. The password is shown once. Copy it and share it with the user.
6. If SMTP email is configured, the password is also emailed to the user.
7. The user must change their password on first login.

### Where Users Are Stored

Users are stored in the `app_user` table in CHOps's SQLite database. The initial super admin accounts are created from the `.env` file when you first run `bun run db:migrate`.

> The community edition records who can log in and what role they hold. If you need a full audit trail of what each user actually did, every DDL statement, every login, every configuration change, captured in a tamper-evident, searchable, exportable log for compliance, that is part of [CHOps Pro](chops-pro.md).

## Cluster Management

CHOps supports up to 3 ClickHouse® clusters with a combined maximum of 18 nodes. Each cluster has a name and a list of nodes. The navbar shows a cluster dropdown (to switch clusters) and a node dropdown (to switch nodes within the active cluster).

> Managing more than a handful of clusters, or fleets spread across regions? [CHOps Pro](chops-pro.md) extends this with sidecar-agent-based fleet management: rolling-restart orchestration, cross-cluster schema synchronization, and centralized configuration management across an unlimited number of clusters.

### How to Add a Cluster

1. Go to **Administration > Cluster Management** in the sidebar.
2. Click **New Cluster**.
3. Enter a cluster name (e.g. "Production", "Staging", "Analytics"). Names must be unique.
4. Add nodes by clicking **Add Node** and filling in: Node Name, Host/IP, Port (default 8123), User, Password, and HTTPS checkbox.
5. Click **Test** next to each node to verify the connection.
6. Click **Create Cluster**. The navbar cluster dropdown updates automatically.

To edit or delete a cluster, use the Edit and Delete buttons on the cluster card.

### Switching Clusters

Use the cluster dropdown in the navbar to switch between clusters. When you switch, the node dropdown updates to show the new cluster's nodes, and CHOps reconnects automatically. All pages (SQL editor, overview, logs, etc.) use the active cluster.

### Limits

- Maximum 3 clusters
- Maximum 18 total nodes across all clusters
- Node names must be unique within each cluster

### Adding or Removing Nodes

Adding a new node to a cluster does not affect running alerts or backup schedules. They pick up the new node on their next tick. Removing a node is also safe - alerts and backups skip unreachable nodes silently.

### Where Cluster Config Is Stored

Cluster configuration is saved in CHOps's SQLite database (in the `app_setting` table under key `clusters`). ClickHouse® passwords are encrypted with AES-256-GCM before storage. There are no ClickHouse® settings in the `.env` file. If upgrading from a single-cluster version, the old configuration is automatically migrated on first startup.

## Storage Profiles

Shared S3-compatible storage configuration used by both ClickHouse® backups (Data Lifecycle) and App Data Backup. Supports Amazon S3, Google Cloud Storage, and Azure Blob (any S3-compatible endpoint like MinIO, Wasabi, Cloudflare R2 works too).

### Adding a Storage Profile

1. Go to **Administration > Storage Profiles**.
2. Click **New Profile**.
3. Fill in: name, type (S3/GCS/Azure), bucket, endpoint (for custom S3-compatible), region, access key ID, and secret key.
4. Click **Test** to verify the connection reaches the bucket.
5. Click **Save**.

Storage profiles are referenced by name in backup schedules. If you rename or delete a profile that is used by an active schedule, the schedule will fail with a "profile not found" error.

## App Data Backup

Backs up CHOps's SQLite database (all settings, alert rules, channels, dashboards, charts, users, backup schedules) to S3-compatible storage. Only super admins can access this page.

### How It Works

1. CHOps creates a clean database snapshot using SQLite's built-in backup command (safe to run while the server is running).
2. The snapshot is uploaded to S3 via ClickHouse®'s `s3()` table function (requires at least one cluster node configured).
3. A JSON manifest is written alongside the backup with metadata: timestamp, app version, file size, and row counts per table.

S3 layout: `{bucket}/chops-app-backups/{timestamp}.db` and `{timestamp}.json`.

### Manual Backup

Go to **Administration > App Data Backup**, select a storage profile, click **Backup Now**.


### Restore

Restore is manual because the server must be stopped. Instructions are shown on the App Data Backup page under "Restore Instructions". The steps are:

1. Download the `.db` file from S3 (using `aws s3 cp` or any S3 client).
2. Stop the CHOps server.
3. Remove `data/chops.db-wal` and `data/chops.db-shm`.
4. Replace `data/chops.db` with the downloaded backup file.
5. Restart the server.

The backup file is self-contained. All app state is inside the single `.db` file.
