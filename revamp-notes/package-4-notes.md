# CHOps 2.0 UI revamp: package 4 (text size and pages part 1)

Base: package 3 (`c6bedf9`) on branch `tailwind_shadcn_magicui`. This zip is the full repo with packages 2, 3 and 4; the last commit is `0dcd8fc`.

## What this package does

| Step | Change |
|---|---|
| 1. Text sizes in rem | All CSS font sizes, the `--text-*` tokens, 691 inline font sizes in the page code, and the layout sizes (`--navbar-height`, `--sidebar-width`, `--sidebar-collapsed`, `--control-h`, `--control-h-sm`) are in `rem`. Chart CSS rules and chart options are not changed. |
| 2. Auto text size | The default. 100% up to a 1920 px wide window, 125% at 2560 px, at most 150%. The user menu shows "Auto (125%)". A fixed size from the slider replaces it; "Use Auto (fits the screen)" brings it back. Saved as `chops_fontscale`. |
| 3. User Management (pilot) | New UI parts: `Input`, `Textarea`, `Label`, `FormField`, `PasswordInput`, `Notice`. `Button` is the Base UI button (as in shadcn/ui) with the Midnight `.btn` look. |
| 4. Part 1 pages | Control panel, alerting, Kubernetes, overview, queries, queues and monitoring pages: 495 buttons and inputs, 51 form groups, 9 modals (new `ui/modal.jsx`), 20 notices; `ToggleSwitch` on the shadcn Switch. |
| 5. Hand work | Toggle buttons with `aria-pressed`, result banners with a close button, two textareas, the "every 5s" picker width. |

## What changes for users

- On screens wider than 1920 px, all text and controls are larger (125% at 2560 px). Charts keep their sizes, so on those screens chart card headers grow and the chart sits a little lower in its card.
- Up to 1920 px, nothing looks different. The visual check confirms this.
- Labels are tied to their fields: a click on a label focuses the field; screen readers read the label.
- Password fields have a real show/hide button.
- Modals keep the focus inside, close on Escape (where the page allows it) and give the focus back to the button that opened them.
- Switches have their label as their name; a click on the label toggles the switch.
- Notices are announced by screen readers (errors at once, info politely).

## Bugs fixed in existing code

- Kubernetes Insights: a click on the "Previous container" switch did nothing. The box around it toggled the value a second time.
- All switches (`ToggleSwitch`) had no accessible name; the label was outside the checkbox.
- User Management: typing the current password copied the show/hide state of the confirm field.

## Decisions to know

- `Button` keeps the team's `.btn` look. A first try with the shadcn button styles made buttons slightly smaller and lost the page and media rules for `.btn`.
- The node and cluster pickers and all other selects keep the app's own `Select`. It already has a real `<select>` under it (keyboard, forms, tests) and a themed menu. Moving 43 pages to the Base UI Select would change every select and its tests for little gain. Tell me if you still want it.
- Simple cases were changed with one-off scripts (Babel). Template class names, multi-control form groups and other cases were done by hand or left as they are.
- The Alert Rules editor keeps its rule: a click on the backdrop does not close it (no lost half-written rule). Escape, Cancel and the close button do.

## Tests

- `bun run test` (with `.env`): all backend groups pass; 2136 frontend tests pass. `bun run lint`: 0 errors. `bun run build`: passes.
- Updated tests: User Management (show/hide button by its name).
- New tests: `toggle-switch.test.jsx` (name, click, click on the label).

## Visual check results

Full check on all pages (normal and stress data, 3 screen sizes, both themes):

- Charts: no change.
- No API call is missing from the recording. No page errors. No new accessibility problems.
- Pictures: small changes only (buttons, notices, switches). The largest is the Alert Rules editor in the light theme: the backdrop is drawn by the dialog now, so its shade over the page differs a little.
- Layout reports that are not real problems: open menus, dialogs and the fixed footer cover page text.
- A separate check at 2560 x 1440 found no text that is newly cut or overflows on the part 1 pages.

## Correction to the package 3 notes

The "lost sign-in after tab 9" in one System Dashboards run was most likely my mistake: I ran `bun run build` during that check. The build rewrites generated files, so the dev server reloaded the page. It happened again during this package and stopped the check; the clean rerun had no problem.

## What to test by hand

1. On a 2560 x 1440 screen, open several part 1 pages. Text and controls are larger; nothing is cut. Open the user menu: the text size shows "Auto (125%)".
2. Move the text size slider, then click "Use Auto (fits the screen)".
3. On a 1920 x 1080 or smaller screen, the pages look as before.
4. User Management: click a label (for example "Username"); the field gets the focus. Use the show/hide button on a password field with the keyboard.
5. Trusted CAs: open "Add a certificate authority". Push Tab many times; the focus stays in the modal. Push Escape; the modal closes and the focus goes back to the button.
6. Alert Rules: open "New Rule". Click the backdrop; the editor stays open. Push Escape; it closes.
7. Kubernetes Insights (pod logs): click the "Previous container" switch; it changes.
8. App Config or Notification Channels: save something; the result banner shows with a close button.
