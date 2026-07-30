# Backups

CHOps backs up ClickHouse® databases to S3 storage and restores them, through a
guided interface rather than hand-written commands. You always see the exact
statement before it runs, with credentials masked.

This page assumes you have not done a ClickHouse® backup before.

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

Worth understanding before you take one, because it explains several things that
otherwise look odd.

ClickHouse® has a `BACKUP` statement. You run it against the server, name a
destination, and the **server** writes the data there. CHOps does not copy
anything itself; it composes the statement, sends it, and reports what happened.

Three consequences.

**The server needs access to the destination.** If your ClickHouse® servers
cannot reach the S3 bucket, the backup fails no matter what CHOps can reach.
This is the most common first-time failure.

**A backup is a set of files in a bucket, not a single file.** ClickHouse® writes
a structured directory. Do not rearrange it by hand.

**A backup is consistent per table**, not necessarily across tables at one
instant. For most purposes that is fine, and it is worth knowing before you rely
on cross-table consistency.

---

## 2. Before you can back anything up

CHOps needs somewhere to put backups: a bucket, and credentials to reach it.
That is a **storage profile**.

Set one up under **Control Panel**, then **Storage Profiles**. The same profiles
serve both ClickHouse® backups and CHOps's own app data backups, so you
configure the destination once.

