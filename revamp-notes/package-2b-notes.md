# CHOps 2.0 UI revamp: package 2 (foundation), version 2

Base: OSS `testing` at `f4e460a` (with PR #681, the Midnight theme).
This package replaces the first package 2. Do not apply the first one.

Start `tailwind_shadcn_magicui` again from this `testing`, then apply this
package. It includes the checkpoint 1 tools, so you do not apply checkpoint 1
separately.

## What this package does

| Step | Change |
|---|---|
| 1. Check tools | `tests/visual/` (record, check, compare), the fake ClickHouse, API data recorded again on the new UI, the chart guard test. Memory fix in `compare.mjs`. |
| 2. F1 fix | A window resize before the bug button is dragged no longer blanks the page. On `testing` this also crashed the Dashboards page on every load. New test. |
| 3. Upgrades | Bun 1.4.4 (Dockerfile, CI). React 19.3.1, React Router 7.18.5, Vite 8.3.5, Vitest 5.1.0, jsdom 30, ESLint 9.39, CodeMirror, xyflow, dagre and other frontend and test packages. Backend packages are not changed. |
| 4. Code font | Atkinson Hyperlegible Mono replaces Red Hat Mono. The unused Red Hat Mono and Plus Jakarta Sans files are removed. |
| 5. Tailwind and shadcn/ui | Tailwind 4.3.3 (no preflight, prefix `tw`). shadcn 4.23.0 through the official CLI: Base UI, JSX, Tabler icons, 45 components in `components/ui`. Colors map to the Midnight tokens. |
| 6. Midnight parts on shadcn | `Button`, `Badge`, `Kbd`, `Card`, `SegmentedControl` and `RowMenu` in `components/ui/index.jsx` now use shadcn, with the same names and props. Pages do not change. `KpiCard`, `PageHeader`, `StatusDot` and `IconChip` stay as they were. |
| 7. F2 fix | The Type filter on Processors Profile was always empty (`type != ''` fails on an Enum). Now `toString(type) != ''`. New test. |

## Apply and test

```sh
node apply-update.mjs <your repo>            # check only
node apply-update.mjs <your repo> --apply    # write the files
bun install
bun run test
bun run lint
bun run build
```

Then:

1. Build the Docker image (checks Bun 1.4.4).
2. Resize the window on any page, then open Custom Dashboards > My Dashboards. Both must work.
3. User Management: open the "..." menu on a row. Use the arrow keys and Escape.
4. App Config, Cluster Management, Kubernetes: click the segmented tabs.
5. Processors Profile: the Type filter now lists the query types.
6. SQL Editor and query ids: the new code font.
7. Make your visual baseline: `bunx vite` in one terminal, then
   `node tests/visual/check.mjs` and `node tests/visual/compare.mjs --update`.

## Rules kept

- No backend code change.
- Charts: font names only (`echarts.js` tooltip, `overviewChart.js` fallback). The chart guard also accepts the chart colors from PR #681 and now watches `utils/theme.js`.
- The app CSS output is byte for byte the same with and without Tailwind. Tailwind rules come after it and use the `tw:` prefix.

## Decisions to know

- Prefix `tw`. Without it, Tailwind makes rules for words the app already uses as class names (`hidden`, `table`, `container`, `shadow` and more).
- shadcn names `--accent`, `--input` and `--ring` are never set on `:root`. shadcn primary is `--accent-solid`, focus ring is `--accent`.
- A small base reset applies only to shadcn parts (elements with `data-slot`), in `tailwind.css`. Without it, shadcn buttons show the browser's default border.
- The shadcn `Badge` and `Kbd` keep the `badge`, `badge-<tone>` and `kbd` classes as hooks for page CSS (for example, the navbar hides `.kbd` on small screens).
- A disabled "..." menu item has `aria-disabled="true"` (Base UI), not `disabled`. `user-management.test.jsx` checks this now.
- js-yaml stays at 4.3.1. ESLint stays at 9; react-hooks 7 with the classic two rules only.
- New packages are pinned to exact versions at least two weeks old.

## Visual check results (all pages, normal and stress, 3 screen sizes)

- Charts: no change in size, position, legend or options.
- No API call is missing from the recording. No page errors. On `testing`, Dashboards crashed on every load (F1).
- Picture changes: the code font everywhere code or ids show; the shadcn segmented tabs, badges and row menu, which look almost the same as before.
- New accessibility report: Dashboards has an image without `alt` text. It was always there; the page crashed before, so the check could not see it.
- Layout reports that are not real problems: the search dialog covers page badges; a long role list in DB RBAC > Full overview runs off screen (it did before, the new font moves it).

## Known limits

- Four icons are used in the code but are not in the icon sprite: `brand-slack`, `brand-teams`, `contract`, `message-circle`. This was already so on `testing`.
- No dashboards are in the recorded data, so dashboard charts are not in the visual check.
- Unused packages (`@clickhouse/client`, `axios`, `farmhash`, `pdfkit`, `@fontsource/*` and others) are not touched.
