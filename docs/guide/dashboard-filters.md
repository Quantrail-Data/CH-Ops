# Dashboard Filters

A dashboard filter is a control at the top of a dashboard that changes what the
charts below it show. Pick a region, and every chart that knows about regions
re-runs for that region. Charts that do not mention regions are left alone.

You do not create filters directly. You write a chart whose SQL asks for a
value, and CHOps builds the control for you.

This page explains how to write those queries, what each part of the filter bar
does, and what to do when something does not behave.

---

## Contents

1. [The idea in one example](#1-the-idea-in-one-example)
2. [Parameter syntax](#2-parameter-syntax)
3. [Types and the controls they produce](#3-types-and-the-controls-they-produce)
4. [Optional filter blocks](#4-optional-filter-blocks)
5. [Required and optional filters](#5-required-and-optional-filters)
6. [Default values](#6-default-values)
7. [Using the filter bar](#7-using-the-filter-bar)
8. [Arranging filters](#8-arranging-filters)
9. [Sharing a filtered view](#9-sharing-a-filtered-view)
10. [When something does not work](#10-when-something-does-not-work)
11. [Worked examples](#11-worked-examples)

---

## 1. The idea in one example

Here is an ordinary chart query:

```sql
SELECT
    toStartOfHour(event_time) AS hour,
    count() AS queries
FROM system.query_log
WHERE event_date >= today() - 7
GROUP BY hour
ORDER BY hour
```

It always shows seven days. To let the viewer choose, replace the number with a
parameter:

```sql
SELECT
    toStartOfHour(event_time) AS hour,
    count() AS queries
FROM system.query_log
WHERE event_date >= today() - {days:UInt16}
GROUP BY hour
ORDER BY hour
```

Save the chart, add it to a dashboard, and a **Chart filters** bar appears above
the dashboard with a numeric box labelled Days. Type 30, press Enter, and the
chart re-runs for thirty days.

That is the whole mechanism. The filter bar is built by reading the SQL of every
chart on the dashboard and collecting the parameters it finds.

### Why it works this way

Parameters are not string substitution. CHOps sends the value to ClickHouse®
separately from the query text, and ClickHouse® binds it according to the
declared type.

That means a value cannot change the shape of your query. Someone typing
`1; DROP TABLE users` into a filter box gets an error about an invalid number,
not a deleted table.

---

## 2. Parameter syntax

A parameter is a name and a type in braces:

```
{name:Type}
```

The name must start with a letter or underscore and may contain letters, digits
and underscores. `region`, `start_date` and `_internal` are valid. `2days` and
`start-date` are not.

The type is any ClickHouse® data type. It is not decoration: it decides which
control you get, how the value is formatted, and what ClickHouse® will accept.

```sql
WHERE region = {region:String}
  AND event_date >= {from:Date}
  AND duration_ms > {min_ms:UInt32}
```

Three parameters, three different controls.

### Where parameters are recognised

CHOps reads your SQL the way ClickHouse® does, so a parameter is only recognised
where it would really take effect.

**Recognised** in ordinary SQL, and inside an optional block.

**Ignored** inside a string literal, a quoted identifier, a backtick identifier,
a line comment starting with `--`, and an ordinary block comment.

So this is safe:

```sql
-- Set {region:String} before running this
SELECT 'the {placeholder:String} syntax' AS example
FROM events
WHERE region = {region:String}
```

One filter appears, named region, from the third line. The comment on the first
line and the string on the second are left alone.

### Using a name more than once

Repeating a name in one query is fine and produces one control:

```sql
SELECT * FROM a WHERE r = {region:String}
UNION ALL
SELECT * FROM b WHERE r = {region:String}
```

Repeating it with a **different type** is an error, and CHOps says so rather
than guessing:

```
Parameter 'region' is declared with two different types: 'String' and 'UInt8'.
Use one type for one name.
```

---

## 3. Types and the controls they produce

| Type family | Examples | Control |
|---|---|---|
| Text | `String`, `FixedString(8)`, `UUID` | Text box |
| Numeric | `UInt8` through `UInt256`, `Int8` through `Int256`, `Float32`, `Float64`, `Decimal` | Number box |
| Date | `Date`, `Date32` | Date picker |
| Date and time | `DateTime`, `DateTime64` | Date and time picker |
| Enumerated | `Enum8('a'=1,'b'=2)` | Dropdown of the members |
| Identifier | `Identifier` | Text box, for a table or column name |

### Enums give you a dropdown

Declaring an enum saves the viewer from typing and from typos:

```sql
WHERE type = {kind:Enum8('QueryStart'=1,'QueryFinish'=2,'ExceptionBeforeStart'=3)}
```

The filter bar shows a dropdown with those three options. The viewer cannot
enter anything else.

### Nullable and LowCardinality are transparent

`Nullable(String)` and `LowCardinality(String)` behave exactly as `String` for
the purpose of the control and the formatting. Wrap your type if your column is
wrapped; it changes nothing about the filter.

### How dates are sent

You pick a date in your own timezone; CHOps converts it to UTC before sending.

| Type | Sent as |
|---|---|
| `Date`, `Date32` | `2026-07-30` |
| `DateTime` | `2026-07-30 14:22:05` |
| `DateTime64` | `2026-07-30 14:22:05.123` |

If your ClickHouse® column stores local time rather than UTC, allow for that in
your query.

---

## 4. Optional filter blocks

Sometimes a filter should narrow the results when it is set and disappear
entirely when it is not. Writing that with a plain parameter is awkward.

An optional block does it. Wrap the part of the query that should only exist
when the filter has a value:

```sql
SELECT count()
FROM system.query_log
WHERE event_date >= today() - 7
  /*[ AND user = {user:String} ]*/
```

Leave User empty and the query runs as if that line were not there. Type a
value and the line appears with the value bound.

The markers are `/*[` to open and `]*/` to close. To ClickHouse® they are an
ordinary block comment, so the query still parses if you paste it into another
tool.

### A block can contain several parameters

```sql
  /*[ AND event_time BETWEEN {from:DateTime} AND {to:DateTime} ]*/
```

The block appears only when **every** parameter inside it has a value. Fill in
one end of that range and nothing changes, because half a range would be
meaningless.

### One rule worth knowing

A block must end with `]*/`. If you put a `*/` inside it, including inside a
string, ClickHouse® ends the comment there and the rest of your block leaks into
the query as live SQL.

CHOps checks for this and refuses to run the chart with a clear message rather
than sending something you did not write.

---

## 5. Required and optional filters

Whether a filter is required is decided by where you used it, not by a setting.

**Outside a block, it is required.** The chart cannot run without it.

**Only inside blocks, it is optional.** The chart runs without it, with the
block omitted.

```sql
SELECT count()
FROM system.query_log
WHERE event_date >= {from:Date}          -- required
  /*[ AND user = {user:String} ]*/       -- optional
```

If a name appears both outside a block and inside one, it is required. Being
needed anywhere makes it needed.

### What a chart does when a required filter is empty

It shows a message naming the filters it is waiting for, instead of running.

That is deliberate. An empty `String` could be sent as `''`, which matches
nothing, so the chart would render empty and look exactly like a working chart
with no data. Numbers and dates cannot even do that: ClickHouse® rejects the
statement with "Substitution is not set", which arrives after a pointless round
trip and does not say which control to touch.

Naming the filter is more useful than either.

---

## 6. Default values

A filter can start with a value rather than empty.

**Chart defaults** are set on the chart itself, in the Chart Builder, and travel
with the chart wherever it is used.

**Dashboard defaults** are set on the dashboard and override the chart's.

The value a filter starts with is the first of these that exists:

1. What the viewer has selected now
2. The dashboard default
3. The chart default
4. Empty

Dashboard defaults are how the same chart shows last 7 days on one dashboard and
last 90 on another without duplicating the chart.

---

## 7. Using the filter bar

The bar appears above the charts whenever a dashboard has at least one filter.

**Type or pick a value**, then **Apply**. Nothing re-runs until you apply, so
you can change several filters and refresh once.

**Enter applies** from any control, so you rarely need the button.

**Reset** returns every filter to its default.

The bar can be collapsed with the chevron when you want the screen back.

### Reading the bar

**Apply is highlighted** when what is on screen no longer matches what the
charts are showing. It compares against the applied values, not the defaults, so
the question it answers is always "is this view stale".

**A count of filters still needing a value** appears when a required filter is
empty, so you know why some charts are not drawing.

**Hovering a filter highlights the charts it affects.** Useful on a crowded
dashboard for answering "what will this change".

### Only affected charts re-run

Changing a filter re-runs the charts whose SQL names that parameter, and no
others. A chart with hardcoded values is never re-queried, however many times
you change the bar.

---

## 8. Arranging filters

A dashboard with several charts can end up with more filters than are useful.
Dashboard settings let you control the bar without touching any chart.

**Reorder** them, so the ones people change most sit first.

**Hide** one, which keeps its value working but removes the control. Useful when
a parameter has a sensible default that nobody should be changing.

**Relabel** one. A parameter named `dt_gte` can be presented as "From date"
without renaming it in the SQL.

These are properties of the dashboard, so the same chart can look different on
two dashboards.

---

## 9. Sharing a filtered view

Filter values live in the page address, so copying the URL shares what you are
looking at, not just the dashboard.

Send someone a link with `region=EU` and `from=2026-07-01` already applied and
they see your view. Changing a filter updates the address, so the back button
walks back through your filter changes.

---

## 10. When something does not work

### No filter bar appears

None of the charts declare a parameter. Check the chart SQL for `{name:Type}`.

The commonest cause is a parameter that is only inside a comment or a string,
which CHOps deliberately ignores.

### This dashboard's filters cannot be built

Two charts declare the same name with different types. The message names both
charts and both types.

One control cannot serve a name meaning two different things, so the bar is
replaced by the error until you fix one of them. Open the chart named in the
message and change its type, or rename one parameter.

### A chart says it is waiting for a filter

A required parameter has no value. Fill in the named filter and apply.

If you want the chart to run without it, move that part of the query into an
optional block. See [section 4](#4-optional-filter-blocks).

### An optional block must end with ]*/

Your block contains a `*/` before its intended end, usually inside a string
literal. ClickHouse® ends the comment at the first `*/` no matter what quoting
surrounds it, so the block cannot be trusted.

Rewrite the string to avoid `*/`, or move it out of the block.

### Parameter is declared with two different types

Within one chart, the same name is used twice with different types. Pick one
type for the name, or use two names.

### The chart runs but returns nothing

Check the value rather than the filter mechanism. A `String` filter matches
exactly, so trailing spaces and case both matter. `EU` does not match `eu`.

For a case-insensitive match, write it into the query:

```sql
WHERE lower(region) = lower({region:String})
```

### Dates are off by a few hours

Values are converted to UTC before being sent. If your column stores local time,
convert in the query, for example with `toTimeZone`.

---

## 11. Worked examples

### A time range with a sensible default

```sql
SELECT
    toStartOfInterval(event_time, INTERVAL 1 HOUR) AS bucket,
    count() AS queries,
    round(avg(query_duration_ms)) AS avg_ms
FROM system.query_log
WHERE type = 'QueryFinish'
  AND event_time >= {from:DateTime}
  AND event_time <  {to:DateTime}
GROUP BY bucket
ORDER BY bucket
```

Two required filters. Set dashboard defaults so the dashboard opens on something
useful rather than empty.

### Optional narrowing on top of a required range

```sql
SELECT
    user,
    count() AS queries,
    round(avg(query_duration_ms)) AS avg_ms
FROM system.query_log
WHERE type = 'QueryFinish'
  AND event_date >= {from:Date}
  /*[ AND user = {user:String} ]*/
  /*[ AND query_duration_ms > {min_ms:UInt32} ]*/
GROUP BY user
ORDER BY queries DESC
LIMIT 50
```

From is required. User and Min ms are independent: set either, both, or neither.

### A dropdown instead of free text

```sql
SELECT
    toStartOfHour(event_time) AS hour,
    count() AS events
FROM system.query_log
WHERE type = {kind:Enum8('QueryStart'=1,'QueryFinish'=2,'ExceptionBeforeStart'=3,'ExceptionWhileProcessing'=4)}
  AND event_date >= today() - {days:UInt16}
GROUP BY hour
ORDER BY hour
```

The viewer picks from four options rather than remembering the exact spelling.

### One filter driving several charts

Give both charts the same parameter name and type:

```sql
-- Chart: Queries by hour
SELECT toStartOfHour(event_time) AS hour, count()
FROM system.query_log
WHERE event_date >= today() - 7 AND user = {user:String}
GROUP BY hour ORDER BY hour
```

```sql
-- Chart: Slowest statements
SELECT query, query_duration_ms
FROM system.query_log
WHERE event_date >= today() - 7 AND user = {user:String}
ORDER BY query_duration_ms DESC LIMIT 20
```

One control appears, and changing it re-runs both. Any third chart that does not
mention `user` is untouched.

### Choosing a table at runtime

```sql
SELECT count() FROM {tbl:Identifier}
```

`Identifier` tells ClickHouse® the value names an object rather than being data,
so it is quoted as an identifier. Do not use `String` for this: it produces a
query that counts a string constant rather than reading a table.

---

## Related pages

- [Chart Builder](dashboards.md#2-chart-builder) for creating the charts these
  filters come from
- [My Dashboards](dashboards.md#6-my-dashboards) for arranging them
- [SQL Editor](sql-editor.md) for testing a parametrized query before saving it
  as a chart
