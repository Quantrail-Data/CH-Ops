# Visual check

The visual check makes sure that the UI revamp does not break a page or a chart.
It opens every page with fixed data, in the dark and the light theme, and saves:

- a screenshot of the whole page
- each chart: its size, its position, its canvas size, its legend box and its options
- layout problems: text cut off, overlapping text, elements outside the window
- the computed styles of key elements (buttons, inputs, cards, tables, tabs)
- accessibility problems (axe, WCAG 2 A and AA)

Then it compares all of this with the baseline.

## Rules that the compare applies

| Item | Rule |
|---|---|
| Charts | Size, position, canvas size, legend box and options must not change. Only colors and font names may change. A chart difference always fails. |
| API calls | Every API call must be in the recorded data. A call that is not recorded fails. It also shows that a page now sends a different request. |
| Pixels and styles | Review mode lists every difference for a person to accept or reject. Strict mode (`--strict`) fails on any style difference and on any picture with 200 or more different pixels. Smaller differences come from anti-aliasing in canvas charts and text; they are listed as "small" but do not fail. A real 1 pixel layout shift gives thousands of different pixels. |
| Layout and accessibility | Only problems that the baseline does not have are listed. |

## Run the check

You need only the Vite dev server. No backend and no ClickHouse.

```sh
bunx playwright install chromium   # one time
bunx vite                          # in a second terminal
bun run test:visual                # check, then compare with the baseline
```

Other commands:

```sh
bun tests/visual/check.mjs normal home   # one data set, one page
bun tests/visual/compare.mjs --strict    # fail on any pixel or style difference
bun tests/visual/compare.mjs --update     # add the checked pages to the baseline
```

The report is `tests/visual/output/report.html`.

## Make the baseline

The baseline is not in git: it is large (about 55 MB for the normal data set),
and fonts look a little different on each operating system. Make it once on the
machine that runs the checks (the same Docker image in CI), from the code before
the change you want to check:

```sh
bun tests/visual/check.mjs
bun tests/visual/compare.mjs --update
```

In CI, keep the baseline as a build artifact of the main branch.

## The two data sets

- **normal**: a healthy 3-node cluster with two days of data.
- **stress**: 40 hosts, 60 users, 300 tables with long names, one point per second
  in the metric charts, and long log messages. It finds charts with too many points,
  labels or legend entries. It also runs at 1280, 1440 and 1920 pixels wide.

## Record the data again

Record again only when the backend API or the SQL of a page changes. The UI
revamp does not change them.

Recording needs Python 3 with chdb (ClickHouse as a library), the CHOps backend
with a test `.env`, and the Vite dev server.

```sh
pip install chdb

# 1. The fake ClickHouse. Each port is one node. Each start fills the data again (about 15 s for "normal", 1 minute for "stress").
python3 tests/visual/fake-clickhouse/server.py --dataset normal --ports 8123,8124,8125

# 2. The CHOps backend, with an empty database.
DB_PATH=/tmp/visual-check.db bun src/backend/server.js

# 3. The Vite dev server.
bunx vite

# 4. Record. The password is SUPER_ADMIN_1_PASSWORD from the test .env.
VISUAL_ADMIN_PASSWORD=... bun tests/visual/record.mjs normal
```

For the stress data set, start the fake ClickHouse with `--dataset stress` and 12
ports, and give the recorder the same ports:

```sh
python3 tests/visual/fake-clickhouse/server.py --dataset stress --ports 8123,8124,8125,8126,8127,8128,8129,8130,8131,8132,8133,8134
VISUAL_FAKE_PORTS=8123,8124,8125,8126,8127,8128,8129,8130,8131,8132,8133,8134 VISUAL_ADMIN_PASSWORD=... bun tests/visual/record.mjs stress
```

### How the fake ClickHouse works

chdb runs real ClickHouse SQL. `clickhouse.xml` turns on the system log tables
(`query_log`, `metric_log`, `text_log` and the others), and `seed.py` fills them
with generated data. chdb has no other nodes, so `server.py` changes the SQL a
little before it runs it:

- `clusterAllReplicas(...)` and `cluster(...)` read the local table.
- System tables that chdb cannot fill (`processes`, `merges`, `replicas`,
  `clusters` and others) are read from copies in the database `seed`.
- `hostName()` gives the node name of the port.

The browser clock is set to the time of the data, and the time zone is UTC.

## Files

| File | Use |
|---|---|
| `pages.js` | The pages, their tabs and extra states (dialogs) |
| `record.mjs` | Records the API answers |
| `check.mjs` | Opens the pages with the recorded answers and saves the results |
| `compare.mjs` | Compares with the baseline and writes the report |
| `fixtures/<data set>/api.json` | The recorded API answers |
| `baseline/` | The accepted results (not in git, see above) |
| `fake-clickhouse/` | The fake ClickHouse for recording |
| `lib/` | Shared code |

The chart files themselves are guarded by `tests/frontend/chart-guard.test.js`.
