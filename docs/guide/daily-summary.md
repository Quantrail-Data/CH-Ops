# Daily Summary

The Daily Summary page shows a single-day health report for your ClickHouse® node. It answers three questions at a glance: Is the node running efficiently? How did queries perform? Did anything break?

Seven cards across three rows cover CPU, memory, query performance, workload mix, and errors for the selected date.

---

## How to Use It

### Open the page

Go to **Overview > Daily Summary** in the sidebar.

### Pick a date

The date picker defaults to yesterday. Click it to select any past date. Today is excluded because the day is not yet complete and the metrics would be misleading.

Click **Refresh** to reload data for the currently selected date.

---

## Row 1: The Pulse (Compute and Memory)

This row answers: Is the node processing efficiently, or is it choking on resources?

### CPU Capacity

Shows two numbers side by side: **Median CPU** and **p99 CPU**, measured in cores. A dual-line sparkline below shows how CPU usage varied throughout the 24-hour period.

**How to read it:**

| Pattern | What it means |
|---------|---------------|
| p99 is high, median is low | Healthy. Brief query spikes are normal. |
| Both median and p99 are high | The node is under-provisioned. Consider adding CPU or moving workloads. |
| p99 and median are both near zero | The node was mostly idle that day. |

The card border turns amber when p99 exceeds 70% of available cores, and red above 90%.

### Memory Allocation

Shows **p99 RAM** (the steady-state utilization) and **Peak RAM** (the single highest point). A horizontal bullet bar visualizes p99 usage against total system memory. A thin marker shows where the peak landed.

Below the bar, three values show the absolute numbers: p99 in bytes, peak in bytes, and total system RAM.

**How to read it:**

| Pattern | What it means |
|---------|---------------|
| p99 is moderate, peak is close to p99 | Stable memory usage. No surprises. |
| p99 is moderate, peak is near 100% | A single query nearly exhausted all memory. One more concurrent heavy query and the OOM killer would have terminated ClickHouse®. |
| p99 is high and peak is high | Persistent memory pressure. Consider increasing RAM or limiting `max_memory_usage` per query. |

The card border turns amber above 75% peak, red above 90%.

### CPU and IO Wait

Shows **Peak CPU Wait** and **Peak IO Wait** in seconds. A stacked area chart below shows how wait times varied across the day. CPU wait is stacked on top of IO wait.

**How to read it:**

| Pattern | What it means |
|---------|---------------|
| IO wait is high, CPU wait is low | Your disks or S3 storage are slow. The CPU is ready but waiting for data. |
| CPU wait is high, IO wait is low | The node is starved for compute. Too many concurrent queries competing for CPU time. |
| Both are low | The node had enough resources for the workload. |

The card border turns amber when either wait exceeds 0.2 seconds, red above 0.4 seconds.

---

## Row 2: The Efficiency (Query and Data Metrics)

This row answers: What kind of workload ran, and how well did the database handle it?

### Workload Profiles

Shows median and p99 query duration for **SELECT** and **INSERT** operations separately, plus the count of each. A horizontal bar chart compares the two.

**Why they are separated:** If you mix SELECT and INSERT durations into one number, a handful of slow analytical SELECTs will skew your understanding of real-time INSERT performance. Separating them gives you an honest read of both.

**How to read it:**

| Pattern | What it means |
|---------|---------------|
| SELECT p99 is high, INSERT p99 is low | Analytical queries are slow but writes are healthy. Consider optimizing heavy SELECTs or adding indexes. |
| INSERT p99 is high, SELECT p99 is low | Write path is under pressure. Check merge activity and part counts. |
| Both are low | The workload fits the hardware. |

The card border turns amber when either p99 exceeds 10 seconds, red above 30 seconds.

### Data Velocity

Shows **Total Bytes Read** and **Total Bytes Written** for the day. A bar chart compares the two visually.

**How to read it:**

This card tracks your read/write amplification ratio. If bytes read suddenly spikes on a day with no workload change, your data-skipping indexes may be failing (ClickHouse® is scanning more data than expected to answer the same queries). If bytes written spikes, check for unexpected bulk inserts or materialized view rebuilds.

---

## Row 3: The Audit (Workload Mix and System Anomalies)

This row answers: Who ran what, and what broke inside the system?

### Query Mix

Shows a donut chart breaking down all queries by type: SELECT, INSERT, ALTER, SHOW, CREATE, and others. The total query count is shown in the subtitle.

**How to read it:**

This card contextualizes the resource usage from Row 1. If memory spiked at 4 PM, check the Query Mix to see if there was an unusual surge in heavy SELECT queries at that time. A sudden increase in ALTER or CREATE queries might indicate a schema migration that consumed resources.

