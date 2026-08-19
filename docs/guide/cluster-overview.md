# Cluster Overview

When you log in, this is the first page you see. It answers one question fast: is this node healthy, and if not, what is wrong?

> Almost everything here is for the single node you are connected to, which you choose in the navbar. It is not aggregated across the cluster. The topology diagram is the exception. It shows every node in every cluster.

**Every section collapses, and most start collapsed.** On a first visit, only the status cards and the Machine and server gauges are open. They sit together at the top. Together they answer two things: which node is this, and is it under load. Everything else is a follow-up question.

Click a header to open it. The page then remembers your choice. The parts that matter differ between a live incident and a weekly check. So you open what you want once, and it stays open.

A collapsed header still shows its summary, including anything that needs attention. The health section reads "3 failing", not only its title. The topology reports how many nodes have problems. To fold a section away can never hide a fault.

The page runs top to bottom, in order of how often things change:

1. **The control bar.** It names the node and sets the refresh rate. It controls every number below it, so it leads.
2. **Status cards.** They refresh every 30 seconds.
3. **Machine and server gauges.** They refresh on the live interval. Together they say which node this is and whether it is under load.
4. **Disks.** They refresh with the status cards.
5. **Live overview.** This is the bulk of the page.
6. **Keeper and connections.**
7. **Cluster topology.** It is last, because it changes only when someone edits the cluster configuration.

---

## Status cards

A row of cards across the top. Each card is one live number from ClickHouse&reg;'s own system tables.

- **Version** is the server version you run.
- **Uptime** is how long the server has run since it last started.
- **Databases** and **Tables** are counts.
- **Active Queries** is how many queries run at this instant.
- **Merges** is the number of background merges in progress. Merges are how ClickHouse&reg; consolidates data, so activity here is normal.
- **Mutations** counts `ALTER UPDATE` and `ALTER DELETE` operations that still run.
- **Readonly Tables** counts replicas that have gone read-only. Above zero, the card turns red and an alert banner appears below. A read-only replica cannot accept writes. It usually means replication is broken.

The row reflows to fit your screen. It is eight across on a wide monitor and two across on a laptop.

## Disks

A donut shows used against free space for one disk. A table beside it lists every configured disk with its total, free, and used percentage. If you have more than one disk, a dropdown above the donut selects which one it shows.

---

## Live overview

This is the largest part of the page. It refreshes fastest.

### Controls

The control bar sits at the top of the page, not above the charts. It names the node and sets the refresh rate for everything below it, including the status cards. Beside the node name:

- **Live** pauses and resumes. Paused freezes the last reading. It does not blank the page.
- **Interval** selects 5, 10, 30, or 60 seconds. The page remembers the toggle and the interval.
- **Updated Ns ago** shows the age of the data, so a stalled refresh is visible.

Polling stops while the browser tab is hidden. It resumes with an immediate refresh when you come back. So this page open on a second screen does not make queries all night.

### What the numbers mean

Every value on this page is one of two things, and the difference matters:

- A **reading**, taken at the last refresh. This is most of the page.
- A **rate**, measured across one refresh interval. The Throughput and Efficiency sections say so in their headings, for example "Throughput (last 5s)".

Nothing here is a running total since the server started. Nothing is a graph over time. For history, the numbers are all in the SQL editor, in `system.metrics`, `system.asynchronous_metrics`, and `system.events`.

A rate needs two readings. So the first refresh after you open the page shows dashes in those sections, not zeros. A dash means "no answer yet". A zero means "nothing happened". They are different, and the page keeps them different.

If the server restarts while you watch, the rate counters reset. The page detects this. It discards the reading it cannot compare, and it shows "Server restarted, rates resuming". It does not draw a large negative spike.

### Health checks

A row of chips under the controls. Every one should be zero on a healthy server. So a healthy server collapses this to one green line: "All checks are clear". Use **Show all checks** to see the full list with current values.

The checks cover read-only replicas, an expired Keeper session, delayed inserts, broken distributed inserts, read-only or broken disks, a server that shuts down, object storage inconsistency, lock waiters, queries that spill to disk, preempted queries, a growing drop queue, banned addresses, and error and Keeper exception rates.

Know two in advance:

- **Delayed inserts** above zero means inserts are throttled, because too many parts exist. This is the step just before inserts start to fail. Act on it.
- **Spilling to disk** is amber, not red. A query that writes temporary files is legitimate. It is only far slower than staying in memory.

### Gauges

Three groups of dials share one rule: **low is always good**. The color bands are the same on every dial, green to amber to red as the value rises. So a green dial always means the same thing.

That rule is why some dials read as the opposite of what you expect. The page shows **Page cache miss**, not hit rate. It shows **File reopens**, not cache hit rate. It shows **Unsorted inserts**, not pre-sorted. It shows **CPU blocked**, not efficiency. It shows **New HTTP connections**, not keep-alive reuse. Each dial is the complement of the familiar figure. So a low reading and a green dial always agree.

**Machine and server** covers CPU, OS memory, ClickHouse&reg; memory, thread pool, CPU slots, and filesystem cache.

