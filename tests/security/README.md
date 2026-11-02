# Security tests

These tests start the real CHOps server with a temporary database and a fake ClickHouse
(see `harness.js`). Then they call the API as each role: readonly, editor, admin and superadmin.

The server and the tests must use the same `data/crypto.salt` in the repository root.
If the file does not exist, run `bun run dev:backend` one time to make it.

Rules:

1. Do not use `mock.module` in this folder. A mock can hide a security hole.
2. Each security fix adds a test here. The test fails without the fix and passes with it.
3. When you add an API route, add it to `EXPECTED_GUARDS` in `routeGuards.test.js`, with its role check.
4. Assert what a client sees: the HTTP status, and that a secret is not in the response text.

Run them with `bun test tests/security`. They are part of `bun run test:backend`.