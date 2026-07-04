# Monitoring Dashboards

The monitoring dashboards give you a live, visual picture of how your cluster is performing, with dozens of charts grouped into tabs by subsystem so you can focus on one area at a time. To keep things efficient, CHOps only runs the queries for the tab you are actually looking at, which means opening this page does not put unnecessary load on your ClickHouse® cluster.

## Dashboards

## Tabs

Each tab gathers the charts for one part of the system. Here is what each one covers:

| Tab | What it shows |
|-----|-------------|
| Queries | Queries per second, running and failed queries, rows and bytes selected, rows inserted |
| Queries (host) | The same query metrics, broken down by individual node |
| CPU | CPU cores in use, IO wait, CPU wait, user and kernel time, load average |
| CPU (host) | The same CPU metrics, broken down by node |
| Memory | Tracked memory, merges, RSS, jemalloc, primary key and index memory, caches |
| Memory (host) | The same memory metrics, broken down by node |
| Disk & IO | Reads from disk and filesystem, per node |
| Merges & Parts | Running merges, total and maximum parts, per node |
| Network | Concurrent connections across TCP, MySQL, HTTP, and interserver traffic |
| Memory Drift | How ClickHouse®'s view of memory compares to the kernel's and the allocator's |
| Distributed Cache | Cache reads, requests, connections, errors, and registry updates |

## Controls

A few controls at the top let you choose what period to look at and how detailed it should be:

- **Quick range buttons** jump to a common window: 1 hour, 6 hours, 24 hours, 48 hours, 7 days, or 30 days.
- **Custom range** lets you set your own start and end times.
- **Rounding** sets how finely the data is grouped over time, and it adjusts automatically when you pick a quick range.
- **Load Charts** runs the queries for the tab you are on.

#### Where the Data Comes From

All of these charts are built from ClickHouse®'s own internal metric tables, the same ones the server uses to track itself. You do not need to know the queries to read the charts, but it is worth knowing that everything you see is drawn directly from ClickHouse®'s live metrics, so it reflects the real state of your cluster. The per-host tabs simply break the same metrics out by node so you can compare one server against another.

## Playback

Playback lets you rewind through your ClickHouse® cluster's history like a DVR. Instead of checking dashboards in real time, you can go back to any point in the past and see exactly what the cluster was doing: CPU usage, memory, queries, errors, log entries, and data part operations, all synchronized on the same timeline.

This is most useful for post-incident investigation ("what happened at 2 AM?"), but also works for capacity planning ("what does our daily traffic pattern look like?") and debugging ("why did queries start failing at 3:47 PM?").

---

## Getting Started

1. Navigate to **Monitoring > Playback**
2. Set the **From** and **To** datetime fields to the time range you want to investigate
3. Choose a **Step** interval. This determines how granular each frame is:

   | Step | Best For | Frames in 1 Hour |
   |------|----------|-----------------|
   | 1s | Precise debugging of a short incident | 3,600 |
   | 5s | Detailed investigation of a 10-30 minute window | 720 |
   | 10s | General investigation of a 1-2 hour window (recommended starting point) | 360 |
   | 30s | Broad overview of a 6-12 hour period | 120 |
   | 60s | Daily patterns over 12-24 hours | 60 |

4. Click **Fetch Data**. CHOps runs 8 queries against ClickHouse® system tables. A progress bar shows completion.
5. Once loaded, the media controls and charts appear. You're ready to play.

---

## Media Controls

The controls bar is sticky and stays visible at the top of the page while you scroll through the charts.

#### Transport Buttons

| Button | Icon | Keyboard | What It Does |
|--------|------|----------|-------------|
| Skip to Start | (start) | Home | Jump to the first frame |
| Step Back | (back) | Left Arrow | Go back one frame |
| Play / Pause | (play/pause) | Space | Start or stop automatic playback |
| Step Forward | (forward) | Right Arrow | Go forward one frame |
| Skip to End | (end) | End | Jump to the last frame |

#### Speed

Controls how fast the frames advance during playback:

| Speed | Meaning | Use Case |
|-------|---------|----------|
| 0.25x | 1 frame every 4 seconds | Careful examination of each frame |
| 0.5x | 1 frame every 2 seconds | Slow review |
| 1x | 1 frame per second (default) | Normal playback |
| 2x | 2 frames per second | Faster scanning |
| 4x | 4 frames per second | Quick overview of long time ranges |

#### Timeline Scrubber

The horizontal slider lets you drag to any point in the timeline. The current timestamp and frame number are displayed above it. Dragging the slider automatically pauses playback.

#### Inspection Buttons

Two red buttons in the controls bar let you drill into the current frame:

- **Failed Queries**, shows queries that threw exceptions at this exact timestamp
- **Error Logs**, shows Error, Critical, and Fatal log entries at this exact timestamp

