# Access Control (RBAC)

RBAC stands for role-based access control, the system ClickHouse® uses to decide who can do what. This section gives you a visual way to manage it: to see who currently has access to what, and to create and adjust the users, roles, and settings profiles behind it. Before CHOps runs any change, it shows you the exact SQL it will execute, so nothing happens that you have not seen first. You reach everything here from the RBAC area in the sidebar.

## View Grants

Before changing anything, it helps to see how access is arranged today. View Grants lays this out so you can trace permissions at a glance. It has three tabs:

- **User Grants**: pick a user and see what that user is allowed to do.
- **Role Grants**: pick a role and see what it carries.
- **Full Overview**: users, roles, and all their grants brought together in one place, including which roles each user has been given, so you get the whole picture without switching back and forth.

### How to read the grants tree

In User Grants and Role Grants, choose a user or role from the dropdown at the top. CHOps then draws a tree. The subject you picked sits at the start, and the lines flow outward to what it has been given: the roles attached to it, and the individual privileges on specific databases and tables. Reading a branch from one end to the other answers the question "what does this lead to". You might see, for example, that a user holds a role, and that the role in turn grants SELECT on a particular database.

Large trees can run past the edge of the screen, so each view has its own controls:

- **Zoom in** and **zoom out** to move closer or further.
- **Reset** to return to the default view.
- **Download** to save the current tree as an image, which is handy for sharing or for an access audit.
- **Fullscreen** to give a busy tree the whole window.

You can also pan by dragging. Nothing here changes any permissions; View Grants is read only.

## Users

The Users area manages the individual ClickHouse® accounts that connect to your cluster. It is organized into five tabs, and each one previews the SQL before you run it:

- **List**: see the users that already exist.
- **Create**: add a new user. You choose how it authenticates (the auth method and a password), and you can set a default database, a default role, the host IP it is allowed to connect from, and an optional expiry time (Valid Until). ON CLUSTER lets you create the same user across every node of a cluster in one step.
- **Alter**: change an existing user. This is the widest tab. You can rename it, reset how it logs in (a new auth method and password), add or drop the hosts it may connect from, add or drop its settings and profiles, and update its expiry.
- **Grant/Revoke**: give or take away one specific permission. Choose the action (Grant or Revoke), the privilege, and the database and table it applies to, with an optional ON CLUSTER.
- **Drop**: remove a user entirely. To prevent accidents, you have to type the username to confirm before it will run.

## Roles

A role is a named bundle of permissions you grant to users, which is far easier than assigning the same permissions to each person one by one. The Roles area mirrors Users, with the same five tabs:

- **List**: see the roles that already exist.
- **Create**: name the role, with an optional ON CLUSTER.
- **Alter**: rename the role, and add or drop the settings and profiles attached to it. There are also shortcuts to drop all settings or drop all profiles at once.
- **Grant/Revoke**: works exactly as it does for users. Pick Grant or Revoke, the privilege, and the database and table, with an optional ON CLUSTER.
- **Drop**: type the role name to confirm before removing it.

A common and tidy pattern is to put privileges on a role, then grant that role to people. Changing what a whole group can do then becomes a single edit rather than many.

## Settings Profiles

A settings profile is a reusable group of ClickHouse® settings you can apply to users and roles, controlling things like how much memory a query may use or whether someone is allowed to run certain kinds of statements. The area has four tabs: **Profiles** (the list), **Create**, **Alter**, and **Drop**.

When you create or alter a profile, rather than face hundreds of settings as one long list, CHOps groups them into collapsible sections so you can find what you need. Open a group, set the values you care about, and leave the rest alone. Alter also lets you add or drop profiles attached to this one, and drop all settings or all profiles in a single step. Dropping a profile asks you to type its name to confirm.

The groups, with a few example settings from each, are:

| Group | Examples |
|-------|----------|
| Query Execution | max_threads, max_memory_usage, max_execution_time |
| Read Limits | max_rows_to_read, max_bytes_to_read, read_overflow_mode |
| Result Limits | max_result_rows, max_result_bytes, result_overflow_mode |
| JOIN | join_algorithm, join_overflow_mode, join_use_nulls |
| Permissions & Access | readonly, allow_ddl, allow_introspection_functions |
| Logging | log_queries, log_query_threads, log_comment |
| INSERT | max_insert_block_size, insert_quorum, async_insert |
| Networking & Timeouts | connect_timeout, receive_timeout, max_network_bandwidth |
| Distributed Queries | max_parallel_replicas, prefer_localhost_replica, skip_unavailable_shards |
| Merges & Mutations | background_pool_size, mutations_sync |
| Query Optimization | optimize_read_in_order, force_primary_key, optimize_move_to_prewhere |
| Data Formats | date_time_input_format, date_time_output_format, input_format_csv_delimiter |
| S3 & Cloud Storage | s3_max_connections, s3_truncate_on_insert |
| Advanced & Experimental | enable_filesystem_cache, flatten_nested, alter_sync |

Every setting uses its exact ClickHouse® name, so what you set here matches the official documentation. The form keeps you from entering invalid values, and there is a free-form field for any additional setting that is not shown in the groups, where you can type entries like `distributed_ddl_task_timeout=300, insert_quorum=2`.
