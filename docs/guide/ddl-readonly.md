# DDL & Readonly Tables

The DDL & Readonly page answers two operational questions at a glance: are my schema changes propagating across the cluster, and are any replicas stuck in read-only mode? Both conditions are early warning signs of cluster trouble, so this page is worth checking after every schema migration and whenever replication feels slow.

This page is read-only. It reads from `system.distributed_ddl_queue` and `system.replicas` and does not modify anything.

---

## What Is Distributed DDL?

When you run a schema change with the `ON CLUSTER` clause, for example `CREATE TABLE ... ON CLUSTER my_cluster` or `ALTER TABLE ... ON CLUSTER my_cluster`, ClickHouse® does not apply the change directly. Instead, it writes the statement to a queue in ClickHouse® Keeper. Every node in the cluster watches that queue, picks up the statement, executes it locally, and reports the result back.

This is how a single `ON CLUSTER` command keeps the schema consistent across dozens of nodes. The queue is visible in the `system.distributed_ddl_queue` table, and this page surfaces it.

On a single-node setup with no distributed DDL configured, the queue is empty and the cards show zeros. That is normal, not an error.

---

## Status Cards

The top of the page shows stat cards summarizing the distributed DDL queue:

| Card | Meaning |
|------|---------|
| **Total** | All DDL entries in the queried window |
| **Active** | Statements currently executing on one or more nodes |
| **Finished** | Statements that completed successfully on all target hosts |
| **Failed** | Statements that returned an exception on at least one host |

A non-zero **Failed** count is the one to watch. It means a schema change succeeded on some nodes but not others, which leaves the cluster in an inconsistent state until you intervene.

---

## DDL Queue Table

Below the cards, a table lists individual DDL entries from `system.distributed_ddl_queue`, typically including:

| Column | Description |
|--------|-------------|
| entry | The queue entry identifier (a monotonically increasing ID assigned by Keeper) |
| host | The node that executed (or is executing) the statement |
| status | Per-host status: `Active`, `Finished`, or an error state |
| cluster | The cluster the statement targeted |
| query | The DDL statement text |
| initiator | The host that submitted the statement |
| query_start_time | When execution began on this host |
| query_duration_ms | How long the statement took on this host |
| exception | The error text, if the statement failed on this host |

Because each `ON CLUSTER` statement produces one row per target host, a single `ALTER` across ten nodes appears as ten rows sharing the same entry ID. This lets you see exactly which node failed when a change does not propagate cleanly.

---

## Readonly Tables

A replicated table enters read-only mode when the node loses its connection to ClickHouse® Keeper, or when the replica's metadata in Keeper is missing or inconsistent. In read-only mode, the table rejects writes (INSERTs, merges, mutations) but still serves reads. This is a protective measure: ClickHouse® would rather refuse writes than risk diverging from the other replicas.

This page queries `system.replicas WHERE is_readonly = 1` and lists every affected table:

| Column | Description |
|--------|-------------|
| database | The database containing the read-only table |
| table | The read-only table name |
| readonly_start_time | When the table entered read-only state (where available) |

If any tables are read-only, an alert banner appears at the top with the count, so the condition is hard to miss.

---

## Reading the Page

| What you see | What it means | What to do |
|--------------|---------------|------------|
| All cards zero, no readonly tables | Healthy. No pending schema changes, all replicas writable. | Nothing. |
| Active entries, no failures | A schema change is mid-flight across the cluster. | Wait and refresh. Active should drop to zero as nodes finish. |
| Failed entries | A schema change failed on at least one host. | Read the exception column to find which host and why. Re-run or manually reconcile. |
| Readonly tables present | One or more replicas lost their Keeper connection or have inconsistent metadata. | Check ClickHouse® Keeper health and the affected nodes. See below. |

---

## Common Scenarios

### "I ran an ALTER ON CLUSTER and one node never updated"

Look at the DDL queue table and filter for your statement's entry ID. The row whose status is not `Finished` shows the host that failed and the exception text. Common causes are a node that was offline when the statement was issued, a disk-full condition, or a lock held by a long-running merge. Once the underlying issue is resolved, re-issue the statement; ClickHouse® is idempotent for most DDL when you use `IF NOT EXISTS` and `IF EXISTS` guards.

### "A table suddenly went read-only"

Read-only almost always traces back to the ClickHouse® Keeper connection. Check the ClickHouse® Keeper status on the Cluster Overview page first. If the connection is healthy but the table is still read-only, the replica's metadata path in Keeper may be missing. The standard recovery is `SYSTEM RESTORE REPLICA db.table` on the affected node, but confirm the cause before acting, since restoring a replica re-fetches metadata from Keeper.

### "The DDL queue keeps growing and nothing finishes"

If entries pile up in `Active` and never reach `Finished`, a node may be unable to reach Keeper, or the `distributed_ddl_task_timeout` may be too short for the size of the operation. Check that every target node is online and that Keeper is reachable from all of them.

---

## Single-Node Setups

If you run a single ClickHouse® node without a cluster definition, distributed DDL is not used, and `system.distributed_ddl_queue` is empty. The status cards show zeros and the queue table is empty. This is expected. Read-only detection still works, since `system.replicas` is populated whenever you use replicated table engines, even on a single node pointed at Keeper.

---

## Refresh

The page reads live data each time you open it or click Refresh. There is no automatic polling on this page, so refresh manually after issuing a schema change to watch it propagate.
