# Tables and Parts

ClickHouse&reg; stores every MergeTree table as a set of files on disk called parts. To understand parts explains a lot of ClickHouse&reg; behavior that otherwise looks arbitrary, including why you should batch inserts and why a table can suddenly refuse writes.

This page gives you two views: a health check on the parts themselves, and a breakdown of how much space each table uses.

---

## Contents

1. [What a part is](#1-what-a-part-is)
2. [The Parts tab](#the-parts-tab)
3. [The four part states](#3-the-four-part-states)
4. [Broken parts](#4-broken-parts)
5. [The Table Sizes tab](#the-table-sizes-tab)
6. [Reading the compression numbers](#6-reading-the-compression-numbers)
7. [What the part counts tell you](#7-what-the-part-counts-tell-you)
8. [When something does not work](#8-when-something-does-not-work)

---

## 1. What a part is

Every insert into a MergeTree table creates a new part: a directory of files that holds those rows, sorted by the table's sort key.

Parts are immutable. Nothing is written into an existing part. New data always becomes a new part.

In the background, ClickHouse&reg; merges small parts into larger ones. That is where the engine name comes from, and it is why the number of parts goes down on its own, with nobody to do anything.

### Why this matters in practice

**Many small inserts create many small parts.** A thousand single-row inserts create a thousand parts, and ClickHouse&reg; then has to merge them all. This is why "batch your inserts" is the most repeated piece of ClickHouse&reg; advice.

**Too many parts finally stops writes.** ClickHouse&reg; has a limit. When a table goes above it, inserts fail with a "too many parts" error. It is not gradual. Things work, then they do not.

**Queries read every part that might match.** Fewer, larger parts mean less to open. This is why merges improve read performance as well as tidiness.

The Parts tab is how you see this happen before it becomes a problem.

---

## The Parts tab

This opens with summary cards that count your **active**, **inactive**, **detached**, and **broken** parts, read from `system.parts` and `system.detached_parts`.

If there are any broken parts, an alert banner appears above a table that names the affected databases and tables and how many each has.

---

## 3. The four part states

| State | Meaning | Normal? |
|---|---|---|
| Active | In use, serving queries | Yes, this is most of them |
| Inactive | Merged away, awaiting cleanup | Yes, routine |
| Detached | Set aside, not in use | Usually |
| Broken | Set aside because something is wrong | No |

### Active

The parts that make up your table right now. Every query reads from these.

### Inactive

When ClickHouse&reg; merges several parts into one, the originals do not disappear at once. It marks them inactive and removes them a little later.

**A number of inactive parts is normal and not a problem.** To see them means merging has been happening, which is what you want. They are cleaned up on their own.

A count that keeps climbing and never falls is worth a look, because it suggests cleanup is not completing.

### Detached

Parts moved out of the table's active set but kept on disk. This can happen because someone ran `DETACH PARTITION`, or because ClickHouse&reg; set a part aside during a restore or a consistency check.

Detached parts still use disk. Queries do not read them, so they can be a quiet source of "the table is small but the disk is full".

### Broken

The ones to care about. See below.

---

## 4. Broken parts

CHOps flags a detached part as broken when its name begins with "broken".

That is ClickHouse&reg;'s own label, not a judgement CHOps makes. The server detached the part because it failed a check.

### What it usually means

Data corruption, most often from disk problems. A checksum that did not match, a file that could not be read, a part that failed validation on startup.

**Investigate, do not wait.** A single broken part often means the disk that holds it is failing, and the next symptom is worse than one detached part.

### What to do

1. **Check the disk.** System logs and SMART data for the device that holds that table's data.
2. **Check whether the data is elsewhere.** On a replicated table, another replica almost certainly holds a good copy, and ClickHouse&reg; can fetch it.
3. **Look at the [Error Log](logs.md#error-log) and [Text Log](logs.md#text-log)** around the time it was detached. The server usually says why.
4. **Do not simply delete it** until you know the data exists elsewhere. A broken part is still evidence.

On a replicated table, the usual fix is to drop the broken part and let replication fetch a clean copy. On a non-replicated table, the data in that part may be gone, which is when your [backups](backups.md) matter.

---

## The Table Sizes tab

A sortable table of every MergeTree table, largest first by default.

| Column | Meaning |
|---|---|
| database, table | The full name |
| compressed | Space used on disk |
| uncompressed | Space it would take without compression |
| compression_pct | Compressed as a percentage of uncompressed |
| ratio | How many times smaller compression made it |
| engine | MergeTree, ReplicatedMergeTree, and so on |
| active_parts, inactive_parts | Counts of each |
| total_rows | Rows across all parts |

### Sorting to answer a question

Largest first answers "what is using my disk", which is the usual question.

Sort by **ratio** ascending to find tables that compress badly, which is where schema improvements pay off most.

Sort by **active_parts** descending to find tables that accumulate parts, which is where insert patterns need attention.

---

## 6. Reading the compression numbers

This is often the most interesting part of the page.

**A high ratio, say 10x or more**, means the data compresses well: repetitive values, sensible types, good sort order.

**A low ratio, near 1x**, means it barely compresses. This is worth investigating, because it is usually fixable and the fix is often large.

### Common causes of poor compression

**Types wider than the data needs.** A `String` that always holds one of five values should be `LowCardinality(String)` or an `Enum`. An `Int64` that holds numbers below a thousand should be `UInt16`.

**A sort order that does not group similar values.** Compression works on adjacent data. If your `ORDER BY` scatters similar rows apart, they cannot compress against each other. To sort by a low-cardinality column before a high-cardinality one usually helps.

**Genuinely random data.** Hashes, UUIDs, encrypted blobs, and compressed images do not compress, and nothing will make them. A ratio near 1x on a column of UUIDs is correct, not a problem.

**Timestamps stored as strings.** This is a very common one. `DateTime` compresses far better than the same value as text.

### Using it

Pick your largest table, look at its ratio, and if it is poor, look at its schema. On a table of any size, the saving from a type change can be large, and it costs nothing at query time.

---

## 7. What the part counts tell you

The relationship between active and inactive parts is a diagnostic.

**Few active, some inactive.** Healthy. Merging keeps up and cleans up.

**Many active, few inactive.** Merges are not keeping up with inserts. This usually means inserts are too small and too frequent. Check [Merges & Mutations](merges-mutations.md) to see whether merges run or are stuck.

**Many inactive, not falling.** Merging happens but cleanup does not complete. This is less common. Check disk space, because cleanup needs somewhere to work.

**Active climbing steadily.** This is the direction that ends in a "too many parts" error. Act before it arrives: batch your inserts, or check whether merges are blocked.

### A rough guide

A few dozen active parts per table is unremarkable. Several hundred is worth a look. Over a thousand and you are heading for trouble.

Those are rough figures. The number that matters is whether it is stable or climbing.

---

## 8. When something does not work

### The broken parts banner appeared

Do not ignore it. See [section 4](#4-broken-parts). Check the disk first, because one broken part is often the first sign of a failing device.

### A table shows a huge number of inactive parts

Merging runs but cleanup is behind. Check free disk space, and check [Merges & Mutations](merges-mutations.md) for whether merges complete.

### Compressed size is larger than I expect from total_rows

There are three usual causes. Poor compression, covered in [section 6](#6-reading-the-compression-numbers). Many inactive parts that still use space. Or detached parts, which use disk but appear in no query.

### A table is missing from Table Sizes

The list covers MergeTree family tables. Log engines, `Memory` tables, dictionaries, and views are not part-based and do not appear.

### total_rows looks wrong

It counts rows across parts, which includes rows superseded but not yet merged away. On a `ReplacingMergeTree` or `CollapsingMergeTree`, that is legitimately higher than the logical row count, because the old versions still exist until they are merged.

### Disk is full but the tables look small

Check detached parts. They use space and appear in no query.

Also check inactive parts, and whether merges complete at all.

---

## Related pages

- [Merges & Mutations](merges-mutations.md) for the background operations that turn many parts into fewer
- [Cluster Overview](cluster-overview.md) for disk usage across the cluster
- [Logs](logs.md) for what the server said when a part was detached
- [Indexes and Projections](indexes.md) when the answer is to read less rather than store less
- [Backups](backups.md) for when a broken part holds data that exists nowhere else
