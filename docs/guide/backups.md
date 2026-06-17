# Backups

S3-based backup and restore workflow with manual backup, incremental support, and automatic retention cleanup.

## Storage Profiles

Storage profiles are now located under **Administration > Storage Profiles** (shared between ClickHouse® backups and App Data Backup). See the [Administration](admin.md) docs for details.

## Data Lifecycle

Two tabs: Manual Backup Available Backups.

### Manual Backup

One-off BACKUP and RESTORE operations.

- **Scope**: ALL, DATABASE (dropdown), TABLE (database + table dropdowns)
- **Storage Profile**: select from configured profiles
- **Options**: ASYNC toggle, ON CLUSTER dropdown, EXCEPT TABLES, EXCEPT DATABASES, SETTINGS
- **SQL Preview**: shows complete BACKUP command with credentials masked
- **S3 path**: `backups/manual/{scope}/{id}/`
- **Manifest**: writes `manifest.json` with `backup_type: 'manual'`

**Restore**: click "List Available Backups" to scan S3 for all manifests (both manual and scheduled directories). Select from dropdown (newest first) and execute.


### Available Backups

Browse all backups stored in S3.

- Select a storage profile and click "Scan S3"
- Filter: All Backups, Manual Only, Scheduled Only
- Results table: Backup ID, Type badge (MANUAL/SCHEDULED), Scope, Created date, FULL/INC badge, Retention
- Scans `manual/`, `scheduled/`, and legacy directories
- Deduplicates by backup_id, sorted newest first
- Tombstoned backups (past retention) are excluded

## S3 Directory Layout

```
{bucket}/backups/
  manual/                                  ← manual backups
    ALL/MANUAL_ALL__timestamp/
      manifest.json
    DATABASE/{db}/MANUAL_{db}__timestamp/
    TABLE/{db}.{tbl}/MANUAL_{db}.{tbl}__timestamp/
```

## Manifest Fields

| Field | Manual | Scheduled |
|-------|--------|-----------|
| backup_id | Yes | Yes |
| display_name | Yes | Yes |
| backup_type | `'manual'` | `'scheduled'` |
| scope | Yes | Yes |
| database | Yes | Yes |
| tables | Yes | Yes |
| created_at | Yes | Yes |
| s3_path | Yes | Yes |
| schedule_id | No | Yes |
| schedule_name | No | Yes |
| is_incremental | No | Yes |
| base_backup_id | No | Yes (for incremental) |
| frequency | No | Yes |
| retention_days | No | Yes |
| deleted | No | Yes (tombstoned) |
| deleted_at | No | Yes (tombstoned) |

## Backup Scheduler Internals

The `backupScheduler.js` service runs every 60 seconds, only acts at minute 0 (top of hour):

1. Load all enabled `backup_schedule` rows
2. For each schedule, check `alreadyRanThisHour` (dedup guard)
3. Resolve the storage profile and backup node (per-schedule `backup_node` or first node)
4. If `shouldRunFullBackup` matches: run full backup, write manifest
5. If `shouldRunIncrementalBackup` matches: find latest full backup via S3 manifest scan, use as `base_backup` SETTING. If no full exists, run full instead
6. Update schedule record: `last_run_at`, `last_run_status`, `last_run_error`, `last_backup_id`, `total_runs`, `total_errors`
7. Run `cleanupExpiredBackups`: scan manifests, tombstone any older than `retention_days + 1` day
