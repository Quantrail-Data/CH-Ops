# UI Framework

`src/frontend/components/ui/` is a small set of generic, reusable UI primitives: `Button`, `Card`, `Badge`, `Tabs`, `Spinner`, `Tooltip`, `Pagination`, and `Modal`. Before this existed, most of these had no React component at all — buttons, cards, badges, and tabs were raw `<button className="btn btn-primary">`-style markup, hand-copied into whichever feature file needed one. Modals were hand-rolled 14 separate times, with only `ConfirmModal.jsx` as a shared component.

Every primitive in `components/ui/` is a thin wrapper over the classes already defined in `styles/global.css` (`.btn*`, `.card`, `.badge-*`, `.tab-bar`/`.tab-item`, `.loading-spinner`, `.modal-overlay`/`.modal-box`). None of them introduce new visual styling — they give the existing CSS a typed, reusable component API instead of copy-pasted class strings. The two exceptions are `Tooltip` and `Pagination`, which had no prior CSS at all; their (small, token-based) styles live in `components/ui/ui.css`, not `global.css`.

## Where something belongs

- **No component exists yet for this CSS pattern** (you're about to type another `<button className="btn ...">` or `<div className="modal-overlay">`) → build it in `components/ui/`, or use what's already there.
- **Something feature-specific or stateful with app knowledge** (a page, a form tied to one endpoint, a widget that only makes sense inside one feature) → stays in its feature folder, or in `components/common/` / `components/layout/` alongside the app's existing shared-but-not-generic components (`Icon`, `Select`, `DataTable`, `Toast`, etc.).

`components/common/` and `components/layout/` were not merged into `components/ui/` and are not being migrated wholesale — see the docs above for how they're documented instead.

## Browsing every element's template + example

```bash
bun run storybook
```

Opens an interactive Storybook at `http://localhost:6006` with a story per component — both the `components/ui/` primitives and the pre-existing reusable components (`Icon`, `Select`/`MultiSelect`, `InfoTip`, `DataTable`, `Toast`, `ChartCard`/`ChartToolbar`, `DateTimePicker`, `AlertBanner`, `StatCard`/`SqlPreview`, `ParamInput`). Each story shows every variant/state (e.g. all four `Button` variants, all six `Badge` colors) with real, working code you can copy. A light/dark toggle in the toolbar flips `[data-theme]`, since every component is theme-token driven.

To add a new component: create `ComponentName.jsx` next to its siblings, then `ComponentName.stories.jsx` in the same folder — Storybook picks up anything under `src/frontend/components/**/*.stories.jsx` automatically (see `.storybook/main.js`).

`bun run build-storybook` produces a static build in `storybook-static/` (gitignored) — mainly useful as a smoke check that every story still renders.

## What's intentionally out of scope (for now)

Building `components/ui/` did **not** include migrating existing call sites onto it. The 383 raw `.btn` usages and 13 of the 14 hand-rolled modals across feature files are untouched — only `ConfirmModal.jsx` was refactored onto `Modal`/`Button`, as a behavior-preserving proof that the primitives fit real usage. `Modal`'s `size`/`zIndex`/`footer` props were chosen to match what those other 13 modals already do inline, so migrating them later is a mechanical swap, not a redesign. `SortableDataTable.jsx` is a separate near-duplicate of `DataTable.jsx` and is also out of scope — prefer `DataTable` for new code.

See [End-to-end tests (Playwright)](testing.md#end-to-end-tests-playwright) for how UI changes in this area get a regression check beyond unit tests.
