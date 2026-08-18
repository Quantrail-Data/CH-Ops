# Indexes and Projections

Indexes and projections are the two main tools ClickHouse&reg; gives you to make queries faster without a change to the query.

This section shows what your tables already have. It creates, builds, and removes these structures through forms, not hand-written SQL. The exact statement appears before anything runs.

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

**A data skipping index** helps ClickHouse&reg; avoid a read. It records something about each block of rows, so a query that filters on that column can skip blocks that cannot match. It is small and cheap, and it only helps queries that filter on the indexed expression.

**A projection** is a second copy of the data, stored in a different order or pre-aggregated. ClickHouse&reg; uses it automatically when it would be faster. It is much larger, more expensive to maintain, and it can transform a query, not just narrow it.

| Situation | Reach for |
|---|---|
| Filtering on a column that is not in the sort key | Skipping index |
| Searching for text within a column | Skipping index, text type |
| Repeatedly aggregating the same way | Projection |
| Frequently sorting by a different column than the table is sorted by | Projection |

### Before either

Check the sort key first. A query that filters on the table's `ORDER BY` columns is already fast, and no index will improve it. Indexes and projections are for the queries the sort key does not serve.

Also check that the query is actually slow. The [Query Profiler](query-profiler.md) tells you where time goes, and it is often somewhere an index cannot help.

---

## Data Skipping Indexes

This is a read-only view of every skipping index across all your databases, as an expandable tree: database, then table, then its indexes with the type and the expression each one covers.

This is for inspection. Use it before you add anything, to see what is already there. Duplicate indexes on the same expression cost write performance and buy nothing.

