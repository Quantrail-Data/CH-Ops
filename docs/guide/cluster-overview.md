# Cluster Overview

When you log in, this is the first page you land on. Think of it as the health dashboard for your ClickHouse® cluster: a quick, at-a-glance read on whether everything is running smoothly or something needs your attention.

> **Heading note:** You reach this page from the sidebar under **Overview > Cluster Overview**, but the heading inside the page reads **Node Overview**. The figures are scoped to the specific node you are connected to (not aggregated across the whole cluster), so the in-page title reflects that node-level view.


## Status Cards

Across the top, you will find a row of cards, each showing one key number about your cluster. Every card pulls its value live from ClickHouse®'s own system tables, so what you see is always current.

Here is what each card tells you:

- **Version** is the ClickHouse® server version you are running.
- **Uptime** shows how long the server has been running since it last started.
- **Databases** and **Tables** are simple counts of how many of each you have.
- **Queries Running** is the number of queries executing right now.
- **Merges Running** shows background merge operations in progress. (Merges are how ClickHouse® tidies up data behind the scenes; this is normal activity.)
- **Mutations Running** counts active mutations, which are changes to existing data that are still in progress.
- **DDL Queue** shows how many schema-change commands are waiting in the distributed queue.
- **Readonly Tables** counts any table replicas that have slipped into a read-only state. If this number is above zero, the card turns red, because it usually means something needs looking into.

## Disk and RAM

Just below the status cards sit two more cards that track your resources.

**Disk Used** shows the percentage of disk space in use across all your configured disks, with a progress bar so you can see it at a glance. It turns red once you pass 85 percent, which is your cue to free up space or add more before you run out.

**RAM (Resident)** shows how much memory the server process is currently holding.

## ClickHouse® Keeper

If your cluster uses ClickHouse® Keeper to coordinate its replicas, this section shows you its connection details: the host, the port, and whether each Keeper node is currently a leader or a follower.

## Clusters Table

This section lays out your cluster topology, drawn from the `system.clusters` table. For each entry you can see the cluster and its name, the IP address, which shard and replica it is, and counters for errors and slowdowns. It always appears, even if you have only a single cluster configured, so you have one consistent place to check.

## Readonly Tables

When a replicated table goes read-only, it can no longer accept writes, so you want to know about it quickly. If any of your tables are in this state, an alert banner appears at the top with a count, and a table below lists exactly which databases and tables are affected, along with when each one entered the read-only state. That timestamp is often the first clue when you are tracking down what went wrong.

## Refreshing the Data

The page refreshes itself every 30 seconds, so you can leave it open and trust that the numbers stay current. During each refresh the values hold steady rather than flickering, which makes them easier to read. If you would rather not wait, the Refresh button in the section header pulls fresh data immediately.
