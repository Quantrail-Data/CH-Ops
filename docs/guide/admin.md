# Administration

## User Management

CHOps has its own user system to control who can log in to the dashboard and what they can do once inside. These users are separate from your ClickHouse&reg; database users. A CHOps user governs access to the CHOps interface. A ClickHouse&reg; user (managed under Access Control) governs access to the database itself.

### How login works

When someone logs in, CHOps checks the username and password against its own database first. If there is no match, it falls back to the super admin credentials from the `.env` file, unless `DISABLE_ENV_LOGIN=true` is set.

CHOps hashes passwords with argon2id (a strong, one-way, memory-hard algorithm) before it stores them. Even if someone obtained the database file, they could not reverse a hash back into the original password. On older installations that stored SHA-256 hashes, CHOps transparently upgrades each user's hash to argon2id the next time that user logs in.

### The four roles

Every CHOps user holds exactly one of four roles, and the roles form a strict order: each role can do everything the role below it can do, and adds more.

**Super Admin (level 3).** Full access to everything, including the actions no other role can perform: managing other super admins and running the App Data Backup of the CHOps database. CHOps creates the first super admins from the `.env` file on first startup, and these first accounts are default users. Nobody can delete a default user or reset its password from User Management. After that, only another super admin can create one. A maximum of 3 super admins can exist at any time. Treat this role as being for initial setup, ownership, and emergency recovery.

**Admin (level 2).** The role for day-to-day administration. Admins can do almost everything a super admin can: manage clusters and nodes, storage profiles, alert rules, notification channels, trusted CAs, App Config, AI API keys, and other CHOps users. They cannot act on users at or above their own level, so they cannot change, reset, or delete super admins or other admins. In the interface, they can create only editor and readonly users. They cannot open the App Data Backup page or the System Email tab, which are for super admins only.

**Editor (level 1).** A working role for people who build and query but do not administer. Editors can use everything in the Overview, SQL Tools, Logs, Monitoring, and Schema Tools areas. They can run queries in the SQL Editor. Write queries need their own ClickHouse&reg; credentials: on the cluster's shared connection, the server makes an editor's queries read-only. Editors can create, rename, and arrange dashboards, but they cannot delete dashboards or charts. The Chart Builder page is for admins only, but the API lets editors create and update charts. On a Kubernetes cluster, editors also see the SQL Editor warning when the load balancer does not keep a session on one replica. They cannot manage alert rules, and they have no access to the administration or cluster-management functions.

**Readonly (level 0).** View-only access, and the default role for every new user. Readonly users can browse the overview pages, view dashboards and charts, and read logs and monitoring. They can open the SQL Editor, but the server forces every query they run to be read-only, so a readonly user can `SELECT` but never write, alter, or drop. They cannot create, edit, or delete anything in CHOps.

### What each role can do

| Capability | Super Admin | Admin | Editor | Readonly |
|------------|:-----------:|:-----:|:------:|:--------:|
| Log in; view overview, logs, monitoring, schema, and query tools | Yes | Yes | Yes | Yes |
| Run queries in the SQL Editor | Yes | Yes | Yes | Read-only queries only |
| View dashboards and charts | Yes | Yes | Yes | Yes |
| Create, rename, or arrange dashboards | Yes | Yes | Yes | No |
| Build or edit charts in the Chart Builder | Yes | Yes | No (the API allows it) | No |
| Delete dashboards and charts | Yes | Yes | No | No |
| View alert rules on the Alert Rules page | Yes | Yes | No | No |
| Create, edit, delete, or test alert rules and channels | Yes | Yes | No | No |
| Manage clusters and nodes | Yes | Yes | No | No |
| Manage storage profiles | Yes | Yes | No | No |
| Manage notification channels | Yes | Yes | No | No |
| Manage trusted CAs and App Config | Yes | Yes | No | No |
| Manage AI (Qurioz) API keys | Yes | Yes | No | No |
| Open the User Management page | Yes | Yes | No | No |
| Create users | Yes (any role) | Yes (editor, readonly) | No | No |
| Reset a password or make a new setup link | Yes (not default users) | Yes (users below you) | No | No |
| Change a user's role | Yes (to admin, editor, or readonly) | Yes (editor, readonly) | No | No |
| Delete a user | Yes (not super admins or default users) | Yes (editor, readonly) | No | No |
| System Email settings | Yes | No | No | No |
| App Data Backup of the CHOps database | Yes | No | No | No |
| Change your own password with **Change My Password** | Yes | Yes | No | No |
| Reset a forgotten password from the sign-in page | Yes | Yes | Yes | Yes |

