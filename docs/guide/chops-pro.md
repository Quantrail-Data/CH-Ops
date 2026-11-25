# CHOps Pro

CHOps follows an open-core model. The core dashboard is the free Community edition, which these guides document in full and which operates fully on its own. A commercial **Pro** edition adds a small set of operational features on top of the core.

## Licensing

The core uses the Apache License 2.0. Pro is sold separately.

| Edition | License | What it covers |
|---------|---------|----------------|
| Community (core) | Apache License 2.0 | The core dashboard: SQL editor, query profiling, monitoring, schema tools, logs, RBAC viewing, custom dashboards, alerting with email, Slack, Google Chat, Microsoft Teams and PagerDuty channels, backups, and more. |
| Pro | Commercial only | The features in [What Pro adds](#what-pro-adds), on top of the core. |

**The Community core uses the Apache License 2.0.** You can use, study, change, and redistribute it. You can also use it in commercial and closed-source products. Keep the license and the copyright notices. The full terms are in the `LICENSE` file.

**Pro is commercial only.** The Pro features are not part of the open-source repository, and they do not use the Apache License 2.0. They are distributed separately under a commercial license.

For Pro, go to [ch-ops.io](https://ch-ops.io) or speak to Quantrail&trade; Data.

---

## What Pro adds

Pro adds to the Community core rather than replacing it. All the features that you use now stay the same. Pro adds these features:

- **Scheduled Archival**: moves ClickHouse&reg; data to object storage on a schedule. See the section below.
- **Scheduled backups with retention**: runs ClickHouse&reg; backups on a schedule and removes the backups that are older than the retention you set. Manual backup and restore are in the Community core.
- **Remote Admin**: lets CHOps do administration tasks on a ClickHouse&reg; server through a sidecar that runs next to the server.
- **Audit Log**: records the actions that users do in CHOps, their sign-ins, and the requests that CHOps refused because the user did not have access. It does not record the SQL that users run.
- **SSO with OpenID Connect**: lets users sign in to CHOps through your identity provider.
- **Scheduled email reports**: runs a SQL query on a schedule and sends the result by email.

---

## Scheduled Archival

Scheduled Archival is a Pro feature that moves data to less expensive, long-term storage on a schedule, so nobody has to run a SQL statement each time. It writes ClickHouse&reg; data to S3-compatible object storage with the ClickHouse&reg; `s3()` function, so you can move old or cold data out at intervals that you set and keep it for as long as your retention policy requires.

**How it is different from Backups.** The [Backups](backups.md) (Data Lifecycle) feature in the Community edition uses native `BACKUP` and `RESTORE` for point-in-time recovery, making a consistent snapshot that you can restore after a failure. Scheduled Archival adds to Backups rather than replacing them. It is for continuous data lifecycle management: it exports data to object storage at regular intervals for retention and cost control, and it does not make restore points on demand. Many teams use the two together: native backups for recovery, and scheduled archival for long-term retention of data that they do not want in hot storage.

Scheduled Archival writes to S3-compatible object storage, for example Amazon S3, Google Cloud Storage, MinIO, Wasabi, or Cloudflare R2.

Scheduled Archival is part of the Pro edition. To get it, go to [ch-ops.io](https://ch-ops.io) or speak to Quantrail&trade; Data.

---

## Select an edition

- If the Community core does what you need, use the open-source build under the Apache License 2.0.
- If you need one of the features in [What Pro adds](#what-pro-adds), use Pro. Pro is commercial only.

---

## Trademarks

ClickHouse&reg; is a registered trademark of ClickHouse, Inc. All references to the ClickHouse&reg; mark in this documentation refer to the ClickHouse&reg; database management system (the open-source server software and its protocol). We use the mark only for identification and description, under nominative fair use. Where we refer to the company, we write "ClickHouse, Inc." CHOps is an independent project of Quantrail&trade; Data Private Limited. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with ClickHouse, Inc. All other trademarks are the property of their owners.

Copyright &copy; 2026 Quantrail&trade; Data Private Limited. The CHOps Community (core) edition uses the Apache License 2.0. The Pro edition is distributed separately under a commercial license.