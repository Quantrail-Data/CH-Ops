# Merges, Mutations, and Replication

This section provides a unified view of three related background operations.

## Summary Cards

Three cards at the top show the current count of active merges, active mutations, and replication queue items.

## Merges Table

Lists all currently running merges from `system.merges`, showing database, table, elapsed time, progress percentage, rows read, rows written, and memory usage. If no merges are running, a message confirms that the data is well-organized.

## Mutations Table

Lists active mutations from `system.mutations` (where `is_done = 0` and `is_killed = 0`), showing database, table, mutation ID, command, parts remaining, and the latest failure reason. Each row has a Kill button that executes `KILL MUTATION`. If no mutations are active, a confirmation message is displayed.

## Replication Queue

Lists items from `system.replication_queue`, showing database, table, replica name, node name, operation type, creation time, and elapsed minutes. If the queue is empty, a message confirms that all replicas are in sync.

## Refresh

All three tables refresh automatically every 30 seconds. The Refresh button in the section header triggers an immediate reload.
