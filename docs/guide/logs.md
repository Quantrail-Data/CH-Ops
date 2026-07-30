# Logs

When something goes wrong on your cluster, the logs tell you what happened and
when. CHOps gives you four viewers, each reading a different ClickHouse® system
table.

| Viewer | Table | Records |
|---|---|---|
| [Crash Log](#crash-log) | `system.crash_log` | Server processes that crashed |
| [Error Log](#error-log) | `system.error_log` | Errors the server counted, by type |
| [Text Log](#text-log) | `system.text_log` | The server's own running commentary |
| [Session Log](#session-log) | `system.session_log` | Logins, logouts and failed sign-ins |

All four share the same two-tab layout, so learning one teaches you the rest.

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

Start from the symptom rather than the log.

| Symptom | Start here |
|---|---|
| A server restarted and nobody restarted it | [Crash Log](#crash-log) |
| Queries are failing and you want to know how often | [Error Log](#error-log) |
| Something is slow or behaving oddly, no visible error | [Text Log](#text-log) |
| Someone cannot connect, or you are auditing access | [Session Log](#session-log) |
| A specific query failed | Not here. Use [Queries](queries.md), which reads `system.query_log` |

The distinction between Error Log and Text Log catches people out. The Error Log
counts errors by type and is good for "how often and what kind". The Text Log is
everything the server said, and is where you look when there is no error to
count.

---

## 2. The Overview tab

The Overview tab answers "when did this happen" before you read a single entry.

### The heatmap

A grid of dates against hours, shaded by how many events fell in each cell.

Pick a range with the quick buttons, **1 hour**, **6 hours**, **24 hours**,
**48 hours**, **7 days** or **30 days**, then choose **Load Heatmap**.

Deeper colours mean more events. The shading adapts to your data, so a pattern
stays visible whether you had four events or forty thousand. That also means
colour is relative: a dark cell in a quiet week may be fewer events than a pale
cell in a busy one. Read the numbers when the difference matters.

The heatmap can be downloaded or opened fullscreen, and it follows your light or
dark theme.

**What to look for.** A solid band means something ran continuously. A single
dark cell means a burst worth investigating. A regular pattern at the same hour
each day usually means a scheduled job.

### The panels below

Depending on the log, the Overview also shows:

- A breakdown by category, log level for the Text Log, error type for the Error
  Log
- Volume over time, so you can see whether activity is climbing or settling
- The most frequent messages or top errors, so repeat offenders are obvious
  without scrolling

Where a panel cannot be filled, it says so rather than showing an empty box.
That happens on older servers, or when a system table is not enabled.

The Error Log and Text Log Overviews also let you filter by error type or log
level, so you can heatmap one kind of event on its own.

---

## 3. The Search tab

Where you read individual entries.

**A start time and an end time are always required.** These tables grow large,
and an unbounded scan on a busy cluster is slow enough to matter. Narrowing the
window is the single biggest thing you can do for speed.

**The row limit starts at 500** and can be raised. Raise it when you are certain
your filters are narrow; a large limit with loose filters returns a lot of rows
you will not read.

Beyond the time range, each log offers filters suited to what it records. Those
are covered in each section below.

### Working efficiently

Start wide in the Overview to find *when*, then switch to Search with a narrow
window around that moment. Searching a whole week to find a five minute incident
is slow and buries the thing you want.

---

## Crash Log

**Table:** `system.crash_log`

The most serious viewer. It records occasions when a ClickHouse® process
crashed, meaning it stopped rather than returned an error.

### When to open it

A server restarted without anyone restarting it. Queries failed with a
connection error rather than a SQL error. A node dropped out of the cluster and
came back.

An empty Crash Log is good news and the normal state on a healthy cluster.

### What you can search

| Filter | Use |
|---|---|
| Query | The statement that was running when it crashed |
| Signal description | The operating system signal, such as a segmentation fault |
| Trace text | The exception trace recorded at the time |

Together those answer what failed and why. The query is often the most useful:
a crash that reproduces on one statement is far easier to act on than one that
appears random.

### Reading a crash entry

The signal tells you the category. A segmentation fault suggests a bug or memory
corruption. An out of memory kill suggests the server was asked for more than
the machine had, which is a configuration problem rather than a defect.

The trace names the code path. You do not need to read it in full, but the top
few frames often name the feature involved, and that is enough to search
ClickHouse® issues or to tell your support contact where to look.

---

## Error Log

**Table:** `system.error_log`

Errors the server counted, grouped by type. This is a count of error kinds over
time, not a record of every failed statement.

### When to open it

Queries are failing and you want to know how often and what kind, or you want to
know whether a class of error is new or has been happening all along.

### What you can search

| Filter | Use |
|---|---|
| Error type | Chosen from the error kinds that have actually occurred here |
| Message text | Search within the messages themselves |

The error type list is built from your data rather than from every error
ClickHouse® can produce, so it is short and relevant.

### Reading it

The Overview breakdown by type is usually more useful than individual entries.
One error type accounting for most of the volume tells you where to look; a flat
spread of many types usually means something upstream, such as a client
retrying.

Compare against the same period last week before treating a count as a problem.
Some errors are normal background noise on any busy cluster.

---

## Text Log

**Table:** `system.text_log`

The server's own running commentary. Everything ClickHouse® decided was worth
saying, at every level of detail.

### When to open it

Something is behaving oddly and there is no error to point at. A merge is not
happening, a replica is not catching up, a setting does not seem to apply.

This is also the log to reach for when the Error Log shows nothing, because not
everything the server complains about is counted as an error.

### Log levels

Eight levels, from most to least severe:

| Level | Meaning |
|---|---|
| Fatal | The server cannot continue |
| Critical | Something is seriously wrong |
| Error | An operation failed |
| Warning | Something unexpected, but handled |
| Notice | Worth mentioning |
| Information | Normal operational messages |
| Debug | Detail for diagnosing |
| Trace | Very verbose, usually per operation |

Entries are colour-coded by level, so serious ones stand out without reading.

**Start at Warning and above.** It is the level that catches real problems
without burying you. Drop to Debug or Trace only once you know roughly what you
are looking for, because Trace on a busy server produces an enormous amount.

### What you can search

Filter by level, and search within the message text.

Searching for a table name is often the quickest route: the server names the
table in most messages about it, so `my_table` finds merges, mutations and
errors concerning it in one pass.

---

## Session Log

**Table:** `system.session_log`

Every login, logout and failed sign-in the server saw. This is an access audit
rather than a diagnostic log.

### When to open it

Somebody cannot connect and you want to know whether the server saw the attempt.
You are auditing who has been connecting. You suspect repeated failed sign-ins
against an account.

### The Overview is different here

There is no heatmap. Instead it summarises:

- The split of successful logins, failed logins and logouts
- The busiest users
- A breakdown by connection interface and by authentication type
- Login activity over time
- The most common failure reasons, each with the most recent user and client
  address

That last table is the one to read first when investigating a failure. It tells
you the reason, who, and from where, without any searching.

### What you can search

| Filter | Use |
|---|---|
| Event type | `LoginSuccess`, `LoginFailure` or `Logout` |
| User | A specific account |
| Failure reason | Search within the reason text |

### Reading a failed login

The reason distinguishes a wrong password from an account that does not exist
from a connection refused by an IP restriction. Those need different fixes, and
the client address tells you where the attempt came from.

Repeated failures from one address against one account are worth attention.
Repeated failures from one address against many accounts are worth more.

---

## 8. When a log is empty

An empty log is not always a healthy one. Three possibilities, in order of
likelihood.

### Nothing happened

The normal case for the Crash Log, and a good outcome.

### The system table is not enabled

`system.text_log` and `system.session_log` are both switched off by default in
ClickHouse®. Where a table does not exist, CHOps says so rather than showing an
empty chart, so you can tell "nothing happened" from "nothing is being
recorded".

Enabling them is a server configuration change, not something CHOps can do. Your
ClickHouse® administrator adds the relevant `<text_log>` or `<session_log>`
section to the server config and restarts.

Worth doing before you need them. Enabling `text_log` during an incident means
it starts recording from that moment and tells you nothing about what already
happened.

### The entries have aged out

System log tables have a retention policy, often a few days or weeks. Looking
for something from last month may simply be looking past the end of the data.

### On ClickHouse Cloud

Some of these tables behave differently or are unavailable on managed services.
CHOps detects what your deployment supports and explains what is missing rather
than showing a blank screen.

---

## 9. Worked investigations

### A node restarted overnight

1. **Crash Log**, Overview, 48 hours. Look for a dark cell.
2. If there is one, switch to Search with a window around it and read the signal
   and trace.
3. If the Crash Log is empty, the process did not crash. It was restarted, by an
   orchestrator, a package upgrade or a person. Check the **Text Log** at
   Information level around that time for shutdown messages.

### Queries started failing this morning

1. **Error Log**, Overview, 24 hours. The breakdown by type names the error.
2. If one type dominates, search it in the same window and read a few messages.
3. If the Error Log is quiet, the failures are not reaching the server. Look at
   the **Session Log** for connection refusals instead.

### A user says they cannot log in

1. **Session Log**, Overview. The failure reasons table names the reason, the
   user and the address.
2. If their attempt does not appear at all, the server never saw it, so the
   problem is between them and the server: address, port, firewall or TLS.
3. If it appears as `LoginFailure` with an IP restriction reason, the account
   exists and is refusing that address, which is a different fix from a wrong
   password.

### A table is not merging

1. **Text Log**, Search, Warning and above, with the table name in the message
   filter.
2. Nothing there, drop to Debug for a narrow window. Merges are chatty at that
   level.
3. Cross-check with [Merges & Mutations](merges-mutations.md), which reads the
   merge tables directly and is a better first stop for this particular
   question.

---

## Related pages

- [Queries](queries.md) for individual statement history from `system.query_log`
- [Merges & Mutations](merges-mutations.md) for background operations
- [Cluster Overview](cluster-overview.md) for the health picture these logs
  explain
- [Alert Rules](alerting.md#alert-rules) for being told about these events
  rather than looking for them
