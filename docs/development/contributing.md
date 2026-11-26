# Contributing

Thank you for your interest in CHOps. We are grateful that you want to help make it better.

CHOps is open source under the Apache License 2.0, and we develop it in public. We want it to become a community project over time.

## Code contributions and the CLA

We accept code contributions (pull requests) through a Contributor License Agreement (CLA). You keep the copyright in your work. The CLA lets us ship your contribution in the open-source core and in the commercial Pro edition. Read the full [CLA](https://github.com/Quantrail-Data/CH-Ops/blob/main/CLA.md) before you accept it.

When you open your first pull request, the CLA Assistant bot adds a comment and asks you to accept the CLA. Once you accept it, the bot records your acceptance and the CLA check on your pull request passes. You only do this once, and the bot does not ask again for pull requests from the same account unless we change the CLA terms.

The CLA check is mandatory on the main branch, so we cannot merge a pull request until you accept the CLA. This protects you and the project, and it keeps the license clear for everyone involved.

## Other ways to help

You can also help without code. We are grateful for this help, and it shapes the future of CHOps.

**Bug reports.** If something does not work as you expect, please tell us. A good bug report includes:

- Your CHOps version
- Your ClickHouse&reg; database version
- Clear steps to reproduce the problem, and the result that you expected

**Feature requests.** If you want CHOps to do something new, please tell us. Describe the problem that you want to solve, or the workflow that you have in mind. We read every request. Many of the best features come from people who tell us what they need in their daily work.

Open a bug report or a feature request as an issue in our repository at [github.com/Quantrail-Data/CH-Ops](https://github.com/Quantrail-Data/CH-Ops). We read all issues, and your input directly shapes the roadmap.

## Set up a development environment

Because CHOps uses the Apache License 2.0, you can run and change your own copy. We test CHOps with Bun 1.4.4. To set up a development environment:

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
cp .env.example .env
# In .env, set SUPER_ADMIN_1, SUPER_ADMIN_1_PASSWORD,
# SUPER_ADMIN_1_EMAIL, and ENCRYPTION_SECRET.
bun install
bun run db:migrate
bun run dev
```

The `dev` command starts the backend on port 7720 and the frontend development server on port 7721. Open `http://localhost:7721`. When you edit the code, the servers reload automatically. After you sign in, add your test cluster in **Control panel > Cluster Management**. To set up a local ClickHouse&reg; cluster for tests, see [Setting Up a Test Cluster](test-cluster-setup.md). Before you open a pull request, run `bun run test`, `bun run lint`, and `bun run check:sensitive-logging`. See [Testing](testing.md).

## Versions

`version.json` at the project root holds the version of CHOps:

```json
{
  "version": "2.0.1",
  "channel": "beta"
}
```

- `version` is `MAJOR.MINOR.BUGFIX`, for example `2.0.1`.
- `channel` is `alpha`, `beta` or `stable`.

The app shows both, for example `v2.0.1 - beta`. In local development the app shows the branch and the commit in place of the version, for example `testing-1fbaae8 - beta`.

**Every pull request to `main` must have a newer version.** The "Version Check" workflow compares `version.json` with the one on `main`. A version is newer when a number is higher. For the same numbers, `beta` is newer than `alpha`, and `stable` is newer than `beta`. For example, after `2.0.0 - beta` you can use `2.0.0 - stable` or `2.0.1 - beta`, but not `2.0.0 - beta` again. To check on your computer:

```bash
git fetch origin main
git show origin/main:version.json > /tmp/main-version.json
bun scripts/check-version-bump.mjs /tmp/main-version.json
```

The release pipeline uses the same file for the git tag and the Docker image tags:

| Channel | Git tag | Docker image tags |
|---|---|---|
| `stable` | `v2.0.1` | `2.0.1`, `2.0`, `2`, `latest` |
| `beta` | `v2.0.1-beta` | `2.0.1-beta`, `beta` |
| `alpha` | `v2.0.1-alpha` | `2.0.1-alpha`, `alpha` |

An `alpha` or `beta` release is a GitHub pre-release, and it never changes the `latest` image.

Thank you again for your help. We are glad that you are here.