See [Storage Profiles](admin.md#storage-profiles) for the fields.

**Test the profile before relying on it.** A profile that CHOps can validate but
your ClickHouse® servers cannot reach will pass here and fail at backup time,
because the server does the writing.

---

## 3. Taking a backup

**Backups**, then **Data Lifecycle**, then the **Manual Backup** tab.

1. **Choose a scope.** Whole cluster, one database, or one table.
2. **Choose a storage profile**, which decides where it goes.
3. **Set any options** you need. Defaults are reasonable for a first backup.
4. **Read the preview.** The complete statement appears as you make choices,
   with credentials masked.
5. **Run it.**

### Read the preview

It is there to be read, not decoration. It is the exact statement that will be
sent, so it is the last chance to notice that the scope is wrong or the
destination is the test bucket.

If you are learning ClickHouse® backups, the preview is also the fastest way to
learn the syntax: change an option and watch which clause appears.

---

## 4. Choosing a scope

| Scope | Statement | Use when |
|---|---|---|
| Cluster | `BACKUP ALL` | You want everything |
| Database | `BACKUP DATABASE x` | One application's data |
| Table | `BACKUP TABLE x.y` | Before a risky change to one table |

**Exclusions** let you take a broad scope and leave things out, which is usually
better than listing every database you do want. Skip anything you can rebuild:
staging copies, materialised data you can recompute, scratch tables.

### A note on scope and time

A cluster backup of a large installation takes a long time and reads a lot of
data. Take one when you need one, and use narrower scopes for routine work.

---

## 5. The options

### Run in the background

Adds `ASYNC`. The statement returns immediately and the server continues in the
background.

**Use it for anything large.** Without it, the request stays open until the
backup finishes, and a browser timeout on a long backup leaves you unsure
whether it is still running.

### Apply across a cluster

Adds `ON CLUSTER`. The statement runs on every node rather than the one you are
connected to.

Necessary for a distributed setup. On a single server it changes nothing.

### Extra settings

A free text field for ClickHouse® backup settings. The three you are most likely
to want:

| Setting | Does |
|---|---|
| `base_backup` | Makes this incremental against an earlier backup |
| `compression_method` | For example `'lz4'`, trading CPU for size |
| `s3_storage_class` | Which S3 class to write to, for cost |

Written as you would in SQL:

```
base_backup = S3('https://bucket.s3.amazonaws.com/full-2026-07-01'), compression_method = 'lz4'
```

These pass through to ClickHouse®, so its documentation is authoritative for
anything not listed here.

---

## 6. Restoring

On the **Manual Backup** tab, choose **List Available Backups**. CHOps looks in
your S3 storage and lists what it finds, newest first. Pick one and restore.

### Before you restore

**Restoring is not undo.** Read what the restore will do to what is already
there. Restoring a table that still exists is not automatically safe.

**Restore somewhere else first when you can.** Restoring into a different
database name, or a staging cluster, tells you the backup is good without
risking the thing you are trying to protect.

**A backup you have never restored is a hope, not a backup.** The first restore
should not be during an incident. Try one on a small table while nothing is
wrong.

---

## 7. Browsing what you have

The **Available Backups** tab lists everything in your S3 storage, so you always
know what you can fall back on.

Choose a storage profile and choose **Scan S3**. For each backup you see:

| Column | Meaning |
|---|---|
| ID | The backup's identifier |
| Scope | Cluster, database or table |
| Created | When it was taken |
| Type | Full or incremental |
| Retention | How long it is set to be kept |

You can filter to show everything or one kind. Backups past their retention and
cleaned up are not listed.

**Scan this occasionally even when nothing is wrong.** It is how you find out
that a schedule stopped running three weeks ago, which is otherwise discovered
at the worst possible time.

---

## 8. Full and incremental

A **full** backup contains everything in its scope.

An **incremental** backup contains only what changed since an earlier one, named
with `base_backup`.

Incrementals are smaller and faster. The trade is that restoring one needs its
base, and the base of its base, all the way back to a full. Break that chain and
everything after it is unusable.

**A practical pattern:** a full backup weekly, incrementals daily against it.
Each week starts a fresh chain, so no chain grows long enough to be fragile.

Keep at least one complete chain beyond your retention period. Retention that
deletes a base while its incrementals survive leaves you with files that cannot
restore.

---

## 9. Scheduled backups

Everything above is manual: you run it when you want it.

CHOps can also run backups automatically on a schedule you define, take
incrementals against the last full, and clean up backups past their retention.

Scheduled backups are part of CHOps Pro. See [CHOps Pro](chops-pro.md).

Until then, a scheduled job outside CHOps calling the same statements works
perfectly well. The preview on the Manual Backup tab gives you the statement to
schedule.

---

## 10. When something does not work

### The backup fails immediately with an access error

The server cannot reach the bucket. Remember the server writes the backup, not
CHOps, so a profile CHOps validated can still fail here.

Check that your ClickHouse® nodes have network access to S3, and that the
credentials in the profile are ones the server can use. On a cloud deployment,
that often means a role attached to the instances rather than keys.

### The backup runs for a long time and the page seems stuck

You did not enable **Run in the background**. The request stays open until the
server finishes.

Enable `ASYNC` for anything large. The backup itself is unaffected by the
browser.

### Scan S3 returns nothing

Three possibilities, in order.

The profile points at a different bucket or prefix from the one that was written
to. Nothing has been backed up yet with this profile. Or everything has passed
its retention and been cleaned up.

### A restore fails saying the base backup is missing

An incremental whose chain is broken. The base it was taken against is gone,
probably deleted by retention.

Find an earlier full backup and restore that instead. Then fix the retention so
it stops deleting bases ahead of their incrementals.

### Restore fails because the table already exists

Expected. ClickHouse® does not silently overwrite. Either restore under a
different name, or remove the existing table deliberately if you are certain.

### The backup succeeded but is smaller than expected

Usually exclusions. Check what was excluded in the preview.

It can also be correct: ClickHouse® compresses well, and a backup being much
smaller than the raw data is normal rather than alarming.

---

## 11. Practices worth adopting

**Restore something once a quarter.** A small table into a spare database. It
takes minutes and it is the only way to know your backups work.

**Back up before schema changes.** A table backup before an `ALTER` costs little
and occasionally saves an afternoon.

**Keep the destination separate from the cluster.** A backup in the same account
and region as the thing it protects survives fewer kinds of accident.

**Write down the restore procedure.** During an incident, nobody wants to work
out which backup and which order. A paragraph in your runbook is enough.

**Watch retention against your chains.** The most common way backups fail
silently is retention deleting a base that incrementals still depend on.

---

## Related pages

- [Storage Profiles](admin.md#storage-profiles) for configuring the destination
- [App Data Backup](admin.md#app-data-backup) for backing up CHOps itself, which
  is separate from your ClickHouse® data
- [CHOps Pro](chops-pro.md) for scheduled backups and automatic retention
