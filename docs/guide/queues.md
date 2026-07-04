# Queues

ClickHouse® moves a lot of data through queues: files streaming in from object storage, writes waiting to be sent to other shards, and replication tasks waiting to be applied. The Queues page brings these together so you can see what is flowing smoothly and what is backing up. You reach it from **Overview > Queues** in the sidebar, and it is organized into four tabs: S3 Queue, Azure Queue, Distribution Queue, and Replication Queue. Each tab is self-contained, so a problem reading one never blanks out the others.

## S3 Queue and Azure Queue

These two tabs monitor streaming ingestion, the kind you get from the `S3Queue` and `AzureQueue` table engines, where ClickHouse® continuously pulls new files from a bucket and loads them. The S3 tab and the Azure tab look and work the same way; they just point at different storage.

If you are not using these engines, the tab shows a friendly "n.a." note rather than an empty screen, so a blank panel never leaves you guessing.

When ingestion is running, each tab gives you three views of it:

- **Per-table health**: a row for each ingesting table showing its success rate, how many files it has processed, how many failed, how many rows it has ingested, and when it was last active. This is the quickest way to spot a table that has quietly stopped or started failing.
- **Throughput**: a chart of the ingestion rate over time, so you can see whether the flow is steady or stalling.
- **Where time goes**: a latency breakdown that splits each file's journey into three stages, Fetch (reading from object storage), Process (loading into ClickHouse®), and Commit (recording progress in Keeper). When ingestion feels slow, this tells you which stage is the bottleneck rather than leaving you to guess.

### Investigating failures

Below those views, a Failures panel lists the files that did not load. You can look at all failures or group them by error code to see which problem is most common. To narrow things down, search by table, by the text of the exception, or by file name. When there are no failures in the selected range, the panel says so plainly. A Refresh button reloads the data whenever you want the latest.

## Distribution Queue

The Distribution Queue tab is for `Distributed` tables. When you insert into a distributed table, ClickHouse® can buffer the rows locally and forward them to the right shard in the background. Those buffered writes sit in a queue, and this tab shows its state, drawn from `system.distribution_queue`.

At the top, summary cards show how much is waiting: the number of files waiting, the bytes waiting, how many are blocked, and how many broken files have been set aside. Below that, you can see the distributed tables involved and the depth of the queue per table and replica, with a filter to find a specific one. If you have no distributed tables, the tab tells you so. A growing queue here means writes are not reaching their shards as fast as they arrive, which is worth looking into.

## Replication Queue

The Replication Queue tab shows the tasks each replica works through to stay in step with the others, from `system.replication_queue`. This is the same queue summarized on the Merges and Mutations page, shown here in more depth.

Summary cards give you the headline: how many tasks are pending, how many are executing right now, and the age of the oldest task (a task that has been waiting a long time is the clearest sign of trouble). Below the cards you can see a breakdown by task type, and a list of tasks ordered with the most-retried first, which surfaces the ones that keep failing. You can filter the list, and switch between what is executing now and what currently has errors. As with the other tabs, an empty queue is reported clearly, and that is exactly what you want to see, since it means your replicas are in sync.
