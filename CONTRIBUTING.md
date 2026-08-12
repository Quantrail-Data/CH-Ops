# Contributing to CHOps

Thanks for considering a contribution. CHOps is built by and for people who run
ClickHouse® clusters, and the project is better for every bug report, feature
idea, and patch that comes from someone using it in anger.

This guide covers how to get set up, what we're looking for, and how a change
makes its way from your fork to a release.

## Ways to contribute

You don't need to write code to help.

- **Report a bug.** Open an issue with the bug report template.
- **Request a feature.** Tell us the problem you hit, not just the fix you have
  in mind.
- **Improve the docs.** Corrections to anything under `docs/` are always welcome.
- **Write code.** Bug fixes, new ClickHouse® system-table coverage, chart types,
  export formats, and editor improvements are all good places to start. Issues
  tagged `good first issue` and `help wanted` are curated for newcomers.

Bug reports and feature requests need no agreement. Code contributions require a
one-time CLA, described below.

## Sign the CLA

Before your first pull request can be merged, you sign the
[Contributor License Agreement](CLA.md). A bot prompts you on the pull request,
and signing takes one comment. You do it once.

CHOps is dual licensed: the public core under the AGPLv3, and a commercial
licence for organisations that cannot take copyleft. The CLA lets us keep
offering both. You retain copyright in your work; you grant us the right to ship
it under either licence. If your employer owns what you write, they sign the
[Corporate CLA](CLA-CORPORATE.md) instead of you signing individually.

## What is in scope

CHOps follows an open-core model. The features below are reserved for the
commercial Pro edition, which funds full-time work on the core, and we will
decline pull requests that reimplement them in the open core:

- Audit logging
- Scheduled reports
- Extended alerting: escalation policies, on-call routing, and channels beyond
  email
- Multi-cluster fleet management
- Scheduled archival to S3-compatible storage

The rule of thumb is **doing a thing** versus **doing it on a schedule, across a
fleet, with a retained record**. The first is core; the second is Pro. When in
doubt, open an issue before you write code and we'll tell you which side your
idea falls on, quickly and honestly.

## Making a change

Fork the repository, make your change on a branch, and test it locally before
opening a pull request. The README covers how to run CHOps for development.

## Before you open a pull request

Run the checks CI will run:

```bash
bun run test                     # backend and frontend suites
bun run lint
bun run check:sensitive-logging  # blocks credentials reaching logs
```

A reviewer will expect:

- **A test for every bug fix**, one that fails before your change and passes
  after.
- **Nothing sensitive in logs or errors.** Credentials, tokens, and raw upstream
  responses must not reach the console or an API error body. The
  `check:sensitive-logging` script enforces this and CI fails on it.
- **Read paths stay read-only.** They must keep passing ClickHouse®'s own
  `readonly=1` setting rather than relying on a regex over the SQL.
- **Parameterised queries.** Anything reaching ClickHouse® goes through the
  existing parameter path, never string concatenation.
- **Trademark-safe naming.** See [TRADEMARKS.md](TRADEMARKS.md) before naming
  anything that touches ClickHouse®, Altinity®, or Kubernetes®.
- **A licence header** on new files: `SPDX-License-Identifier: AGPL-3.0-or-later`.

Keep each pull request to one concern. A fix bundled with a refactor is hard to
review and hard to revert.

## The pull request process

1. For anything beyond a small fix, open an issue first so we can agree on the
   approach before you invest time.
2. Branch from `main` and push to your fork.
3. Open the pull request and sign the CLA when the bot asks.
4. CI runs the tests, the linter, and the checks above. All must pass.
5. A maintainer reviews. We aim to respond within five working days.

Write a clear commit message: a short imperative subject line, and a body
explaining *why* where the reason isn't obvious.

## Reporting a bug

Open an issue using the bug report template and include your CHOps version, your
ClickHouse® server version, how you deployed it, and the steps to reproduce.

**Security vulnerabilities do not go in public issues.** Follow
[SECURITY.md](SECURITY.md) instead.

## Code of conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). In short:
respect others.