**Background pools** shows the eight pools as in-use against limit. It draws them as bars, not dials, because these are counts, not percentages. A saturated merge pool is the most useful early warning on this page. Parts stop being consolidated, the part count climbs, inserts are delayed, and in the end they fail.

**Efficiency** covers the counter-derived percentages over the last interval.

Every dial has an information icon. Hover over it to see what the number is, how to read it, and the exact formula.

### Throughput and Efficiency

Two rows of single-value readings for the last interval: query rate, average query time, rows and bytes read and written, disk and network throughput, CPU cores in use, and merge activity.

The Efficiency row carries the most important numbers:

- **Read amplification** is the rows scanned for every row returned. Close to 1 means the primary key filters well. In the tens or hundreds, most of what was read is thrown away.
- **Write amplification** is the rows rewritten by merges for every row inserted. It is always above 1, because that is how MergeTree works. Tens is normal. Hundreds means parts are made faster than they can be merged.
- **Rows per part** is the lever behind write amplification. Under about a thousand, with a steady insert rate, is the classic sign of inserts row by row instead of in batches.

### Where the time goes

A bar chart shows how many threads were busy or blocked on each activity, on average, over the last interval. A value of 8 means the equivalent of eight threads spent the whole interval on that activity.

**These bars are not a partition. Do not add them up.** Disk read wait includes reads served from page cache. Merge execution includes its own CPU time. Different counters cover different sets of threads. Compare their heights against each other, not against a total.

It is the fastest way to answer "the server is busy, but doing what".

### Activity right now, Storage, and Data health

Bar charts show what is in flight at this instant: queries, background work, I/O, locks, and threads. Then the shape of the data on disk: parts by state, part format, caches by size, and attached objects. Then a row of derived numbers, including part churn, DDL lag, maximum parts per partition, replica delay, and load average.

**Maximum parts per partition** is the number that triggers the too-many-parts insert failure. Watch it climb, rather than wait for the error.

### In use on this node

A final section appears only when the subsystem is in use: temporary files, distributed inserts, async inserts, Kafka, replication queue. On a plain installation, none of them appears. This is intentional. ClickHouse&reg; reports several hundred metrics for features most installations never use. To show them all would hide the ones that matter.

---

## ClickHouse® Keeper and connections

At the foot of the page, side by side.

**Keeper** shows the connection: host and port, session uptime, when it connected, whether the session is active or expired, the API version, the session timeout, and when the connection was last lost. If Keeper is not configured, this reads as not configured, not as an error.

**Active Connections** breaks down current client connections by protocol, with a bar per protocol and a total.

---

## Cluster topology

This is last on the page, and collapsed by default. The diagram changes only when someone edits the cluster configuration, so it changes least often. The collapsed header still shows the summary, including how many nodes report problems, so to fold it away never hides a fault.

It draws every cluster in `system.clusters`, one card each, stacked down the page. Each cluster has its own full-screen control. Escape leaves full screen.

Within a cluster, **each column is a shard and each row is a replica**. There are no lines between nodes, on purpose. Replicas of a shard are peers, not a chain, so a line would invent a relationship the server does not have. The grid position carries the topology. A light container groups each shard.

Every node shows:

- A **status dot**. It is green when healthy, red when the node reports connection errors, amber for slowdowns, and grey when the cluster does not report node liveness. Only clusters that use Keeper-backed auto-discovery report liveness. So grey means unknown, not down.
- The **host name**, and the **address and port** below it.
- Its **position** as `S1/R2`, which means shard 1, replica 2.
- **Error and slowdown counts**, but only when they are not zero. So a healthy cluster stays clean.

Color shows the shard by fill and the replica by outline. The node you are connected to has a thicker border. The `S1/R2` text carries the same information. So the diagram still works if you cannot tell the colors apart, or if you have more shards than the palette.

You can pan and zoom with the scroll wheel or the corner controls. Clusters larger than a dozen nodes get a minimap.

### The health table

Beside each diagram is a table with one row per node. It carries every health column your server reports: errors, slowdowns, estimated recovery time, recovery time, replication lag, and unsynced-after-recovery. A diagram is good at shape and bad at columns of numbers, so these live in a table.

Know two conventions in that table:

- **A zero is shown as `0`.** It means the column is reported and there is nothing wrong.
- **A dash means the column is not reported by this cluster.** Several columns apply only to Replicated database clusters and come back as NULL everywhere else. These are different states, and the table keeps them different.

A column that no node in the cluster reports is left out. A table of six dashes tells you nothing, and its absence is itself informative.

---

## Colors

Charts use the same colors in both themes. Only the text changes: light labels on the dark theme, dark labels on the light one. A series keeps its color in either theme. So two people who compare the same page, or a screenshot against a live server, see the same thing.

## Refreshing

The status cards, disks, topology, Keeper, and connections refresh every 30 seconds. The live overview refreshes on its own interval, 5 seconds by default.

The two are separate, on purpose. The slower numbers change rarely and cost more to fetch. To speed them up would add load without adding information.
