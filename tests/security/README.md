# Security tests

These tests start the real CHOps server with a temporary database and a fake ClickHouse
(see `harness.js`). Then they call the API as each role: readonly, editor, admin and superadmin.

Rules:

1. Do not use `mock.module` in this folder. A mock can hide a security hole.
2. Each security fix adds a test here that fails before the fix and passes after it.
3. A new API route must be added to `EXPECTED_GUARDS` in `routeGuards.test.js`, with its role check.
4. Assert what a client sees: the HTTP status, and that a secret is not in the response text.

Run them with `bun test tests/security`. They are part of `bun run test:backend`.