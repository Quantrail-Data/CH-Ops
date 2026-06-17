# Database Schema

CHOps uses Drizzle ORM with bun:sqlite. The schema is defined in `src/backend/db/schema.js` using plain JavaScript (no codegen).

## Tables

### app_setting
Key-value store for application configuration.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| key | TEXT UNIQUE | Setting key |
| value | TEXT | Setting value |
| category | TEXT | Grouping category |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |

### alert_rule
SQL-based alert definitions with cron scheduling.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Rule name |
| description | TEXT | Optional description |
| sql | TEXT | SQL query (must return single value) |
| threshold | REAL | Threshold value |
| operator | TEXT | gt, gte, lt, lte, eq, neq |
| severity | TEXT | info, warning, critical |
| schedule | TEXT | Cron expression |
| enabled | INTEGER/BOOL | Active flag |
| is_active | INTEGER/BOOL | Currently firing |
| last_run_at | TEXT | Last evaluation time |
| last_value | REAL | Last query result |
| last_status | TEXT | ok, firing, error |
| last_error | TEXT | Last error message |
| nodes | TEXT | JSON array of target node hostnames (null = all nodes) |
| cluster_id | TEXT | Which cluster to run this alert on (null = first cluster) |

### alert_channel
Notification channel configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Channel name |
| type | TEXT | email
| config | TEXT (JSON) | Channel-specific configuration |
| enabled | INTEGER/BOOL | Active flag |
| last_test_at | TEXT | Last test timestamp |
| last_test_ok | INTEGER/BOOL | Test result |
| last_test_error | TEXT | Test error |

### alert_rule_channel
Many-to-many junction. Cascading deletes on both sides.

### dashboard (v4)
Custom dashboard definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Dashboard name |
| columns | INTEGER | Grid column count (1-4) |

### chart (v4)
Custom chart definitions linked to dashboards.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Chart name |
| dashboard_id | INTEGER FK | References dashboard (SET NULL on delete) |
| grid_row | INTEGER | Row position in grid |
| grid_col | INTEGER | Column position in grid |
| sql_query | TEXT | SQL to execute |
| chart_type | TEXT | bar, line, pie, scatter, etc. |
| chart_subtype | TEXT | simple_bar, donut, area_line, etc. |
| config | TEXT (JSON) | Column-to-field mapping |


## PostgreSQL Migration

Change 2 lines to switch from SQLite to PostgreSQL:
1. `schema.js`: `import { sqliteTable } from 'drizzle-orm/sqlite-core'` -> `import { pgTable } from 'drizzle-orm/pg-core'`
2. `db/index.js`: `drizzle(bunSqlite)` -> `drizzle(pgPool)`

### app_user
CHOps user accounts with role-based access control.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| username | TEXT UNIQUE | Login username |
| password_hash | TEXT | Argon2id hash |
| role | TEXT | superadmin, admin, editor, readonly (default: readonly) |
| email | TEXT | Optional email for password notifications |
| must_change_password | INTEGER/BOOL | Forces password change on next login |
| last_login_at | TEXT | Timestamp of last login |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |
