# CHOps 2.0 UI revamp: package 3 (layout)

Base: package 2 v2 (`e1ea37c`) on branch `tailwind_shadcn_magicui`. This zip is the full repo with packages 2 and 3; the last commit is `c6bedf9`.

## What this package does

| Step | Change |
|---|---|
| 1. Toasts | `useToast()` now shows shadcn/ui Sonner toasts. Same functions and times. Top right, below the navbar, with a close button and a status color on the icon. Several toasts stack; hover shows all. |
| 2. Confirm dialogs | `ConfirmModal` and the editor `ConfirmDialog` use the shadcn AlertDialog (new `ui/confirm-alert.jsx`). Same props. |
| 3. Navbar | Breadcrumb on the shadcn Breadcrumb. Refresh, Docs and GitHub on the shadcn Button. User menu on the shadcn DropdownMenu, with a shadcn Slider for text size. |
| 4. Search (Ctrl+K) | The shadcn Command dialog (cmdk). Fuse.js still ranks the results. |
| 5. Sidebar | Real buttons, a shadcn Collapsible for each section, a shadcn Tooltip for each icon in the collapsed sidebar. Same look. |
| 6. Magic UI | Floating 3D Particles behind the page (150, at most 30 frames per second, accent color). Animated Theme Toggler in the navbar. A Background animation switch in the user menu. |

## Behavior changes

- A click outside a confirm dialog does not close it. Use Cancel or Escape. Focus starts on the confirm button. The dialog role is now `alertdialog`.
- The user menu, the search and the dialogs close on Escape and keep the keyboard focus inside while open.
- Sidebar: Tab moves through the items; Enter or Space opens a section or a page. The current page has `aria-current="page"`.
- The theme change is an animated circle from the toggle button (browsers with View Transitions; others switch at once).
- The background animation is on by default. It stops when the tab is hidden and draws one still frame when the system asks for reduced motion. The choice is saved per browser (`chops_background_motion`).

## Fixed during this package

- Ctrl+K did nothing after a shadcn button or menu had focus, because the focused part stopped the key. The shortcut now listens first (capture phase).
- shadcn lists showed the browser list numbers: a "1." covered the first breadcrumb item. The scoped base reset now removes list numbers.
- The search dialog put its screen-reader heading ("Search pages") on every page, also while closed. The heading is now inside the dialog.

## Not done in this package

- The node and cluster pickers keep the app's own Select. It is used on many pages and moves to shadcn with the forms in package 4.
- The full shadcn Sidebar layout component is not used, because it replaces the page shell (widths and positions) on every page. The sidebar uses shadcn parts inside the existing shell.
- No mobile sheet for the sidebar. The app has no mobile layout today.

## Tests

- `bun run test` (with `.env`): all backend groups pass; 2132 frontend tests pass.
- `bun run lint`: 0 errors. `bun run build`: passes.
- Updated tests: toast (Sonner adds a toast on the next tick), confirm modal (role `alertdialog`, `data-variant="danger"`), navbar and sidebar source checks for the new markup, global search source checks.
- New tests: `sidebar-render.test.jsx` renders the sidebar and checks the buttons, `aria-current`, sections and the collapsed names.
- Visual check: new Home state with the user menu open. The check turns the background animation off.

## Visual check results

Full check on all pages (normal and stress data, 3 screen sizes, both themes):

- Charts: no change in size, position, legend or options.
- No API call is missing from the recording. No page errors.
- Pictures: the navbar, sidebar and search look almost the same; the search dialog is new (Command). I checked the changed parts zoomed in: navbar, breadcrumb, user menu, sidebar, search and System Dashboards.
- New accessibility problems: none.
- Layout reports that are not real problems: the open user menu and search dialog cover page text (they are overlays).
- One run of System Dashboards (normal data, dark) lost the signed-in state after tab 9: the navbar showed no user and no nodes. A second run was clean. I could not repeat it. If you see a sign-out on a long System Dashboards session, tell me.

## What to test by hand

1. Toasts: save something (for example App Config). The toast shows top right and closes after 4 seconds.
2. Delete a user in User Management: the confirm dialog opens; Escape cancels; the Delete button is red.
3. User menu: open it, change the text size with the slider and the arrow keys, turn the background animation off and on, sign out.
4. Ctrl+K from any page, also right after you close the user menu. Type "ddl", use the arrow keys and Enter.
5. Sidebar: use Tab and Enter to open sections and pages. Collapse the sidebar and hover an icon to see its name.
6. Theme toggle: switch dark and light. Look at the particles in both themes.
