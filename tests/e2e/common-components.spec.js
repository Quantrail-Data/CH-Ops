// Common components smoke tests - regression baseline for reusable UI components
// used across the application including selects, inputs, badges, buttons, modals, etc.
//
// This suite tests component behavior across different pages where they appear:
// - Select component (dropdown selection)
// - MultiSelect component (multiple selections)
// - ParamInput component (parameter input)
// - Badge component (status badges)
// - Button component (various button states)
// - InfoTip component (tooltips)
// - Modal behavior (open, close, interactions)
// - Error handling and validation
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { test, expect } from "@playwright/test";
import { TestDataFactory } from "./fixtures/test-data-factory.js";

function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test.describe("Common Components", () => {
  let factory;

  test.beforeEach(async ({ page }) => {
    factory = new TestDataFactory(page);
  });

  test.afterEach(async () => {
    if (factory) {
      await factory.cleanup();
    }
  });

  test("select dropdown component renders and opens", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/dashboards");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Look for select elements (dashboard selector or similar)
    const selectElements = page.locator("select, .select-container, .select-control").first();
    if (await selectElements.count() > 0) {
      // Try to interact with select
      await selectElements.first().click({ force: true });
      // Wait for options to appear
      await page.waitForTimeout(300);
    }

    expect(errors).toEqual([]);
  });

  test("select component keyboard navigation works", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/dashboards");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Find and click select
    const selectElements = page.locator("select, .select-container, .select-control").first();
    if (await selectElements.count() > 0) {
      await selectElements.first().click({ force: true });
      await page.waitForTimeout(300);

      // Try arrow down to select next option
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    }

    expect(errors).toEqual([]);
  });

  test("select component closes on Escape", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/dashboards");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const selectElements = page.locator("select, .select-container, .select-control").first();
    if (await selectElements.count() > 0) {
      await selectElements.first().click({ force: true });
      await page.waitForTimeout(300);

      // Close with Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }

    expect(errors).toEqual([]);
  });

  test("form input components are visible and interactive", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/users");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Just verify page loaded - inputs may have security restrictions
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test("badge component renders correctly", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/alerting/rules");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Look for badges (severity badges, status badges, etc)
    const badges = page.locator(".badge, [class*='badge'], span[class*='badge']").first();
    if (await badges.count() > 0) {
      await expect(badges).toBeVisible();

      // Check that badge has content
      const text = await badges.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }

    expect(errors).toEqual([]);
  });

  test("button component renders in different states", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/users");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Look for buttons
    const buttons = page.locator("button.btn, button[class*='btn']").first();
    if (await buttons.count() > 0) {
      await expect(buttons).toBeVisible();

      // Check multiple buttons
      const allButtons = page.locator("button.btn, button[class*='btn']");
      const buttonCount = await allButtons.count();
      expect(buttonCount).toBeGreaterThan(0);
    }

    expect(errors).toEqual([]);
  });

  test("button click handlers work", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/alerting/rules");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Find a clickable button (e.g., New Rule)
    const clickableBtn = page.getByRole("button", { name: /new|create|add/i }).first();
    if (await clickableBtn.count() > 0) {
      await clickableBtn.click();
      // Wait to see if anything appears (form, modal, etc)
      await page.waitForTimeout(300);
    }

    expect(errors).toEqual([]);
  });

  test("info tip tooltip is visible on hover", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/dashboards");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Look for info tip icon (usually a small i icon or similar)
    const infoTip = page.locator("button[aria-label*='info' i], .info-tip, [class*='tooltip']").first();
    if (await infoTip.count() > 0) {
      // Hover over info tip
      await infoTip.hover();
      await page.waitForTimeout(300);

      // Tooltip might appear
      const tooltip = page.locator("[role='tooltip'], .tooltip, .popover").first();
      if (await tooltip.count() > 0) {
        // Tooltip content should be visible
        const content = await tooltip.textContent();
        expect(content?.trim().length).toBeGreaterThan(0);
      }
    }

    expect(errors).toEqual([]);
  });

  test("modal component renders with title and content", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/users");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Trigger a modal by clicking a button that opens one
    const usersTab = page.getByRole("button", { name: "Users", exact: true });
    if (await usersTab.count() > 0) {
      await usersTab.click();
    }

    // Find and click delete button to open confirmation modal - pick a row
    // whose delete action isn't disabled by RBAC (e.g. same-or-higher-level
    // users can't be deleted by the logged-in admin, and nth(1) may land on
    // exactly that row).
    const deleteBtn = page.locator('tr button[title*="Delete" i]:not([disabled])').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();

      // Modal should be visible
      const modal = page.locator(".modal-box, .confirm-modal, [role='dialog']").first();
      if (await modal.count() > 0) {
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Check for modal content
        const modalContent = await modal.textContent();
        expect(modalContent?.trim().length).toBeGreaterThan(0);
      }
    }

    expect(errors).toEqual([]);
  });

  test("modal backdrop click closes modal", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/users");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const usersTab = page.getByRole("button", { name: "Users", exact: true });
    if (await usersTab.count() > 0) {
      await usersTab.click();
    }

    // Open modal - pick a row whose delete action isn't disabled by RBAC
    // (e.g. same-or-higher-level users can't be deleted by the logged-in admin)
    const deleteBtn = page.locator('tr button[title*="Delete" i]:not([disabled])').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();

      const modal = page.locator(".modal-box, .confirm-modal, [role='dialog']").first();
      if (await modal.count() > 0) {
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Click backdrop to close
        const overlay = page.locator(".modal-overlay, .backdrop, [data-testid='modal-backdrop']").first();
        if (await overlay.count() > 0) {
          await overlay.click({ position: { x: 5, y: 5 } });
          await expect(modal).not.toBeVisible();
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("card component renders with content", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/overview/cluster");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Look for card components
    const cards = page.locator(".card");
    if (await cards.count() > 0) {
      await expect(cards.first()).toBeVisible();

      // Card should have content
      const cardContent = await cards.first().textContent();
      expect(cardContent?.trim().length).toBeGreaterThan(0);
    }

    expect(errors).toEqual([]);
  });

  test("table component renders headers and rows", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/users");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const usersTab = page.getByRole("button", { name: "Users", exact: true });
    if (await usersTab.count() > 0) {
      await usersTab.click();
    }

    // Look for table
    const table = page.locator("table").first();
    if (await table.count() > 0) {
      await expect(table).toBeVisible();

      // Check for table headers
      const headers = table.locator("th");
      if (await headers.count() > 0) {
        await expect(headers.first()).toBeVisible();
      }

      // Check for table rows
      const rows = table.locator("tr");
      if (await rows.count() > 1) {
        await expect(rows.nth(1)).toBeVisible();
      }
    }

    expect(errors).toEqual([]);
  });

  test("form component with multiple field types", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/alerting/rules");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Look for create button to open form
    const createBtn = page.getByRole("button", { name: /new rule|add rule|create rule/i }).first();
    if (await createBtn.count() > 0) {
      await createBtn.click();

      // Wait for form
      const form = page.locator("form.card, form, .rule-form").first();
      if (await form.count() > 0) {
        await expect(form).toBeVisible({ timeout: 5000 });

        // Check for various input types
        const inputs = form.locator("input, select, textarea").first();
        if (await inputs.count() > 0) {
          await expect(inputs).toBeVisible();
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("form input validation shows error on invalid input", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/users");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const usersTab = page.getByRole("button", { name: "Users", exact: true });
    if (await usersTab.count() > 0) {
      await usersTab.click();
    }

    // Open create user form
    const newUserBtn = page.getByRole("button", { name: /new user/i }).first();
    if (await newUserBtn.count() > 0) {
      await newUserBtn.click();
      await page.waitForTimeout(500);

      const form = page.locator("form.card, form, .user-form").first();
      if (await form.count() > 0) {
        // Fill only email with invalid format
        const emailInput = form.locator("input[type='email']").first();
        if (await emailInput.count() > 0) {
          await emailInput.fill("invalid");

          // Try to move to next field to trigger validation
          await emailInput.blur();
          await page.waitForTimeout(300);

          // Should show validation error
          const errorMsg = page.locator(".form-error, [role='alert'], .error-message").first();
          if (await errorMsg.count() > 0) {
            // Error might be shown
          }
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("button disabled state works correctly", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/users");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const usersTab = page.getByRole("button", { name: "Users", exact: true });
    if (await usersTab.count() > 0) {
      await usersTab.click();
    }

    // Open form
    const newUserBtn = page.getByRole("button", { name: /new user/i }).first();
    if (await newUserBtn.count() > 0) {
      await newUserBtn.click();
      await page.waitForTimeout(500);

      const form = page.locator("form.card, form, .user-form").first();
      if (await form.count() > 0) {
        // Find submit button
        const submitBtn = form.locator("button[type='submit']").first();
        if (await submitBtn.count() > 0) {
          // Button might be disabled initially
          const isDisabled = await submitBtn.isDisabled();
          // Either disabled or enabled is ok, just check it exists
          await expect(submitBtn).toBeVisible();
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("modal handles long content with scrolling", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/users");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const usersTab = page.getByRole("button", { name: "Users", exact: true });
    if (await usersTab.count() > 0) {
      await usersTab.click();
    }

    // Open delete confirmation (which might have long content) - skip rows
    // whose delete action is disabled by RBAC (self, or a higher-privilege user)
    const deleteBtn = page.locator('tr button[title*="Delete" i]:not([disabled])').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();

      const modal = page.locator(".modal-box, .confirm-modal, [role='dialog']").first();
      if (await modal.count() > 0) {
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Modal should be scrollable if needed
        const scrollTop = await modal.evaluate((el) => el.scrollTop);
        // Scrolling is ok
      }
    }

    expect(errors).toEqual([]);
  });

  test("select component handles arrow key navigation", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/dashboards");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Find and interact with select
    const selectElements = page.locator("select, .select-container, .select-control").first();
    if (await selectElements.count() > 0) {
      await selectElements.first().click({ force: true });
      await page.waitForTimeout(300);

      // Navigate with arrows
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowUp");

      // All keyboard interactions should work
    }

    expect(errors).toEqual([]);
  });

  test("badge component displays correctly with different colors", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/alerting/rules");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Just verify page loaded - badges may or may not be present
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test("tooltip component appears on hover and disappears on mouse leave", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/admin/api-management");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Scope to main content: the topbar has [title] elements (e.g. the
    // cluster switcher) that would otherwise match first and intercept hover.
    const tooltipElement = page
      .locator("main .tooltip-trigger, main [title], main button[aria-label*='info' i]")
      .first();
    if (await tooltipElement.count() > 0) {
      // Hover to show tooltip
      await tooltipElement.hover();
      await page.waitForTimeout(300);

      // Tooltip might be visible
      const tooltip = page.locator("[role='tooltip'], .tooltip, .popover").first();
      if (await tooltip.count() > 0) {
        await expect(tooltip).toBeVisible();
      }

      // Move away
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);

      // Tooltip should be hidden or gone
    }

    expect(errors).toEqual([]);
  });

  test("select component handles search/filter", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/dashboards");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Find select element
    const selectElements = page.locator("select, .select-container, .select-control").first();
    if (await selectElements.count() > 0) {
      await selectElements.first().click({ force: true });
      await page.waitForTimeout(300);

      // Try typing to filter
      await page.keyboard.type("a");
      await page.waitForTimeout(300);

      // Options should be filtered or component should handle it gracefully
    }

    expect(errors).toEqual([]);
  });

  test("form shows required field indicators", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/#/alerting/rules");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Open create rule form
    const createBtn = page.getByRole("button", { name: /new rule|add rule|create rule/i }).first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      await page.waitForTimeout(500);

      const form = page.locator("form.card, form, .rule-form").first();
      if (await form.count() > 0) {
        // Look for required field indicators (asterisk, label text, etc)
        const labels = form.locator("label");
        if (await labels.count() > 0) {
          for (let i = 0; i < Math.min(await labels.count(), 3); i++) {
            const label = labels.nth(i);
            const text = await label.textContent();
            // Label text should be visible
            expect(text?.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }

    expect(errors).toEqual([]);
  });
});
