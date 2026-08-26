# Database RBAC

This section manages ClickHouse&reg;'s own users, roles, and settings profiles. It controls who may connect to your database, what they may read and write, and what limits apply to their queries.

There are four pages: [View Grants](#view-grants), [Users](#users), [Roles](#roles), and [Settings Profiles](#settings-profiles). Every action shows the SQL before it runs.

---

## Contents

1. [Two different sets of users](#1-two-different-sets-of-users)
2. [Where ClickHouse stores access](#2-where-clickhouse-stores-access)
3. [ON CLUSTER](#3-on-cluster)
4. [View Grants](#view-grants)
5. [Users](#users)
6. [Roles](#roles)
7. [Settings Profiles](#settings-profiles)
8. [Patterns worth adopting](#8-patterns-worth-adopting)
9. [When something does not work](#9-when-something-does-not-work)

---

## 1. Two different sets of users

This is the most common confusion. Settle it first.

**CHOps users** are accounts for CHOps itself. They control who can log in to this interface and what they can do here. They live in the CHOps database. You manage them under [Control Panel, User Management](admin.md#user-management).

**ClickHouse&reg; users** are accounts on your database server. They control who may connect and what data they may touch. They live in ClickHouse&reg;. You manage them here.

The two sets are not related. A CHOps administrator is not automatically a ClickHouse&reg; administrator. If you make a user here, that person cannot log in to CHOps.

| Question | Where |
|---|---|
| Who can open CHOps | [User Management](admin.md#user-management) |
| Who can connect to the database | This section |
| Who can drop a table | This section |
| Who can add a cluster to CHOps | [User Management](admin.md#user-management) |

---

## 2. Where ClickHouse stores access

Know this. It decides whether a user you make exists on one server or all of them.

ClickHouse&reg; holds users and roles in one of two ways.

**Local directory** is the default. Each server keeps its own copy. If you make a user on one node, it exists only there.

**Replicated access storage** must be configured. ClickHouse&reg; coordinates users and roles through Keeper, so they exist across the whole cluster.

### Why it matters

On a cluster with local storage, a user you make without `ON CLUSTER` exists on the node you connected to and nowhere else. Everything looks correct until a query reaches a different replica.

That failure is hard to find, because it is intermittent. It depends on which node the connection reached.

On a Kubernetes cluster, CHOps checks the access configuration. It shows a banner on these screens when `ON CLUSTER` is advisable. You do not have to remember which storage your cluster uses.

There is also a third group. Users defined in the server XML configuration, such as `default` and the operator account, are read-only here. They are not managed through SQL, so you cannot change them from this interface.

---

## 3. ON CLUSTER

Every create, alter, grant, and drop offers an `ON CLUSTER` option. It runs the statement on every node, not only the node you connected to.

Use it when your cluster has more than one node and you are not sure access is replicated. To apply a change to all nodes when it was already replicated does no harm. To not apply it when it was needed leaves the cluster inconsistent.

An inconsistent cluster is the worst outcome here, because it works most of the time. A user exists on three nodes out of four, and one connection in four fails.

### On a Kubernetes cluster

CHOps reads the cluster access configuration. It turns the option on by default where it should be, and it shows a banner that explains why. The banner appears only when it is relevant.

You can still turn it off. This is for the rare case when a change is meant for one node.

---

## View Grants

This is a read-only view of who has what.

Grants appear as a tree that you expand: from grantee, to database, to table, to the privileges held.

### How to use it

**Before you change anything.** Look at what a user already has before you grant more. Duplicate grants do no harm, but they make the picture harder to read later.

**When someone reports a permission error.** Find the user here first. It is faster than reading the error. It shows what the user does have and what the user does not.

**During a review.** Expand everything for the full picture. That is what an auditor asks for.

### How to read the tree

A privilege granted at the database level covers every table in the database, including tables made later. This is convenient. It is also how people get more access than intended.

A privilege granted through a role appears under the role, not under each user that holds it. If a user seems to have fewer privileges than they clearly do, check their roles.

---

## Users

This page manages ClickHouse&reg; accounts. It has five tabs. Each tab shows its SQL.

### List

The users that already exist.

### Create

Choose the authentication method and password. You can also set a default database, a default role, the host addresses the account may connect from, and an expiry time.

**The host restriction is a security control, not a convenience.** A user restricted to a known address cannot connect from anywhere else, even with the correct password. It is one of the strongest controls on this page.

**Valid Until** suits temporary access, such as a contractor, an investigation, or a migration. The account stops working on its own. This is more reliable than a reminder to remove it.

**A default role** applies automatically when the user connects, so the user does not activate it. Without a default role, a user with a granted role may have no privileges until they run `SET ROLE`.

### Alter

This is the widest tab. Rename the user, reset the authentication, add or drop permitted hosts, add or drop settings and profiles, and change the expiry.

Use this tab to reset authentication when a password must change.

### Grant and Revoke

Give or take one privilege, on a database and table, with an optional `ON CLUSTER`.

**Grant to roles, not to users,** wherever you can. See [section 8](#8-patterns-worth-adopting).

### Drop

This removes a user. You must type the user name to confirm. This is deliberate, because a drop is not reversible and a wrong name in a list is easy to click.

To drop a user does not affect anything they made. Their tables stay.

---

## Roles

A role is a named group of privileges. Grant the role to people, rather than grant each privilege to each person.

Roles have the same five tabs as Users: **List**, **Create**, **Alter**, **Grant/Revoke**, and **Drop**.

**Create** names the role, with an optional `ON CLUSTER`.

**Alter** renames the role and adds or drops attached settings and profiles. It has shortcuts to drop all settings or all profiles at once.

**Grant/Revoke** works the same way as it does for users.

**Drop** asks you to type the role name.

### Why roles are worth the extra step

To change what a group can do becomes one edit, not one edit per person.

Roles also make access reviewable. "Which analysts can read the finance database" is answerable from one role. The same question across forty individually granted users is not.

**To drop a role removes its privileges from everyone that holds it.** This is usually what you want. Be sure of it first.

---

## Settings Profiles

A settings profile is a reusable group of ClickHouse&reg; settings applied to users and roles. It controls how much memory a query may use, whether a user may run DDL, and how long a query may run.

There are four tabs: **Profiles**, **Create**, **Alter**, **Drop**.

CHOps groups the settings into collapsible sections, so you do not face hundreds of settings as one list. Open a group, set what you care about, and leave the rest.

| Group | Examples |
|---|---|
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

Every setting uses its exact ClickHouse&reg; name, so what you set matches the official documentation. The form rejects invalid values. A free-form field takes any setting that is not shown in the groups, written as `distributed_ddl_task_timeout=300, insert_quorum=2`.

**Alter** also adds or drops profiles attached to this one. It can drop all settings or all profiles at once. **Drop** asks you to type the name.

### The settings that matter most

**`readonly`** is the strongest control. It stops a user from changing anything. It is the right start for an analyst account.

**`max_memory_usage`** stops one query from taking down a server. Set it on any profile used by people who run exploratory queries.

**`max_execution_time`** stops a runaway query from holding resources with no end.

**`allow_ddl`** decides whether a user may create or drop objects. Turn it off for anyone who does not need it.

Those four cover most of what a profile is for. The rest is tuning.

---

## 8. Patterns worth adopting

**Privileges on roles, roles on people.** Grant privileges to a role, then grant the role to people. The extra step pays back the first time someone joins or leaves.

**A profile per kind of user, not per person.** Make an analyst profile, an application profile, and an admin profile. Attach them to roles.

**Restrict hosts wherever you can.** An application account that only connects from three known addresses should say so. This makes a leaked password a much smaller problem.

**Use Valid Until for anything temporary.** Access that expires on its own is better than access that depends on someone to remember it.

**Review with View Grants often.** Access accumulates. Nobody notices until someone asks who can read a table, and the answer takes an afternoon.

**Use ON CLUSTER unless you are sure you should not.** To apply a change to all nodes when it was not needed costs nothing. The reverse leaves an inconsistent cluster that fails intermittently.

---

## 9. When something does not work

### A user I made cannot connect from another node

This is almost always the access storage. The user exists on the node you connected to and nowhere else.

Make the user again with `ON CLUSTER`, or configure replicated access storage so it stops. See [section 2](#2-where-clickhouse-stores-access).

### A user has a role but no privileges

The role is granted but not active. Set it as the user's default role, or have the user run `SET ROLE`.

A default role is the better fix, because it needs nothing from the user.

### I cannot alter the default user

Users defined in the server XML configuration cannot be changed through SQL. `default` is usually one of them, as is the operator account on an operator-managed cluster.

Change those in the server configuration instead.

### Permission denied on a table the user should see

Check View Grants first. Common causes are a privilege granted on a different database, a grant that covers some tables but not this one, or a role that was never activated.

Remember that a database-level grant covers tables made later, but a table-level grant does not cover a new table.

### A grant worked but the user still cannot connect

To connect and to have privileges are different things. Check the host restriction and the expiry. Either one refuses a connection, whatever the account may do once inside.

### Changes seem to apply and then revert

On a cluster without replicated access storage, a load balancer can send consecutive statements to different nodes. A change made on one node is genuinely not on another.

`ON CLUSTER` solves this. CHOps warns about it on a Kubernetes cluster, because that arrangement makes it likely.

### I dropped a role and people lost access

This is expected. A role's privileges belong to the role, so to remove the role removes them from everyone that held it.

Make the role again and grant it again, or grant the privileges directly as a temporary measure.

---

## Related pages

- [User Management](admin.md#user-management) for CHOps's own accounts, which are not related to these
- [SQL Editor](sql-editor.md) to run access statements by hand
- [Session Log](logs.md#session-log) to audit who connected
- [The Kubernetes Page](kubernetes-page.md) for why CHOps recommends `ON CLUSTER` on an operator-managed cluster
