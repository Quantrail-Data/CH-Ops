# CHOps

CHOps is a web-based dashboard for managing ClickHouse® database clusters. It gives you a visual interface to run SQL queries, monitor performance, set up alerts, manage users and permissions, and handle backups, all from your browser.

## What Can CHOps Do?

CHOps brings the everyday work of running ClickHouse® into one place, so you can do it visually instead of from the command line. Here is what it helps you with:

- **Run SQL queries** in a built-in editor with autocomplete, syntax highlighting, and visual diagrams of how a query will run.
- **Monitor your cluster** through real-time charts covering CPU, memory, disk, network, queries, and much more.
- **Build custom dashboards** by creating your own charts and arranging them however suits your team, with drag-and-drop.
- **Set up alerts** as SQL-based rules that email you when something needs attention.
- **Manage access control** by creating and adjusting ClickHouse® users, roles, and settings profiles through a visual interface.
- **Handle backups** by backing up and restoring databases to and from S3 cloud storage.
- **Manage CHOps users** by adding team members, each with one of four permission levels (super admin, admin, editor, or readonly).
- **Manage cluster nodes** by configuring up to 3 clusters with a combined maximum of 18 ClickHouse® nodes, testing connections, and switching between them.

## Tech Stack

CHOps is built with:
- **Frontend**: React (for the user interface)
- **Backend**: Bun + Express.js (for the server)
- **Database**: SQLite via Drizzle ORM (for storing CHOps settings, users, and alerts)
- **Charts**: Apache ECharts (for all graphs and visualizations)

## Next Steps

- [Installation](getting-started/installation.md) - How to set up CHOps
- [Configuration](getting-started/configuration.md) - How to configure environment variables
