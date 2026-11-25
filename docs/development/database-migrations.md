# Database migrations

CHOps keeps its own data (users, alert rules, dashboards, clusters, settings) in a SQLite file, `data/chops.db` (or `DB_PATH`). When a new version changes the tables, a numbered migration changes the database at start.

## How it works

- The migrations are in `src/backend/db/migrations.js`, numbered 1, 2, 3 ...
- The database keeps the number of the last migration that ran, in `PRAGMA user_version`. A new database has 0.
- At start, `src/backend/db/migrate.js` calls `runMigrations` (`src/backend/db/migrationRunner.js`). It runs only the migrations with a higher number, in order.
- Before the first migration of an upgrade, the database is copied to `<database folder>/backups/pre-upgrade-schema-<old>-to-<new>-<time>.db`, with the encryption salt (`.salt`). The newest 5 copies are kept. Other backups are never removed.
- Each migration runs in its own transaction, and its number is saved in the same transaction. If the migration fails, nothing of it stays, and the app does not start. The message gives the migration number and the backup file.
- The transaction takes the write lock first. If two copies of the app start at the same time, the second one waits, then sees that the migration already ran.
- If the database number is higher than the app knows (an older app on a newer database), the app does not start.

Migration 1 brings a database from any version before the numbered migrations (1.4.1 and earlier) to the first numbered schema.

## How to add a migration

1. Open `src/backend/db/migrations.js`.
2. Add an entry at the end of `MIGRATIONS`, with the next number:

   ```js
   {
     version: 2,
     description: "Add alert_rule.owner",
     up: (sqlite) => sqlite.exec("ALTER TABLE alert_rule ADD COLUMN owner TEXT"),
   },
   ```

3. Change `schema.js` (Drizzle) to match.
4. Add a test in `tests/db/migrations.test.js`: upgrade the sample database (`tests/db/fixtures/chops-1.4.1.db`) and check the change and the data.
5. Run `bun run test`.

## Rules

- **Never change or remove a migration after a release.** Databases that already ran it do not run it again. To correct a migration, add a new one.
- **The `up` function must be synchronous.** It runs inside a transaction; an `await` would end the transaction early.
- **Do not catch errors in `up`.** An error must stop the migration, so that the transaction rolls back.
- **Change the schema in two steps (add first, remove later):**

  | Change | Release N | Release N+1 or later |
  |---|---|---|
  | New column | Add it, with a default value or as nullable. | Nothing. |
  | Rename a column | Add the new column, copy the data, write to both. | Remove the old column. |
  | Remove a column | Stop using it in the code. | Remove it (SQLite: rebuild the table). |
  | Change a column type | Add a new column, copy and convert the data. | Remove the old column. |
  | New table | Add it. | Nothing. |

  Then the previous version still works on the new database, and a rollback by one version is safe.
- **A table rebuild** (SQLite cannot change a column in place): create the new table, copy the rows, drop the old table, rename the new one. All in the same `up` function.
- **Data changes** (for example a delete of an old setting) are migrations too, so that they run one time only.

## Sample databases

`tests/db/fixtures/chops-1.4.1.db` is a database made by CHOps 1.4.1, with a few rows. At each release, add a sample database made by that release (for example `chops-1.5.0.db`) and a test that upgrades it.

## Release steps

1. List the schema changes in the release notes.
2. Tell users that the app makes a backup at start, and where it is.
3. Write the rollback steps: stop the new version, restore the pre-upgrade backup (`.db` and `.salt`) to the database path, start the old version.
4. Docker and Kubernetes: run one copy of the app during the upgrade.

## Restore a pre-upgrade backup

1. Stop CHOps.
2. Copy `backups/pre-upgrade-schema-<old>-to-<new>-<time>.db` to the database path (`data/chops.db` or `DB_PATH`). Remove `chops.db-wal` and `chops.db-shm` if they exist.
3. Copy the `.salt` file of the same name to `data/crypto.salt`.
4. Start the CHOps version that made the backup, with the same `ENCRYPTION_SECRET`.
