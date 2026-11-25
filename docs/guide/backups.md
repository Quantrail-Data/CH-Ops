# Backups

CHOps backs up ClickHouse&reg; databases to S3-compatible, Google Cloud, or Azure Blob storage and restores them through a guided interface, not hand-written commands. You always see the statement, with the credentials masked, before it runs.

This page assumes you have not done a ClickHouse&reg; backup before.

Only admins and super admins can use the Data Lifecycle page. Other roles see the message "Data lifecycle management is only available for administrators."

---

## Contents

1. [How ClickHouse backups work](#1-how-clickhouse-backups-work)
2. [Before you can back anything up](#2-before-you-can-back-anything-up)
3. [Taking a backup](#3-taking-a-backup)
4. [Choosing a scope](#4-choosing-a-scope)
5. [The options](#5-the-options)
6. [Restoring](#6-restoring)
7. [Browsing what you have](#7-browsing-what-you-have)
8. [Full and incremental](#8-full-and-incremental)
9. [Scheduled backups](#9-scheduled-backups)
10. [When something does not work](#10-when-something-does-not-work)
11. [Practices worth adopting](#11-practices-worth-adopting)

---

## 1. How ClickHouse backups work

Understand this before you take a backup. It explains several things that look odd.

ClickHouse&reg; has a `BACKUP` statement. You run it against the server, you name a destination, and the **server** writes the data there. CHOps does not copy anything itself. It builds the statement, sends it, and reports the result.

The page sends only the values of the form to the CHOps server. The CHOps server checks them, builds the `BACKUP` or `RESTORE` statement, and adds the storage keys. The keys never reach your browser.

There are three consequences.

**The server needs access to the destination.** If your ClickHouse&reg; servers cannot reach the S3 bucket, the backup fails, whatever CHOps can reach. This is the most common first-time failure.

**A backup is a set of files in a bucket, not one file.** ClickHouse&reg; writes a structured directory. Do not rearrange it by hand.

**A backup is consistent per table**, not always across tables at one instant. This is fine for most purposes, but know it before you rely on cross-table consistency.

---

## 2. Before you can back anything up

CHOps needs a place to put backups: a bucket, and credentials to reach it. CHOps calls this a **storage profile**.

Set one up under **Control panel**, then **Storage Profiles**. The same profiles serve ClickHouse&reg; backups and CHOps app-data backups, so you configure the destination once.

See [Storage Profiles](admin.md#storage-profiles) for the fields.

### Test the storage profile

Test the profile before you rely on it:

1. Go to **Control panel**, then **Storage Profiles**.
2. Click **Test** on the profile card.
3. Read the result on the card. "Connection OK" means that the node reached the bucket with the keys of the profile.

The test runs a query on the active node that reads a probe file, with the ClickHouse&reg; `s3()` function, or `azureBlobStorage()` for Azure Blob. So it checks the path that backups use, from the server to the bucket or container. Another node on a different network can still fail. A missing probe file counts as reachable. A wrong key, a missing bucket or container, or a network error counts as a failure, and the card shows the error, with the keys hidden.

---

## 3. Taking a backup

Go to **Backups**, then **Data Lifecycle**, then the **Manual Backup** tab.

1. **Set Action to BACKUP.**
2. **Choose a Scope.** ALL, DATABASE, or TABLE. For DATABASE and TABLE, select the **Database** and the **Table**. Database and table names must be simple names: letters, digits, and underscores, not starting with a digit.
3. **Choose a Storage Profile.** This sets where the backup goes.
4. **Set any options** you need. The defaults are reasonable for a first backup.
5. **Read the preview.** The complete statement appears as you make choices, with the credentials masked.
6. **Click Execute BACKUP.**

CHOps writes the backup to `backups/manual/<scope>/...` in the bucket. The CHOps server makes the backup ID, for example `manual/ALL/MANUAL_ALL__2026_01_01_10_00_00`, from the scope and the time. Next to the backup, it writes a `manifest.json` file with the scope, the time, and the backup type. The backup lists use these manifest files.

### Read the preview

Read the preview. It is not decoration. It is the statement that CHOps sends, with the keys masked, and your last chance to notice that the scope is wrong or that the destination is the test bucket. The CHOps server builds the real statement from the same values, so the clauses are the same.

If you are learning ClickHouse&reg; backups, the preview is also the fastest way to learn the syntax. Change an option and watch which clause appears.

---

## 4. Choosing a scope

| Scope | Statement | Use when |
|---|---|---|
| ALL | `BACKUP ALL` | You want everything. |
| DATABASE | `BACKUP DATABASE x` | One application's data. |
| TABLE | `BACKUP TABLE x.y` | Before a risky change to one table. |

**Exclusions** let you take a broad scope and leave things out. Use **EXCEPT TABLES** (for example `db.table1, db.table2`) with the ALL or DATABASE scope. With the ALL scope, you can also use **EXCEPT DATABASES**. Each name in these lists must be a simple name, as above. This is usually better than listing every database you want. Skip anything you can rebuild: staging copies, data you can recompute, and scratch tables.

### A note on scope and time

A cluster backup of a large installation takes a long time and reads a lot of data. Take one when you need one. Use narrower scopes for routine work.

---

## 5. The options

### Run in the background

Turn on the **ASYNC** switch to add `ASYNC`. The statement then returns at once, and the server continues in the background.

Use it for anything large. Without it, the request stays open until the backup finishes, and a browser timeout on a long backup leaves you unsure whether it is still running.

### Apply across a cluster

Select a cluster in **ON CLUSTER**, which lists the clusters from `system.clusters`. This adds `ON CLUSTER`, so the statement runs on every node, not only the node you connected to. A cluster name can have letters, digits, underscores, dots, and dashes.

You need it for a distributed setup. On a single server it changes nothing.

### Extra settings

The **SETTINGS** field takes ClickHouse&reg; backup settings as `name = value` pairs, split by commas. A value must be a number, a word, or a quoted text with letters, digits, dots, colons, dashes, and underscores. CHOps refuses anything else. Two settings you are likely to want are:

| Setting | Does |
|---|---|
| `compression_method` | For example `'lz4'`. It trades CPU for size. |
| `compression_level` | For example `3`. |

For example:

```
compression_method = 'lz4', compression_level = 3
```

These pass through to ClickHouse&reg;. For anything not listed here, the ClickHouse&reg; documentation is the authority.

Do not put `base_backup` in SETTINGS. CHOps refuses it there. Use the **BASE BACKUP** field instead.

### Incremental backups

The **BASE BACKUP** field takes the backup ID of an earlier backup, for example `manual/ALL/MANUAL_ALL__2026_01_01_02_00_00`. CHOps then adds `base_backup` with the location of that backup in the same storage profile, so the new backup is incremental. The field is only for a backup, not for a restore. See [Full and incremental](#8-full-and-incremental).

---

## 6. Restoring

1. On the **Manual Backup** tab, set **Action** to **RESTORE**.
2. Choose the **Scope** and the **Storage Profile**.
3. Click **List Available Backups**. CHOps looks in your S3 storage and lists the backups for that scope, newest first.
4. Select a backup in **Available Backups**.
5. Read the preview, then click **Execute RESTORE**.

### Before you restore

**A restore is not an undo.** Read what the restore does to what is already there. Restoring a table that still exists is not automatically safe.

**Restore somewhere else first, when you can.** Restore into a different database name, or a staging cluster. This confirms the backup is good without putting the thing you protect at risk.

**A backup you have never restored is not proven.** Do the first restore before an incident, not during one. Try one on a small table while nothing is wrong.

---

## 7. Browsing what you have

The **Available Backups** tab lists everything in your S3 storage, so you always know what you can fall back on.

Choose a **Storage Profile** and click **Scan S3**. For each backup you see:

| Column | Meaning |
|---|---|
| Backup ID | The backup identifier. |
| Scope | ALL, DATABASE, or TABLE, with the database and table. |
| Created | When you took it. |
| Backup Type | FULL, or INC for incremental. |

CHOps marks a backup as INC when you made it with a **BASE BACKUP**. The list shows only backups that have a CHOps manifest file. A backup that you made outside CHOps does not show.

**Scan from time to time, even when nothing is wrong.** This is how you find out that a schedule stopped three weeks ago, instead of finding out at the worst time.

---

## 8. Full and incremental

A **full** backup has everything in its scope.

An **incremental** backup has only what changed since an earlier backup. You name the earlier backup in the **BASE BACKUP** field.

Incrementals are smaller and faster. The trade is that restoring one needs its base, and the base of its base, all the way back to a full. If you break that chain, everything after it is unusable.

A practical pattern is a full backup weekly and incrementals daily against it. Each week starts a fresh chain, so no chain grows long enough to be fragile.

Keep at least one complete chain beyond your retention period. Retention that deletes a base while its incrementals survive leaves you with files that cannot restore.

---

## 9. Scheduled backups

Everything above is manual. You run it when you want it.

CHOps can also run backups on a schedule you define, take incrementals against the last full, and clean up backups past their retention.

Scheduled backups are part of CHOps Pro. See [CHOps Pro](chops-pro.md).

Until then, a scheduled job outside CHOps that calls the same statements works well. The preview on the Manual Backup tab gives you the statement to schedule.

---

## 10. When something does not work

### The backup fails at once with an access error

The server cannot reach the bucket. CHOps shows one of these messages, followed by the details: "Storage access denied. Check your storage profile credentials.", "Bucket or container not found. Verify the name in your storage profile.", or "Cannot reach the storage endpoint. Check the endpoint in your storage profile." CHOps removes the storage keys from the details. Because the server writes the backup, not CHOps, a profile that passed the test on one node can still fail on another node.

### CHOps refuses the request before it runs

CHOps checks the form values before it builds the statement. The error names the value that is not valid, for example a database name with a dash, a setting that is not a `name = value` pair, or `base_backup` in SETTINGS. Correct the value and click **Execute BACKUP** or **Execute RESTORE** again.

Check that your ClickHouse&reg; nodes have network access to S3, and that the credentials in the profile are ones the server can use. On a cloud deployment, this often means a role attached to the instances, not keys.

### The backup runs for a long time and the page seems stuck

You did not turn on **Run in the background**. The request stays open until the server finishes.

Turn on `ASYNC` for anything large. The browser does not affect the backup itself.

### Scan S3 returns nothing

There are three possible causes, in order: the profile points at a different bucket from the one ClickHouse&reg; wrote to, nobody has backed anything up with this profile yet, or someone made the backups outside CHOps, so they have no CHOps manifest file.

### A restore fails and says the base backup is missing

This is an incremental with a broken chain. The base it was taken against is gone, for example because a cleanup job or a bucket lifecycle rule deleted it.

Find an earlier full backup and restore that instead. Then fix the cleanup so it stops deleting bases ahead of their incrementals.

### A restore fails because the table already exists

This is expected. ClickHouse&reg; does not overwrite silently. Restore under a different name, or remove the existing table on purpose if you are sure.

### The backup succeeded but is smaller than expected

This is usually exclusions. Check the preview to see what you excluded.

It can also be correct. ClickHouse&reg; compresses well, so a backup much smaller than the raw data is normal.

---

## 11. Practices worth adopting

**Restore something once a quarter.** Restore a small table into a spare database. It takes minutes, and it is the only way to know your backups work.

**Back up before schema changes.** A table backup before an `ALTER` costs little and sometimes saves an afternoon.

**Keep the destination separate from the cluster.** A backup in the same account and region as the thing it protects survives fewer kinds of accident.

**Write down the restore procedure.** During an incident, nobody wants to work out which backup and which order. A paragraph in your runbook is enough.

**Watch retention against your chains.** The most common way backups fail silently is retention that deletes a base while its incrementals still depend on it.

---

## Related pages

- [Storage Profiles](admin.md#storage-profiles) to configure the destination
- [App Data Backup](admin.md#app-data-backup) to back up CHOps itself, which is separate from your ClickHouse&reg; data
- [CHOps Pro](chops-pro.md) for scheduled backups and automatic retention
