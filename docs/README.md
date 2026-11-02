# CHOps Documentation

CHOps is a web-based administration and monitoring dashboard for ClickHouse&reg; clusters. Database administrators use one interface to monitor cluster health, analyze queries, manage access control, examine logs, and set alerts.

## What CHOps does

CHOps connects to your ClickHouse&reg; cluster through the HTTP interface and gives you these capabilities:

- Real-time cluster health monitoring with automatic refresh
- Kubernetes insights for clusters that run under the Altinity&reg; Kubernetes Operator for ClickHouse&reg; (AKOC) or the official ClickHouse&reg; Kubernetes Operator (OCKO)
- Query management: running queries, analytics, and query-log search
- Deep query analysis: a flame-graph query profiler, a processors pipeline view, per-query metric timelines, and side-by-side query comparison
- Table and part inspection with compression statistics
- Merge, mutation, replication, and ingestion queue monitoring
- A full SQL editor with autocomplete, syntax highlighting, a database explorer, and saved queries for each user
- Schema tools: a schema visualizer, a guided table designer (Schema Studio), data-skipping indexes, and projections
- Qurioz, an assistant that turns natural language into SQL
- Log viewers for crash, error, text, and session logs, with datetime filters
- Monitoring dashboards for queries, CPU, memory, disk, network, and more, with playback and a memory-allocator view
- SQL-based alerts with cron schedules, a separate state for each node, and notifications by email, Slack, Google Chat, Microsoft Teams, or PagerDuty
- Role-based access-control management with visual grant trees
- Backup storage-profile configuration and data-lifecycle management
- CHOps user management with four roles, one-time password setup links, and a system email server

## Requirements

- Bun 1.4.2. We test CHOps with this version.
- A ClickHouse&reg; cluster, version 26.3 or newer, that you can reach over HTTP (port 8123 by default)
- A modern web browser (Chrome, Firefox, Safari, or Edge)

## Quick start

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

Open http://localhost:5173 in your browser. Sign in with the super-admin user name and password that you set in `.env`. Then add your ClickHouse&reg; cluster in **Control panel > Cluster Management**.

The documentation is at http://localhost:5173/docs/ in development, and at http://localhost:3000/docs/ in production.

## License

CHOps follows an open-core model. The community edition uses the **Apache License 2.0**. You can use, change, and self-host it free of charge. A separate **Pro edition** adds audit logging, scheduled email reports, extended alerting, multi-cluster fleet management, and scheduled archival to S3-compatible storage, under a commercial license. See [ch-ops.io](https://ch-ops.io) for more information, and the `LICENSE` file for the full terms of the Apache License 2.0.

Copyright &copy; 2026 Quantrail&trade; Data Private Limited.

---

## Trademarks

ClickHouse&reg; is a registered trademark of ClickHouse, Inc. All references to the ClickHouse&reg; mark in this documentation refer to the ClickHouse&reg; database management system (the open-source server software and its protocol). We use the mark only for identification and description, under nominative fair use. Where we refer to the company, we write "ClickHouse, Inc." Altinity&reg; is a registered trademark of Altinity, Inc. CHOps is an independent project of Quantrail&trade; Data Private Limited. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with ClickHouse, Inc. or Altinity, Inc. All other trademarks are the property of their owners.