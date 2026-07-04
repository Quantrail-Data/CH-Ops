-- CHOps ClickHouse® User Setup (Full App Access)
--
-- Creates the dedicated ClickHouse® user 'chops' for the CHOps app connection,
-- with every privilege the app needs. Run as a ClickHouse® admin.
-- The SQL Editor uses its OWN separate creds, so nothing here is for it.
--
-- Replace 'your_secure_password' with a strong password.

-- Create the user
CREATE USER IF NOT EXISTS chops
  IDENTIFIED BY 'your_secure_password'
  DEFAULT DATABASE default;

-- Read everything: system tables (monitoring/logs/cluster/RBAC pages) AND user
-- data (Chart Builder, Dashboards, Schema Studio, Query Comparison, Archival).
GRANT SELECT ON *.* TO chops;

-- SHOW commands (SHOW CREATE TABLE, SHOW DATABASES, etc.)
GRANT SHOW ON *.* TO chops;

-- Kill running queries (Overview > Current Queries)
GRANT KILL QUERY ON *.* TO chops;

-- Scheduled Archival to S3 (s3() read/write)
GRANT S3 ON *.* TO chops;

-- Native Backup / Restore
GRANT BACKUP ON *.* TO chops;

-- RBAC user/role/profile management (Access Control pages)
-- POWERFUL: lets chops manage and potentially escalate any user/role.
GRANT ACCESS MANAGEMENT ON *.* TO chops;

-- Index and projection management (Indexes section)
GRANT ALTER INDEX ON *.* TO chops;
GRANT ALTER PROJECTION ON *.* TO chops;

-- Verify
SHOW GRANTS FOR chops;
