# Alerting

SQL-based alert rules with multiple notification channels and parallel multi-node execution.

## Alert Rules

Each rule has: name, description, SQL query (must return single numeric value), threshold, comparison operator (gt/gte/lt/lte/eq/neq), severity (info/warning/critical), cron schedule (validated), and optional target nodes.

### Target Nodes

By default, each alert rule runs against all cluster nodes. You can optionally pick specific nodes for a rule to target. When nodes are selected, only those nodes are queried, and the rest are skipped. This is useful when certain alerts only apply to specific shards or replicas.

- **No nodes selected** (default): the alert runs on all cluster nodes
- **Specific nodes selected**: the alert runs only on those nodes
- Selected nodes are still queried in parallel (not sequentially)
- Stored as a JSON array of hostnames in the `nodes` column (null = all)

**Adding a cluster node**: rules targeting all nodes automatically include the new node on the next scheduler tick. Rules with specific target nodes are not affected unless you edit them. The node selector on the Alert Rules page refreshes when you switch back to the tab or click the refresh button.

**Removing a cluster node**: rules targeting all nodes silently stop querying the removed node. Rules with specific target nodes that included it will skip it (the promise is rejected and ignored). If all of a rule's target nodes are removed, the rule pauses - its last status stays unchanged. The old hostname remains visible in the rule card until you edit the rule.

### Scheduler
- Runs every 60 seconds
- Evaluates all enabled rules
- **3-level parallel execution**:
  1. **Rules** - all due rules are evaluated concurrently via `Promise.allSettled` (not one-by-one)
  2. **Nodes** - each rule queries its target nodes simultaneously (all nodes if none selected, specific nodes if configured)
  3. **Channels** - when a rule fires, all linked notifications are dispatched concurrently
- Each node is evaluated independently. If a node breaches the threshold, a separate notification is sent for that node with its value and hostname
- Failed nodes and channels silently skipped (never block other rules)
- Updates: `isActive`, `lastValue`, `lastStatus`, `lastRunAt`

> The community edition evaluates fixed threshold rules. If you need anomaly detection that learns normal behavior and flags deviations automatically, alert dependencies to suppress downstream noise, or scheduled digest emails that summarize firing alerts, these are available in [CHOps Pro](chops-pro.md).

## Alert Channels

Each supported notification type carries comprehensive details in every message:

| Field | Included |
|-------|----------|
| Alert name | &#10003; |
| Severity (color-coded) | &#10003; |
| Description | &#10003; |
| Current value | &#10003; |
| Threshold + operator | &#10003; |
| Alert SQL query | &#10003; |
| Cron schedule | &#10003; |
| Cluster hostname(s) | &#10003; |
| Timestamp | &#10003; |

### Email (SMTP)
Styled HTML with severity-colored header, table layout, monospace SQL block. Config: smtp_host, smtp_port, smtp_user, smtp_pass, from, to.

### Config Validation
All channels validate required fields before sending - prevents blank URL errors:
- Email: requires smtp_host and to

### Config Handling
Channel config stored as JSON string in SQLite. Flattened to `{ type, ...config_fields }` before passing to notifier - both in test endpoint and scheduler.

## Alert Marquee
Scrolling right-to-left bar below the navbar. Glassy background (backdrop-filter) on both dark and light themes. Shows all active alerts with severity, value, threshold, and time. Collapsible. CSS animation: `marquee-scroll 40s linear infinite`.
