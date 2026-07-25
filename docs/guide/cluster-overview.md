# Cluster Overview

When you log in, this is the first page you land on. It answers one question quickly: is this node healthy, and if not, what is wrong with it.

> **A note on the heading.** You reach this page from the sidebar under **Overview > Cluster Overview**, but the heading inside reads **Node Overview**. Almost everything here is scoped to the single node you are connected to, chosen in the navbar, rather than aggregated across the cluster. The topology diagram is the exception: it shows every node in every cluster.

The page has four parts, top to bottom:

1. **Status cards and disks**, refreshed every 30 seconds.
2. **Cluster topology**, a diagram of every configured cluster.
3. **Live overview**, refreshed every few seconds, and the bulk of the page.
4. **Keeper and connections**, refreshed with the status cards.

---

## Status cards

A row of cards across the top, each one number pulled live from ClickHouse®'s own system tables.

- **Version** is the server version you are running.
- **Uptime** is how long the server has been up since it last started.
- **Databases** and **Tables** are counts.
- **Active Queries** is how many queries are executing at this instant.
- **Merges** is background merge operations in progress. Merges are how ClickHouse® consolidates data behind the scenes, so activity here is normal.
- **Mutations** counts `ALTER UPDATE` and `ALTER DELETE` operations still running.
- **Readonly Tables** counts replicas that have slipped into a read-only state. Above zero, the card turns red and an alert banner appears below, because a read-only replica cannot accept writes and usually means replication is broken.

The row reflows to fit your screen, so it is eight across on a wide monitor and two across on a laptop.

## Disks

A donut showing used against free space for one disk, with a table beside it listing every configured disk with its total, free and used percentage. If you have more than one disk, a dropdown above the donut chooses which one it shows.

---

## Cluster topology

A block diagram of every cluster in `system.clusters`, one card each, stacked down the page.

Within a cluster, **each column is a shard and each row is a replica**. There are deliberately no lines drawn between nodes: replicas of a shard are peers rather than a chain, so any line would be inventing a relationship the server does not have. The grid position carries the topology, and a light container groups each shard.

Every node shows:

- A **status dot**: green when healthy, red when the node is reporting connection errors, amber for slowdowns, and grey when the cluster does not report node liveness at all. Only clusters using Keeper-backed auto-discovery report it, so grey means unknown rather than down.
- The **host name**, and the **address and port** beneath it.
- Its **position** as `S1/R2`, meaning shard 1, replica 2.
- **Error and slowdown counts**, but only when they are non-zero, so a healthy cluster stays clean. The card header also carries a summary such as "2 of 6 nodes reporting errors", so a cluster you have scrolled past still announces trouble.

Colour encodes shard by fill and replica by outline, and the node you are currently connected to has a thicker border. The `S1/R2` text carries the same information, so the diagram still works if you cannot distinguish the colours or if you have more shards than the palette.

You can pan, zoom with the scroll wheel or the controls in the corner, and clusters larger than a dozen nodes get a minimap.

---

## Live overview

The largest part of the page, and the part that refreshes fastest.

### Controls

The node name leads the section, so it is never ambiguous which server the numbers below belong to. Beside it:

- **Live** pauses and resumes. Paused freezes the last reading rather than blanking the page.
- **Interval** chooses 5, 10, 30 or 60 seconds. Both the toggle and the interval are remembered.
- **Updated Ns ago** so a stalled refresh is visible rather than quietly showing old numbers.

Polling stops while the browser tab is hidden and resumes with an immediate refresh when you come back, so leaving this page open on a second screen does not generate queries all night.

### What the numbers mean

Every value on this page is one of two things, and the difference matters:

- A **reading**, taken at the moment of the last refresh. Most of the page.
- A **rate**, measured across exactly one refresh interval. The Throughput and Efficiency sections say so in their headings, for example "Throughput (last 5s)".

Nothing here is a running total since the server started, and nothing is a graph over time. If you want history, the numbers are all available in the SQL editor from `system.metrics`, `system.asynchronous_metrics` and `system.events`.

Because a rate needs two readings, the very first refresh after opening the page shows dashes in those sections rather than zeros. A dash means "no answer yet"; a zero means "genuinely nothing happened". They are different, and the page keeps them different.

If the server restarts while you are watching, the rate counters reset. The page detects this, discards the reading it cannot compare, and shows "Server restarted, rates resuming" rather than drawing a large negative spike.

