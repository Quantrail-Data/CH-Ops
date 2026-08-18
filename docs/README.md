# CHOps Documentation

CHOps is a web-based administration and monitoring dashboard for ClickHouse&reg; clusters. It gives database administrators a single interface for cluster health monitoring, query analysis, access-control management, log inspection, and alerting.

## What CHOps does

CHOps connects to your ClickHouse&reg; cluster over the HTTP interface and provides the following capabilities:

- Real-time cluster health monitoring with automatic refresh
- Kubernetes insights for clusters run under the Altinity&reg; Kubernetes Operator for ClickHouse&reg; (AKOC) or Official ClickHouse&reg; Kubernetes Operator (OCKO)
- Query management, including running queries, analytics, and query-log search
- Deep query analysis: a flame-graph query profiler, a processors pipeline view, per-query metric timelines, and side-by-side query comparison
- Table and part inspection with compression statistics
- Merge, mutation, replication, and ingestion queue monitoring
- A full SQL editor with autocomplete, syntax highlighting, and a database explorer
- Schema tools: a schema visualizer, a guided table designer (Schema Studio), data-skipping indexes, and projections
- Qurioz, a natural-language-to-SQL assistant
- Log viewers for crash, error, text, and session logs, with datetime filtering
- Monitoring dashboards covering queries, CPU, memory, disk, network, and more, plus playback and a memory-allocator view
- SQL-based alerting with cron scheduling and multi-channel notifications
- Role-based access-control management with visual grant trees
- Backup storage-profile configuration and data-lifecycle management

## Requirements

- Bun 1.3.13 (the pinned version)
- A ClickHouse&reg; cluster, version 26.3 or newer, accessible over HTTP (port 8123 by default)
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Quick start

```bash
git clone https://github.com/Quantrail-Data/CH-Ops.git
cd CH-Ops
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

Copyright &copy; 2026 Quantrail&trade; Data Private Limited. All rights reserved.

ClickHouse&reg; is a registered trademark of ClickHouse, Inc. CHOps refers to the ClickHouse&reg; database management system and is not affiliated with, endorsed by, or sponsored by ClickHouse, Inc.

---

## Trademarks

ClickHouse&reg; is a registered trademark of ClickHouse, Inc. All references to the ClickHouse&reg; mark in this documentation refer to the ClickHouse&reg; database management system (the open-source server software and its protocol) and are used only for identification and description under nominative fair use. Where the company is meant, it is written as "ClickHouse, Inc." Altinity&reg; is a registered trademark of Altinity, Inc. CHOps is an independent project developed by Quantrail&trade; Data Private Limited and is not affiliated with, endorsed by, sponsored by, or otherwise associated with ClickHouse, Inc. or Altinity, Inc. All other trademarks are the property of their respective owners.
