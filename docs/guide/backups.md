# Backups

CHOps backs up ClickHouse&reg; databases to S3-compatible storage and restores them. It uses a guided interface, not hand-written commands. You always see the exact statement before it runs, with the credentials masked.

This page assumes you have not done a ClickHouse&reg; backup before.

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

There are three consequences.

**The server needs access to the destination.** If your ClickHouse&reg; servers cannot reach the S3 bucket, the backup fails, whatever CHOps can reach. This is the most common first-time failure.

**A backup is a set of files in a bucket, not one file.** ClickHouse&reg; writes a structured directory. Do not rearrange it by hand.

**A backup is consistent per table**, not always across tables at one instant. This is fine for most purposes. Know it before you rely on cross-table consistency.

---

## 2. Before you can back anything up

CHOps needs a place to put backups: a bucket, and credentials to reach it. This is a **storage profile**.

Set one up under **Control Panel**, then **Storage Profiles**. The same profiles serve ClickHouse&reg; backups and CHOps app-data backups, so you configure the destination once.

See [Storage Profiles](admin.md#storage-profiles) for the fields.

**Test the profile before you rely on it.** A profile that CHOps can validate, but your ClickHouse&reg; servers cannot reach, passes here and fails at backup time. The server does the writing.

---

## 3. Taking a backup

Go to **Backups**, then **Data Lifecycle**, then the **Manual Backup** tab.

1. **Choose a scope.** The whole cluster, one database, or one table.
2. **Choose a storage profile.** This sets where the backup goes.
3. **Set any options** you need. The defaults are reasonable for a first backup.
4. **Read the preview.** The complete statement appears as you make choices, with the credentials masked.
5. **Run it.**

### Read the preview

Read the preview. It is not decoration. It is the exact statement that CHOps sends. It is your last chance to notice that the scope is wrong or that the destination is the test bucket.

If you are learning ClickHouse&reg; backups, the preview is also the fastest way to learn the syntax. Change an option and watch which clause appears.

---

## 4. Choosing a scope

| Scope | Statement | Use when |
|---|---|---|
| Cluster | `BACKUP ALL` | You want everything. |
| Database | `BACKUP DATABASE x` | One application's data. |
| Table | `BACKUP TABLE x.y` | Before a risky change to one table. |

**Exclusions** let you take a broad scope and leave things out. This is usually better than a list of every database you want. Skip anything you can rebuild: staging copies, data you can recompute, and scratch tables.

### A note on scope and time

A cluster backup of a large installation takes a long time and reads a lot of data. Take one when you need one. Use narrower scopes for routine work.

---

## 5. The options

### Run in the background

This adds `ASYNC`. The statement returns at once, and the server continues in the background.

Use it for anything large. Without it, the request stays open until the backup finishes. A browser timeout on a long backup leaves you unsure whether it still runs.

### Apply across a cluster

This adds `ON CLUSTER`. The statement runs on every node, not only the node you connected to.

It is necessary for a distributed setup. On a single server it changes nothing.

### Extra settings

This is a free-text field for ClickHouse&reg; backup settings. The three you are most likely to want are:

| Setting | Does |
|---|---|
| `base_backup` | Makes this backup incremental against an earlier backup. |
| `compression_method` | For example `'lz4'`. It trades CPU for size. |
| `s3_storage_class` | The S3 class to write to, for cost. |

Write them as you would in SQL:

```
base_backup = S3('https://bucket.s3.amazonaws.com/full-2026-07-01'), compression_method = 'lz4'
```

These pass through to ClickHouse&reg;. For anything not listed here, the ClickHouse&reg; documentation is the authority.

---

## 6. Restoring

On the **Manual Backup** tab, click **List Available Backups**. CHOps looks in your S3 storage and lists what it finds, newest first. Pick one and restore.

### Before you restore

**A restore is not an undo.** Read what the restore does to what is already there. To restore a table that still exists is not automatically safe.

**Restore somewhere else first, when you can.** Restore into a different database name, or a staging cluster. This confirms the backup is good without risk to the thing you protect.

**A backup you have never restored is not proven.** Do the first restore before an incident, not during one. Try one on a small table while nothing is wrong.

---

## 7. Browsing what you have

The **Available Backups** tab lists everything in your S3 storage, so you always know what you can fall back on.

Choose a storage profile and click **Scan S3**. For each backup you see:

| Column | Meaning |
|---|---|
| ID | The backup identifier. |
| Scope | Cluster, database, or table. |
| Created | When you took it. |
| Type | Full or incremental. |
| Retention | How long CHOps keeps it. |

You can show everything or one kind. Backups past their retention, and already cleaned up, are not listed.

**Scan sometimes, even when nothing is wrong.** This is how you find out that a schedule stopped three weeks ago. Otherwise you find out at the worst time.

---

## 8. Full and incremental

A **full** backup has everything in its scope.

An **incremental** backup has only what changed since an earlier backup. You name the earlier backup with `base_backup`.

Incrementals are smaller and faster. The trade is that a restore of one needs its base, and the base of its base, all the way back to a full. If you break that chain, everything after it is unusable.

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

The server cannot reach the bucket. Remember that the server writes the backup, not CHOps, so a profile that CHOps validated can still fail here.

Check that your ClickHouse&reg; nodes have network access to S3, and that the credentials in the profile are ones the server can use. On a cloud deployment, this often means a role attached to the instances, not keys.

### The backup runs for a long time and the page seems stuck

You did not turn on **Run in the background**. The request stays open until the server finishes.

Turn on `ASYNC` for anything large. The backup itself is not affected by the browser.

### Scan S3 returns nothing

There are three possible causes, in order. The profile points at a different bucket or prefix from the one that was written to. Nothing has been backed up yet with this profile. Or everything has passed its retention and been cleaned up.

### A restore fails and says the base backup is missing

This is an incremental with a broken chain. The base it was taken against is gone, probably deleted by retention.

Find an earlier full backup and restore that instead. Then fix the retention so it stops deleting bases ahead of their incrementals.

### A restore fails because the table already exists

This is expected. ClickHouse&reg; does not overwrite silently. Restore under a different name, or remove the existing table on purpose if you are sure.

### The backup succeeded but is smaller than expected

This is usually exclusions. Check what was excluded in the preview.

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
