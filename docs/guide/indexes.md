# Indexes and Projections

Indexes and projections are the two main tools ClickHouse® gives you for making
queries faster without changing the query.

This section shows what your tables already have, and creates, builds and
removes these structures through forms rather than hand-written SQL. The exact
statement appears before anything runs.

---

## Contents

1. [Which one do you need](#1-which-one-do-you-need)
2. [Data Skipping Indexes](#data-skipping-indexes)
3. [Index Management](#index-management)
4. [Choosing an index type](#4-choosing-an-index-type)
5. [Granularity](#5-granularity)
6. [Materializing](#6-materializing)
7. [Projections](#projections)
8. [When something does not work](#8-when-something-does-not-work)

---

## 1. Which one do you need

Both make queries faster, in different ways.

**A data skipping index** helps ClickHouse® avoid reading data. It records
something about each block of rows, so a query filtering on that column can skip
blocks that cannot possibly match. Small, cheap, and it only helps queries that
filter on the indexed expression.

**A projection** is a second copy of the data, stored in a different order or
pre-aggregated. ClickHouse® uses it automatically when it would be faster. Much
larger, more expensive to maintain, and it can transform a query rather than
just narrowing it.

| Situation | Reach for |
|---|---|
| Filtering on a column that is not in the sort key | Skipping index |
| Searching for text within a column | Skipping index, text type |
| Repeatedly aggregating the same way | Projection |
| Frequently sorting by a different column than the table is sorted by | Projection |

### Before either

Check the sort key first. A query filtering on the table's `ORDER BY` columns is
already fast, and no index will improve it. Indexes and projections are for the
queries the sort key does not serve.

Also check the query is actually slow. The [Query Profiler](query-profiler.md)
tells you where time is going, and it is often somewhere an index cannot help.

---

## Data Skipping Indexes

A read-only view of every skipping index across all your databases, as an
expandable tree: database, then table, then its indexes with the type and the
expression each one covers.

This is for inspection. Use it before adding anything, to see what is already
there. Duplicate indexes on the same expression cost write performance and buy
nothing.

To create or remove one, use [Index Management](#index-management).

---

## Index Management

Three tabs: **Create**, **Materialize** and **Drop**.

### Create

Pick the database, the table and the column, name the index, choose its type and
granularity.

The column list is read from the table, with each column's data type shown
beside it, so you are choosing from what exists rather than typing a name.

Name it after what it does. `idx_user_id` is findable later; `idx1` is not.

Some types reveal extra options once chosen, covered below. If a type needs no
tuning, no extra fields appear.

### Materialize

Builds the index for rows already in the table. See
[section 6](#6-materializing), because this step is easy to miss and its absence
is silent.

### Drop

Removes an index. Choose the database, table and index.

Dropping is quick and does not touch the data itself. If an index turned out not
to help, remove it: every index costs something on every insert.

---

## 4. Choosing an index type

Four types.

### minmax

Records the smallest and largest value in each block. A query filtering on a
range skips any block whose range cannot contain the value.

**Use for** numbers, dates and timestamps, especially a date column that is not
the table's sort key.

**Best when** the column correlates with insertion order, because then each
block covers a narrow range and most blocks can be skipped. A timestamp usually
does. A random identifier does not, and minmax on it will skip almost nothing.

The cheapest type. Try it first for numeric and date columns.

### set

Records the distinct values in each block, up to a limit. A query filtering for
equality skips blocks whose set does not contain the value.

**Use for** columns with a limited number of distinct values: a status, a
country, a category.

**Not for** high-cardinality columns. Once a block exceeds the set limit the
index stops helping for that block, so an index on a unique identifier is
overhead with no benefit.

### bloom_filter

A probabilistic structure that answers "is this value definitely absent". It can
say no with certainty and yes only probably, so a positive answer means
ClickHouse® reads the block to check.

**Use for** equality filters on higher-cardinality columns, where `set` would be
too large.

Choosing it reveals a **False Positive Rate** field. That is the trade: a lower
rate means a larger index and fewer unnecessary reads, a higher rate means a
smaller index that occasionally sends ClickHouse® to check a block that does not
match. The default is reasonable; change it only with a measurement in hand.

### text

For searching within text rather than matching it exactly. Splits the text into
terms and indexes those, so a query looking for a word inside a longer string
can skip blocks that do not contain it.

**Use for** log messages, descriptions, any long text you search rather than
compare.

Choosing it opens **Text Index Parameters**:

| Parameter | Controls |
|---|---|
| Tokenizer | How text is split into searchable terms |
| Separator | The string to split on, when splitting on a custom one |
| Dictionary block size | How the term dictionary is stored |
| Posting block size | How the occurrence lists are stored |
| Codec | Compression for the index |

The tokenizer is the one that matters. It decides what counts as a term, and
therefore what your queries can find. Splitting on whitespace suits prose;
splitting on a custom separator suits structured strings like paths.

The block sizes and codec are storage tuning. The defaults are sensible and
worth leaving alone unless you have measured a problem.

---

## 5. Granularity

How many granules of the table each index entry covers. It defaults to 1.

**Lower granularity** means a larger index that can skip more precisely.
**Higher granularity** means a smaller index that skips in bigger, blunter
chunks.

Leave it at the default unless the index is large and rarely helping, in which
case raising it trades precision for size.

This is one of the last things worth tuning. Type and expression matter far
more.

---

## 6. Materializing

**Adding an index does not index the data already in the table.**

An index applies from the moment it exists. Rows already there are not covered
until you materialize it.

This is the most common way an index appears not to work: it was created,
queries did not get faster, and it was never built for the existing data.

So after creating an index on a table that already holds rows, use the
**Materialize** tab.

You can limit materialization to a single partition. On a large table that is
worth doing: it spreads the work rather than running one long operation, and you
can measure whether the index is helping before building the rest.

The same applies to projections, which have their own Materialize tab for the
same reason.

---

## Projections

A projection is an alternate arrangement of a table's data, stored alongside it.
ClickHouse® picks it automatically when it would answer a query faster.

Two common shapes. A projection sorted differently from the table, which serves
queries filtering on another column. And a pre-aggregated projection storing
sums or counts by some grouping, which serves aggregate queries without reading
the rows.

The area has five tabs.

### View

Every existing projection as an expandable tree: database, table, projection.

### Add Projection

Choose the database and table, name the projection, and define what it contains:
a select expression, and optional `GROUP BY` and `ORDER BY` clauses.

Options let you apply the change across a cluster, and skip the operation if the
projection already exists.

**One thing to know: projections do not support `SELECT DISTINCT`.** If you
include it, CHOps removes it from the generated statement, and the form says so
as you type. That is a ClickHouse® restriction rather than a CHOps one.

### Drop Projection

Removes a projection's definition and its data.

### Materialize Projection

Builds the projection for rows already in the table.

Newly inserted data is handled automatically. Existing data is not, for exactly
the same reason as skipping indexes, and with the same silent failure mode.

Can be limited to one partition.

### Clear Projection

Empties a projection's data while keeping its definition.

Useful when a projection has become inconsistent and you want to rebuild it:
clear, then materialize. Different from dropping, which removes the definition
too.

### The cost of a projection

A projection is a second copy of the data. It uses disk, and every insert writes
to it as well as to the table.

That makes projections powerful and worth being deliberate about. One that
serves a query run thousands of times a day is clearly worth it. One added
speculatively is a permanent cost for an occasional benefit.

---

## 8. When something does not work

### I created an index and queries are not faster

Three causes, in order of likelihood.

**Not materialized.** Existing rows are not covered. See
[section 6](#6-materializing).

**The query does not filter on the indexed expression.** A skipping index only
helps when the filter matches what the index covers. `WHERE toDate(ts) = today()`
does not use an index on `ts` unless the index covers that expression too.

**The type does not suit the column.** A `set` index on a unique column, or a
`minmax` on a randomly distributed one, will not skip anything. See
[section 4](#4-choosing-an-index-type).

### The index made inserts slower

Expected. Every index is maintained on write. That is the trade.

If the read benefit does not justify it, drop the index. Having one that does
not help is worse than having none.

### DISTINCT disappeared from my projection

Correct. ClickHouse® projections do not support `SELECT DISTINCT`, so CHOps
removes it rather than sending a statement that will be rejected.

Restructure with `GROUP BY` if you need distinct behaviour.

### A projection exists but is not being used

ClickHouse® chooses a projection when it judges it faster. It will not use one
that does not cover the query, and it may not use one it considers no better.

Check that the projection's `GROUP BY` and `ORDER BY` actually match how the
query aggregates and filters. A projection grouped by day cannot serve a query
grouped by hour.

### Materializing is taking a long time

Expected on a large table: it processes existing data.

Use the partition option to do it in pieces. That also lets you check whether it
is helping before committing to the whole table.

### I cannot see the Create tab

Index management requires admin. The read-only views remain available to
everyone.

---

## Related pages

- [Query Profiler](query-profiler.md) for finding out whether an index would
  help before creating one
- [Tables & Parts](tables-and-parts.md) for what a table currently holds
- [Schema Visualizer](schema-visualizer.md) for how tables relate
- [Merges & Mutations](merges-mutations.md) for watching a materialize operation
  progress
