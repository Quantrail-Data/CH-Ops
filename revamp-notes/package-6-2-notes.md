# CHOps 2.0 UI revamp: package 6.2 (your 6.1 feedback and safe database migrations)

Base: package 6.1 (`06952d2`) on branch `tailwind_shadcn_magicui`. This zip is the full repo with packages 2 to 6.2; the last commit is `3f958c2`.

Run `bun install` first.

## UI fixes

| Point | Change |
|---|---|
| 1. Login: empty space in the middle | Both sides are in one group (at most 1240 px wide) in the middle of the window, centered vertically. The logo is above the sign-in card. Narrower than 1100 px: only the logo and the card. |
| 2. Login details not saved by the browser | The fields have `name` and `id`, and the form has `method="post"`, so the browser finds the login form. After a successful login, the app asks the browser to save the details (Chrome and Edge: `PasswordCredential`; other browsers use the field names). I could not test the save prompt: my test browser has no user profile. |
| 3. Forms do not use the width | Text fields grow to fill the row. Dropdowns grow up to 16rem. Date and number fields keep their size. Check box lists (for example Error Type) use the full row. All search forms. |
| 4. Dot grid with the particles | The dot pattern on the empty states and the tree canvas is removed. Only the moving particles stay. |

## Database migrations

This is a backend change. You approved it as an exception to the revamp rule.

- `src/backend/db/migrations.js`: a numbered list of database changes. Migration 1 holds the steps that each start ran before, so it works on a database of any earlier version (tested with a 1.4.1 database).
- `src/backend/db/migrationRunner.js` runs the list:
  - `PRAGMA user_version` keeps the number of the last migration. Each migration runs once.
  - Before the first migration of an upgrade: a copy of the database and the encryption salt in `data/backups/pre-upgrade-schema-<old>-to-<new>-<time>.db` / `.salt`. The newest 5 are kept; other backups are never removed.
  - Each migration runs in a transaction that takes the write lock first, with its number saved in the same transaction. A failure leaves the database as it was and stops the start, with the migration number and the backup file.
  - A database from a newer version: the app does not start, with a message to install the newer version or restore the backup.
- Migration 1 ignores only "duplicate column name" and "no such table" errors for the added columns. Before, every error was ignored.
- The 3 repeated `ALTER` statements in `db/index.js` are removed. The one-time delete of the shared bookmarks list now runs one time only.
- `docs/development/database-migrations.md`: how to add a migration, the rules (add first, remove in a later release), the release steps, how to restore a backup.

**Bug found during the tests (it was in the code before):** when a second CHOps process started while the first one changed the database, the second one stopped at once with "database is locked ... The file exists but is not a SQLite database". Now each process waits up to 30 seconds for the lock, and the message for a locked database says what it is.

**Upgrade note:** the first start of 6.2 on an existing database makes a backup in `data/backups` and runs migration 1. The log shows both lines.

## Tests

- `bun run test` (with `.env`): all backend groups pass; 2185 frontend tests pass. `bun run lint`: 0 errors (the same 5 warnings). `bun run build` and `bun run check:bundle` (474 KB): pass.
- New: `tests/db/migrations.test.js` (12 tests, 6 runs in a row pass), with the sample `tests/db/fixtures/chops-1.4.1.db` made by the CHOps 1.4.1 migration script. `.gitignore` now allows `.db` files in `tests/db/fixtures`.
- New: `tests/frontend/search-form-layout.test.js`; Login tests for the layout and the password saving.
- Updated (same intent, the SQL moved to `migrations.js`): `tests/backend/dashboardFilters.test.js`, `tests/frontend/schema-routes.test.js`.
- Real server start: on a copy of the 1.4.1 sample (backup made, migration 1 ran, server ready), and on a database with a newer schema number (the server did not start, clear message).
- I did not run the full visual check or the memory gates again. The particles did not change. I checked the Login page (1000, 1440 and 2560 px, both themes) and 3 search forms by screenshots.

## What to check

**Prepare**
1. Unzip, copy your `.env` into `ch-ops`, run `bun install`.
2. Back up your `data` folder (`data/chops.db` and `data/crypto.salt`).
3. Run `bun run test`. Make sure that all tests pass.

**Database migration**
4. Run `bun run dev` with your existing `data` folder.
5. In the start log, make sure that you see "Database backup before the upgrade: ..." and "Database migration 1: ...".
6. Make sure that the file `data/backups/pre-upgrade-schema-0-to-1-<time>.db` and a `.salt` file of the same name exist.
7. Log in. Make sure that your users, alert rules, dashboards and clusters are there.
8. Stop and start again. Make sure that the log does not show the backup line or "Database migration 1" again.

**Login page**
9. Log out. Make sure that the two sides are close together in the middle of the window, and that the logo is above the card. Do this on your largest screen and on an HD screen.
10. Log in with a correct password. Make sure that the browser offers to save the password. Log out. Make sure that the browser fills in the details.
11. Make the window narrower than 1100 px. Make sure that only the logo and the card show.

**Search forms**
12. Open Error Log > Search on a wide screen. Make sure that the Error Message field grows to fill the row, and that the Error Type box uses the full width.
13. Do the same on Session Log, Text Log, Crash Log and Queries > Query Log.
14. Make the window narrower. Make sure that the fields wrap to the next line and do not overlap.

**Background**
15. Open a page with an empty state (for example Error Log before a search) and a tree (DB RBAC > View Grants, select a user). Make sure that there is no dot grid, only the moving particles.
