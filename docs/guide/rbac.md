# Database RBAC

This section manages ClickHouse®'s own users, roles and settings profiles: who
may connect to your database, what they may read and write, and what limits
apply to their queries.

Four pages: [View Grants](#view-grants), [Users](#users), [Roles](#roles) and
[Settings Profiles](#settings-profiles). Every action previews the SQL before it
runs.

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

The most common confusion, worth settling before anything else.

**CHOps users** are accounts for CHOps itself: who can log into this interface
and what they may do here. They live in CHOps's own database and are managed
under [Control Panel, User Management](admin.md#user-management).

**ClickHouse® users** are accounts on your database server: who may connect and
what data they may touch. They live in ClickHouse® and are managed here.

They are unrelated. A CHOps administrator is not automatically a ClickHouse®
administrator, and creating a user here does not let anyone log into CHOps.

| Question | Where |
|---|---|
| Who can open CHOps | [User Management](admin.md#user-management) |
| Who can connect to the database | This section |
| Who can drop a table | This section |
| Who can add a cluster to CHOps | [User Management](admin.md#user-management) |

---

## 2. Where ClickHouse stores access

Worth knowing, because it decides whether a user you create exists on one server
or all of them.

ClickHouse® has two ways of holding users and roles.

**Local directory**, the default. Each server keeps its own copy. Create a user
on one node and it exists only there.

**Replicated access storage**, which must be configured. Users and roles are
coordinated through Keeper and exist across the cluster automatically.

### Why it matters

On a cluster using local storage, creating a user without `ON CLUSTER` produces
a user that works on the node you happened to be connected to and nowhere else.
Everything looks fine until a query lands on a different replica.

That failure is confusing because it is intermittent: it depends which node the
connection reached.

**On a Kubernetes cluster**, CHOps checks this and shows a banner on these
screens when `ON CLUSTER` is advisable, so you do not have to remember which
storage your cluster uses.

There is also a third category. Users defined in the server's XML configuration,
including `default` and the operator's own account, are read-only here. They are
not managed through SQL, so they cannot be altered from this interface.

---

## 3. ON CLUSTER

Every create, alter, grant and drop offers an `ON CLUSTER` option, which runs the
statement on every node rather than just the one you are connected to.

**Use it whenever your cluster has more than one node and you are not certain
access is replicated.** Applying to all nodes when it was already replicated is
harmless. Not applying when it was needed leaves the cluster inconsistent.

An inconsistent cluster is the worst outcome here, because it works most of the
time. A user exists on three nodes out of four, and one connection in four
fails.

### On a Kubernetes cluster

CHOps reads the cluster's access configuration and turns the option on by
default where it should be, with a banner explaining why. The banner appears
only when it is actually relevant.

You can still turn it off, in the rare case where a change really is meant for
one node.

---

## View Grants

A read-only view of who has what.

Grants appear as a tree you expand: from grantee, to database, to table, to the
privileges held.

### How to use it

**Before changing anything.** Look at what a user already has before granting
more. Duplicated grants are harmless but they make the picture harder to read
later.

**When someone reports a permission error.** Find them here first. It is faster
than reading the error, and it shows what they do have as well as what they do
not.

**During a review.** Expanding everything gives you the full picture, which is
what an auditor asks for.

### Reading the tree

Privileges granted at a database level cover every table in it, including tables
created later. That is convenient and it is also how people end up with more
access than intended.

A privilege granted through a role appears under the role, not under each user
holding it. If a user seems to have fewer privileges than they clearly do, check
their roles.

---

## Users

Manages ClickHouse® accounts. Five tabs, each previewing its SQL.

### List

The users that already exist.

### Create

Choose the authentication method and password, and optionally a default
database, a default role, the host addresses the account may connect from, and
an expiry time.

**The host restriction is a security control, not a convenience.** A user
restricted to a known address cannot be used from anywhere else even with the
correct password. It is one of the more effective things on this page.

**Valid Until** suits temporary access: a contractor, an investigation, a
migration. The account stops working on its own, which is more reliable than a
reminder to remove it.

**A default role** is applied automatically when the user connects, so they do
not have to activate it. Without one, a user granted a role may still find
themselves with no privileges until they use `SET ROLE`.

### Alter

The widest tab. Rename the user, reset authentication, add or drop permitted
hosts, add or drop settings and profiles, and change the expiry.

Resetting authentication is the tab to use when someone's password must change.

### Grant and Revoke

Give or take one specific privilege, on a database and table, with an optional
`ON CLUSTER`.

**Grant to roles rather than users** wherever you can. See
[section 8](#8-patterns-worth-adopting).

### Drop

Removes a user. You must type the username to confirm, which is deliberate: this
is not reversible and a mistyped name in a list is easy to click.

Dropping a user does not affect anything they created. Their tables remain.

---

## Roles

A role is a named bundle of privileges. Grant the role to people rather than
granting each privilege to each person.

The same five tabs as Users: **List**, **Create**, **Alter**, **Grant/Revoke**
and **Drop**.

**Create** names the role, with an optional `ON CLUSTER`.

**Alter** renames it and adds or drops attached settings and profiles, with
shortcuts to drop all settings or all profiles at once.

**Grant/Revoke** works exactly as it does for users.

**Drop** asks you to type the role name.

### Why roles are worth the extra step

Changing what a group can do becomes one edit rather than one per person.

More importantly, it makes access reviewable. "Which analysts can read the
finance database" is answerable by looking at one role. The same question across
forty individually granted users is not.

**Dropping a role removes its privileges from everyone holding it.** That is
usually what you want, and it is worth being certain about first.

---

## Settings Profiles

A settings profile is a reusable group of ClickHouse® settings applied to users
and roles: how much memory a query may use, whether someone may run DDL, how
long a query may run.

Four tabs: **Profiles**, **Create**, **Alter**, **Drop**.

Rather than facing hundreds of settings as one list, CHOps groups them into
collapsible sections. Open a group, set what you care about, leave the rest
alone.

| Group | Examples |
|---|---|
| Query Execution | max_threads, max_memory_usage, max_execution_time |
| Read Limits | max_rows_to_read, max_bytes_to_read, read_overflow_mode |
| Result Limits | max_result_rows, max_result_bytes, result_overflow_mode |
| JOIN | join_algorithm, join_overflow_mode, join_use_nulls |
| Permissions and Access | readonly, allow_ddl, allow_introspection_functions |
| Logging | log_queries, log_query_threads, log_comment |
| INSERT | max_insert_block_size, insert_quorum, async_insert |
| Networking and Timeouts | connect_timeout, receive_timeout, max_network_bandwidth |
| Distributed Queries | max_parallel_replicas, prefer_localhost_replica, skip_unavailable_shards |
| Merges and Mutations | background_pool_size, mutations_sync |
| Query Optimization | optimize_read_in_order, force_primary_key, optimize_move_to_prewhere |
| Data Formats | date_time_input_format, date_time_output_format, input_format_csv_delimiter |
| S3 and Cloud Storage | s3_max_connections, s3_truncate_on_insert |
| Advanced and Experimental | enable_filesystem_cache, flatten_nested, alter_sync |

Every setting uses its exact ClickHouse® name, so what you set matches the
official documentation. The form rejects invalid values, and a free-form field
takes any setting not shown in the groups, written as
`distributed_ddl_task_timeout=300, insert_quorum=2`.

**Alter** also adds or drops profiles attached to this one, and can drop all
settings or all profiles at once. **Drop** asks you to type the name.

### The settings that matter most

**`readonly`** is the blunt instrument. It stops a user modifying anything, and
it is the right starting point for an analyst account.

**`max_memory_usage`** is what stops one query taking down a server. Set it on
any profile used by people running exploratory queries.

**`max_execution_time`** stops a runaway query holding resources indefinitely.

**`allow_ddl`** decides whether a user may create or drop objects. Off for
anyone who does not need it.

Those four cover most of what a profile is for. The rest is tuning.

---

## 8. Patterns worth adopting

**Privileges on roles, roles on people.** Grant to a role, then grant the role.
The extra step pays back the first time someone joins or leaves.

**A profile per kind of user, not per person.** An analyst profile, an
application profile, an admin profile. Attach them to roles.

**Restrict hosts wherever you can.** An application account that only ever
connects from three known addresses should say so. It turns a leaked password
into a much smaller problem.

**Use Valid Until for anything temporary.** Access that expires on its own beats
access that relies on someone remembering.

**Review with View Grants periodically.** Access accumulates. Nobody notices
until someone asks who can read a table, and the answer takes an afternoon.

**Use ON CLUSTER unless you are certain you should not.** Applying to all nodes
when it was unnecessary costs nothing. The reverse leaves an inconsistent
cluster that fails intermittently.

---

## 9. When something does not work

### A user I created cannot connect from another node

Almost certainly access storage. The user exists on the node you were connected
to and nowhere else.

Recreate with `ON CLUSTER`, or configure replicated access storage so it stops
happening. See [section 2](#2-where-clickhouse-stores-access).

### A user has a role but no privileges

The role is granted but not active. Either set it as their default role, or have
them run `SET ROLE`.

Default role is the better fix, since it needs nothing from the user.

### I cannot alter the default user

Users defined in the server's XML configuration cannot be changed through SQL.
`default` is usually one of them, as is the operator's own account on an
operator-managed cluster.

Change those in the server configuration instead.

### Permission denied on a table the user should see

Check View Grants first. Common causes are a privilege granted on a different
database, a grant that covers some tables and not this one, or a role that was
never activated.

Remember that a database-level grant covers tables created afterwards, but a
table-level grant obviously does not cover a new table.

### A grant worked but the user still cannot connect

Connecting and having privileges are different. Check the host restriction and
the expiry, since either will refuse a connection regardless of what the account
is allowed to do once inside.

### Changes seem to apply and then revert

On a cluster without replicated access storage, connecting through a load
balancer means consecutive statements can reach different nodes. A change made
on one node genuinely is not on another.

`ON CLUSTER` solves this. CHOps warns about it on a Kubernetes cluster because
that arrangement makes it likely.

### I dropped a role and people lost access

Expected. A role's privileges belong to the role, so removing it removes them
from everyone who held it.

Recreate the role and re-grant it, or grant the privileges directly as an
interim measure.

---

## Related pages

- [User Management](admin.md#user-management) for CHOps's own accounts, which
  are unrelated to these
- [SQL Editor](sql-editor.md) for running access statements by hand
- [Session Log](logs.md#session-log) for auditing who actually connected
- [The Kubernetes Page](kubernetes-page.md) for why CHOps recommends
  `ON CLUSTER` on an operator-managed cluster
