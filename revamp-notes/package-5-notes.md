# CHOps 2.0 UI revamp: package 5 (pages part 2, Login and Home)

Base: package 4 (`0dcd8fc`) on branch `tailwind_shadcn_magicui`. This zip is the full repo with packages 2 to 5; the last commit is `58819d6`.

## What this package does

| Step | Change |
|---|---|
| 1. Fixes from your package 4 test | Auto text size, sidebar spacing, SQL in the alert cards, SQL field height. Details below. |
| 2. Part 2 pages | Logs, profiler, SQL Editor, Qurioz, dashboards, schema, schema studio, indexes, RBAC, backups and admin pages: about 240 buttons, 150 inputs and text areas, 144 form groups, 10 modals and 66 notices move to the shared UI parts. 18 toggle buttons get `aria-pressed`. |
| 3. Login | The Magic UI particles (the same as in the app) behind the sign-in form. The title, subtitle and proof line were already in the team's code (`73f886d`) and match the decided text. |
| 4. Home | Magic UI Magic Card on the page tiles: a soft spotlight follows the pointer. Magic UI Number Ticker on the KPI numbers: they count up to the value. |

## Fixes from your package 4 test

1. **Auto did not always give 125%.** My mistake. The label read the font size during its 0.15 s transition, so it showed a value in between. Now it calculates the value from the window width with the same formula as the CSS, and it updates when the window size changes. Tested: 125% at 2560 every time.
2. **Sidebar font sizes.** The sidebar text is 13 px at 100%, the same as in the team's Midnight design and the same as the breadcrumb. It scales correctly (16.25 px at 2560). The problem was the row heights and spacing: they were in px and did not grow, so the rows looked tight on wide screens. They are now in rem. Nothing changes at 1920 px or less.
3. **SQL in the alert cards.** The rule cards do not show the SQL now. A click on a card or on the rule name opens the rule, and the SQL shows there. Only admins see the cards, so the editor is enough. The Edit, Delete and History icon buttons now have names for screen readers. The template picker never showed SQL; I took "alert templates" to mean rules made from templates.
4. **SQL field height.** The field grows while you type, from 4.5rem up to half the screen height, then it scrolls. Tested with 100 extra lines at 1440 px: it stops at 720 px and scrolls.

## Bugs fixed in existing code

- Login: "Forgot password?" and "Back to Login" were text with a click handler. The keyboard could not reach them. They are buttons now. "Back to Login" used a fixed blue color, hard to read in the dark theme; it uses the accent color now. The text "Forget password ?" is now "Forgot password?".
- Show/hide password toggles on 9 pages (Login, Setup Password, cluster management, RBAC users, storage profiles, schema studio, SQL Editor, comparison view, Qurioz) were clickable `div`s with no name. They are buttons with a name and `aria-pressed`.
- Login password fields: the labels are tied to the fields, and the fields have autocomplete hints (username, current password, new password).
- Qurioz: the "NO API KEY" box that opens API Management was a clickable `div`. It is a button now.
- SQL Editor: the Pipeline and Metrics links had the Flame Graph tooltip. They now say "Open in Processors Profile" and "Open in Query Metrics".
- Dashboard filter settings: the page had its own Escape listener on top of the dialog's, so Escape called close twice. Removed.

## Decisions to know

- The SQL Editor side panel (history, bookmarks) stays as it is. It must let a drag pass through to the editor while it is open, and a modal dialog blocks the page behind it.
- Links that look like buttons (for example Flame Graph in the SQL Editor), `motion.button` parts, checkboxes, file pickers and the two date fields of Processors Profile keep their markup.
- The app's own `Select` stays, as in package 4.
- The Login background uses the same particles as the app, not a new effect, so the app has one look. It follows "reduced motion" and the Background animation switch.
- Magic Card and Number Ticker are adapted to the app: the card fill and border use the app tokens, Number Ticker takes the text color of the page and shows the value at once with reduced motion.
- The title on Login has no full stop after "made easy". The team wrote it that way; I did not change it.

