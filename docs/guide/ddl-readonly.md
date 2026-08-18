# DDL & Readonly Tables

The DDL & Readonly page answers two operational questions at a glance: are my schema changes propagating across the cluster, and are any replicas stuck in read-only mode? Both conditions are early warning signs of cluster trouble, so this page is worth a check after every schema migration and whenever replication feels slow.

This page is read-only. It reads from `system.distributed_ddl_queue` and `system.replicas` and does not change anything.

---

## What is distributed DDL?

When you run a schema change with the `ON CLUSTER` clause, for example `CREATE TABLE ... ON CLUSTER my_cluster` or `ALTER TABLE ... ON CLUSTER my_cluster`, ClickHouse&reg; does not apply the change directly. Instead, it writes the statement to a queue in ClickHouse&reg; Keeper. Every node in the cluster watches that queue, picks up the statement, runs it locally, and reports the result back.

This is how a single `ON CLUSTER` command keeps the schema consistent across dozens of nodes. The queue is visible in the `system.distributed_ddl_queue` table, and this page shows it.

On a single-node setup with no distributed DDL configured, the queue is empty and the cards show zeros. That is normal, not an error.

---

## Status cards

The top of the page shows three cards that summarise the distributed DDL queue:

| Card | Meaning |
|------|---------|
| **DDL Queue Length** | The number of queued statements that have not yet run (status `Inactive`) |
| **Median Processing Time** | The median time that finished statements took to run |
| **Failed DDLs** | The number of statements that returned an exception on at least one host |

A non-zero **Failed DDLs** count is the one to watch. It means a schema change succeeded on some nodes but not others, which leaves the cluster in an inconsistent state until you intervene.

---

## DDL queue table

Below the cards, a table lists the statements that have not finished, from `system.distributed_ddl_queue`:

| Column | Description |
|--------|-------------|
| cluster | The cluster the statement targeted |
| query | The DDL statement text |
| query_create_time | When the statement was submitted |
| query_duration_seconds | How long it has taken so far, in seconds |
| status | The current status, such as `Inactive` for a pending statement |

The table shows only statements that are not `Finished`, so on a healthy cluster it is empty. When a change does not propagate cleanly, the statement stays here with a non-finished status. For the full per-host detail and the exception text, query `system.distributed_ddl_queue` in the [SQL Editor](sql-editor.md).

---

## Read-only tables

A replicated table enters read-only mode when the node loses its connection to ClickHouse&reg; Keeper, or when the replica's metadata in Keeper is missing or inconsistent. In read-only mode, the table rejects writes (INSERTs, merges, mutations) but still serves reads. This is a protection. ClickHouse&reg; would rather refuse writes than risk a divergence from the other replicas.

This page queries `system.replicas WHERE is_readonly = 1` and lists every affected table:

| Column | Description |
|--------|-------------|
| database | The database that holds the read-only table |
| table | The read-only table name |
| is_readonly | 1 while the table is read-only |
| absolute_delay | How far behind this replica is, in seconds |
| zookeeper_exception | The most recent Keeper error for the replica, if any |

If the list is empty, all replicas are writable. The `zookeeper_exception` column is usually the fastest clue to why a table went read-only.

---

## Refresh

The page refreshes on its own. The DDL queue updates every 10 seconds, and the read-only tables update every 30 seconds. So after you issue a schema change, you can watch it propagate without a manual refresh.

---

## Reading the page

| What you see | What it means | What to do |
|--------------|---------------|------------|
| Queue length zero, no read-only tables | Healthy. No pending schema changes, all replicas writable. | Nothing. |
| Queue length above zero, no failures | A schema change is mid-flight across the cluster. | Wait. The queue length should drop to zero as nodes finish. |
| Failed DDLs above zero | A schema change failed on at least one host. | Query `system.distributed_ddl_queue` in the SQL Editor to find the host and the exception. Re-run or reconcile by hand. |
| Read-only tables present | One or more replicas lost their Keeper connection or have inconsistent metadata. | Check ClickHouse&reg; Keeper health and the affected nodes. See below. |

---

## Common scenarios

### "I ran an ALTER ON CLUSTER and one node never updated"

Look at the DDL queue table and find your statement by its query text and cluster. A status that is not `Finished` means it is still pending or has stopped on some host. For the host and the exception text, query `system.distributed_ddl_queue` in the SQL Editor. Common causes are a node that was offline when the statement was issued, a disk-full condition, or a lock held by a long-running merge. Once you resolve the underlying issue, re-issue the statement. ClickHouse&reg; is idempotent for most DDL when you use `IF NOT EXISTS` and `IF EXISTS` guards.

### "A table suddenly went read-only"

Read-only almost always traces back to the ClickHouse&reg; Keeper connection. Check the ClickHouse&reg; Keeper status on the Cluster Overview page first, and read the `zookeeper_exception` column here. If the connection is healthy but the table is still read-only, the replica's metadata path in Keeper may be missing. The standard recovery is `SYSTEM RESTORE REPLICA db.table` on the affected node, but confirm the cause before you act, because a restore re-fetches metadata from Keeper.

### "The DDL queue keeps growing and nothing finishes"

If statements pile up and never reach `Finished`, a node may be unable to reach Keeper, or the `distributed_ddl_task_timeout` may be too short for the size of the operation. Check that every target node is online and that Keeper is reachable from all of them.

---

## Single-node setups

If you run a single ClickHouse&reg; node with no cluster definition, distributed DDL is not used, and `system.distributed_ddl_queue` is empty. The status cards show zeros and the queue table is empty. This is expected. Read-only detection still works, because `system.replicas` is populated whenever you use replicated table engines, even on a single node pointed at Keeper.
