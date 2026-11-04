# CHOps Pro

CHOps follows an open-core model. The core dashboard is the free Community edition, which these guides document in full and which operates fully on its own. For teams that run ClickHouse&reg; at scale, a commercial **Pro** edition adds more operational features on top of the core.

## Licensing

The core uses the Apache License 2.0. Pro is sold separately.

| Edition | License | What it covers |
|---------|---------|----------------|
| Community (core) | Apache License 2.0 | The core dashboard: SQL editor, query profiling, monitoring, schema tools, logs, RBAC viewing, custom dashboards, alerting with email, Slack, Google Chat, Microsoft Teams and PagerDuty channels, backups, and more. |
| Pro | Commercial only | Advanced operational features on top of the core, and priority support. |

**The Community core uses the Apache License 2.0.** You can use, study, change, and redistribute it. You can also use it in commercial and closed-source products. Keep the license and the copyright notices. The full terms are in the `LICENSE` file.

**Pro is commercial only.** The Pro features are not part of the open-source repository, and they do not use the Apache License 2.0. They are distributed separately under a commercial license.

For Pro, go to [ch-ops.io](https://ch-ops.io) or speak to Quantrail&trade; Data.

---

## What Pro adds

Pro adds to the Community core rather than replacing it. All the features that you use now stay the same, and Pro adds capabilities for fleets, compliance, and long-term data operations.

- **Scheduled Archival**: automatic archival of ClickHouse&reg; data to S3-compatible object storage on a schedule. See the section below.
- **Scheduled backups**: ClickHouse&reg; backups on a schedule, incremental backups against the last full backup, and removal of backups past their retention. Manual backup and restore are in the Community core.
- **Audit logging**: a tamper-evident record of all DDL, DML, and login events. You can search and export the record. Retention policies help with compliance reports.
- **Scheduled email reports**: dashboard snapshots and alert digests that CHOps sends on a schedule. You can customize the templates.
- **Extended alerting**: escalation policies and on-call routing.
- **Multi-cluster fleet management**: manage many ClickHouse&reg; clusters from one location through a lightweight sidecar agent.
- **Priority support**: direct support with faster response times.

---

## Scheduled Archival

Scheduled Archival is a Pro feature that moves data to less expensive, long-term storage on a schedule, so nobody has to run a SQL statement each time. It writes ClickHouse&reg; data to S3-compatible object storage with the ClickHouse&reg; `s3()` function, so you can move old or cold data out at intervals that you set and keep it for as long as your retention policy requires.

**How it is different from Backups.** The [Backups](backups.md) (Data Lifecycle) feature in the Community edition uses native `BACKUP` and `RESTORE` for point-in-time recovery, making a consistent snapshot that you can restore after a failure. Scheduled Archival adds to Backups rather than replacing them. It is for continuous data lifecycle management: it exports data to object storage at regular intervals for retention and cost control, and it does not make restore points on demand. Many teams use the two together: native backups for recovery, and scheduled archival for long-term retention of data that they do not want in hot storage.

Scheduled Archival uses the same S3-compatible storage configuration as the rest of CHOps, so every provider that works with backups also works with archival. Examples are Amazon S3, Google Cloud Storage, and S3-compatible endpoints such as MinIO, Wasabi, and Cloudflare R2.

Scheduled Archival is part of the Pro edition. To get it, go to [ch-ops.io](https://ch-ops.io) or speak to Quantrail&trade; Data.

---

## Select an edition

- If the Community core does what you need, use the open-source build under the Apache License 2.0.
- If you need audit trails, scheduled archival, scheduled backups, scheduled reports, extended alerting, or multi-cluster fleet management, use Pro. Pro is commercial only.

---

## Trademarks

ClickHouse&reg; is a registered trademark of ClickHouse, Inc. All references to the ClickHouse&reg; mark in this documentation refer to the ClickHouse&reg; database management system (the open-source server software and its protocol). We use the mark only for identification and description, under nominative fair use. Where we refer to the company, we write "ClickHouse, Inc." CHOps is an independent project of Quantrail&trade; Data Private Limited. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with ClickHouse, Inc. All other trademarks are the property of their owners.

Copyright &copy; 2026 Quantrail&trade; Data Private Limited. The CHOps Community (core) edition uses the Apache License 2.0. The Pro edition is distributed separately under a commercial license.