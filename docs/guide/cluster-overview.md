# Cluster Overview

The Cluster Overview is the default landing page after login. It provides a snapshot of your ClickHouse® cluster's health.

## Status Cards

The top section displays stat cards for key metrics, each fetched from ClickHouse® system tables:

- **Version**: the ClickHouse® server version (`SELECT version()`)
- **Uptime**: how long the server has been running
- **Databases**: count of databases
- **Tables**: count of tables
- **Queries Running**: active queries from `system.processes`
- **Merges Running**: active background merges
- **Mutations Running**: active mutations that are not done or killed
- **DDL Queue**: items in the distributed DDL queue
- **Readonly Tables**: count of replicas in readonly state (highlighted in red if greater than zero)

## Disk and RAM

Below the stat cards, two additional cards display:

- **Disk Used**: percentage of disk used across all configured disks, with a progress bar. Turns red above 85%.
- **RAM (Resident)**: memory tracked by the server process, from `system.asynchronous_metrics`.

## ClickHouse® Keeper

If the cluster uses ClickHouse® Keeper, its connection details are displayed showing host, port, and leader/follower status.

## Clusters Table

The Clusters section shows the `system.clusters` table with columns: cluster, name, IP, shard, replica, errors_count, and slowdowns_count. This table always displays, even if only one cluster is configured.

## Readonly Tables

If any replicated tables are in readonly state, an alert banner appears with the count. Below it, a table lists the affected databases, tables, and when they entered readonly state.

## Refresh

Data refreshes automatically every 30 seconds. Values are stabilized during refresh to prevent flickering. You can also click the Refresh button in the section header to trigger an immediate refresh.