### Health checks

A row of chips underneath the controls. Every one should be zero on a healthy server, so a healthy server collapses this to a single green line reading "All checks are clear". Use **Show all checks** to see the full list with their current values.

The checks cover readonly replicas, an expired Keeper session, delayed inserts, broken distributed inserts, readonly or broken disks, a server shutting down, object storage inconsistency, lock waiters, queries spilling to disk, preempted queries, a growing drop queue, banned addresses, plus error and Keeper exception rates.

Two are worth knowing about in advance:

- **Delayed inserts** above zero means inserts are being throttled because too many parts exist. This is the step immediately before inserts start failing outright, so it is the one to act on.
- **Spilling to disk** is amber rather than red. Queries writing temporary files is legitimate, just far slower than staying in memory.

### Gauges

Three groups of dials, and they share one rule: **low is always good**. The colour bands are the same on every dial, green through amber to red as the value rises, so a green dial always means the same thing wherever you look.

That rule is why some dials are phrased as the opposite of what you might expect. **Page cache miss** rather than hit rate, **File reopens** rather than cache hit rate, **Unsorted inserts** rather than pre-sorted, **CPU blocked** rather than efficiency, **New HTTP connections** rather than keep-alive reuse. Each one is the complement of the familiar figure, so that a low reading and a green dial always agree.

**Machine and server** covers CPU, OS memory, ClickHouse memory, thread pool, CPU slots and filesystem cache.

**Background pools** shows the eight pools as in-use against limit, drawn as bars rather than dials because these are counts rather than percentages. A saturated merge pool is the single most useful early warning on this page: parts stop being consolidated, part count climbs, inserts start being delayed, and eventually they fail.

**Efficiency** covers the counter-derived percentages over the last interval.

Every dial has an information icon. Hovering it explains what the number is, how to read it, and the exact formula it was computed from.

### Throughput and Efficiency

Two rows of single-value readings covering the last interval: query rate, average query time, rows and bytes read and written, disk and network throughput, CPU cores in use, and merge activity.

The Efficiency row carries the numbers that reward the most attention:

- **Read amplification** is rows scanned for every row returned. Close to 1 means the primary key is filtering well. In the tens or hundreds, most of what was read is being thrown away.
- **Write amplification** is rows rewritten by merges for every row inserted. Always above 1, because that is how MergeTree works. Tens is normal; hundreds means parts are being created faster than they can be merged.
- **Rows per part** is the lever behind write amplification. Under about a thousand with a steady insert rate is the classic sign of inserting row by row instead of in batches.

### Where the time goes

A bar chart showing how many threads were busy or blocked on each activity, on average, over the last interval. A value of 8 means the equivalent of eight threads spent the whole interval doing that.

**These bars are not a partition and must not be added up.** Disk read wait includes reads served from page cache, merge execution includes its own CPU time, and different counters cover different populations of threads. Compare their heights against each other, not against a total.

It is the fastest way to answer "the server is busy, but doing what".

### Activity right now, Storage, and Data health

Bar charts of what is in flight at this instant: queries, background work, I/O, locks and threads. Then the shape of the data on disk: parts by state, part format, caches by size and attached objects. Then a row of derived numbers including part churn, DDL lag, maximum parts per partition, replica delay and load average.

**Maximum parts per partition** is the number that triggers the too-many-parts insert failure. Watch it climbing rather than waiting for the error.

### In use on this node

A final section that appears only when the relevant subsystem is actually being used: temporary files, distributed inserts, async inserts, Kafka, replication queue. On a plain installation none of them appear at all, which is intentional. ClickHouse® reports several hundred metrics for features most installations never touch, and showing them all would bury the ones that matter.

---

## ClickHouse® Keeper and connections

At the foot of the page, side by side.

**Keeper** shows the connection: host and port, session uptime, when it connected, whether the session is active or expired, the API version, the session timeout, and when the connection was last lost. If Keeper is not configured, this reads as not configured rather than as an error.

**Active Connections** breaks down current client connections by protocol, with a bar per protocol and a total.

---

## Refreshing

The status cards, disks, topology, Keeper and connections refresh every 30 seconds. The live overview refreshes on its own interval, 5 seconds by default.

The two are deliberately separate. The slower numbers change rarely and cost more to fetch, so speeding them up would add load without adding information.
