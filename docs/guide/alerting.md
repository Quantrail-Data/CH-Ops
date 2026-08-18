# Alerting

Alerting watches your cluster so you do not have to. You write a query that returns one number, set the value that counts as a problem, and choose how to be told. CHOps runs the query on a schedule and notifies you when the condition is met.

---

## Contents

1. [How an alert works](#1-how-an-alert-works)
2. [Writing the query](#2-writing-the-query)
3. [Threshold and comparison](#3-threshold-and-comparison)
4. [Severity](#4-severity)
5. [Schedule](#5-schedule)
6. [Choosing which nodes a rule watches](#6-choosing-which-nodes-a-rule-watches)
7. [Managing rules](#7-managing-rules)
8. [How and when rules run](#8-how-and-when-rules-run)
9. [Alert Channels](#alert-channels)
10. [The alert marquee](#10-the-alert-marquee)
11. [Alerts worth having](#11-alerts-worth-having)
12. [When something does not work](#12-when-something-does-not-work)

---

## 1. How an alert works

An alert rule has four parts:

1. **A query** that returns a single number.
2. **A threshold** and a **comparison**, which decide what counts as a problem.
3. **A schedule**, which decides how often to check.
4. **Channels**, which decide who hears about it.

Every minute, CHOps looks for rules that are due, runs their queries, compares the results, and notifies where the comparison is true.

That is the whole model. The simplicity is the point. Anything you can express as "this number should stay below that" becomes an alert, with no new concepts.

---

## Alert Rules

Find them under **Custom Alerts**, then **Alert Rules**.

To create one, you give a name and description, the query, the threshold and comparison, a severity, a schedule, the channels to notify, and, if you want, specific nodes.

---

## 2. Writing the query

**The query must return exactly one value.** Not one column of many rows. Not one row of many columns. One number.

```sql
SELECT count()
FROM system.replication_queue
WHERE num_tries > 10
```

That returns a single count. If it goes above your threshold, the alert fires.

### Making a query return one number

Most useful questions start as several rows. Aggregate them:

```sql
-- Wrong: one row per table
SELECT table, sum(bytes_on_disk) FROM system.parts GROUP BY table

-- Right: one number
SELECT max(total) FROM (
    SELECT sum(bytes_on_disk) AS total FROM system.parts GROUP BY table
)
```

The second query answers "is any table above the limit" in a single value, which is what an alert needs.

### The description is the message

The person who gets the notification at three in the morning may not have written the rule. The description appears in the notification, so write it for them: what this means, and what to do about it. "Replication queue backing up, check Keeper connectivity" is more use than "queue check".

### There is no row limit

Alert queries are not row-limited, because by definition they return one value. That also means a query that returns thousands of rows by mistake will do so. Check it in the SQL Editor before you save it as a rule.

---

## 3. Threshold and comparison

There are six comparisons:

| Comparison | Fires when |
|---|---|
| greater than | value > threshold |
| greater than or equal | value >= threshold |
| less than | value < threshold |
| less than or equal | value <= threshold |
| equal to | value = threshold |
| not equal to | value != threshold |

**Less than is the one people forget.** People usually write alerts for things that grow. But some problems are things that stop. A count of active replicas that falls below the expected number is exactly the alert you want, and it needs "less than".

**Equal to and not equal to** suit health checks that should always return the same answer, for example a count of read-only replicas that should always be zero.

### Choosing a threshold

Run the query for a week first and look at what normal is. A threshold set from guesswork either fires constantly, so people ignore it, or never fires, so it gives false comfort.

Set it above the normal peaks, not above the average. Anything that fires during ordinary Monday traffic is noise.

---

## 4. Severity

There are three levels: **info**, **warning**, and **critical**.

Severity does not change when a rule runs, or how. It colors the notification and lets people triage.

A rough division that works: critical means someone should look now, warning means someone should look today, and info means it is worth knowing but nothing is wrong.

Be strict about critical. A channel where everything is critical is a channel nobody reads.

---

## 5. Schedule

The schedule is a cron expression. The default is `*/5 * * * *`, which is every five minutes.

| Expression | Means |
|---|---|
| `*/5 * * * *` | Every five minutes |
| `*/15 * * * *` | Every fifteen minutes |
| `0 * * * *` | Hourly, on the hour |
| `0 9 * * *` | Daily at 09:00 |
| `0 9 * * 1` | Mondays at 09:00 |

CHOps validates the expression before it saves. It reports an error rather than accept something that will never run.

### Choosing a frequency

Match it to how fast the problem develops and how fast you could react.

A disk that fills over days does not need a check every minute. A replication queue that can back up in minutes does. To check a slow-moving condition often costs query time on your cluster and tells you nothing extra.

---

## 6. Choosing which nodes a rule watches

By default, a rule runs against every node, which is usually right.

Sometimes an alert makes sense only for certain nodes, perhaps one shard or one replica. Pick those, and CHOps checks only them.

**Each node is checked separately.** If three nodes cross the threshold, you get three notifications, each with the node name and its value. This is deliberate. To know which node has the problem is most of the diagnosis.

### As your cluster changes

Rules keep up sensibly.

Add a node, and any rule that watches all nodes includes it automatically. Remove one, and those rules stop the check on it.

A rule aimed at specific nodes keeps its targets until you edit it. If every node it watched is removed, the rule pauses quietly, rather than an error.

---

## 7. Managing rules

The list shows each rule's name, severity, schedule, the channels it notifies, and a status that reads **FIRING** when its condition is currently met.

**Enable and disable** without a delete. This is what you want before planned maintenance: silence the alert that would otherwise fire while you work, then turn it back on.

To disable beats a delete, because a delete loses the query and the threshold you tuned.

**Edit** to change anything. **Delete** to remove it.

---

## 8. How and when rules run

CHOps checks about once a minute and evaluates every enabled rule that is due.

CHOps evaluates rules in parallel, not one at a time, so many rules do not slow the cycle. When a rule fires, all of its notifications go out together.

If a node or a notification fails, CHOps skips it and carries on. One unreachable node does not hold up your other alerts.

### What that means in practice

A rule scheduled every five minutes runs on the minute boundary nearest its due time, not exactly five minutes after the last run. For alerting, that difference never matters.

A rule with a slow query delays only itself.

---

## Alert Channels

A channel is how a notification reaches you. Manage channels under **Custom Alerts**, then **Channels**, or under **Control Panel**, then **Notification Channels**. They are the same channels.

### What every notification contains

Enough to act without a login first:

| Field | Included |
|---|---|
| Alert name | Yes |
| Severity, color-coded | Yes |
| Description | Yes |
| Current value | Yes |
| Threshold and comparison | Yes |
| The alert's SQL query | Yes |
| Schedule | Yes |
| Cluster hostname or hostnames | Yes |
| Timestamp | Yes |

To include the query matters more than it looks. The person who reads it at three in the morning can see exactly what was measured, and can paste it into the SQL Editor to see the current value, without a hunt for the rule.

### Email

CHOps delivers alerts by email through your SMTP server. The message arrives formatted, with a header colored by severity, the details in a table, and the query in a readable block.

You provide your mail server details and the destination address. CHOps checks that the essential fields are filled in before it tries to send. So a missing setting produces an error at configuration time, not a silent failure at three in the morning.

### Sending to more than one place

A rule can notify several channels. A common arrangement is one channel to a team address for warnings, and another to an on-call address for critical.

---

## 10. The alert marquee

The alert marquee is a scrolling bar just below the navigation bar. It lists everything currently firing, with its severity, value, threshold, and time.

It is on every page, so a firing alert is visible wherever you are, not only on the alerting page. Collapse it when you want it out of the way.

If the marquee is empty, nothing is firing.

---

## 11. Alerts worth having

These are starting points, not rules. Check the thresholds against your own cluster before you use them.

### Replication falling behind

```sql
SELECT max(absolute_delay) FROM system.replicas
```

Greater than 300, which means five minutes. This is one of the most useful alerts on any replicated setup, because replication lag is invisible until someone reads stale data.

### Replication queue stuck

```sql
SELECT count() FROM system.replication_queue WHERE num_tries > 10
```

Greater than 0. Entries that retry many times are not going to resolve themselves.

### Read-only replicas

```sql
SELECT count() FROM system.replicas WHERE is_readonly
```

Greater than 0. A read-only replica usually means lost Keeper connectivity, and it is silent otherwise.

### Disk filling

```sql
SELECT min(free_space / total_space) * 100 FROM system.disks
```

Less than 15. Note the comparison. The problem is a number that gets smaller.

### Too many parts

```sql
SELECT max(cnt) FROM (
    SELECT count() AS cnt FROM system.parts
    WHERE active GROUP BY database, table
)
```

Greater than 300. Rising part counts mean merges do not keep up, and the error that finally stops inserts arrives with no warning.

### Long running queries

```sql
SELECT count() FROM system.processes WHERE elapsed > 300
```

Greater than 0, at a warning severity. This is not always a problem, which is why it suits warning rather than critical.

### Mutations stuck

```sql
SELECT count() FROM system.mutations WHERE NOT is_done AND latest_fail_time > 0
```

Greater than 0. A failing mutation retries without end and blocks the ones behind it.

---

## 12. When something does not work

### The rule never fires, but the condition is clearly met

Check the comparison direction first. A disk space alert with "greater than" instead of "less than" is the most common version of this.

Then run the query in the SQL Editor and look at what it returns. A query that returns multiple rows does not behave as expected.

### The rule fires constantly

The threshold is inside the normal range. Run the query over a week and set the threshold above the peaks, not the average.

If it fires correctly and constantly, that is a cluster problem, not an alerting one.

### It fires but no notification arrives

Check that the rule has a channel attached. A rule with no channel evaluates and notifies nobody.

Then check the channel configuration. For email, that is the SMTP details and the destination address.

### Several notifications for one problem

This is expected when a rule watches several nodes and more than one crosses the threshold. CHOps checks each node separately and reports each one separately, with the node name.

To get one notification, write a query that aggregates across nodes and aim the rule at a single node.

### A rule stopped running after cluster changes

If it was aimed at specific nodes and all of them were removed, it pauses rather than errors. Edit it and pick current nodes, or switch it to all nodes.

### FIRING in the list but nothing in the marquee

The list status and the marquee both reflect the current state, so they should agree. If they disagree, refresh the page. The marquee updates on its own schedule.

---

## Beyond fixed thresholds

The community edition evaluates fixed-threshold rules, which is what this page describes.

CHOps Pro adds anomaly detection that learns normal behavior and flags deviations without a fixed number, alert dependencies that suppress downstream noise when a root cause fires, and scheduled digest emails that summarise what is firing.

See [CHOps Pro](chops-pro.md).

---

## Related pages

- [SQL Editor](sql-editor.md) to develop and test an alert query
- [Cluster Overview](cluster-overview.md) for the health picture alerts watch
- [Logs](logs.md) to investigate what an alert told you about
- [Notification Channels](admin.md) for the administrative view of channels
