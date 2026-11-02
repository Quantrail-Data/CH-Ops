# Alerting

Alerting watches your cluster so you do not have to. You write a query that returns one number, set the value that counts as a problem, and choose how you want to hear about it. CHOps runs the query on a schedule and notifies you when the condition is met.

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

Every minute, CHOps looks for rules that are due and runs their queries on each node. It compares each node's result with the threshold and sends a notification when the list of nodes where the comparison is true changes.

That is the whole model. The simplicity is the point. Anything you can express as "this number should stay below that" becomes an alert, with no new concepts.

---

## Alert Rules

Find them under **Custom Alerts**, then **Alert Rules**. Only admins and super admins can see and change the rules on this page. Other roles see the message "Alert rules management is only available for administrators."

To create a rule, click **New Rule**. To start from a ready-made rule, click **New from template** (see [Alert templates](#alert-templates)). The form has these fields:

| Field | What it does |
|---|---|
| Name | The name of the rule. It is also the start of each notification title. |
| Severity | info, warning, or critical. The default is warning. |
| Schedule (cron) | When the rule runs. The default is `*/5 * * * *`. |
| Operator | The comparison. The default is greater than. |
| Threshold | The value to compare with. |
| Notify Interval | Minutes between "still firing" reminders. 0 sends no reminders. |
| Breach Run Required | How many runs in a row must breach before a node fires. The default is 1. |
| Enabled | Turns the rule on or off. |
| noRowsMeansBreach | When on, a query that returns no rows counts as a breach. When off, no rows does not fire. |
| SQL (single value) | The query. |
| Description | Text that goes into the notification. |
| Channels | The channels that get the notifications. Click a channel to select it. |
| Cluster | The cluster the rule runs on. |
| Target Nodes | The nodes the rule runs on. Empty means all nodes. |

Click **Test** to run the query one time on each target node. The table shows the value of each node and "Would fire", "OK. Would not fire.", "No rows. Would not fire.", or the error. Test saves nothing and notifies nobody.

Click **Create** (or **Update** when you edit) to save the rule.

---

## 2. Writing the query

**The query must return one number.** CHOps reads the first column of the first row and ignores all other columns and rows.

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

### No rows and values that are not numbers

- If the query returns no rows, the node does not fire. Turn on **noRowsMeansBreach** to make no rows a breach.
- If the first column is empty or is not a number, the run is a query error for that node. See [Query errors](#query-errors).

### The description is the message

The person who gets the notification at three in the morning may not have written the rule. The description appears in the notification, so write it for them: what this means, and what to do about it. "Replication queue backing up, check Keeper connectivity" is more use than "queue check".

### There is no row limit

CHOps does not add a row limit to alert queries, though the **Maximum result size** setting on the App Config page still applies. Alert queries run read-only, and a run stops after 120 seconds. Use **Test** to check a query before you save it.

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

CHOps supports only part of the cron syntax:

- Use five fields: minute, hour, day of month, month, day of week.
- In each field, use `*`, `*/n`, or a comma list of numbers, for example `0,30`.
- CHOps does not support ranges such as `1-5`.
- Day of week is 0 to 6, where 0 is Sunday. CHOps does not accept 7.
- If you type four fields, the form adds `0` as the minute.

Schedules use the server's time zone. CHOps checks the expression before it saves the rule, and if the expression is not valid, it shows an error and does not save the rule.

### Choosing a frequency

Match it to how fast the problem develops and how fast you could react.

A disk that fills over days does not need a check every minute. A replication queue that can back up in minutes does. Checking a slow-moving condition often costs query time on your cluster and tells you nothing extra.

---

## 6. Choosing which nodes a rule watches

First select the **Cluster**, because a rule runs on the nodes of one cluster.

- Select a cluster to run the rule on the nodes of that cluster.
- **All clusters (default)** runs the rule on the nodes of the first cluster in the cluster list. It does not run the rule on the other clusters.

Then select the **Target Nodes**. Leave the list empty to run the rule on all nodes of the cluster, which is usually right. Sometimes an alert makes sense only for certain nodes, for example one shard or one replica. Select those nodes, and CHOps checks only them.

CHOps identifies target nodes by node name. Node names are unique in a cluster, so two nodes with the same host address stay separate.

**Each node has its own state.** CHOps compares each node's value with the threshold, and the rule then sends one message for all of its nodes, listing the firing nodes and each node's value. See [How and when rules run](#8-how-and-when-rules-run).

### As your cluster changes

Add a node, and each rule that watches all nodes includes it at the next run. Remove a node, and those rules stop checking it.

A rule with specific target nodes keeps them until you edit it. If no target node exists any more, the rule cannot run, and CHOps sends `<rule> - evaluation failed` with the error "No target nodes resolved for this rule".

If a rule's cluster has no nodes, the rule does not run and sends nothing, and the rule card shows the **NO NODES** badge.

---

## 7. Managing rules

Each rule card shows the name, severity, query, comparison, schedule, cluster, and target nodes. It also shows these badges:

| Badge | Meaning |
|---|---|
| Enabled or Disabled | Whether the rule runs |
| FIRING | One or more nodes fire now |
| NO NODES | The cluster of the rule has no nodes |
| NO CHANNELS | The rule has no channel, so it notifies nobody |
| template | The rule comes from a template |

The line under the badges shows the last status, the last value, and the time of the last run. If a node had a query error, the line also shows the error.

The buttons on each card are:

- **Edit** (pencil icon) to change the rule.
- **Disable** or **Enable** to turn the rule off or on. Use this before planned maintenance, then turn the rule on again.
- **Delete** (trash icon) to remove the rule.
- **History** (clock icon) to see the status changes of the rule. It shows the last 200 changes. CHOps deletes history entries after 90 days.

When you turn off a rule that fires, CHOps first sends `<rule> - resolved`. If nodes of that rule also have query errors, CHOps also sends `<rule> - recovered`. So no PagerDuty incident stays open for a rule that is off.

Disabling is better than deleting. A delete removes the query and the threshold you tuned, along with the rule's history and node states.

### Alert templates

CHOps has 31 ready-made rules in four groups: Resources, Storage and replication, Queries and inserts, and Keeper and cluster. They read the ClickHouse&reg; system tables.

- When you add a cluster, CHOps adds each template as a rule for that cluster and leaves these rules off.
- The list hides template rules that are off. Turn on **Show the template rules that are off** to see them.
- Click **New from template** to make a new rule from a template. Search by name, group, or description, then select a template. The form opens with the template's values.
- In a template rule's form, click **Reset to template** to put back the template's values.
- When you delete a cluster, CHOps deletes its template rules that nobody changed. A template rule that you changed stays.

The rule description includes tuning advice. Check the threshold against your own cluster before you turn a template rule on.

---

## 8. How and when rules run

CHOps checks once a minute and runs every enabled rule that is due. Because it runs the due rules at the same time, many rules do not slow the cycle, and each rule runs on all its target nodes at the same time.

### Node states and messages

CHOps keeps a state for each node of a rule. A node fires when its value breaches the threshold for the number of runs in **Breach Run Required**.

A rule sends one message for all its nodes. The message title tells you what changed:

| Title | When CHOps sends it |
|---|---|
| `<rule>` | The first node starts to fire. No node fired before. |
| `<rule> - nodes changed` | The list of firing nodes changes. The message lists the firing nodes, then `(new: ...; stopped: ...)`. |
| `<rule> - still firing` | Nodes still fire and the **Notify Interval** has passed since the last message. |
| `<rule> - resolved` | No node fires any more. |

The node field of the message lists each firing node and its value, for example `node-1 = 95.5, node-2 = 97`.

### Query errors

A query error on a node does not change that node's breach state. Because CHOps does not know the value, it keeps the last state. Errors have their own messages:

| Title | When CHOps sends it |
|---|---|
| `<rule> - evaluation failed` | The query fails on a node where it did not fail before. The message shows the error of each node. Severity is critical. |
| `<rule> - recovered` | The query runs again without errors on all nodes. |

An error on one node does not stop the breach messages of the other nodes. If a notification to one channel fails, CHOps still sends to the other channels.

### What that means in practice

A rule scheduled every five minutes runs on the minute boundary nearest its due time, not exactly five minutes after the last run. For alerting, that difference never matters.

A rule with a slow query delays only itself.

### PagerDuty incidents

For PagerDuty, a breach opens an incident and `<rule> - resolved` closes it. A query error opens a separate incident, and `<rule> - recovered` closes it. The two incidents close separately.

---

## Alert Channels

A channel is how a notification reaches you. Manage channels under **Control panel**, then **Notification Channels**. Only admins and super admins can manage channels.

There are five channel types:

| Type | Fields |
|---|---|
| Email (SMTP) | SMTP Host, SMTP Port, SMTP User, SMTP Password, From, To (comma-sep) |
| Slack | Bot Token, Channel ID |
| Google Chat | Webhook URL |
| Microsoft Teams | Webhook URL |
| PagerDuty | Integration Key |

A webhook URL must use HTTPS and cannot point to localhost or to a private network.

### Testing a channel

Click **Test** on the channel card to send a test message. If the message fails, CHOps shows "Test failed:" and the error. The card shows the result of the last test.

### When a service refuses a message

If a service refuses a notification, for example when a webhook answers with an HTTP error or Slack answers with an error, CHOps records an error for the channel. The channel card then shows **Last notification failed:** and the error.

### What every notification contains

| Field | Email | Slack, Google Chat, Microsoft Teams | PagerDuty |
|---|---|---|---|
| Title with severity and rule name | Yes | Yes | Yes |
| Description | Yes | Yes | Yes |
| Value (breach messages) | Yes | Yes | Yes |
| Error (evaluation failed messages) | Yes | Yes | Yes |
| Threshold and comparison | Yes | No | No |
| Schedule | Yes | No | No |
| Cluster | Yes | Yes | Yes |
| Node or nodes | Yes | Yes | Yes |
| Time | Yes | Yes | Yes |
| The SQL query of the rule | Yes | No | No |

The query in the email matters more than it looks. The person who reads it at three in the morning can see what the rule measured and paste it into the SQL Editor to see the current value.

### Email

CHOps sends alert email through the SMTP server of the channel. The message has a header colored by severity, the details in a table, and the query in a block.

This SMTP server is not the System Email of CHOps, which sends account email only. See [System Email](admin.md#system-email).

### Sending to more than one place

A rule can notify several channels. A common arrangement is one channel to a team address for warnings, and another to an on-call address for critical.

---

## 10. The alert marquee

The alert marquee is a scrolling bar just below the navigation bar. It lists each enabled rule that fires now, with its severity, value, threshold, cluster, nodes, and time, and updates every 30 seconds.

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

Less than 15. Note the comparison: the problem is a number that gets smaller.

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

Then click **Test** in the rule form and look at each node's value. Remember that CHOps uses only the first column of the first row.

Check **Breach Run Required**. If it is 3, a node must breach on three runs in a row before it fires.

### The rule fires constantly

The threshold is inside the normal range. Run the query over a week and set the threshold above the peaks, not the average.

If it fires correctly and constantly, that is a cluster problem, not an alerting one.

### It fires but no notification arrives

Check that the rule has a channel. A rule with no channel shows **NO CHANNELS** and notifies nobody.

Then check the channel card. If it shows **Last notification failed:**, the error tells you why. Click **Test** on the channel to try again.

A rule sends a message only when the list of firing nodes changes. If the same nodes still fire, set **Notify Interval** to get reminders.

### Several notifications for one problem

A rule sends one message for all its nodes, and you get a new one each time the list of firing nodes changes. A node that fires, stops, and fires again gives a new message each time.

Query errors have their own messages, so one run can send a breach message and an "evaluation failed" message.

### A rule stopped running after cluster changes

If none of its target nodes exists any more, the rule sends `<rule> - evaluation failed`. Edit it and select current nodes, or clear the target nodes to use all nodes.

If its cluster has no nodes, the rule does not run and the card shows **NO NODES**. Select another cluster.

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
- [Administration](admin.md) for the roles that can manage rules and channels
