# Contributing

CHOps is open source under AGPLv3. We are not accepting external code contributions (pull requests) yet: before we can merge community code, we need a Contributor License Agreement (CLA) in place, and we are still preparing it. Pull requests opened in the meantime may be closed without review, not because the work is unwelcome, but because we cannot legally incorporate it until the CLA exists.

What we welcome right now: **bug reports** and **feature requests**. Open an issue with your CHOps version (from `version.json`), your ClickHouse® database version, and clear steps to reproduce or a description of the use case. Once the CLA is ready, we will update this page with full contribution guidelines and open the project to pull requests.

The sections below document the development setup and code standards for when contributions open, and for anyone maintaining a fork under the AGPLv3.

## Development Setup

```bash
git clone https://github.com/quantrail/chops.git
cd chops
cp .env.example .env
# Edit .env with your test cluster credentials
bun install
bun run db:migrate
bun run dev
```

The dev command starts both the backend (port 3000) and the Vite frontend dev server (port 5173) with hot module replacement.

## Code Standards

- Standard JavaScript. No TypeScript.
- Function and variable names should be intuitive and self-documenting.
- Minimal but necessary comments. Do not over-comment.
- Every function should have unit tests. Pull requests accepted only if all tests pass.
- Open source dependencies only (MIT, BSD, or Apache 2.0 licenses).
- Pin all dependency versions in `package.json` (no `^` or `~` prefixes, except react-router-dom).
- Use Tabler Icons exclusively. No other icon libraries.
- No emojis in the UI or code comments.

## Version Management

The app version lives in `version.json` at the project root. When releasing:

1. Update `version.json` fields (`major`, `minor`, `patch`, and the computed `version` string).
2. If targeting a new ClickHouse® release, update `clickhouseVersion`.
3. The `package.json` version should match `version.json`'s `version` field.

## Frontend Guidelines

- React with React Context for state management. No Redux or external state libraries.
- CSS custom properties from `global.css` for all colors and spacing.
- Font variables: `--font-ui` for text, `--font-table` for data, `--font-code` for SQL/code, `--font-card` for stat cards, `--font-chart` for chart axes.
- All datetime inputs use the DateTimePicker component with 24-hour format.
- All charts use the registered ECharts themes (`chadmin-light`, `chadmin-dark`) via `initChart()`.
- All ClickHouse® queries go through `runQuery()` from `utils/api.js`.

## Backend Guidelines

- Express 5 for HTTP routing.
- Drizzle ORM with bun:sqlite for database operations. Schema defined in plain JS.
- Protect all non-auth API routes with the JWT middleware.
- Return ClickHouse® errors verbatim to the frontend for transparency.
- Routes are thin routers. All logic goes in controllers.

## Pull Request Process

1. Fork the repository and create a feature branch.
2. Write or update unit tests for your changes.
3. Run `bun run test` and ensure all tests pass (backend + frontend).
4. Submit a pull request with a clear description of the changes.