### Errors and System Logs

Shows two headline numbers: **Query Errors** (queries that failed with an exception) and **Critical / Fatal** (entries from ClickHouse®'s internal `system.text_log` at Critical or Fatal severity).

Below the numbers, a table lists the top 5 most frequent error codes for the day with a preview of the error message and the count. If no errors occurred, a green checkmark is shown instead.

**How to read it:**

This is the safety net card. The other cards might look perfectly healthy, but if `text_log` shows Fatal entries, it means the OOM killer or another system-level failure crashed ClickHouse® and masked the memory spike. Always check this card, even when everything else looks green.

The card border turns amber if any query errors occurred, and red if any Critical or Fatal log entries exist.

---

## Threshold Reference

| Metric | Normal | Warning (amber) | Critical (red) |
|--------|--------|-----------------|----------------|
| p99 CPU (% of cores) | 0 to 70% | 70% to 90% | Above 90% |
| Peak RAM (% of total) | 0 to 75% | 75% to 90% | Above 90% |
| CPU Wait | Below 0.2s | 0.2s to 0.4s | Above 0.4s |
| IO Wait | Below 0.2s | 0.2s to 0.4s | Above 0.4s |
| Query p99 duration | Below 10s | 10s to 30s | Above 30s |
| Query errors | 0 | 1 or more | n/a |
| Critical/Fatal logs | 0 | n/a | 1 or more |

When a threshold is breached, the left border of the card changes color. Cards stay neutral (no colored border) when all values are within normal range.

---

## Common Scenarios

### "Everything looks green but the application was slow yesterday"

Check the **Workload Profiles** card. The p99 duration might be within the 10-second threshold but still too slow for your application's SLA. The thresholds are general-purpose defaults. Your application might need tighter targets.

Also check **Data Velocity**. A spike in bytes read without a corresponding increase in query count means individual queries are scanning more data than usual, possibly due to a missing WHERE clause or a dropped index.

### "The CPU card is red but queries were fast"

Check **CPU and IO Wait**. If CPU wait is high, too many queries are competing for CPU time. Each individual query might finish quickly, but the CPU is context-switching constantly. Consider reducing `max_threads` per query or spreading queries across more nodes.

### "Memory peak hit 95% but p99 is only 40%"

A single large query consumed most of the available memory. The p99 being low means this is not a sustained problem. Identify the query using the SQL Editor:

```sql
SELECT
    query_id,
    memory_usage,
    query_duration_ms,
    substring(query, 1, 200) AS query_preview
FROM system.query_log
WHERE event_date = '2025-01-15'
    AND type = 'QueryFinish'
ORDER BY memory_usage DESC
LIMIT 5
```

Then set `max_memory_usage` for that user or profile to prevent it from happening again.

### "The Error card shows errors but I do not see any failures in my application"

Not all ClickHouse® query errors are visible to applications. Background queries (materialized view refreshes, merges, system tasks) can fail silently. Check the top error codes in the error table. Common non-application errors:

| Code | Meaning |
|------|---------|
| 60 | Table does not exist (temporary table expired, or a race with DROP) |
| 159 | Timeout exceeded |
| 241 | Memory limit exceeded |
| 349 | Missing columns (schema changed between query parse and execution) |

### "No data on the page"

Three possible causes:

1. **`system.metric_log` is not enabled.** This table is enabled by default since ClickHouse® 21.8. If you are on an older version, add `<metric_log><database>system</database><table>metric_log</table></metric_log>` to your server config.

2. **The selected date has no data.** ClickHouse® rotates system logs based on configured retention (`ttl` settings on system log tables). Data older than the retention period is automatically deleted.

3. **The ClickHouse® user does not have access to system tables.** The user configured in CHOps's cluster settings needs SELECT permission on `system.metric_log`, `system.asynchronous_metric_log`, `system.query_log`, and `system.text_log`.

---

## Tips

- **Start with yesterday.** Today's data is incomplete, which makes percentiles and totals misleading. The page defaults to yesterday for this reason.
- **Compare days.** If yesterday's p99 CPU was 45% but last Monday it was 85%, something changed. Switch between dates to spot trends.
- **Use errors as a starting point.** If the Error card shows failures, note the error codes, then go to **Query Tools > SQL Editor** and query `system.query_log` for the full exception text and the query that caused it.
- **Check after deployments.** Run the Daily Summary the day after a schema change, index change, or application deployment. Compare workload profiles and data velocity against the previous day to catch regressions early.