### How access is actually enforced

It helps to know where CHOps enforces permissions, because it enforces them on the server, not by hiding menu items.

- **The sidebar is the same for everyone.** All roles see every navigation entry, including the **Control panel** section. Nothing is removed from the menu based on role.
- **Privileged pages gate themselves.** When a user without the required role opens an administration page, the page shows an "only available for administrators" message instead of the controls. This applies to User Management, Cluster Management, Storage Profiles, Notification Channels, Trusted CAs, App Config, AI API Keys, and Alert Rules. App Data Backup shows an "only available for superadministrators" message.
- **The server is the final authority.** CHOps checks every write action again on the backend API, so nobody can bypass a permission with a direct API call or by editing the page. The rules below describe that server-side enforcement, which is the behavior you can rely on.

For readers who work at the API level, the guards map to routes as follows. Most `GET` list endpoints are open to any logged-in user. The table shows the write actions and the `GET` endpoints that need a higher role.

| Route | Method(s) | Minimum role |
|-------|-----------|--------------|
| `/api/users` | `GET` (list) | Admin |
| `/api/users` | `POST` (create) | Admin |
| `/api/users/:id` | `PUT` (email, role, password reset) | Admin, with hierarchy checks |
| `/api/users/:id` | `DELETE` | Admin, with hierarchy checks |
| `/api/users/regenerate` | `GET` (new setup link) | Admin, with hierarchy checks |
| `/api/system-smtp` | all | Super admin |
| `/api/dashboards`, `/api/dashboards/charts` | `POST`/`PUT` | Editor |
| `/api/dashboards`, `/api/dashboards/charts` | `DELETE` | Admin |
| `/api/alerts/rules`, `/api/alerts/channels` | `POST`/`PUT`/`DELETE`, rule test, channel test, templates | Admin |
| `/api/cluster` | `POST`/`PUT`/`DELETE` | Admin |
| `/api/storage` | profile test, update, delete | Admin |
| `/api/trusted-cas`, `/api/app-config` | all | Admin |
| `/api/app-backup` | `POST`/`GET`/`PUT` | Super admin |
| `/api/qurioz/api-keys` | create/update/delete/select/check/read value | Admin |
| `/api/settings/:key` for `backup_profiles`, `app_backup_config`, `k8s.enabled`, `backup.exclude_k8s_credentials` | write/delete | Admin |
| `/api/settings/:key` for `clusters`, `cluster.nodes`, `clusters.storage` | write/delete | Nobody. Use the cluster pages (`/api/cluster`) |
| `/api/settings/:key` for other keys | read | Admin |
| `/api/query` | `POST` | Any logged-in user; the readonly role is forced to read-only queries |

### Rules for creating, changing, and deleting users

These rules exist to stop anyone from quietly escalating their own privileges, and the server applies them on every request.

**Creating a user.**

- A super admin can create a user with any role: super admin, admin, editor, or readonly.
- An admin can create editor and readonly users through the interface.
- Only a super admin can create a super admin, and only while fewer than 3 super admins exist.
- Editors and readonly users cannot create anyone.

**Changing a role.** Role changes obey two hard limits: you can never act on a user at or above your own level, and you can never grant a role at or above your own level.

- A super admin can change any admin, editor, or readonly user to admin, editor, or readonly.
- An admin can change editor and readonly users, and only to editor or readonly.
- Editors and readonly users cannot change anyone's role.
- **You cannot create a super admin by changing an existing user's role.** The only way to add a super admin is to create a brand-new user with that role, and only a super admin can do it. In other words, you cannot promote an existing account to super admin, so you create one from scratch instead.
- No one can change a super admin's role, not even another super admin.

