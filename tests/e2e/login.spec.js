// Login smoke test - runs unauthenticated (its own storageState), independent
// of the shared authenticated session the other e2e specs reuse.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("logs in with valid credentials and reaches the app shell", async ({ page }) => {
  const username = process.env.SUPER_ADMIN_1;
  const password = process.env.SUPER_ADMIN_1_PASSWORD;
  test.skip(!username || !password, "SUPER_ADMIN_1 / SUPER_ADMIN_1_PASSWORD not set in env");

  await page.goto("/");
  const form = page.locator("form.login-form-con");
  await expect(form).toBeVisible();

  await form.locator("input.form-input").first().fill(username);
  await form.locator('input[type="password"]').fill(password);
  await form.locator('button[type="submit"]').click();

  await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });
});

test("shows an error on invalid credentials", async ({ page }) => {
  await page.goto("/");
  const form = page.locator("form.login-form-con");
  await form.locator("input.form-input").first().fill("not-a-real-user");
  await form.locator('input[type="password"]').fill("definitely-wrong");
  await form.locator('button[type="submit"]').click();

  await expect(page.locator(".alert-banner.danger")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".sidebar")).not.toBeVisible();
});
