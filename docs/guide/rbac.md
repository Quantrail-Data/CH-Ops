# Database RBAC

This section manages ClickHouse&reg;'s own users, roles, and settings profiles. It controls who may connect to your database, what they may read and write, and what limits apply to their queries.

There are four pages under **DB RBAC** in the sidebar: [View Grants](#view-grants), [Users](#users), [Roles](#roles), and [Settings Profiles](#settings-profiles). Every action shows the SQL before it runs.

All CHOps users can look at the lists. Only CHOps administrators can create, alter, grant, revoke, and drop. CHOps disables those tabs and buttons for everyone else.

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

This is the most common confusion, so settle it first.

**CHOps users** are accounts for CHOps itself, and they control who can log in to this interface and what they can do here. They live in the CHOps database, and you manage them under [Control Panel, User Management](admin.md#user-management).

**ClickHouse&reg; users** are accounts on your database server, and they control who may connect and what data they may touch. They live in ClickHouse&reg;, and you manage them here.

The two sets are not related. A CHOps administrator is not automatically a ClickHouse&reg; administrator. If you make a user here, that person cannot log in to CHOps.

| Question | Where |
|---|---|
| Who can open CHOps | [User Management](admin.md#user-management) |
| Who can connect to the database | This section |
| Who can drop a table | This section |
| Who can add a cluster to CHOps | [User Management](admin.md#user-management) |

---

## 2. Where ClickHouse stores access

This matters, because it decides whether a user you make exists on one server or all of them.

ClickHouse&reg; holds users and roles in one of two ways.

**Local directory** is the default. Each server keeps its own copy. If you make a user on one node, it exists only there.

**Replicated access storage** needs explicit configuration. ClickHouse&reg; coordinates users and roles through Keeper, so they exist across the whole cluster.

### Why it matters

On a cluster with local storage, a user you make without `ON CLUSTER` exists on the node you connected to and nowhere else. Everything looks correct until a query reaches a different replica.

That failure is hard to find because it is intermittent, depending on which node the connection reached.

On a Kubernetes cluster, CHOps checks the access configuration and shows a banner on these screens when `ON CLUSTER` is advisable, so you do not have to remember which storage your cluster uses.

There is also a third group. Users defined in the server XML configuration, such as `default` and the operator account, are not managed through SQL. The **List** tab of the Users page names them under **Managed elsewhere**. On an operator-managed cluster, the next reconcile overwrites any change that you make to them here.

---

## 3. ON CLUSTER

Every create, alter, grant, and drop offers an `ON CLUSTER` option. It runs the statement on every node, not only the node you connected to.

Use it when your cluster has more than one node and you are not sure access is replicated. Applying a change to all nodes when it was already replicated does no harm, while skipping it when it was needed leaves the cluster inconsistent.

An inconsistent cluster is the worst outcome here, because it works most of the time. A user exists on three nodes out of four, and one connection in four fails.

### On a Kubernetes cluster

CHOps reads the cluster access configuration. When the **ON CLUSTER** field is empty and the cluster has more than one replica, a banner says: "This cluster has N replicas. Without ON CLUSTER, this change applies to one replica only." The banner appears only when it is relevant.

You can still turn it off for the rare case when a change is meant for one node.

---

## View Grants

This is a read-only view of who has what. It has four tabs:

- **User Grants**: select a user in the **User** list. A tree shows the user, a **Roles** branch with each granted role and its privileges, and a **Direct Grants** branch with the privileges granted to the user directly. A partial revoke shows in red. Use the toolbar to zoom, download the tree as an image, or show it full screen.
- **Role Grants**: select a role to see the same kind of tree for that role.
- **Full Overview**: three tables, **Users**, **Roles**, and **All Grants**, with every grant on the server.
- **Settings**: the settings that apply to a user or a role, and where each one comes from. See [Settings of a user or a role](#settings-of-a-user-or-a-role).

### How to use it

**Before you change anything.** Look at what a user already has before you grant more. Duplicate grants do no harm, but they make the picture harder to read later.

**When someone reports a permission error.** Find the user here first. It is faster than reading the error, and it shows what the user does have and what they do not.

**During a review.** Open **Full Overview** for the full picture. That is what an auditor asks for.

### How to read the tree

A privilege granted at the database level covers every table in the database, including tables made later. This is convenient, and it is also how people get more access than intended.

A privilege granted through a role appears under that role in the **Roles** branch, not under **Direct Grants**. If a user seems to have fewer privileges than they clearly do, check their roles.

### Settings of a user or a role

A user rarely gets all of their settings from one place. Some come from the default profile of the server, some from profiles assigned with a `TO` clause, some from roles, and some from the user itself. The **Settings** tab puts these together the way ClickHouse&reg; does, so you can see what applies in the end.

1. Choose **User** or **Role**, then the name.
2. For a user, choose **All granted roles** or **Default roles only (as at login)**. A new session starts with the default roles. `SET ROLE` can turn on the other granted roles later.
3. Type in **Search settings** to find one setting.

The tab has three parts:

- **Effective settings**: one row for each setting, with the value, the min and max, the writability, the source of the value, and how many earlier values it overrides. Point at a setting name to see its description and its built-in default. Point at the override count to see the earlier values and where they came from.
- **Sources, in the order ClickHouse applies them**: the default profile, the profiles with a `TO` clause, the roles (with the path that reaches each one), and the user. A later source overrides an earlier one.
- **Rows of system.settings_profile_elements**: the raw rows that belong to the user or the role. This is what you set with `CREATE USER ... SETTINGS` or `ALTER ROLE ... SETTINGS`.

Writability tells you what the user can do with a setting:

| Writability | Meaning |
| --- | --- |
| `WRITABLE` | The user can change the setting, within min and max. |
| `CONST` | The user cannot change the setting. |
| `CHANGEABLE_IN_READONLY` | The user can change the setting within min and max, even with `readonly = 1`. |

A warning icon next to a source means that two profiles with a `TO` clause, or two roles that do not reach each other, set the same setting. ClickHouse merges them in the order of their internal ids, so the value that wins can differ from the one shown.

ClickHouse does not show the `default_profile` of the server or the option `settings_constraints_replace_previous` in any system table. CHOps uses the ClickHouse defaults (`default`, and on). If your servers use other values, an admin can set them in **Control panel > App Config > DB RBAC**.

The view shows the settings at login. It does not include settings that a client sends with a connection or a query, or a `SET` in a session. ClickHouse still checks those against the constraints shown here.

---

## Users

This page manages ClickHouse&reg; accounts. It has five tabs: **List**, **Create**, **Alter**, **Grant/Revoke**, and **Drop**. Each tab shows its SQL.

### List

The users that already exist.

### Create

Enter the **Username** and choose the **Auth Method** and **Password**. You can also set a **Default Database**, a **Default Role**, the **Host IP** the account may connect from, a **Valid Until** expiry time, and **ON CLUSTER**.

**The host restriction is a security control, not a convenience.** A user restricted to a known address cannot connect from anywhere else, even with the correct password. It is one of the strongest controls on this page.

**Valid Until** suits temporary access, such as a contractor, an investigation, or a migration. The account stops working on its own, which is more reliable than a reminder to remove it.

**A default role** applies automatically when the user connects, so the user does not have to activate it. Without a default role, a user with a granted role may have no privileges until they run `SET ROLE`.

### Alter

This is the widest tab. Rename the user (**Rename To**), reset the authentication (**RESET AUTH**), add or drop permitted hosts (**Host Action**: **ADD HOST** or **DROP HOST**), add or drop settings and profiles, and change the expiry.

Use this tab to reset authentication when a password must change.

### Grant and Revoke

Choose **Grant** or **Revoke** in **Action**, then choose the **Privilege**, the **Database**, and the **Table**, with an optional `ON CLUSTER`.

**Grant to roles, not to users,** wherever you can. See [section 8](#8-patterns-worth-adopting).

### Drop

This removes a user. You must type the user name to confirm, then click **Drop User**. This is deliberate, because a drop is not reversible and a wrong name in a list is easy to click.

Dropping a user does not affect anything they made, and their tables stay.

---

## Roles

A role is a named group of privileges. Grant the role to people, rather than granting each privilege to each person.

Roles have the same five tabs as Users: **List**, **Create**, **Alter**, **Grant/Revoke**, and **Drop**.

**Create** names the role, with an optional `ON CLUSTER`.

**Alter** renames the role and adds or drops attached settings and profiles. The **DROP ALL SETTINGS** and **DROP ALL PROFILES** options drop all of them at once.

**Grant/Revoke** works the same way as it does for users.

**Drop** asks you to type the role name, then click **Drop Role**.

### Why roles are worth the extra step

Changing what a group can do becomes one edit, not one edit per person.

Roles also make access reviewable. "Which analysts can read the finance database" is answerable from one role. The same question across forty individually granted users is not.

**Dropping a role removes its privileges from everyone that holds it.** This is usually what you want, but be sure of it first.

---

## Settings Profiles

A settings profile is a reusable group of ClickHouse&reg; settings that you apply to users and roles. It controls how much memory a query may use, whether a user may run DDL, and how long a query may run.

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

Every setting uses its exact ClickHouse&reg; name, so what you set matches the official documentation. The form rejects invalid values. The **Additional Settings (key=value, comma-separated)** field takes any setting that is not shown in the groups, written as `distributed_ddl_task_timeout=300, insert_quorum=2`.

**Alter** also adds or drops profiles attached to this one. The **DROP ALL SETTINGS** and **DROP ALL PROFILES** options drop all of them at once. **Drop** asks you to type the profile name.

### The settings that matter most

**`readonly`** is the strongest control. It stops a user from changing anything, which makes it the right start for an analyst account.

**`max_memory_usage`** stops one query from taking down a server. Set it on any profile used by people who run exploratory queries.

**`max_execution_time`** stops a runaway query from holding resources with no end.

**`allow_ddl`** decides whether a user may create or drop objects. Turn it off for anyone who does not need it.

Those four cover most of what a profile is for. The rest is tuning.

---

## 8. Patterns worth adopting

**Privileges on roles, roles on people.** Grant privileges to a role, then grant the role to people. The extra step pays back the first time someone joins or leaves.

**A profile per kind of user, not per person.** Make an analyst profile, an application profile, and an admin profile. Attach them to roles.

**Restrict hosts wherever you can.** An application account that only connects from three known addresses should say so. This makes a leaked password a much smaller problem.

**Use Valid Until for anything temporary.** Access that expires on its own is better than access that depends on someone remembering it.

**Review with View Grants often.** Access accumulates. Nobody notices until someone asks who can read a table, and the answer takes an afternoon.

**Use ON CLUSTER unless you are sure you should not.** Applying a change to all nodes when it was not needed costs nothing. The reverse leaves an inconsistent cluster that fails intermittently.

---

## 9. When something does not work

### A user I made cannot connect from another node

This is almost always the access storage. The user exists on the node you connected to and nowhere else.

Make the user again with `ON CLUSTER`, or configure replicated access storage so it stops happening. See [section 2](#2-where-clickhouse-stores-access).

### A user has a role but no privileges

The user has the role, but it is not active. Set it as the user's default role, or have the user run `SET ROLE`.

A default role is the better fix, because it needs nothing from the user.

### I cannot alter the default user

You cannot change users defined in the server XML configuration through SQL. `default` is usually one of them, as is the operator account on an operator-managed cluster.

Change those in the server configuration instead.

### Permission denied on a table the user should see

Check View Grants first. Common causes are a privilege granted on a different database, a grant that covers some tables but not this one, or a role that was never activated.

Remember that a database-level grant covers tables made later, but a table-level grant does not cover a new table.

### A grant worked but the user still cannot connect

Connecting and having privileges are different things. Check the host restriction and the expiry. Either one refuses a connection, whatever the account may do once inside.

### Changes seem to apply and then revert

On a cluster without replicated access storage, a load balancer can send consecutive statements to different nodes. A change you make on one node is genuinely not on another.

`ON CLUSTER` solves this. CHOps warns about it on a Kubernetes cluster, because that arrangement makes it likely.

### I dropped a role and people lost access

This is expected. A role's privileges belong to the role, so removing the role removes them from everyone that held it.

Make the role again and grant it again, or grant the privileges directly as a temporary measure.

---

## Related pages

- [User Management](admin.md#user-management) for CHOps's own accounts, which are not related to these
- [SQL Editor](sql-editor.md) to run access statements by hand
- [Session Log](logs.md#session-log) to audit who connected
- [The Kubernetes Page](kubernetes-page.md) for why CHOps recommends `ON CLUSTER` on an operator-managed cluster
