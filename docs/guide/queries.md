# Queries

This section is where you go to see what your cluster is doing right now, dig into how queries have performed over time, and search through past activity. It is organized into three tabs: Current, Analytics, and Query Log.

## Current Queries

The Current tab shows you every query running on your cluster at this moment, pulled live from `system.processes`. It refreshes every 5 seconds, so it keeps pace with what is actually happening.

You may notice a banner at the top reminding you that some queries in the list might already be finished. That is not a bug. ClickHouse® is fast enough that a query can complete in the time between one refresh and the next, so a brief overlap is normal.

Each row comes with two action buttons for stopping a query that is misbehaving or taking too long:

- **Kill** asks ClickHouse® to stop the query and moves on without waiting.
- **Kill Sync** stops the query and waits until it has fully terminated before reporting back, so you know for certain it is gone.

Both buttons use whichever ClickHouse® credentials are set in the connection bar at the top of the page.

## Analytics

The Analytics tab turns your query history into a visual story. Instead of reading raw logs, you get calendar heatmaps and ranked tables that make patterns easy to spot.

Start by choosing a time range. You can use the quick buttons (1 hour, 6 hours, 24 hours, 48 hours, 7 days, or 30 days) or set your own start and end times with the date pickers. If you only care about a certain kind of query, you can filter by query kind as well. Then click Analyze to load everything.

You will see four heatmaps, each showing a different measure broken down by day and hour, so busy periods and quiet ones stand out at a glance:

- **Query Count** is how many queries ran in each time slot.
- **Error Count** is how many of them failed.
- **Median Memory Usage** shows the typical memory a query used.
- **Median Query Duration** shows how long the typical query took.

The colors run from a faint warm tint for low values up to a deep brown for the highest ones, and the scale adjusts itself to your data so the contrast stays meaningful whether your numbers are large or small.

Below the heatmaps, two tables rank the queries worth a closer look: the ten slowest queries by duration, and the ten heaviest by memory used. These are usually the first place to look when you are hunting for something to optimize.

## Query Log Search

The Query Log tab is a full search tool for `system.query_log`, the table where ClickHouse® records every query it has run. Because that table is indexed by date and time, you always need to set both a start time and an end time. This keeps your searches fast even when the log is enormous.

From there, you can narrow things down with as many filters as you need:

- **Query Kind** lets you pick a category, with the options drawn from what actually appears in your log.
- **Type** filters by the stage of a query, such as when it started, when it finished, or whether it threw an exception.
- **Exception Code** lets you focus on queries that failed with a specific error.
- **Exception (text)** searches the error messages themselves for any text you type.
- **Is Initial Query** separates queries a user started directly from ones triggered internally.
- **Initial User** filters to a particular user.

Once you have your results, you can sort them by whatever matters most for what you are investigating, including run time, duration, rows and bytes read or written, result size, and memory used. CHOps builds the search behind the scenes from the filters and sorting you choose, and always uses the date and time index so it runs efficiently.
