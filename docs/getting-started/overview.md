# CHOps

CHOps is a web-based dashboard for managing ClickHouse® database clusters. It gives you a visual interface to run SQL queries, monitor performance, set up alerts, manage users and permissions, and handle backups, all from your browser.

## What Can CHOps Do?

- **Run SQL queries**: A built-in SQL editor with autocomplete, syntax highlighting, and visual EXPLAIN plans
- **Monitor your cluster**: Real-time charts showing CPU, memory, disk, network, queries, and more
- **Build custom dashboards**: Create your own charts and arrange them in drag-and-drop dashboards
- **Set up alerts**: Write SQL-based alert rules that notify you via Email
- **Manage access control**: Create and manage ClickHouse® users, roles, and settings profiles through a visual interface
- **Handle backups**: Back up and restore databases to/from S3 cloud storage
- **Manage CHOps users**: Add team members with one of four permission levels (super admin, admin, editor, or readonly)
- **Manage cluster nodes**: Configure up to 3 clusters with a combined maximum of 18 ClickHouse® nodes, test connections, and switch between them

## Tech Stack

CHOps is built with:
- **Frontend**: React (for the user interface)
- **Backend**: Bun + Express.js (for the server)
- **Database**: SQLite via Drizzle ORM (for storing CHOps settings, users, and alerts)
- **Charts**: Apache ECharts (for all graphs and visualizations)

## Next Steps

- [Installation](getting-started/installation.md) - How to set up CHOps
- [Configuration](getting-started/configuration.md) - How to configure environment variables
