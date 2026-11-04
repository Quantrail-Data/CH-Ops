# Queries

This section is where you see what your cluster does right now, look at how queries performed over time, and search past activity. Open it from **Overview > Queries** in the sidebar. It has three tabs: **Current**, **Analytics**, and **Query Log**.

## Current Queries

The Current tab shows every query that runs on your cluster at this moment, live from `system.processes`. It refreshes every 5 seconds by default. Use the **Refresh** list to choose **Off**, **2s**, **5s**, **10s**, or **30s**. The pause button stops the automatic refresh, and the refresh button loads the list at once.

Use the filter row to narrow the list:

- **User** and **Kind** show only the queries of one user or one query kind.
- **Search in** chooses the field to search: **All fields**, **Query text**, **User**, or **Query ID**. Type the text in **Search** and press Enter to search at once.
- **Hide internal** hides the queries that ClickHouse&reg; runs for itself.
- **Initial only** hides the secondary queries that a distributed query starts on other shards.
- **Clear** resets all filters.

Below the filters, five cards show the totals for the listed queries: **Running**, **Users**, **Memory**, **Longest**, and **Read**. Click **Workload breakdown** to show charts of memory and read volume per user, queries per user and kind, the longest running queries, and concurrency over the last 60 samples. The cards and charts follow the current filter.

The table shows the query ID, user, kind, elapsed time, progress, memory, peak memory, rows and bytes read and written, threads, and the query text. Click a column header to sort. Click a row to open the **Query detail** window, which shows the query text, progress and resources, identity, client, distributed, ProfileEvents, and settings information. Use **Open in...** to open the query in the Query Profiler, Processors Profile, or Query Metrics.

A query that finishes between two refreshes can still show in the list until the next refresh. This is normal.

You can stop a query that misbehaves or takes too long, although only administrators can kill queries. Each kill has two modes:

- **ASYNC** (**Kill async**) asks ClickHouse&reg; to stop the query and returns without a wait.
- **SYNC** (**Kill sync**) waits until the query has fully stopped before it reports back, so you know for certain it is gone.

To kill queries:

- To kill one query, open its **Query detail** window and click **Kill async** or **Kill sync**.
- To kill several queries, select their checkboxes and click **Kill selected**.
- To kill all listed queries of one user, select the user in the **User** filter, then click the button **Kill N listed from** followed by the user name.

A confirmation window opens. Choose **ASYNC** or **SYNC** under **Mode**. If you kill 10 or more queries, type the number of queries to confirm. CHOps sends 8 kills at a time and pauses the automatic refresh until it finishes. The result shows how many queries are gone and how many are still running.

## Analytics

The Analytics tab turns your query history into charts, so patterns are easy to spot.

Start by choosing a time range. Use a **Quick Range** button (**1h**, **6h**, **24h**, **48h**, **7d**, or **30d**), or set your own **From** and **To** times. To look at one kind of query, choose it in **Query Kind** as well. Then click **Analyze** to load everything.

Four cards show the **Total queries**, the **Error rate**, the **p99 duration**, and the **p99 memory** for the range.

You then see:

- **Throughput and Error Rate**: how many queries ran over time, and how many failed.
- **Duration Percentiles (p50 / p90 / p99)**: the typical and the tail query times, in milliseconds.
- **Duration Distribution**: how query times are spread.
- **Duration vs Memory (slowest 200)**: a scatter of the 200 slowest completed queries, one point each. The top right is both slow and memory-heavy. Click a point to see the full query text.

Below the charts, two tables rank the queries worth a closer look: the **Top 100 Slowest Queries** by duration, and the **Top 100 Memory-Intensive Queries** by memory used. These are usually the first place to look when you hunt for something to optimize.

## Query Log Search

The Query Log tab is a full search tool for `system.query_log`, the table where ClickHouse&reg; records every query it ran. ClickHouse&reg; indexes that table by date and time, so you always set both **From (required)** and **To (required)**. This keeps your searches fast even when the log is enormous.

From there, you narrow the results with as many filters as you need:

- **Query Kind** picks a category, with the options drawn from what appears in your log.
- **Type** filters by the stage of a query, such as when it started, when it finished, or whether it threw an exception.
- **Exception Code** focuses on queries that failed with a specific error.
- **Exception** searches the error messages for text you type.
- **Is Initial** separates queries a user started directly from ones triggered internally.
- **Initial User** filters to a particular user.
- **Additional Result Columns** adds more columns of `system.query_log` to the result.
- **Custom SQL Filters** adds your own conditions to the WHERE clause, joined with **AND** or **OR**.

Choose the order with **Sort By** (**Event Time**, **Duration**, **Read Rows**, **Read Bytes**, **Written Rows**, **Written Bytes**, **Result Rows**, **Result Bytes**, or **Memory**) and **Direction** (**Desc** or **Asc**). Then click **Search**. The result shows at most 500 queries, and because CHOps always uses the date and time index, the search runs efficiently. Click **Collapse Filters** or **Expand Filters** to hide or show the filters.
