# CHOps Documentation

CHOps is a web-based administration and monitoring dashboard for ClickHouse® clusters. It provides database administrators with a single interface for cluster health monitoring, query analysis, access control management, log inspection, and alerting.

## What CHOps Does

CHOps connects to your ClickHouse® cluster over the HTTP interface and provides the following capabilities:

- Real-time cluster health monitoring with automatic refresh
- Query management including running queries, analytics, and query log search
- Table and part inspection with compression statistics
- Merge, mutation, and replication queue monitoring
- A full SQL editor with autocomplete, syntax highlighting, and a database explorer
- Log viewers for crash, error, and text logs with datetime filtering
- Monitoring dashboards covering queries, CPU, memory, disk, network, and more
- SQL-based alerting with cron scheduling and multi-channel notifications
- Role-based access control management with visual grant trees
- Backup storage profile configuration

## Requirements

- Bun runtime (v1.0 or later)
- A ClickHouse® cluster accessible over HTTP (port 8123 by default)
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Quick Start

```bash
git clone https://github.com/quantrail/chops.git
cd chops
cp .env.example .env
# Edit .env with your cluster credentials
bun install
bun run db:migrate
bun run dev
```

Open http://localhost:5173 in your browser. Sign in with the credentials you set in `.env`.

Documentation is available at http://localhost:5173/docs/ during development, or http://localhost:3000/docs/ in production.

## License

CHOps follows an open-core model. The community edition is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**, and is free to use, modify, and self-host. A separate **Pro edition** adds audit logging, scheduled email reports, extended alerting, and multi-cluster fleet management under a commercial license. See [ch-ops.io](https://ch-ops.io) for details, and the `LICENSE` file for the full AGPLv3 terms.

Copyright © 2026 Quantrail™ Data Private Limited. All rights reserved.

ClickHouse® is a registered trademark of ClickHouse, Inc. CHOps refers to the ClickHouse® database management system and is not affiliated with, endorsed by, or sponsored by ClickHouse, Inc.

---

## Trademarks

ClickHouse® is a registered trademark of ClickHouse, Inc. All references to the ClickHouse® mark in this documentation refer to the ClickHouse® database management system (the open-source server software and its protocol) and are used solely for identification and descriptive purposes under nominative fair use. Where the company is meant, it is written as "ClickHouse, Inc." CHOps is an independent project developed by Quantrail™ Data Private Limited and is not affiliated with, endorsed by, sponsored by, or otherwise associated with ClickHouse, Inc. All other trademarks are the property of their respective owners.