These are explained in detail in the [Inspection Popups](#inspection-popups) section below.

---

## Charts

All 8 charts share the same timeline. A **purple vertical line** moves across every chart simultaneously, showing the current frame's position. This lets you correlate events: "when CPU spiked, what happened to queries and logs at the same moment?"

#### Hardware (3 charts)

These charts use a **confidence band** style: three overlapping lines showing the minimum, median, and maximum value within each step interval. The shaded area between min and max shows the range of values.

| Line | Color | Meaning |
|------|-------|---------|
| Min | Green | The lowest value seen in this step interval |
| Median | Orange | The middle value (50th percentile) |
| Max | Red | The highest value seen in this step interval |

If all three lines are close together, the metric is stable. If min and max are far apart, there's high variance within each interval.

**CPU Usage (cores)**
Shows how many CPU cores the ClickHouse® server was using. Pulled from `ProfileEvent_OSCPUVirtualTimeMicroseconds` in `system.metric_log`. Values are in CPU-seconds per step interval.

**RAM Usage**
Shows tracked memory usage in bytes from `CurrentMetric_MemoryTracking`. This is the memory ClickHouse® is actively tracking (not total system memory). A sudden spike followed by a drop usually indicates a large query that allocated and then released memory.

**Network Connections**
Total concurrent connections across all protocols: TCP (native client), HTTP (web interface, REST APIs), MySQL (MySQL protocol compatibility), and Interserver (replication between nodes). A sudden spike might indicate a connection leak or a burst of client connections.

#### App Logs (1 chart)

A **stacked area chart** of log entries per step interval from ClickHouse®'s internal text log, grouped by severity level. Each severity level is a different color, stacked on top of each other.

| Severity | Color | What It Means |
|----------|-------|--------------|
| Test | Light green | Test-only messages (rarely seen in production) |
| Trace | Green | Very detailed diagnostic messages |
| Debug | Dark green | Debugging information |
| Information | Light orange | Normal operational messages |
| Notice | Orange | Notable but non-problematic events |
| Warning | Dark orange | Something unexpected that might need attention |
| Error | Light red | Something went wrong but the server continued |
| Critical | Red | A serious problem |
| Fatal | Dark red | The server is about to crash or has crashed |

**What to look for:** A sudden spike in the red/orange area (Error/Critical/Fatal) correlates with something going wrong. Use the **Error Logs** inspection button to see the actual messages.

#### Data Parts (1 chart)

A **stacked area chart** of data part events from `system.part_log`. ClickHouse® stores data in "parts", immutable chunks of rows. Understanding part lifecycle helps diagnose performance issues.

| Event Type | Color | What It Means |
|-----------|-------|--------------|
| NewPart | Cyan | A new part was written (from an INSERT) |
| MergeParts | Blue | Two or more parts were merged into one (background merge completed) |
| MergePartsStart | Indigo | A background merge was started |
| MutatePart | Purple | A part was rewritten by a mutation (ALTER UPDATE/DELETE) |
| MutatePartStart | Light purple | A mutation was started |
| DownloadPart | Green | A part was downloaded from another replica |
| MovePart | Yellow | A part was moved between storage volumes or disks |
| RemovePart | Red | A part was removed (merged away, expired by TTL, or dropped) |

**What to look for:** A burst of NewPart without corresponding MergeParts means parts are accumulating faster than merges can process them. This can lead to "too many parts" errors. A burst of RemovePart after MergeParts is normal (old parts cleaned up after merge).

#### Queries (3 charts)

**Successful Queries by Kind**
Stacked area chart showing the count of successfully completed queries per step, grouped by query kind (Select, Insert, Create, Alter, Drop, System, etc.). Shows the mix and volume of your workload over time.

**Query Exceptions by Kind**
Same grouping but for queries that threw exceptions (`ExceptionBeforeStart` or `ExceptionWhileProcessing`). A spike here means something is failing. Use the **Failed Queries** inspection button to see the actual errors.

**Rows Selected vs Inserted**
Two stacked areas: rows read by SELECT queries and rows written by INSERT queries, from `system.metric_log`. Shows the read/write ratio of your workload. A sudden drop in selected rows might indicate queries are failing (check the exceptions chart). A spike in inserted rows correlates with bulk load jobs.

---

## Inspection Popups

When you see something interesting in the charts (a spike, a drop, an anomaly), pause the playback and use the inspection buttons to see exactly what happened at that moment.

#### Failed Queries

Click **Failed Queries** in the controls bar to see all queries that failed at the current frame's timestamp.

The popup shows a table with three columns:

| Column | What It Shows |
|--------|-------------|
| User | The ClickHouse® user who ran the query |
| Query | The SQL text (first 500 characters) |
| Exception | The error message ClickHouse® returned |

The timestamp matching uses `toStartOfInterval(event_time, INTERVAL {step} SECOND)`. This rounds each query's event time to the same step interval used by the charts, so the popup shows exactly the queries that contributed to the exception count in that frame.

#### Error Logs

Click **Error Logs** to see Error, Critical, and Fatal log entries from ClickHouse®'s internal log at the current frame's timestamp.

The popup shows a table with three columns:

| Column | What It Shows |
|--------|-------------|
| Level | The severity, color-coded: Error (red), Critical (darker red), Fatal (darkest red) |
| Logger | Which ClickHouse® component generated the log entry (e.g., `executeQuery`, `MergeTreeDataWriter`) |
| Message | The log message text (first 500 characters) |

#### Reading the Popup Tables

- **Text is truncated by default** to one line per cell with an ellipsis (...) for long content
- **Click any row** to expand it, the full text wraps and becomes visible
- **Click the same row again** to collapse it back to one line
- The table scrolls vertically if there are many rows (up to 200)
- There is no horizontal scrollbar, column widths are fixed, text wraps when expanded
- Press **Escape** or click outside the popup to close it

---

## Typical Workflows

#### Post-Incident Investigation

*"Something went wrong at 2 AM. What happened?"*

1. Set From to **1:30 AM**, To to **3:00 AM** (bracket the incident with margin)
2. Step = **10s** (gives 540 frames for 90 minutes, good granularity)
3. Click **Fetch Data**
4. Click **Play** at **2x speed** and watch the charts
5. When you see an anomaly (CPU spike, error log spike, query exception spike), click **Pause**
6. Note the timestamp in the controls bar
7. Click **Failed Queries** to see what failed at that exact second
8. Click **Error Logs** to see what ClickHouse® logged internally
9. Use **Step Back** and **Step Forward** to move one frame at a time around the incident
10. The combination of charts + failed queries + error logs usually tells the full story

#### Merge Storm Diagnosis

*"Queries are slow during certain hours. Why?"*

1. Set From/To to cover the slow period
2. Watch the **Data Parts** chart, look for a spike in MergeParts/MergePartsStart events
3. At the same moment, check the **CPU** and **RAM** charts, are merges consuming all resources?
4. Check the **Queries** chart, are queries slowing down (fewer completions per frame) during the merge storm?
5. Step to the frame where merges peak, click **Failed Queries** to see if any queries timed out

#### Capacity Planning

*"What does our daily traffic pattern look like?"*

1. Set a **24-hour** range with **60s** step (gives 1,440 frames)
2. Play at **4x speed**, the entire day replays in about 6 minutes
3. Note the peak values in the Hardware charts (CPU, RAM, connections)
4. Note when the peaks happen, do they correlate with batch jobs, business hours, or cron schedules?
5. Check if the query mix changes (more inserts at night, more selects during the day)

#### Finding the Root Cause of "Too Many Parts"

*"ClickHouse® is throwing 'too many parts' errors."*

1. Set the time range to when the errors started
2. Watch the **Data Parts** chart, look for NewPart events (cyan) growing without matching MergeParts events (blue)
3. This means parts are being created faster than merges can consolidate them
4. Check the **Queries** chart, is there a spike in INSERT queries?
5. Check **CPU** and **RAM**, are merges starved of resources?
6. Step to the frame where the gap between NewPart and MergeParts widens, click **Error Logs** to see the actual "too many parts" messages

---

## Limitations and Good to Know

| Limitation | Details |
|-----------|---------|
| **Maximum 10,000 frames** | If your time range ÷ step exceeds 10,000, CHOps asks you to increase the step or narrow the range. Example: 24 hours ÷ 1s = 86,400 (too many). Use 10s step for 8,640 frames (OK). |
| **Data is fetched once** | Changing the time range or step requires clicking Fetch Data again. Charts do not auto-refresh. |
| **Step is global** | All 8 charts use the same step interval. You cannot have 1s for CPU and 60s for logs. |
| **Empty tables are OK** | If a system table has no data for the range (e.g., no part_log events), the chart shows a flat zero line instead of an error. |
| **Short time ranges** | A 1-minute range with 1s step gives only 60 frames. Playback finishes in 60 seconds at 1x speed. |
| **Queries must have finished** | Only completed queries appear in query_log. Currently running queries are not shown. |
| **Chart animations disabled** | During playback, chart transition animations are turned off for performance. This is intentional. |

---

#### Keyboard Shortcuts Reference

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Left Arrow | One frame back |
| Right Arrow | One frame forward |
| Home | Jump to first frame |
| End | Jump to last frame |

Shortcuts are disabled when the cursor is inside an input field (datetime pickers, step dropdown) to avoid conflicts with typing.


---

## Related Page

The Monitoring section also includes the **[Memory Allocator](memory-allocator.md)** page, a deep dive into ClickHouse®'s jemalloc allocator: pool fragmentation, allocation size classes, reclaimable memory, and lock contention. Use it when you need to understand allocator-level memory behavior rather than the aggregate metrics shown here.
