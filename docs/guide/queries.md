# Queries

This section is where you see what your cluster does right now, look at how queries performed over time, and search past activity. It has three tabs: Current, Analytics, and Query Log.

## Current Queries

The Current tab shows every query that runs on your cluster at this moment, live from `system.processes`. It refreshes every 5 seconds by default, and you can change the interval. So it keeps pace with what happens.

You may see a banner at the top that reminds you some queries in the list may already be finished. That is not a bug. ClickHouse&reg; is fast enough that a query can complete between one refresh and the next, so a brief overlap is normal.

You can stop a query that misbehaves or takes too long. Each query offers two actions:

- **Kill** asks ClickHouse&reg; to stop the query and returns without a wait.
- **Kill Sync** stops the query and waits until it has fully stopped before it reports back, so you know for certain it is gone.

You can also select several queries from the list and stop them together. A confirmation dialog appears, and CHOps stops them a few at a time. All of this uses the ClickHouse&reg; credentials set in the connection bar at the top of the page.

## Analytics

The Analytics tab turns your query history into charts, so patterns are easy to spot.

Start by choosing a time range with the quick buttons or your own start and end times. To look at one kind of query, filter by query kind as well. Then click **Analyze** to load everything.

You then see:

- **Throughput and Error Rate**: how many queries ran over time, and how many failed.
- **Duration Percentiles (p50 / p90 / p99)**: the typical and the tail query times, in milliseconds.
- **Duration Distribution**: how query times are spread.
- **Duration vs Memory (slowest 200)**: a scatter of the 200 slowest completed queries, one point each. The top right is both slow and memory-heavy. Click a point to see the full query text.

Below the charts, two tables rank the queries worth a closer look: the **Top 100 Slowest Queries** by duration, and the **Top 100 Memory-Intensive Queries** by memory used. These are usually the first place to look when you hunt for something to optimize.

## Query Log Search

The Query Log tab is a full search tool for `system.query_log`, the table where ClickHouse&reg; records every query it ran. That table is indexed by date and time, so you always set both a start time and an end time. This keeps your searches fast even when the log is enormous.

From there, you narrow the results with as many filters as you need:

- **Query Kind** picks a category, with the options drawn from what appears in your log.
- **Type** filters by the stage of a query, such as when it started, when it finished, or whether it threw an exception.
- **Exception Code** focuses on queries that failed with a specific error.
- **Exception (text)** searches the error messages for text you type.
- **Is Initial Query** separates queries a user started directly from ones triggered internally.
- **Initial User** filters to a particular user.

Once you have your results, sort them by whatever matters for your investigation, including run time, duration, rows and bytes read or written, result size, and memory used. CHOps builds the search from the filters and sorting you choose, and always uses the date and time index so it runs efficiently.
