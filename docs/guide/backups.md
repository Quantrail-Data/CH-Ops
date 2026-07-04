# Backups

CHOps lets you back up your ClickHouse® databases to S3 cloud storage and restore them when you need to, all through a guided interface rather than hand-written commands. As with the rest of CHOps, you see the exact command before it runs, with any credentials masked.

## Storage Profiles

Before you can back anything up, CHOps needs to know where to put it: which S3 bucket, and the credentials to reach it. That configuration lives in a storage profile.

Storage profiles are managed under **Administration > Storage Profiles**, and the same profiles are shared by both ClickHouse® backups and CHOps's own app-data backups. See the [Administration](admin.md) guide for how to set one up.

## Data Lifecycle

The Data Lifecycle page is where you create backups and restore from them. It has two tabs: one for running a backup or restore, and one for browsing what you already have.

### Manual Backup

This tab handles one-off backups and restores, the kind you run yourself when you want them.

When creating a backup, you first choose its scope: your entire cluster, a single database, or a single table. You then pick the storage profile that says where it should go. A set of options lets you fine-tune the job, including running it in the background so you do not have to wait, applying it across a cluster, and excluding specific databases or tables you would rather skip. As you make these choices, a live preview shows you the complete backup command CHOps will run, with sensitive details hidden.

To restore, click List Available Backups. CHOps looks in your S3 storage for everything available, shows them newest first, and lets you pick one and restore it.

### Available Backups

This tab lets you browse every backup sitting in your S3 storage, so you always know what you have to fall back on.

Choose a storage profile and click Scan S3, and CHOps lists what it finds. You can filter the list to show everything or just certain kinds of backups, and for each one you can see its ID, its scope, when it was created, whether it is a full or incremental backup, and how long it is set to be kept. Backups that have passed their retention period and been cleaned up are left out of the list.

## Scheduled Backups

Alongside the manual backups described above, CHOps can run backups automatically on a schedule you define, including incremental backups that only capture what has changed since the last full one, and it cleans up old backups for you once they pass their retention period. Scheduled backups are part of CHOps Pro. See the [CHOps Pro](chops-pro.md) page for more.
