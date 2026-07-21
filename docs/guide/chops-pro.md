# CHOps Pro

CHOps follows an open-core model. The core dashboard, everything documented in these guides, is the free Community edition and is fully functional on its own. For teams running ClickHouse® at scale, a commercial **Pro** edition layers additional operational features on top of that core.

## Licensing

CHOps is available under a dual-license arrangement for the core, with Pro sold separately.

| Edition | License | What it covers |
|---------|---------|----------------|
| Community (core) | AGPLv3 or Commercial | The core dashboard: SQL editor, query profiling, monitoring, schema tools, logs, RBAC viewing, custom dashboards, backups, and more. |
| Pro | Commercial only | Advanced operational features layered on the core, plus priority support. |

**The Community core is dual licensed.** By default it is offered under the GNU Affero General Public License, version 3.0 (AGPLv3), and the copy in this repository is AGPLv3: you may use, study, modify, and redistribute it under those terms (see the `LICENSE` file). If the AGPLv3 do not fit how you deploy , the same core is also available under a separate **commercial license**. You choose whichever of the two fits your situation; the software is the same either way.

**Pro is commercial only.** The Pro features are not part of the open-source repository and are not offered under the AGPLv3. They are distributed separately under a commercial license that permits proprietary, non-source-disclosed use.

For a commercial license of the core, or for Pro, visit [ch-ops.io](https://ch-ops.io) or contact Quantrail™ Data.

---

## What Pro adds

Pro builds on the Community core rather than replacing it. Everything you already use stays the same; Pro adds capabilities aimed at fleets, compliance, and long-term data operations.

- **Scheduled Archival**: recurring, hands-off archival of ClickHouse® data to S3-compatible object storage. See the section below.
- **Audit logging**: a tamper-evident record of every DDL, DML, and login event, searchable and exportable, with retention policies for compliance reporting.
- **Scheduled email reports**: dashboard snapshots and alert digests delivered on a schedule, with customizable templates.
- **Extended alerting**: Adds out of the box support for Google Chat, Microsoft teams, Slack and Pagerduty alert channels.
- **Remote Cluster management**: manage many ClickHouse® nodes from one place through lightweight sidecar agent.
- **Priority support**: direct support with faster response commitments.

---

## Scheduled Archival

Scheduled Archival is a Pro feature for moving data out to cheaper, long-term storage on a recurring schedule, without anyone running a SQL statement each time. It periodically writes ClickHouse® data to S3-compatible object storage using ClickHouse®'s `s3()` function, so aging or cold data can be offloaded on a cadence you define and kept for as long as your retention policy requires.

**How it differs from Backups.** The Community edition's [Backups](backups.md) (Data Lifecycle) feature is built around native `BACKUP` and `RESTORE` for point-in-time recovery: it captures a consistent snapshot you can restore in a disaster. Scheduled Archival is complementary rather than a replacement. Its job is ongoing data lifecycle management, regularly exporting data to object storage for retention and cost control, on a schedule, rather than producing restore points on demand. Many teams use both: native backups for recovery, scheduled archival for long-term retention of data they want to keep out of hot storage.

It reuses the same S3-compatible storage configuration that the rest of CHOps uses, so any provider that works for backups (Amazon S3, Google Cloud Storage, Azure Blob, or S3-compatible endpoints such as MinIO, Wasabi, or Cloudflare R2) works for archival too.

Scheduled Archival ships in the Pro edition. To enable it, see [ch-ops.io](https://ch-ops.io) or contact Quantrail™ Data.

---

## Choosing an edition

- If the Community core meets your needs and the AGPLv3 terms are acceptable for your deployment, run the open-source build as-is under AGPLv3.
- If you need the core without AGPLv3, take the core under the commercial license instead. The functionality is identical.
- If you need audit trails, scheduled archival or reports, extended alerting, or multi-cluster fleet management, those are Pro, which is commercial only.

---

## Trademarks

ClickHouse® is a registered trademark of ClickHouse, Inc. All references to the ClickHouse® mark in this documentation refer to the ClickHouse® database management system (the open-source server software and its protocol) and are used solely for identification and descriptive purposes under nominative fair use. Where the company is meant, it is written as "ClickHouse, Inc." CHOps is an independent project developed by Quantrail™ Data Private Limited and is not affiliated with, endorsed by, sponsored by, or otherwise associated with ClickHouse, Inc. All other trademarks are the property of their respective owners.

Copyright © 2026 Quantrail™ Data Private Limited. The CHOps Community (core) edition is dual licensed under the GNU Affero General Public License v3.0 (AGPLv3) or a separate commercial license. The Pro edition is distributed separately under a commercial license.
