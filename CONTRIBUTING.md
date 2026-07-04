# Contributing

First of all, thank you for your interest in CHOps. The fact that you want to help make it better means a lot.

CHOps is open source under the GNU Affero General Public License v3.0 (AGPLv3), and we are building it in the open. We would love for this to grow into a community project over time.

## A Note on Code Contributions

We are not accepting external code contributions (pull requests) just yet, and we want to be upfront about why.

CHOps is still in its early days. Before we can responsibly merge code from the community, we need a Contributor License Agreement (CLA) in place, and we have not finalized one yet. We would rather take the time to get it right than rush something out. Until it is ready, any pull requests opened may be closed without review. Please know that this is not a reflection on your work. It is simply that we are not yet in a position to incorporate outside code in a way that is fair and clear for everyone involved.

Once the CLA is in place, we will update this page with full contribution guidelines and open the project up to pull requests. We are genuinely looking forward to that.

## What We Warmly Welcome Right Now

While code contributions are on hold, there is a lot you can do that we truly appreciate, and that genuinely shapes where CHOps goes next:

**Bug reports.** If something is not working the way you expect, please tell us. A good bug report includes:

- Your CHOps version
- Your ClickHouse® database version
- Clear steps to reproduce the problem, and what you expected to happen instead

**Feature requests.** If there is something you wish CHOps could do, we want to hear it. Describe the problem you are trying to solve or the workflow you have in mind, and we will take it seriously. Many of the best features come from people telling us what they actually need day to day.

You can open a bug report or feature request as an issue on our repository at [github.com/Quantrail-Data/CH-Ops](https://github.com/Quantrail-Data/CH-Ops). Every issue is read, and your input directly influences the roadmap.

## If You Maintain a Fork

Because CHOps is licensed under the AGPLv3, you are free to run and modify your own copy. If you are doing that, here is how to get a development environment up and running:

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
cp .env.example .env
# Edit .env with your test cluster credentials
bun install
bun run db:migrate
bun run dev
```

The dev command starts both the backend and the frontend development server, with changes reloading automatically as you edit.

Whatever brought you to this page, thank you again. We are glad you are here, and we hope to open the door to code contributions before long.