To create or remove one, use [Index Management](#index-management).

---

## Index Management

There are three tabs: **Create**, **Materialize**, and **Drop**.

### Create

Pick the database, the table, and the column. Name the index, and choose its type and granularity.

CHOps reads the column list from the table, with each column's data type beside it, so you choose from what exists rather than type a name.

Name it after what it does. `idx_user_id` is findable later. `idx1` is not.

Some types reveal extra options once chosen, covered below. If a type needs no tuning, no extra fields appear.

### Materialize

This builds the index for rows already in the table. See [section 6](#6-materializing), because this step is easy to miss and its absence is silent.

### Drop

This removes an index. Choose the database, table, and index.

A drop is quick and does not touch the data itself. If an index turned out not to help, remove it. Every index costs something on every insert.

---

## 4. Choosing an index type

There are four types.

### minmax

Records the smallest and largest value in each block. A query that filters on a range skips any block whose range cannot contain the value.

**Use for** numbers, dates, and timestamps, especially a date column that is not the table's sort key.

**Best when** the column correlates with insertion order, because then each block covers a narrow range and most blocks can be skipped. A timestamp usually does. A random identifier does not, and minmax on it skips almost nothing.

This is the cheapest type. Try it first for numeric and date columns.

### set

Records the distinct values in each block, up to a limit. A query that filters for equality skips blocks whose set does not contain the value.

**Use for** columns with a limited number of distinct values: a status, a country, a category.

**Not for** high-cardinality columns. Once a block goes above the set limit, the index stops helping for that block. So an index on a unique identifier is overhead with no benefit.

### bloom_filter

A probabilistic structure that answers "is this value definitely absent". It can say no with certainty and yes only probably. So a positive answer means ClickHouse&reg; reads the block to check.

**Use for** equality filters on higher-cardinality columns, where `set` would be too large.

Choose it and a **False Positive Rate** field appears. That is the trade. A lower rate means a larger index and fewer unnecessary reads. A higher rate means a smaller index that sometimes sends ClickHouse&reg; to check a block that does not match. The default is reasonable. Change it only with a measurement in hand.

### text

For a search within text, not an exact match. It splits the text into terms and indexes those, so a query that looks for a word inside a longer string can skip blocks that do not contain it.

**Use for** log messages, descriptions, and any long text you search rather than compare.

Choose it and **Text Index Parameters** appear. The tokenizer is the one that matters. It decides what counts as a term, and so what your queries can find. It has these options:

- **splitByNonAlpha** (the default): splits on non-alphanumeric characters. Suits prose.
- **splitByString**: splits on a separator you give. A **Separator** field appears. Suits structured strings such as paths.
- **asciiCJK**: suits CJK text.
- **ngrams**: indexes character sequences of length N. An **N** field appears. Suits substring search.
- **sparseGrams**: indexes variable-length grams. **Min Length**, **Max Length**, and a cutoff field appear.
- **array**: treats an array column's elements as the terms.

The other parameters are storage tuning:

| Parameter | Controls |
|---|---|
| Dictionary block size | How the term dictionary is stored |
| Dictionary frontcoding | Frontcoding compression for the dictionary |
| Posting block size | How the occurrence lists are stored |
| Posting codec | Compression for the occurrence lists |

The defaults are sensible. Leave them alone unless you measured a problem.

---

## 5. Granularity

Granularity is how many granules of the table each index entry covers. It defaults to 1.

**Lower granularity** means a larger index that can skip more precisely. **Higher granularity** means a smaller index that skips in bigger, blunter chunks.

Leave it at the default unless the index is large and rarely helps. In that case, a higher value trades precision for size.

This is one of the last things worth tuning. Type and expression matter far more.

---

## 6. Materializing

**To add an index does not index the data already in the table.**

An index applies from the moment it exists. Rows already there are not covered until you materialize it.

This is the most common way an index appears not to work. It was created, queries did not get faster, and it was never built for the existing data.

So after you create an index on a table that already holds rows, use the **Materialize** tab.

You can limit the materialize to a single partition. On a large table, that is worth doing. It spreads the work rather than one long operation, and you can measure whether the index helps before you build the rest.

The same applies to projections, which have their own Materialize tab for the same reason.

---

## Projections

A projection is an alternate arrangement of a table's data, stored alongside it. ClickHouse&reg; picks it automatically when it would answer a query faster.

There are two common shapes. A projection sorted differently from the table serves queries that filter on another column. A pre-aggregated projection that stores sums or counts by some grouping serves aggregate queries without a read of the rows.

The area has five tabs.

### View Projections

Every existing projection as an expandable tree: database, table, projection.

### Add Projection

Choose the database and table, name the projection, and define what it contains: a select expression, and optional `GROUP BY` and `ORDER BY` clauses.

Options let you apply the change across a cluster, and skip the operation if the projection already exists.

**One thing to know: projections do not support `SELECT DISTINCT`.** If you include it, CHOps removes it from the generated statement, and the form says so as you type. This is a ClickHouse&reg; restriction, not a CHOps one.

### Drop Projection

Removes a projection's definition and its data.

### Materialize Projection

Builds the projection for rows already in the table.

CHOps handles newly inserted data automatically. It does not handle existing data, for exactly the same reason as skipping indexes, and with the same silent failure mode.

You can limit it to one partition.

### Clear Projection

Empties a projection's data but keeps its definition.

This helps when a projection has become inconsistent and you want to rebuild it: clear, then materialize. It is different from a drop, which removes the definition too.

### The cost of a projection

A projection is a second copy of the data. It uses disk, and every insert writes to it as well as to the table.

That makes projections powerful and worth a deliberate choice. One that serves a query run thousands of times a day is clearly worth it. One added on a hunch is a permanent cost for an occasional benefit.

---

## 8. When something does not work

### I created an index and queries are not faster

There are three causes, in order of likelihood.

**Not materialized.** Existing rows are not covered. See [section 6](#6-materializing).

**The query does not filter on the indexed expression.** A skipping index only helps when the filter matches what the index covers. `WHERE toDate(ts) = today()` does not use an index on `ts` unless the index covers that expression too.

**The type does not suit the column.** A `set` index on a unique column, or a `minmax` on a randomly distributed one, skips nothing. See [section 4](#4-choosing-an-index-type).

### The index made inserts slower

This is expected. Every index is maintained on write. That is the trade.

If the read benefit does not justify it, drop the index. One that does not help is worse than none.

### DISTINCT disappeared from my projection

This is correct. ClickHouse&reg; projections do not support `SELECT DISTINCT`, so CHOps removes it rather than send a statement that will be rejected.

Restructure with `GROUP BY` if you need distinct behavior.

### A projection exists but is not being used

ClickHouse&reg; chooses a projection when it judges it faster. It will not use one that does not cover the query, and it may not use one it considers no better.

Check that the projection's `GROUP BY` and `ORDER BY` match how the query aggregates and filters. A projection grouped by day cannot serve a query grouped by hour.

### Materializing is taking a long time

This is expected on a large table, because it processes existing data.

Use the partition option to do it in pieces. That also lets you check whether it helps before you commit to the whole table.

### I cannot see the Create tab

Index management needs admin. The read-only views stay available to everyone.

---

## Related pages

- [Query Profiler](query-profiler.md) to find out whether an index would help before you create one
- [Tables & Parts](tables-and-parts.md) for what a table currently holds
- [Schema Visualizer](schema-visualizer.md) for how tables relate
- [Merges & Mutations](merges-mutations.md) to watch a materialize operation progress