## Ports (added after the first package 5 zip)

- The backend port and the Vite dev server port are set in `.env`: `PORT` (backend, default **7720**, was 3000) and the new `DEV_FRONTEND_PORT` (Vite, default **7721**, was 5173). Vite sends `/api` and `/docs` to the backend `PORT`. If its port is in use, Vite stops with an error and does not move to another port.
- The Dockerfile, `docker-compose.yml`, the Kubernetes files (`configmap.yaml`, `statefulset.yaml`, `service.yaml`, `ingress.yaml`), `.env.example`, the docs and the visual check tools use the new ports.
- **Upgrade note:** an install with no `PORT` in its `.env` moves from 3000 to 7720. Update reverse proxies, firewalls, bookmarks and port mappings, or set `PORT=3000` to keep the old port. A `.env` that has `PORT=3000` keeps 3000.
- In Kubernetes, the Service port is 7720 now. Other apps that call the Service on port 3000 must change.

## Tests

- `bun run test` (with `.env`): all backend groups pass (77 files); 2138 frontend tests pass. `bun run lint`: 0 errors (5 warnings that were there before). `bun run build`: passes.
- Updated tests (they check the markup text; same intent, new parts): chart builder preview, dashboard filters wiring, query compare, schema studio UI, Tabler icons. ExportWizard resume: the wizard is a dialog at the end of the page body now, so the test searches the whole document.

## Visual check results

Full check on all pages (normal and stress data, 3 screen sizes, both themes, 328 page states):

- Charts: no change.
- No API call is missing from the recording. No page errors. No new accessibility problems.
- Pictures: most part 2 pages look the same as before outside the sidebar. All pages change a little in the sidebar (version text, row spacing in rem).
- Home: the new tiles and KPI numbers (expected).
- Found and fixed during the check: the date field of the date/time picker became about 10 px wider (the shared Input set its own width). On Crash Log at 1920 px this pushed the Search button to a new line. It also showed on Error Log, Text Log, Session Log, Playback, Queries and System Dashboards. A recheck of these pages shows no change now.
- Small changes left: the icon in the Data Lifecycle notes is about 4 px closer to the text, the same as the notes in package 4.
- Layout reports that are not real problems: the open search dialog and user menu cover the Home KPI numbers (they are overlays).
- The Login page is not in the visual check; I checked it by hand at 1440 and 2560 px in both themes, and with the keyboard.

## What to test by hand

0. Ports: remove `PORT` and `DEV_FRONTEND_PORT` from your `.env`, run `bun run dev` and open `http://localhost:7721`. Sign in. Then set `PORT=7801` and `DEV_FRONTEND_PORT=7802`, run `bun run dev` again and open `http://localhost:7802`.

1. On a 2560 x 1440 screen, open the user menu. Move the text size slider, then click "Use Auto (fits the screen)". The label shows "Auto (125%)" every time.
2. Look at the sidebar on a 2560 screen: the rows have more space than in package 4.
3. Alert Rules: the cards show no SQL. Click a card or a rule name: the rule opens with the SQL. Type or paste a long SQL: the field grows, then scrolls.
4. Login: push Tab from the username field. The focus goes to the password, the show/hide button, "Forgot password?" and Login. Push Enter on "Forgot password?", then use "Back to Login". Look at the particles behind the form in both themes.
5. Home: move the pointer over the tiles; a soft spotlight follows it. Reload: the KPI numbers count up. Push Tab: each tile shows a focus outline.
6. Logs (Error Log, Text Log, Session Log, Crash Log): use the time range buttons and the filters button.
7. SQL Editor: open the AI DDL generator ("Database Schema & Estimate Generator"). Push Escape; it closes. A click on the backdrop does not close it.
8. Custom Dashboards: open the filter settings; Escape and a click on the backdrop close it.
9. Backups (Storage Profiles, Data Lifecycle): save something; the result banner shows with a close button.
10. Export from the SQL Editor: the export wizard opens and works as before.
