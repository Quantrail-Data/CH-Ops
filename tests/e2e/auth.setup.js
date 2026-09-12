// Auth setup for the e2e suite - logs in once via the real login form using
// the existing env-based super-admin login fallback (SUPER_ADMIN_1 /
// SUPER_ADMIN_1_PASSWORD, see .env.example), then saves storageState so every
// other spec starts already authenticated.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { test as setup, expect } from "@playwright/test";

const authFile = "tests/e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  setup.setTimeout(60000);
  const username = process.env.SUPER_ADMIN_1;
  const password = process.env.SUPER_ADMIN_1_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "e2e login requires SUPER_ADMIN_1 and SUPER_ADMIN_1_PASSWORD in the " +
        "environment (the same super-admin fallback credentials configured " +
        "in your local .env). Export them before running `bun run test:e2e`.",
    );
  }

  await page.goto("/");
  const form = page.locator("form.login-form-con");
  await form.locator("input.form-input").first().fill(username);
  await form.locator('input[type="password"]').fill(password);

  // `webServer` only confirms the Vite dev port is open, not that the proxied
  // backend on :3000 has finished its cold start. Hitting login during that
  // window gets an empty proxied response, which the login form surfaces as
  // an "Unexpected end of JSON input" error - retry the submit rather than
  // failing on that transient window.
  let loggedIn = false;
  for (let attempt = 0; attempt < 10 && !loggedIn; attempt++) {
    await form.locator('button[type="submit"]').click();
    try {
      await expect(page.locator(".sidebar")).toBeVisible({ timeout: 3000 });
      loggedIn = true;
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  if (!loggedIn) {
    throw new Error("Login did not succeed after retries - is the backend reachable on :3000?");
  }

  await page.context().storageState({ path: authFile });
});
