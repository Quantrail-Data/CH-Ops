# Logs

When something goes wrong on your cluster, the logs tell you what happened and when. CHOps gives you four viewers, and each one reads a different ClickHouse&reg; system table.

| Viewer | Table | Records |
|---|---|---|
| [Crash Log](#crash-log) | `system.crash_log` | Server processes that crashed |
| [Error Log](#error-log) | `system.error_log` | Errors the server counted, by type |
| [Text Log](#text-log) | `system.text_log` | The server's own running commentary |
| [Session Log](#session-log) | `system.session_log` | Logins, logouts, and failed sign-ins |

All four share the same two-tab layout, **Overview** and **Search**, so when you learn one, you know the rest. Open them from the **Logs** section of the sidebar.

---

## Contents

1. [Which log to open](#1-which-log-to-open)
2. [The Overview tab](#2-the-overview-tab)
3. [The Search tab](#3-the-search-tab)
4. [Crash Log](#crash-log)
5. [Error Log](#error-log)
6. [Text Log](#text-log)
7. [Session Log](#session-log)
8. [When a log is empty](#8-when-a-log-is-empty)
9. [Worked investigations](#9-worked-investigations)

---

## 1. Which log to open

Start from the symptom, not the log.

| Symptom | Start here |
|---|---|
| A server restarted and nobody restarted it | [Crash Log](#crash-log) |
| Queries are failing and you want to know how often | [Error Log](#error-log) |
| Something is slow or behaves oddly, with no visible error | [Text Log](#text-log) |
| Someone cannot connect, or you are auditing access | [Session Log](#session-log) |
| A specific query failed | Not here. Use [Queries](queries.md), which reads `system.query_log` |

The difference between the Error Log and the Text Log catches people out. The Error Log counts errors by type and is good for "how often and what kind". The Text Log is everything the server said, and is where you look when there is no error to count.

---

## 2. The Overview tab

The Overview tab answers "when did this happen" and "how much" before you read a single entry.

### The time range

Choose a range with the **Quick** buttons: **1h**, **6h**, **24h**, **48h**, **7d** or **30d**. The Crash Log also has **All**, which reads every crash on the server. Then select **Load**, because nothing loads until you do.

| Log | Default range |
|---|---|
| Crash Log | 30d |
| Error Log | 7d |
| Text Log | 24h |
| Session Log | 7d |

The Overview has no other filters. To filter by error type, level or user, use the [Search tab](#3-the-search-tab).

### The panels

Each Overview starts with summary cards, such as the total count and the time of the last event. Below the cards, it shows charts and a table:

| Log | Panels |
|---|---|
| Crash Log | **Total Crashes**, **Distinct Signals**, **Crashed Versions**, **Last Crash**. Charts of crashes by signal and by version. The **Crash Incidents** table |
| Error Log | **Total Errors**, **Error Types**, **Remote Share**, **Last Error**. **Local vs Remote**, **Top Error Types**, **Error Rate Over Time**. The **Top Errors** table |
| Text Log | **Total Lines**, **Errors**, **Warnings**, **Loggers**, **Last Error**. **Log Volume by Level**, **Level Distribution**, **Noisiest Loggers (errors + warnings)**. The **Most Frequent Messages** table |
| Session Log | See [The Overview is different here](#the-overview-is-different-here) |

**What to look for over time.** A steady level means something runs continuously. A single spike means a burst worth investigating. A regular pattern at the same hour each day usually means a scheduled job.

If CHOps cannot fill one panel, that panel shows the error and the other panels still load. This happens on older servers, or when a column does not exist. Charts follow your light or dark theme.

---

## 3. The Search tab

This is where you read individual entries.

**The From and To dates are always required.** These tables grow large, and an unbounded scan on a busy cluster is slow enough to matter. A narrow window is the single biggest thing you can do for speed.

By default, **From** is 7 days ago and **To** is now. On the Text Log, **From** is 24 hours ago. **From** must be earlier than **To**. If it is not, CHOps shows a warning and resets the date.

**The row limit starts at 500**, and you can raise it once you are sure your filters are narrow. A large limit with loose filters returns a lot of rows you will not read.

Beyond the time range, each log offers filters suited to what it records. Each section below covers them. Select **Search** to run the query, and the filters collapse. To show them again, select **Expand Filters**.

### Extra columns and custom filters

Every Search tab also has two advanced controls:

- **Additional Result Columns** adds more columns of the system table to the result.
- **Custom SQL Filters** adds your own conditions to the `WHERE` clause, for example `thread_id = 12345`. Join them with **AND** or **OR**. You can add up to 10 filters.

CHOps keeps these choices in your browser for each log.

### Working efficiently

Start wide in the Overview to find *when*, then switch to Search with a narrow window around that moment. Searching a whole week for a five-minute incident is slow, and it buries the thing you want.

---

## Crash Log

**Table:** `system.crash_log`

This is the most serious viewer. It records each time a ClickHouse&reg; process crashed, meaning it stopped instead of returning an error.

### When to open it

A server restarted and nobody restarted it. Queries failed with a connection error, not a SQL error. A node dropped out of the cluster and came back.

An empty Crash Log is good news and the normal state on a healthy cluster. ClickHouse&reg; creates `system.crash_log` only when a fatal error occurs. If the table does not exist, the Overview says so, and that simply means the server has recorded no crashes.

### What you can search

| Filter | Use |
|---|---|
| Query (text) | The statement that ran when it crashed |
| Signal Description | The operating system signal, such as a segmentation fault |
| Exception Trace | The exception trace recorded at the time |

Together those answer what failed and why. The query is often the most useful, because a crash that reproduces on one statement is far easier to act on than one that appears random.

### Reading a crash entry

The signal tells you the category. A segmentation fault suggests a bug or memory corruption. An out-of-memory kill suggests the server was asked for more than the machine had, which is a configuration problem, not a defect.

The trace names the code path. You do not need to read it in full, but the top few frames often name the feature involved. That is enough to search ClickHouse&reg; issues, or to tell your support contact where to look.

---

## Error Log

**Table:** `system.error_log`

Errors the server counted, grouped by type. This is a count of error kinds over time, not a record of every failed statement.

### When to open it

Queries are failing and you want to know how often and what kind. Or you want to know whether a class of error is new or has been happening all along.

### What you can search

| Filter | Use |
|---|---|
| Error Type (multi-select) | Chosen from the error kinds that have occurred here |
| Error Message (text) | Search within the last error message of each type |

CHOps builds the error type list from your data, not from every error ClickHouse&reg; can produce, so it is short and relevant.

The result shows the time, the error type, the last error message and the query id of that message.

### Reading it

The Overview breakdown by type is usually more useful than individual entries. **Remote Share** is the part of the errors that came from other servers in a distributed query. One error type that accounts for most of the volume tells you where to look. A flat spread of many types usually means something upstream, such as a client that retries.

Compare against the same period last week before you treat a count as a problem. Some errors are normal background noise on any busy cluster.

---

## Text Log

**Table:** `system.text_log`

The server's own running commentary. Everything ClickHouse&reg; decided was worth saying, at every level of detail.

### When to open it

Something behaves oddly and there is no error to point at. A merge is not happening. A replica is not catching up. A setting does not seem to apply.

This is also the log to reach for when the Error Log shows nothing, because not everything the server complains about is counted as an error.

### Log levels

There are nine levels, from most to least severe:

| Level | Meaning |
|---|---|
| Fatal | The server cannot continue |
| Critical | Something is seriously wrong |
| Error | An operation failed |
| Warning | Something unexpected, but handled |
| Notice | Worth mentioning |
| Information | Normal operational messages |
| Debug | Detail for diagnosis |
| Trace | Very verbose, usually per operation |
| Test | Test-only messages, rarely seen |

CHOps color-codes entries by level, so serious ones stand out before you read them.

**Start at Warning and above.** It is the level that catches real problems without burying you. Drop to Debug or Trace only once you know roughly what you are looking for, because Trace on a busy server produces an enormous amount.

### What you can search

| Filter | Use |
|---|---|
| Log Levels | The levels to show. At least one is required. By default, Fatal, Critical, Error and Warning are selected. **All** and **None** change all levels at once |
| Message (text) | Search within the message text |

Searching for a table name is often the quickest route. The server names the table in most messages about it, so `my_table` finds merges, mutations, and errors about it in one pass.

---

## Session Log

**Table:** `system.session_log`

Every login, logout, and failed sign-in the server saw. This is an access audit, not a diagnostic log.

### When to open it

Someone cannot connect and you want to know whether the server saw the attempt. You are auditing who has been connecting. You suspect repeated failed sign-ins against an account.

### The Overview is different here

It summarises access, not errors:

- Cards for **Total Events**, **Successful Logins**, **Failed Logins**, **Logouts**, **Distinct Users** and **Last Event**.
- **Login Outcomes**: the split of successful logins, failed logins, and logouts.
- **Top Users**: the busiest users.
- **By Interface** and **By Auth Type**: a breakdown by connection interface and by authentication type.
- **Login Activity Over Time**.
- **Top Failure Reasons**: the most common failure reasons, each with the most recent user and client address.

That last table is the one to read first when you investigate a failure. It tells you the reason, who, and from where, with no search.

The Session Log reads the server that CHOps is connected to. It does not read the other replicas.

### What you can search

| Filter | Use |
|---|---|
| Event Type (multi-select) | `LoginSuccess`, `LoginFailure`, or `Logout` |
| User (text) | A specific account |
| Failure Reason (text) | Search within the reason text |

### Reading a failed login

The reason tells a wrong password from an account that does not exist from a connection refused by an IP restriction. Those need different fixes, and the client address tells you where the attempt came from.

Repeated failures from one address against one account are worth attention. Repeated failures from one address against many accounts are worth more.

---

## 8. When a log is empty

An empty log is not always a healthy one. There are three possibilities, in order of likelihood.

### Nothing happened

This is the normal case for the Crash Log, and a good outcome.

### The system table is not enabled

`system.text_log` and `system.session_log` are both off by default in ClickHouse&reg;. When `system.session_log` does not exist, the Session Log says so. When `system.text_log` does not exist, each Text Log panel shows the error from the server. That way you can tell "nothing happened" from "nothing is being recorded".

Enabling them is a server configuration change, not something CHOps can do. Your ClickHouse&reg; administrator adds the relevant `<text_log>` or `<session_log>` section to the server config and restarts.

Do this before you need them. If you enable `text_log` during an incident, it records from that moment only and tells you nothing about what already happened.

### The entries have aged out

System log tables have a retention policy, often a few days or weeks. A search for something from last month can look past the end of the data.

### On ClickHouse Cloud

Some of these tables behave differently or are unavailable on managed services. CHOps detects what your deployment supports and explains what is missing, rather than showing a blank screen.

---

## 9. Worked investigations

### A node restarted overnight

1. **Crash Log**, Overview, **48h**, **Load**. Look in **Crash Incidents** for an entry at that time.
2. If there is one, switch to Search with a window around it and read the signal and trace.
3. If the Crash Log is empty, the process did not crash. Something restarted it: an orchestrator, a package upgrade, or a person. Check the **Text Log** at Information level around that time for shutdown messages.

### Queries started failing this morning

1. **Error Log**, Overview, **24h**, **Load**. **Top Error Types** names the error.
2. If one type dominates, search it in the same window and read a few messages.
3. If the Error Log is quiet, the failures are not reaching the server. Look at the **Session Log** for connection refusals instead.

### A user says they cannot log in

1. **Session Log**, Overview. **Top Failure Reasons** names the reason, the user, and the address.
2. If their attempt does not appear at all, the server never saw it, so the problem is between them and the server: address, port, firewall, or TLS.
3. If it appears as `LoginFailure` with an IP restriction reason, the account exists and refuses that address, which is a different fix from a wrong password.

### A table is not merging

1. **Text Log**, Search, Warning and above, with the table name in **Message (text)**.
2. If there is nothing there, drop to Debug for a narrow window. Merges are chatty at that level.
3. Cross-check with [Merges & Mutations](merges-mutations.md), which reads the merge tables directly and is a better first stop for this question.

---

## Related pages

- [Queries](queries.md) for individual statement history from `system.query_log`
- [Merges & Mutations](merges-mutations.md) for background operations
- [Cluster Overview](cluster-overview.md) for the health picture these logs explain
- [Alert Rules](alerting.md#alert-rules) to be told about these events rather than look for them
