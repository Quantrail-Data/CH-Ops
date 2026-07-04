# Merges, Mutations, and Replication

ClickHouse® does a lot of work quietly in the background to keep your data organized and your replicas in sync. This section brings three of those background activities together in one place so you can keep an eye on them: merges, mutations, and replication.

## Summary Cards

Three cards at the top give you the quick headline: how many merges are running, how many mutations are active, and how many items are waiting in the replication queue. If everything is calm, these numbers stay low.

## Merges

A merge is ClickHouse® combining several smaller data parts into a larger one. This happens constantly and is a healthy sign that the engine is housekeeping as designed.

The Merges table lists every merge currently running, drawn from `system.merges`. For each one you can see the database and table involved, how long it has been going, its progress as a percentage, how many rows it has read and written, and how much memory it is using. When nothing is merging, you will see a friendly note confirming your data is already well organized.

## Mutations

A mutation is a change applied to existing data, such as an UPDATE or DELETE. Unlike a quick query, a mutation rewrites data in the background and can take a while on a large table.

The Mutations table shows the mutations still in progress, from `system.mutations`. Each row lists the database and table, the mutation's ID, the command it is carrying out, how many parts are left to process, and the most recent failure reason if it has hit a snag. If a mutation is stuck or you started it by mistake, the Kill button next to it stops the mutation. When there is nothing in progress, a short confirmation message lets you know.

## Replication Queue

When you run a cluster with replicas, each replica works through a queue of tasks to stay in step with the others. The Replication Queue table, from `system.replication_queue`, shows what is waiting: the database and table, the replica and node names, the type of operation, when it was created, and how many minutes it has been pending. If the queue is empty, that is exactly what you want to see, and a message confirms all your replicas are in sync.

## Refreshing the Data

All three tables refresh on their own every 30 seconds, so you can leave the page open and watch the background activity ebb and flow. If you want an instant update, the Refresh button in the section header reloads everything right away.
