# Trademarks and Naming

CHOps interoperates with software owned by other companies. This page records
whose marks are whose, and the naming rules the code follows so that nobody has
to guess.

---

## Attribution

**ClickHouse®** is a registered trademark of ClickHouse, Inc.

**Altinity®**, **Altinity.Cloud®** and **Altinity Stable®** are registered
trademarks of Altinity Inc.

**Kubernetes®** is a registered trademark of The Linux Foundation.

The **Official ClickHouse® Kubernetes Operator** is published by ClickHouse,
Inc. The **Altinity® Kubernetes Operator for ClickHouse®** is published by
Altinity Inc.

CHOps is not affiliated with, endorsed by, or sponsored by any of them. These
names appear here only to identify the software CHOps works with, which is
nominative use and the only reason they appear at all.

CHOps® and Quantrail™ are marks of Quantrail Data Private Limited.

---

## The naming rule

Two operators are supported, and each has an abbreviation used throughout the
codebase in file names, function names and variables.

**AKOC** is the Altinity® Kubernetes Operator for ClickHouse®.

**OCKO** is the Official ClickHouse® Kubernetes Operator.


| Context | Use |
|---|---|
| File names | `akoc.js`, `ocko.js`, `akocProvider.test.js` |
| Function names | `createAkocProvider` |
| Code comments, after first mention | AKOC |
| First mention in a file header | Altinity® Kubernetes Operator for ClickHouse® |
| User-facing text, first mention | Altinity® Kubernetes Operator for ClickHouse® |
| User-facing text, later mentions | AKOC, or "the operator" |

What we never do is use `Altinity` as an identifier we own. A file called
`altinity.js` or a function called `createAltinityProvider` reads as though the
name belongs to us. It does not.

---

## The exception, and it matters

Some strings containing `altinity` are **not** naming choices. They are wire
protocol identifiers published by the operator, and they must be quoted exactly
as they appear or nothing works.

**API groups:**

```
clickhouse.altinity.com
clickhouse-keeper.altinity.com
clickhouse.com
```

**Label keys:**

```
clickhouse.altinity.com/chi
clickhouse.altinity.com/cluster
clickhouse.altinity.com/shard
clickhouse.altinity.com/replica
clickhouse.altinity.com/ready
clickhouse.altinity.com/reclaimPolicy
clickhouse-keeper.altinity.com/chk

clickhouse.com/role
clickhouse.com/shard-id
clickhouse.com/replica-id
clickhouse.com/keeper-replica-id
clickhouse.com/disk
```

**URL paths:**

```
/apis/clickhouse.altinity.com/v1/namespaces/{ns}/clickhouseinstallations
/apis/clickhouse-keeper.altinity.com/v1/namespaces/{ns}/clickhousekeeperinstallations
```


