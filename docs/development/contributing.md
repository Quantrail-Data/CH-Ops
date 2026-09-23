# Contributing

Thank you for your interest in CHOps. We are grateful that you want to help make it better.

CHOps is open source under the Apache License 2.0, and we develop it in public. We want it to become a community project over time.

## Code contributions and the CLA

We accept code contributions (pull requests) through a Contributor License Agreement (CLA). You keep the copyright in your work. The CLA lets us ship your contribution in the open-source core and in the commercial Pro edition. Read the full [CLA](https://github.com/Quantrail-Data/CH-Ops/blob/main/CLA.md) before you accept it.

When you open your first pull request, the CLA Assistant bot adds a comment and asks you to accept the CLA. When you accept it, the bot records your acceptance, and the CLA check on your pull request passes. You do this one time only. The bot does not ask again for pull requests from the same account, unless we change the CLA terms.

The CLA check is mandatory on the main branch. Thus, we cannot merge a pull request until you accept the CLA. This protects you and the project, and it keeps the license clear for all persons involved.

## Other ways to help

You can also help without code. We are grateful for this help, and it has an effect on the future of CHOps.

**Bug reports.** If something does not operate as you expect, please tell us. A good bug report includes:

- Your CHOps version
- Your ClickHouse&reg; database version
- Clear steps to reproduce the problem, and the result that you expected

**Feature requests.** If you want CHOps to do something new, please tell us. Describe the problem that you want to solve, or the workflow that you have in mind. We examine all requests. Many of the best features come from people who tell us what they need in their daily work.

Open a bug report or a feature request as an issue in our repository at [github.com/Quantrail-Data/CH-Ops](https://github.com/Quantrail-Data/CH-Ops). We read all issues, and your input has a direct effect on the roadmap.

## Set up a development environment

CHOps uses the Apache License 2.0. Thus, you can run and change your own copy. We test CHOps with Bun 1.4.2. To set up a development environment:

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

The `dev` command starts the backend and the frontend development server. When you edit the code, the servers reload automatically. After you sign in, add your test cluster in **Administration > Cluster Management**. To set up a local ClickHouse&reg; cluster for tests, see [Setting Up a Test Cluster](test-cluster-setup.md).

Thank you again for your help. We are glad that you are here.