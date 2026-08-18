# Monitoring Dashboards

The monitoring dashboards give you a live, visual picture of how your cluster performs. There are many charts, grouped into tabs by subsystem, so you can look at one area at a time. CHOps runs the queries only for the tab you have open, and only when you ask it to. So this page does not put load on your ClickHouse&reg; cluster on its own.

---

## Dashboards

### Tabs

Each tab collects the charts for one part of the system. Here is what each tab covers.

| Tab | What it shows |
|-----|-------------|
| Queries | Queries per second, running and failed queries, rows and bytes selected, rows inserted, and the query mix. |
| Storage | Disk used and available, inodes, MergeTree data size and row count, the largest tables, and active part counts. |
| Merges & Parts | Running merges, total MergeTree parts, and the maximum parts for one partition. |
| Memory | Tracked memory, merge memory, kernel RSS, allocator memory, primary key and index memory, and in-memory caches. |
| CPU | CPU cores in use, IO wait, CPU wait, userspace and kernel time, and the 15-minute load average. |
| Replication | Replica delay, the replication queue, inserts and merges in the queue, and read-only replicas. |
| Insert Path | Delayed inserts, distributed insert backlog, and inserted rows per second. |
| Cache | Mark cache hit ratio, cache hit ratio, and mark cache hits against misses. |
| Background Pools | The merges and mutations pool, pool utilisation, active pool tasks, and the flush and distributed pools. |
| Concurrency | Global threads (total against active), read-write lock activity, and preempted queries. |
| Coordination | Keeper sessions and watches, and Keeper requests and outstanding requests. |
| Network | Concurrent connections, network throughput, and packet drops. |
| Disk & IO | Reads from disk and reads from the filesystem. |
| Server Vitals | Uptime, database and table counts, and async metric jitter. |
| Memory Drift | How ClickHouse&reg;'s view of memory compares to the kernel and to the allocator. |
| Dist Cache | Distributed cache reads and writes, bytes, open connections, errors, and registry updates. |

### Controls

A few controls at the top choose the period to look at and how detailed it is.

- **Quick range buttons** jump to a common window, such as 1 hour, 24 hours, 7 days, or 30 days.
- **Custom range** lets you set your own start and end times.
- **Rounding** sets how finely CHOps groups the data over time. It adjusts automatically when you pick a quick range.
- **Load Charts** runs the queries for the tab you are on.

### Where the data comes from

The charts are built from ClickHouse&reg;'s own internal metric tables, the same ones the server uses to track itself. CHOps reads `system.metric_log` and `system.asynchronous_metric_log` through the `merge()` table function, so it covers every metric-log table at once. You do not need to know the queries to read the charts. It is worth knowing that everything you see comes straight from ClickHouse&reg;'s live metrics, so it reflects the real state of your cluster.

---

## Playback

Playback lets you go back through your cluster's history, like a DVR. Instead of a live dashboard, you go to any point in the past and see what the cluster was doing: CPU, memory, queries, errors, log entries, and data part operations, all on one timeline.

It is most useful for post-incident investigation ("what happened at 2 AM?"). It also helps with capacity planning ("what does our daily traffic pattern look like?") and debugging ("why did queries start to fail at 3:47 PM?").

---

## Getting started

1. Go to **Monitoring > Playback**.
2. Set the **From** and **To** datetime fields to the time range you want to investigate.
3. Choose a **Step** interval. This sets how detailed each frame is.

   | Step | Best for | Frames in 1 hour |
   |------|----------|-----------------|
   | 1s | Precise debugging of a short incident | 3,600 |
   | 5s | Detailed investigation of a 10 to 30 minute window | 720 |
   | 10s | General investigation of a 1 to 2 hour window (a good start) | 360 |
   | 30s | Broad overview of a 6 to 12 hour period | 120 |
   | 60s | Daily patterns over 12 to 24 hours | 60 |

4. Click **Fetch Data**. CHOps runs 8 queries against ClickHouse&reg; system tables. A progress bar shows completion.
5. When the data loads, the media controls and charts appear. You are ready to play.

---

## Media controls

The controls bar is sticky. It stays at the top of the page while you scroll through the charts.

### Transport buttons

| Button | Keyboard | What it does |
|--------|----------|-------------|
| Skip to Start | Home | Jump to the first frame. |
| Step Back | Left Arrow | Go back one frame. |
| Play / Pause | Space | Start or stop automatic playback. |
| Step Forward | Right Arrow | Go forward one frame. |
| Skip to End | End | Jump to the last frame. |

### Speed

Speed sets how fast the frames advance during playback.

| Speed | Meaning | Use case |
|-------|---------|----------|
| 0.25x | 1 frame every 4 seconds | Careful look at each frame. |
| 0.5x | 1 frame every 2 seconds | Slow review. |
| 1x | 1 frame per second (default) | Normal playback. |
| 2x | 2 frames per second | Faster scanning. |
| 4x | 4 frames per second | Quick overview of a long time range. |

### Timeline scrubber

