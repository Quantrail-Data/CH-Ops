# Alerting

Alerting lets CHOps keep an eye on your cluster for you and tell you when something needs attention, so you do not have to watch the dashboards around the clock. You write an alert as a SQL query, set the threshold that counts as a problem, and choose how you want to be notified. CHOps then checks it on a schedule and sends a notification whenever the condition is met.

## Alert Rules

An alert rule is the heart of the system. Each rule pairs a question with a threshold: the SQL query returns a single number, and CHOps compares that number against the limit you set to decide whether to alert.

When you create a rule, you give it a name and description, write the query that produces the number to watch, and set the threshold along with how to compare against it, such as greater than or less than. You choose a severity (info, warning, or critical) so you can tell routine notices from urgent ones, and you set a schedule that controls how often the rule runs. Optionally, you can point the rule at specific nodes.

Your existing rules sit in a list, each showing its name, severity, schedule, and the channels it notifies, along with a status that reads FIRING when its condition is currently met. From the list you can enable or disable a rule without deleting it, which is handy when you want to silence an alert during planned maintenance, and you can edit a rule or remove it entirely.

### Choosing Which Nodes a Rule Watches

By default, a rule runs against every node in your cluster, which is usually what you want. Sometimes, though, an alert only makes sense for certain nodes, perhaps a particular shard or replica. In that case you can pick the specific nodes a rule should watch, and CHOps checks only those and leaves the rest alone. Each node is checked on its own, so if more than one node crosses the threshold, you get a separate notification for each, naming the node and its value.

Your cluster can change over time, and rules keep up sensibly. When you add a node, any rule that watches all nodes starts including it automatically. When you remove a node, those rules simply stop checking it. A rule aimed at specific nodes keeps its targets until you edit it, and if every node it was watching is removed, the rule quietly pauses rather than erroring out.

### How and When Rules Run

CHOps checks your rules about once a minute, evaluating every enabled rule that is due. It does this work in parallel rather than one rule at a time, so having many rules does not slow things down, and when a rule fires, all of its notifications go out together. If a particular node or notification fails for some reason, CHOps skips it quietly and carries on with everything else, so one hiccup never holds up your other alerts.

> The community edition evaluates fixed threshold rules. If you need anomaly detection that learns normal behavior and flags deviations automatically, alert dependencies to suppress downstream noise, or scheduled digest emails that summarize firing alerts, these are available in [CHOps Pro](chops-pro.md).

## Alert Channels

A channel is how a notification reaches you. Whatever channel you use, CHOps packs each message with the full context, so you can understand the situation without having to log in and investigate first. Every notification includes:

| Field | Included |
|-------|----------|
| Alert name | Yes |
| Severity (color-coded) | Yes |
| Description | Yes |
| Current value | Yes |
| Threshold and comparison | Yes |
| The alert's SQL query | Yes |
| Schedule | Yes |
| Cluster hostname(s) | Yes |
| Timestamp | Yes |

### Email

CHOps delivers alerts as email through your SMTP server. The message arrives as a nicely formatted email with a header colored by severity, the details laid out in a table, and the alert's query shown in a readable block. To use email alerts, you provide your mail server details and the address to send to, and CHOps checks that the essential fields are filled in before it tries to send, so you do not get silent failures from a missing setting.

## The Alert Marquee

So that active alerts are always visible, CHOps shows a scrolling bar just below the navigation bar that lists everything currently firing, each with its severity, value, threshold, and time. It is there at a glance on every page, and you can collapse it when you want it out of the way.
