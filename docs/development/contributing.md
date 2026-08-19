# Contributing

Thank you for your interest in CHOps. The fact that you want to help make it better means a lot.

CHOps is open source under the GNU Affero General Public License v3.0 (AGPLv3), and we build it in the open. We would like this to grow into a community project over time.

## Code contributions and the CLA

We accept code contributions (pull requests) through a Contributor License Agreement (CLA).

The first time you open a pull request, the CLA Assistant bot comments on it and asks you to accept the CLA. Once you accept, your acceptance is recorded and the CLA check on your pull request passes. You only do this once. After that, future pull requests from the same account do not ask again.

Because the CLA check is required on the main branch, a pull request cannot be merged until the CLA is accepted. This protects both you and the project, and keeps the license clear for everyone involved.

## What we warmly welcome

Alongside code, there is a lot you can do that we truly appreciate, and that shapes where CHOps goes next.

**Bug reports.** If something does not work the way you expect, please tell us. A good bug report includes:

- Your CHOps version
- Your ClickHouse&reg; database version
- Clear steps to reproduce the problem, and what you expected to happen instead

**Feature requests.** If there is something you wish CHOps could do, we want to hear it. Describe the problem you are trying to solve, or the workflow you have in mind, and we will take it seriously. Many of the best features come from people who tell us what they actually need day to day.

Open a bug report or feature request as an issue on our repository at [github.com/Quantrail-Data/CH-Ops](https://github.com/Quantrail-Data/CH-Ops). Every issue is read, and your input directly influences the roadmap.

## Setting up a development environment

Because CHOps is licensed under the AGPLv3, you are free to run and modify your own copy. To get a development environment up and running:

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
cp .env.example .env
# Edit .env with your test cluster credentials
bun install
bun run db:migrate
bun run dev
```

The `dev` command starts both the backend and the frontend development server, with changes that reload automatically as you edit. To set up a local ClickHouse&reg; cluster to test against, see [Setting Up a Test Cluster](test-cluster-setup.md).

Whatever brought you to this page, thank you again. We are glad you are here.