**Resetting a password.** An admin can reset the password of a user below their own level. An admin cannot reset the password of a user at or above their own level, or make a setup link for that user. A super admin can reset the password of any user, including another super admin. Nobody can reset their own password this way, or the password of a default user. A reset removes the old password, makes a one-time setup link, and ends all sessions of that user. See [Resetting a user's password](#resetting-a-users-password).

**Deleting a user.**

- You cannot delete yourself.
- You cannot delete a user at your own level or above. In practice, an admin can delete editors and readonly users, and a super admin can also delete admins.
- No one can delete a super admin. A super admin cannot delete another super admin.
- No one can delete a default user.
- Editors and readonly users cannot delete anyone.

### Creating a new user

1. Go to **Control panel > User Management**.
2. Click **New User**.
3. Enter a username, an email address, and select a role. The email address is required, and both the username and the email address must be unique.
4. Click **Create User**.
5. CHOps shows a one-time setup link in the **Password Setup Link** box. Click **Copy URL** and send the link to the user securely.
6. If [System Email](#system-email) is configured, CHOps also sends the link to the email address of the user. The email shows the user name and the role.
7. The user opens the link and sets a password.

CHOps does not make a password for the user. Nobody sees a password, and CHOps does not send one by email.

The setup link expires after 30 minutes and works one time only. If the link expires before the user sets a password, click **Copy setup URL** (refresh icon) in the user's row, and CHOps makes a new link. This button works only for a user who has no password. A new link also ends all sessions of the user.

The link starts with the address in the `FRONTEND_LINK` environment variable. If `FRONTEND_LINK` is not set, CHOps uses the address of the request that reached the server. Behind a proxy, that address can be wrong, so set `FRONTEND_LINK` to the address that your users open.

### The first login password change

New users, and users whose password an administrator reset, have no password. Nobody can sign in to that account until the user sets a password with the setup link. There is nothing to configure.

**What the user sees.** The setup link opens the **Set Your Password** page. The page asks for two things:

| Field | Notes |
|---|---|
| New Password | At least 8 characters, at most 256 |
| Confirm Password | Must match |

Each field has a show or hide control.

**After it succeeds** the user goes straight into CHOps. They do not have to sign in again. Any other session of the user ends.

### Helping a user through it

**They mistyped and got an error.** The message names the problem: the passwords do not match, or the password is too short or too long. A failed attempt does not use up the link.

**The link does not work.** Either the link expired after 30 minutes or the user already used it. The page shows "Password setup link has expired." or "Invalid or expired password setup link." Click **Copy setup URL** in the user's row to make a new link.

**Nothing arrived by email.** System Email may not be configured. Copy the link from User Management and send it to the user. A super admin sees the message "SMTP is not configured" on User Management when System Email is not configured.

### Resetting a user's password

From **User Management**, an administrator can reset the password of another user:

1. Click **Reset Password** (key icon) in the user's row.
2. CHOps removes the user's current password, so the old password stops working. CHOps also ends all sessions of the user, so the user is signed out everywhere.
3. CHOps shows a one-time setup link in the **Password Setup Link** box. Click **Copy URL** and send the link to the user.
4. If System Email is configured, CHOps also sends the link to the user. The email shows the user name and the role.
5. The user opens the link and sets a new password.

CHOps does not make, show, or send a password. The link expires after 30 minutes.

An admin cannot reset the password of a user at or above their own level. CHOps shows "You cannot reset the password of a user at or above your level." A super admin can reset the password of any user except a default user.

An administrator cannot reset their own password this way. Use **Change My Password** on the User Management page instead. A change of your own password ends all your sessions, also the one you used to make the change, so you sign in again with the new password.

### Forgotten password

A user who forgets their password can reset it from the sign-in page. This needs [System Email](#system-email) and an email address on the account.

1. On the sign-in page, click **Forget password ?**.
2. Enter the email address of the account and click **Send Verification Code**.
3. CHOps sends a 6-digit code to that address. The code is valid for 10 minutes.
4. Enter the code and click **Verify**.
5. Enter the new password two times and click **Change Password**. The password must have 8 to 256 characters.
6. Sign in with the new password.

The page shows the same message for every email address, so it does not reveal which addresses have an account. CHOps sends a code only when exactly one account has that email address. The new password ends all existing sessions of the account.

CHOps limits the codes for each account:

- One code each 60 seconds. A new code does not reset this wait.
- At most 5 codes in 24 hours.
- After 5 wrong guesses, the code stops working. Ask for a new code.
- After 10 wrong guesses in 24 hours, the account cannot reset its password with a code until those 24 hours end.

When a limit stops a request, the page still shows its usual message, so the page does not tell an attacker which limit applies. CHOps keeps these counts in memory, so a server restart clears them.

### Where users are stored

Users live in the `app_user` table in CHOps's SQLite database. The `role` column defaults to `readonly`, and `must_change_password` defaults to true, so a new account has the lowest role and must set its own password before it does anything else. When the table has no users, CHOps adds the super admin accounts from the `.env` file (`SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and so on, up to 3). This happens in the database migration, which runs at server start and with `bun run db:migrate`.

The `token_version` column ends old sessions. Each login token holds the value it had when CHOps made the token. A password reset, a new setup link, a forgotten-password reset, or a change of your own password adds 1, so CHOps refuses all older tokens of that user. The migration adds the column to an existing database.

> The community edition records who can log in and what role they hold. It does not keep a record of what users do. [CHOps Pro](chops-pro.md) has an Audit Log that records actions in CHOps, sign-ins, and refused access. It does not record the SQL that users run.

## System Email

CHOps sends email for three things: the code that lets a user reset a forgotten
password, the setup link for a new user, and the setup link after a password reset.

To send email, CHOps needs an SMTP server. This page is where you give it one.
Only a super admin can open it.

### What this is not

This is **not** the same as the email channel under Notification Channels. That
one sends alerts. This one sends account email. They are separate on purpose:
your alerts can go to a team mailbox while account email comes from a different
address.

### Setting it up

1. Go to **Control panel > User Management** and open the **System Email** tab.
   Only a super admin sees this tab.
2. Fill in **SMTP host**, **Port**, and **From address**.
3. Fill in **Username** and **Password**, if your server needs them. Many internal
   relays do not.
4. Turn on **Use TLS** if your server needs it. Port 465 usually does. Port 587
   usually does not, because it starts without TLS and upgrades.
   CHOps uses this setting for every account email: the reset codes and both setup link emails.
5. Click **Test connection**. This checks that CHOps can reach the server and
   sign in. It sends nothing.
6. Enter an address in **Send a test email to** and click **Send test email**.
   This sends a real message. Do this one as well, because a server can accept a
   sign in and still refuse to send.
7. Click **Save**. CHOps tests the connection again before it saves. If the test
   fails, CHOps saves nothing and shows the error.

### Where the settings come from

CHOps uses the settings on this page. The **Currently using:** line above the
form tells you if a configuration is in use.

To remove the settings, click **Delete configuration**. CHOps then cannot send
account email until you save new settings.

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

CHOps supports up to 3 ClickHouse&reg; clusters, with a combined maximum of 18 nodes in direct connection clusters. Each cluster has a name and a list of nodes. The navbar shows a cluster dropdown (to switch clusters) and a node dropdown (to switch nodes within the active cluster). Managing clusters and nodes is an admin-level action.

> [CHOps Pro](chops-pro.md) adds Remote Admin, which does administration tasks on your ClickHouse&reg; servers through a sidecar.

### How to add a cluster

1. Go to **Control panel > Cluster Management** in the sidebar.
2. Click **New Cluster**.
3. Enter a **Cluster Name** (for example "Production", "Staging", "Analytics"). Names must be unique. CHOps ignores upper and lower case when it compares names.
4. Add nodes with **Add Node** and fill in: Name, Host, Port (default 8123), User, Password, and the **HTTPS** checkbox.
5. Click the test button (plug icon) next to each node to check the connection.
6. Click **Create Cluster**. The navbar cluster dropdown updates automatically.

To edit a cluster, click **Edit** on the cluster card. To delete a cluster, click the delete button (trash icon) on the card.

When you add a cluster, CHOps adds the alert templates as rules for that cluster and leaves these rules off. See [Alert templates](alerting.md#alert-templates).

If Kubernetes support is on, the page has two tabs: **Direct connection** and **Kubernetes**. See [Connect a Kubernetes cluster](kubernetes-connect.md).

### Switching clusters

Use the cluster dropdown in the navbar to switch between clusters. When you switch, the node dropdown updates to show the new cluster's nodes, and CHOps reconnects automatically. All pages (SQL editor, overview, logs, and so on) use the active cluster.

### Limits

- Maximum 3 clusters.
- Maximum 18 total nodes across all direct connection clusters. Nodes of Kubernetes clusters do not count.
- Node names must be unique within each cluster.

### Adding or removing nodes

Adding a new node to a cluster does not affect running alerts or backup schedules. Alert rules that watch all nodes include the new node at their next run. If you remove a node that an alert rule selects by name, the rule reports an error. See [Choosing which nodes a rule watches](alerting.md#6-choosing-which-nodes-a-rule-watches).

### Where cluster config is stored

CHOps saves cluster configuration in its SQLite database, in the `cluster` and `cluster_node` tables. CHOps encrypts ClickHouse&reg; passwords with AES-256-GCM before it stores them. There are no ClickHouse&reg; settings in the `.env` file.

Older versions kept all clusters in one JSON value in the `app_setting` table, under the key `clusters`. At the first start after an upgrade, the database migration copies that value to the key `clusters.bak.<time>`, moves the clusters to the tables, checks the result, and then sets `clusters.storage` to `tables`. If the check fails, CHOps keeps reading the old value.

Use the Cluster Management page to change clusters. The settings API refuses writes to `clusters`, `cluster.nodes`, and `clusters.storage` from every role, because a direct write would skip the checks of the cluster pages. Each save of a cluster increases its version number. A background refresh of a Kubernetes host list that started before the save then reads the cluster again.

## Trusted CAs

### The problem this solves

You turn on TLS for ClickHouse&reg;, tick **HTTPS** in CHOps, and get this:

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

1. Go to **Control panel > Trusted CAs**.
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

Shared storage configuration, used by both ClickHouse&reg; backups (Data Lifecycle) and App Data Backup. The types are **Amazon S3**, **Google Cloud**, and **Azure Blob**. Any S3-compatible endpoint, such as MinIO, Wasabi, or Cloudflare R2, works with the Amazon S3 type. Creating, editing, testing, or deleting a profile is an admin-level action.

### Adding a storage profile

1. Go to **Control panel > Storage Profiles**.
2. Click **New Profile**.
3. Fill in **Name**, **Type**, and **Bucket** (**Container** for Azure Blob).
4. For Amazon S3, fill in **Endpoint** if you use an S3-compatible service. Leave it empty for Amazon S3.
5. For Amazon S3 and Google Cloud, fill in **Region**, **Access Key ID**, and **Access Key (Secret)**.
6. For Azure Blob, fill in **Account Key or Connection String**. With an account key, also fill in **Account Name (not needed with a connection string)**. **Endpoint** is optional. The default is `https://<account>.blob.core.windows.net`.
7. Click **Save**.

CHOps treats the value in **Account Key or Connection String** as a connection string when it has `;` and `=` in it, and as an account key otherwise. We did not test Azure Blob profiles against a real Azure account.

Profile names must be unique.

CHOps encrypts the endpoint, the access key ID (or account name), and the key of every profile type before it stores them. Profiles from an older version that have a plain endpoint are encrypted at the next start.

### Testing a storage profile

Click **Test** on the profile card. CHOps runs a query on the active node that reads a probe file in the bucket or container, with the ClickHouse&reg; `s3()` function, or `azureBlobStorage()` for Azure Blob. "Connection OK" means that the node reached the storage with the keys. The probe file does not have to exist: if only the file is missing, the card shows "Bucket reachable (test key not found - expected)". A wrong key, a missing bucket or container, or a network error is a failure. The card then shows the error, with the keys hidden.

### Editing a storage profile

Click **Edit** to change the name, type, bucket, or region. You cannot change the endpoint, the access key ID, or the secret key. To change them, delete the profile and create a new one.

Backup schedules reference storage profiles by name. If you rename or delete a profile that an active schedule uses, the schedule fails with a "profile not found" error.

## App Data Backup

Backs up CHOps's SQLite database (all settings, alert rules, channels, dashboards, charts, users, and backup schedules) to the storage of a storage profile: Amazon S3 or an S3-compatible service, Google Cloud, or Azure Blob. Only super admins can use App Data Backup. The page and its API refuse every other role, because a backup holds the password hashes and the encrypted secrets of CHOps.

### How it works

1. CHOps makes a clean database snapshot with SQLite `VACUUM INTO`. This is safe while the server runs.
2. CHOps uploads the snapshot and the `crypto.salt` file through ClickHouse&reg;'s `s3()` table function, or `azureBlobStorage()` for Azure Blob. This needs at least one cluster node, and CHOps uses the first node of the first cluster.
3. CHOps writes a JSON manifest next to the backup with metadata: timestamp, app version, file size, backup type, and row counts per table.

Layout: `{bucket or container}/chops-app-backups/{timestamp}.db`, `{timestamp}.salt`, and `{timestamp}.json`. CHOps stores the `.db` and `.salt` files as base64 text, so you must decode them before a restore.

### Manual backup

Go to **Control panel > App Data Backup**, select a storage profile, and click **Backup Now**.

### Scheduled backup

Under **Scheduled Backup**, select the **Storage Profile**, the **Frequency** (**Daily** or **Weekly**), the **Day** for weekly backups, and the **Hour (24h)**. Turn the switch to **Enabled** and click **Save Schedule**. The backup runs at the start of the selected hour, in the time zone of the server.

### Restore

Restore is manual, because you must stop the server first. Use these steps:

1. Download `chops-app-backups/BACKUP_ID.db` and `chops-app-backups/BACKUP_ID.salt` of the same backup. Use `aws s3 cp` (or any S3 client) for S3 and Google Cloud, or `az storage blob download` for Azure Blob.
2. Stop the CHOps server.
3. Remove `data/chops.db-wal` and `data/chops.db-shm`.
4. Decode the `.db` file with `base64 -d` and replace `data/chops.db` with the result.
5. Decode the `.salt` file with `base64 -d`. The decoded salt must be 32 bytes. Save it as `data/crypto.salt`.
6. Restart the server.

The **Restore** section of the App Data Backup page shows the same steps as commands that you can copy.

Keep the same `ENCRYPTION_SECRET` as the original server. CHOps needs the secret and the salt to decrypt the stored credentials.


## App Config

Limits on how CHOps behaves. A change applies at once, with no restart.

The page has five tabs: Exports, Queries, Security, Kubernetes, and DB RBAC. All
tabs are open to admins and super admins.

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
| Total export storage | All export files together. When it is reached, CHOps refuses new exports. |
| Largest single export | CHOps stops an export when it passes this. |
| Exports running at once | Across everybody. |
| Exports per user | How many one person may run at the same time. |
| Warn above | Shown to the user as a warning. It stops nothing. |
| Delete idle files after | CHOps cleans up an export that nobody downloads after this. |

**Total export storage is bounded by the disk.** In Kubernetes that disk has a
size set in the deployment. Set this above it and Kubernetes evicts the pod when
the disk fills, which is worse than CHOps refusing an export. Check the disk before
you raise this.

### Queries

| Setting | What it does |
| --- | --- |
| Maximum result size | CHOps stops a query that returns more than this to it. This does not affect exports. |
| Schema Studio sample rows | How many rows CHOps uses to work out column statistics. |

The result size limit protects CHOps, not ClickHouse&reg;. A query that returns
a very large result can use all the memory CHOps has.

### Security

| Setting | What it does |
| --- | --- |
| Failed logins before lockout | How many wrong passwords lock an account. |
| Lockout lasts | How long it stays locked, and the window failures are counted in. |
| Session length | How long a login lasts. |

**Session length also sets how long a saved ClickHouse&reg; credential lives.**
That is deliberate. A saved credential that outlives the login it belongs to is
of no use to anybody, and is one more thing to steal.

Every setting, on all tabs, has a smallest and a largest value, shown under it,
and CHOps refuses anything outside that range. The server checks this, not only
the browser, so nobody can get around the range.

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

**Changing the refresh interval restarts the timer.** Every other setting here,
also **Missed refreshes before removing a host**, applies the next time CHOps
uses it, with no restart. The interval has to replace a running timer, so CHOps
does that when you save.

CHOps removes a host when no refresh has seen it for the refresh interval times
the number of missed refreshes. With the defaults, 15 minutes and 3, that is 45
minutes. A save on the Cluster Management page does not reset this time for a
host that keeps its address and port.

### DB RBAC

| Setting | What it does |
| --- | --- |
| ClickHouse default profile | The `default_profile` of your ClickHouse&reg; servers. **View Grants > Settings** starts with this profile. |
| A constraint replaces the previous one | The ClickHouse option `settings_constraints_replace_previous`, as **On** or **Off**. |

ClickHouse keeps both values in its server configuration, and no system table
shows them. CHOps uses the ClickHouse defaults, `default` and **On**. Change them
only when your servers use other values. The profile name is text, from 1 to
128 characters, so it has no smallest and largest value like the other settings.
