# CHOps

CHOps is a web-based dashboard for the ClickHouse&reg; database. It gives you a visual interface to run SQL, monitor performance, set alerts, manage users and permissions, and handle backups. You do all of this from your browser.

## What can CHOps do?

CHOps brings the daily work of running ClickHouse&reg; into one place. You do it visually, not from the command line. It helps you with these tasks:

- **Run SQL queries** in a built-in editor. The editor has autocomplete, syntax highlighting, and visual diagrams of the query plan.
- **Monitor your cluster** with real-time charts for CPU, memory, disk, network, queries, and more.
- **Build custom dashboards.** Make your own charts and arrange them with drag-and-drop.
- **Set alerts** as SQL rules. CHOps emails you when a threshold is crossed.
- **Manage access control.** Make and change ClickHouse&reg; users, roles, and settings profiles in a visual interface.
- **Handle backups.** Back up and restore databases to and from S3 storage.
- **Manage CHOps users.** Add team members. Each member has one of four roles: super admin, admin, editor, or readonly.
- **Manage cluster nodes.** Configure up to 3 clusters, with a combined maximum of 18 ClickHouse&reg; nodes. Test connections and switch between them.

## Tech stack

CHOps is built with:

- **Frontend**: React
- **Backend**: Bun and Express.js
- **Database**: SQLite through Drizzle ORM, for CHOps settings, users, and alerts
- **Charts**: Apache ECharts

## Next steps

- [Installation](getting-started/installation.md): how to set up CHOps.
- [Configuration](getting-started/configuration.md): how to set environment variables.
