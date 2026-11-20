# CHOps 2.0 UI revamp: release notes, packages 2 to 6

Branch `tailwind_shadcn_magicui`. Base: OSS `testing` at `f4e460a` (with PR #681, the Midnight theme). Last commit: `c43d8b3`.

The detailed notes of each package are in `package-2b-notes.md`, `package-3-notes.md`, `package-4-notes.md`, `package-5-notes.md` and `package-6-notes.md`.

## Summary

| Package | Main changes |
|---|---|
| 2 (foundation) | Visual check tools (`tests/visual`), fake ClickHouse, chart guard test. Bun 1.4.4, React 19, Vite 8, Vitest 5 and other frontend upgrades. Tailwind v4 (prefix `tw:`, no global preflight) and shadcn/ui 4.23 (Base UI). Midnight parts on shadcn. Fixes F1 (bug button blanked the page) and F2 (empty Type filter on Processors Profile). |
| 3 (layout) | Sonner toasts, AlertDialog confirm dialogs, shadcn navbar, breadcrumb and user menu, Command search (Ctrl+K), sidebar with Collapsible sections and tooltips, Magic UI particles and Animated Theme Toggler, Background animation switch. |
| 4 (text size, pages part 1) | All text and layout sizes in rem. Auto text size (125% at 2560 px). Shared Input, Textarea, Label, FormField, PasswordInput, Notice, Modal and Switch on the part 1 pages. |
| 5 (pages part 2, Login, Home, ports) | The shared parts on the part 2 pages. Login particles and keyboard access. Home Magic Card and Number Ticker. Configurable ports: `PORT` (default 7720) and `DEV_FRONTEND_PORT` (default 7721). |
| 6 (forms, trees, memory, premium) | shadcn date picker, compact search forms with "More options", one button size, React Flow trees with curved animated lines, memory fixes and gates, new Login carousel, premium touches, clean-up. |

## Upgrade notes

- **Ports:** an install with no `PORT` in its `.env` moves from 3000 to **7720**. Update reverse proxies, firewalls, bookmarks and port mappings, or set `PORT=3000`. The Vite dev server is on **7721** (was 5173). In Kubernetes, the Service port is 7720.
- **Bun 1.4.4** is needed (Dockerfile and CI are updated).
- Run `bun install` after you take the branch.

## Exceptions to the revamp rules

- Backend: only `src/backend/utils/env.js` (ports). The F2 fix is in the frontend (`utils/processorsPipeline.js`).
- Charts: only font names and colors change, except the 4 tree views (User Grants, Role Grants, Data Skipping Indexes, Projections), which moved from ECharts to React Flow. You approved both.

## Memory and speed (package 6)

| Measure | Before | After |
|---|---|---|
| Chart page left behind after you closed it (each visit) | 677 DOM nodes, about 310 animation frames per second that never stopped | 0 |
| Main JavaScript file | 2214 KB | 473 KB |
| Idle CPU on Home, background animation on | about 7.5% of one core | 3.8% to 4.6% |
| Login carousel images | 7.4 MB (PNG) | 1.3 MB (WebP) |

New gates: `bun run check:bundle` (main file at most 600 KB) and `bun tests/visual/memory.mjs` (leak per visit, running work, page size, idle CPU).

## Behavior changes users can see

- New colors and fonts (Midnight), larger text on screens wider than 1920 px (Auto text size).
- Toasts top right; confirm dialogs do not close on an outside click; Escape closes menus and dialogs.
- A moving particle background (15 frames per second) and premium effects. All stop with "reduced motion" and with the Background animation switch in the user menu.
- New date picker, compact search forms, one button height (2rem).
- Trees with curved lines and a moving light; a new settings source tree on the Settings tab.

## Known limits

- The Login carousel pictures come from the test data, which is thin. Real cluster pictures can replace them (same names, 1920 x 993).
- 13 shadcn kit parts are not used by a page yet. The build leaves them out.
- The 5 lint warnings were there before the revamp.

## Tests at the end of package 6

- `bun run test` with `.env`: all backend groups pass; 2171 frontend tests pass.
- `bun run lint`: 0 errors. `bun run build` and `bun run check:bundle`: pass.
- Memory gates: all pass.
- Visual check (en-US and en-IN): see `package-6-notes.md`.
