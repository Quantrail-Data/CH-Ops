# CHOps 2.0 UI revamp: package 6.1 (your package 6 feedback and the Login design)

Base: package 6 (`c43d8b3`) on branch `tailwind_shadcn_magicui`. This zip is the full repo with packages 2 to 6.1; the last commit is `06952d2`.

Run `bun install` first. Package 6 added `react-day-picker` and `html-to-image`; without them, 5 test files fail to load.

## What this package does

| Point | Change |
|---|---|
| 1. Text selection | The selection color is stronger. In the SQL Editor, a selection on the current line did not show: the solid current-line color covered it (the editor draws the selection behind the text). That line is now transparent. This was in the team's editor code before the revamp. |
| 2. Particles | Bigger (size 2.2 to 4) and stronger (0.27 to 0.55 dark, 0.22 to 0.5 light). Still 15 frames per second. |
| 3. Date picker | The popover had a fixed width of 18rem, wider than the calendar. Now it is as wide as the calendar, and the time field fits in it. |
| 4. Icons | 5 icons were not in the app's icon set and showed as squares: `brand-slack`, `brand-teams` (Notification Channels), `message-circle`, `contract` (Trusted CAs) and `world-bolt` (Login). They are added from Tabler 3.50. A scan of all pages and tabs (both data sets) finds no square icon now. |
| 5. Login carousel | One carousel. The feature text moves with the screenshots, also with the arrows and dots. Before, the text had its own timer, and only the screenshots moved by hand. |
| Login design | The Login page follows `Login.dc.html`. See below. |

## Login page

Your choices: keep the current texts, follow the design effects, no Google button.

- Product side on the left: logo, headline, subtitle, proof line, feature chips, screenshot carousel with dots and arrows below it, feature text, trademark line.
- Sign-in card on the right with a Shine Border (a light turns slowly around the border).
- 260 particles behind the whole page (the design and the component map say 260; the app has 150).
- The feature chips move slowly and stop when the pointer is on them.
- "Forgot password?" is in the password label row.
- The Login button is a plain accent button with a soft glow.
- Removed from Login: Aurora Text, Shimmer Button, Border Beam. Aurora Text and Shimmer Button are deleted (nothing else used them). The SQL Editor Go button keeps its shimmer.
- Not in the design and not added: "Sign in with Google" (CHOps has no Google sign-in; it needs backend work).
- Small fixes: the error box is full width, and it clears when you open "Forgot password?".
- Screens narrower than 1100 px show only the sign-in card. Short windows can scroll.

Speed: the first Shine Border used an animated gradient angle. It repainted the card on each frame, and Login used 13% of one core when idle. It is now a turning square behind the card (a transform): 5%.

## Tests

- `bun run test` (with `.env`): all backend groups pass; 2179 frontend tests pass. `bun run lint`: 0 errors (the same 5 warnings). `bun run build` and `bun run check:bundle` (474 KB): pass.
- Idle CPU on Home: 4.0% and 4.3% with the background animation on (limit 5%), 1.8% and 2.0% off (limit 3%).
- New tests: the Login layout and carousel (`login-carousel.test.js`), `stepsBetween` (`carousel-steps.test.js`).
- I did not run the full visual check again for this package. I checked these by screenshots: Login (1280, 1440 and 1920 px, both themes, the error and Forgot password states), the date picker, the text selection, the particles.

## What to check

1. Run `bun install`, then `bun run test`. Make sure that all tests pass.
2. SQL Editor: type 3 lines. Select a part of the current line with the mouse. Make sure that the selection shows. Select text on a card on another page. Make sure that the selection shows.
3. Look at the particles on Home and on Error Log in both themes. Make sure that they are bigger and easier to see.
4. Error Log: click the date field. Make sure that the popover is as wide as the calendar and that the time field is inside it.
5. Control panel > Notification Channels and Trusted CAs: make sure that the Slack, Teams and certificate icons show (not squares).
6. Log out. Make sure that the Login page looks like `Login.dc.html`: the product side on the left, the card on the right.
7. Make sure that a light turns slowly around the card border, and that the feature chips move. Put the pointer on a chip. Make sure that the chips stop.
8. Click the right arrow under the screenshots. Make sure that the screenshot and the text under it both change. Click the left arrow, then a dot. Make sure that the text changes each time.
9. Type a wrong password and click Login. Make sure that the error box is as wide as the fields. Click "Forgot password?". Make sure that the error goes away.
10. Set the light theme. Do steps 6 to 8 again.
11. In the user menu, turn off Background animation (or turn on "reduce motion" in your system). Make sure that the border light, the chips and the particles stop.
12. Make the window narrower than 1100 px. Make sure that only the card shows.
