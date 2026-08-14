CREATE ROLE IF NOT EXISTS chops_admin;

GRANT SELECT ON *.* TO chops_admin;
GRANT SHOW ON *.* TO chops_admin;
GRANT KILL QUERY ON *.* TO chops_admin;
GRANT INTROSPECTION ON *.* TO chops_admin;
GRANT BACKUP ON *.* TO chops_admin;
GRANT ACCESS MANAGEMENT ON *.* TO chops_admin;
GRANT ALTER INDEX ON *.* TO chops_admin;
GRANT ALTER PROJECTION ON *.* TO chops_admin;

CREATE USER IF NOT EXISTS chops IDENTIFIED BY 'your_secure_password';
GRANT chops_admin TO chops;
SET DEFAULT ROLE ALL TO chops;
ALTER USER chops SETTINGS allow_introspection_functions = 1;

SHOW GRANTS FOR chops;