The horizontal slider lets you drag to any point in the timeline. The current timestamp and frame number appear above it. To drag the slider pauses playback.

### Inspection buttons

Two red buttons in the controls bar let you drill into the current frame:

- **Failed Queries** shows queries that threw exceptions at this exact timestamp.
- **Error Logs** shows Error, Critical, and Fatal log entries at this exact timestamp.

The [Inspection popups](#inspection-popups) section below explains these in detail.

---

## Charts

All 8 charts share one timeline. A **purple vertical line** moves across every chart at the same time, and shows the position of the current frame. This lets you correlate events. When CPU spiked, what happened to queries and logs at the same moment?

### Hardware (3 charts)

These charts use a **confidence band** style. Three overlapping lines show the minimum, median, and maximum value in each step interval. The shaded area between minimum and maximum shows the range.

| Line | Color | Meaning |
|------|-------|---------|
| Min | Green | The lowest value in this step interval. |
| Median | Orange | The middle value (50th percentile). |
| Max | Red | The highest value in this step interval. |

If the three lines are close together, the metric is stable. If minimum and maximum are far apart, there is high variance in each interval.

**CPU Usage (cores).** Shows how many CPU cores the server used. It comes from `ProfileEvent_OSCPUVirtualTimeMicroseconds` in `system.metric_log`. The values are CPU-seconds per step interval.

**RAM Usage.** Shows tracked memory in bytes, from `CurrentMetric_MemoryTracking`. This is the memory ClickHouse&reg; actively tracks, not total system memory. A sudden spike, then a drop, usually means a large query that allocated memory and then released it.

**Network Connections.** Total concurrent connections across all protocols: TCP (native client), HTTP (web interface and REST APIs), MySQL (MySQL protocol), and Interserver (replication between nodes). A sudden spike can mean a connection leak or a burst of client connections.

### App Logs (1 chart)

A **stacked area chart** of log entries per step interval, from ClickHouse&reg;'s internal text log, grouped by severity. Each severity is a different color, stacked on top of the others.

| Severity | Color | What it means |
|----------|-------|--------------|
| Test | Light green | Test-only messages (rare in production). |
| Trace | Green | Very detailed diagnostic messages. |
| Debug | Dark green | Debugging information. |
| Information | Light orange | Normal operational messages. |
| Notice | Orange | Notable but not a problem. |
| Warning | Dark orange | Something unexpected that may need attention. |
| Error | Light red | Something went wrong, but the server continued. |
| Critical | Red | A serious problem. |
| Fatal | Dark red | The server is about to crash, or has crashed. |

What to look for: a sudden spike in the red and orange area (Error, Critical, Fatal) goes together with something wrong. Use the **Error Logs** inspection button to see the actual messages.

### Data Parts (1 chart)

A **stacked area chart** of data part events, from `system.part_log`. ClickHouse&reg; stores data in "parts", which are immutable chunks of rows. The part lifecycle helps you diagnose performance problems.

| Event Type | Color | What it means |
|-----------|-------|--------------|
| NewPart | Cyan | A new part was written (from an INSERT). |
| MergeParts | Blue | Two or more parts were merged into one (a background merge finished). |
| MergePartsStart | Indigo | A background merge started. |
| MutatePart | Purple | A part was rewritten by a mutation (ALTER UPDATE or DELETE). |
| MutatePartStart | Light purple | A mutation started. |
| DownloadPart | Green | A part was downloaded from another replica. |
| MovePart | Yellow | A part was moved between storage volumes or disks. |
| RemovePart | Red | A part was removed (merged away, expired by TTL, or dropped). |

What to look for: a burst of NewPart without matching MergeParts means parts accumulate faster than merges can process them. This can lead to "too many parts" errors. A burst of RemovePart after MergeParts is normal, because old parts are cleaned up after a merge.

### Queries (3 charts)

**Successful Queries by Kind.** A stacked area chart of successfully completed queries per step, grouped by kind (Select, Insert, Create, Alter, Drop, System, and so on). It shows the mix and volume of your workload over time.

**Query Exceptions by Kind.** The same grouping, but for queries that threw exceptions (`ExceptionBeforeStart` or `ExceptionWhileProcessing`). A spike here means something fails. Use the **Failed Queries** inspection button to see the actual errors.

**Rows Selected vs Inserted.** Two stacked areas: rows read by SELECT queries and rows written by INSERT queries, from `system.metric_log`. It shows the read/write ratio of your workload. A sudden drop in selected rows can mean queries fail (check the exceptions chart). A spike in inserted rows goes together with bulk load jobs.

---

## Inspection popups

When you see something of interest in the charts (a spike, a drop, an anomaly), pause the playback and use the inspection buttons to see what happened at that moment.

### Failed Queries

Click **Failed Queries** in the controls bar to see all queries that failed at the current frame's timestamp.

The popup shows a table with three columns.

| Column | What it shows |
|--------|-------------|
| User | The ClickHouse&reg; user who ran the query. |
| Query | The SQL text (first 500 characters). |
| Exception | The error message ClickHouse&reg; returned. |

The timestamp match uses `toStartOfInterval(event_time, INTERVAL {step} SECOND)`. This rounds each query's event time to the same step interval as the charts. So the popup shows exactly the queries that made up the exception count in that frame.

### Error Logs

Click **Error Logs** to see Error, Critical, and Fatal log entries from ClickHouse&reg;'s internal log at the current frame's timestamp.

The popup shows a table with three columns.

| Column | What it shows |
|--------|-------------|
| Level | The severity, color-coded: Error (red), Critical (darker red), Fatal (darkest red). |
| Logger | Which ClickHouse&reg; component made the log entry, for example `executeQuery` or `MergeTreeDataWriter`. |
| Message | The log message text (first 500 characters). |

### How to read the popup tables

- Text is truncated by default to one line per cell, with an ellipsis for long content.
- Click a row to expand it. The full text wraps and becomes visible.
- Click the same row again to collapse it to one line.
- The table scrolls vertically if there are many rows (up to 200).
- There is no horizontal scrollbar. Column widths are fixed, and text wraps when expanded.
- Press Escape, or click outside the popup, to close it.

---

## Typical workflows

### Post-incident investigation

*"Something went wrong at 2 AM. What happened?"*

1. Set From to 1:30 AM and To to 3:00 AM. Bracket the incident with a margin.
2. Set Step to 10s. This gives 540 frames for 90 minutes, which is good detail.
3. Click **Fetch Data**.
4. Click **Play** at 2x speed and watch the charts.
5. When you see an anomaly (a CPU spike, an error log spike, a query exception spike), click **Pause**.
6. Note the timestamp in the controls bar.
7. Click **Failed Queries** to see what failed at that exact second.
8. Click **Error Logs** to see what ClickHouse&reg; logged.
9. Use **Step Back** and **Step Forward** to move one frame at a time around the incident.
10. The charts, the failed queries, and the error logs together usually tell the full story.

### Merge storm diagnosis

*"Queries are slow during certain hours. Why?"*

1. Set From and To to cover the slow period.
2. Watch the **Data Parts** chart. Look for a spike in MergeParts and MergePartsStart events.
3. At the same moment, check the **CPU** and **Memory** charts. Do merges use all the resources?
4. Check the **Queries** chart. Do queries slow down (fewer completions per frame) during the merge storm?
5. Step to the frame where merges peak. Click **Failed Queries** to see if any queries timed out.

### Capacity planning

*"What does our daily traffic pattern look like?"*

1. Set a 24-hour range with a 60s step. This gives 1,440 frames.
2. Play at 4x speed. The whole day replays in about 6 minutes.
3. Note the peak values in the CPU, Memory, and Network charts.
4. Note when the peaks happen. Do they match batch jobs, business hours, or cron schedules?
5. Check whether the query mix changes: more inserts at night, more selects during the day.

### Finding the root cause of "too many parts"

*"ClickHouse throws 'too many parts' errors."*

1. Set the time range to when the errors started.
2. Watch the **Data Parts** chart. Look for NewPart events (cyan) that grow without matching MergeParts events (blue).
3. This means parts are made faster than merges can consolidate them.
4. Check the **Queries** chart. Is there a spike in INSERT queries?
5. Check the **CPU** and **Memory** charts. Are merges starved of resources?
6. Step to the frame where the gap between NewPart and MergeParts widens. Click **Error Logs** to see the actual "too many parts" messages.

---

## Limitations and good to know

| Limitation | Details |
|-----------|---------|
| Maximum 10,000 frames | If the time range divided by the step is more than 10,000, CHOps asks you to increase the step or narrow the range. For example, 24 hours divided by 1s is 86,400, which is too many. A 10s step gives 8,640 frames, which is fine. |
| Data is fetched once | To change the time range or step, click Fetch Data again. The charts do not auto-refresh. |
| Step is global | All 8 charts use the same step interval. You cannot set 1s for CPU and 60s for logs. |
| Empty tables are fine | If a system table has no data for the range, for example no `part_log` events, the chart shows a flat zero line, not an error. |
| Short time ranges | A 1-minute range with a 1s step gives only 60 frames. Playback finishes in 60 seconds at 1x speed. |
| Queries must have finished | Only completed queries appear in `query_log`. Queries that still run are not shown. |
| Chart animations off | During playback, CHOps turns off chart transition animations for performance. This is intentional. |

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Left Arrow | One frame back |
| Right Arrow | One frame forward |
| Home | Jump to first frame |
| End | Jump to last frame |

Shortcuts are off when the cursor is in an input field (the datetime pickers or the step dropdown), so they do not conflict with typing.

---

## Related page

The Monitoring section also includes the **[Memory Allocator](memory-allocator.md)** page. It is a deep look at ClickHouse&reg;'s jemalloc allocator: pool fragmentation, allocation size classes, reclaimable memory, and lock contention. Use it when you need to understand allocator-level memory behavior, rather than the aggregate metrics here.
