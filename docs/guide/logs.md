# Logs

When something goes wrong on your cluster, the logs are where you find out what and when. CHOps gives you four log viewers, each focused on a different kind of event: the Crash Log for serious failures, the Error Log for errors ClickHouse® recorded, the Text Log for the detailed running commentary the server produces, and the Session Log for who signed in and out, and when sign-ins failed.

Each viewer works the same way, with two tabs. The Overview tab gives you a bird's-eye view of when events happened, and the Search tab lets you dig into the individual entries.

## The Overview Tab

The Overview tab shows a calendar heatmap of how often events occurred, broken down by date and hour. This makes it easy to spot when trouble started or whether a problem is ongoing. Pick a time range using the quick buttons (1 hour, 6 hours, 24 hours, 48 hours, 7 days, or 30 days) and click Load Heatmap.

Busier periods show up in deeper, warmer colors, and the shading adapts to your data so that patterns stay visible whether events are rare or frequent. You can download the heatmap or view it fullscreen using the buttons above it, and it adjusts automatically when you switch between light and dark mode. For the Error Log and Text Log, the Overview tab also lets you filter by error type or log level so you can focus on what matters.

The Overview tab is more than the heatmap alone. Depending on the log, it also shows a breakdown of entries by category (log level for the Text Log, error type for the Error Log), a volume-over-time chart so you can see whether activity is climbing or settling, and a short list of the most frequent messages or top errors so the repeat offenders are obvious without scrolling through every entry. Each of these panels shows a friendly note instead of an empty box when the data behind it is not available, which can happen on older servers or when a system table is not enabled.

The **Session Log** Overview is built for access auditing rather than a heatmap. It summarises the split of successful logins, failed logins, and logouts, the busiest users, a breakdown by connection interface and by authentication type, login activity over time, and a table of the most common failure reasons with the most recent user and client address for each. Because the `system.session_log` table only exists when session logging is enabled in the server config, the page shows a clear note instead of charts when it is switched off.

## The Search Tab

Every log viewer has a Search tab for finding specific entries. Because these tables can be large, you always set a start time and an end time to keep your search fast and focused. There is also a row limit you can adjust (it starts at 500) to control how many results come back at once.

Beyond the time range, each log offers filters suited to what it records.

The **Crash Log** captures the most serious events, the ones where a ClickHouse® process crashed. You can search it by the query involved, by a description of the crash signal, and by the text of the exception trace, which together help you pin down what failed and why.

The **Error Log** records errors the server encountered. You can filter by error type, choosing from the specific error kinds that have actually occurred on your system, and search within the error messages themselves.

The **Text Log** is the server's detailed internal log, the running account of what ClickHouse® is doing. Because it is so detailed, you can filter by log level, from the most severe (Fatal and Critical) down through Warning and Information to the most verbose (Debug and Trace), and search within the message text. In the Text Log, entries are color-coded by their level so the serious ones stand out at a glance.

The **Session Log** records every login, logout, and failed sign-in the server saw. You can filter by event type (successful login, failed login, or logout), by user, and by the text of the failure reason, which together make it easy to audit who is connecting and to spot repeated failed sign-ins from the same account.
