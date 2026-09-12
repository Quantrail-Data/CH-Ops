// Test data factory - utilities for creating, managing, and cleaning up test data
// across e2e tests. Provides consistent fixtures and disposable test entities.
//
// Usage:
//   import { testDataFactory } from './fixtures/test-data-factory.js';
//   const factory = new TestDataFactory(page);
//   await factory.createUser({ name: 'test-user' });
//   await factory.cleanup();
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { expect } from "@playwright/test";

export class TestDataFactory {
  constructor(page, apiBaseURL = "http://127.0.0.1:3000") {
    this.page = page;
    this.apiBaseURL = apiBaseURL;
    this.createdUsers = [];
    this.createdRoles = [];
    this.createdProfiles = [];
    this.createdAlertRules = [];
    this.createdDashboards = [];
    this.createdChannels = [];
  }

  /**
   * Generate unique test user data
   */
  generateUserData(overrides = {}) {
    const timestamp = Date.now();
    return {
      username: `e2e_user_${timestamp}`,
      email: `e2e_user_${timestamp}@example.com`,
      password: `TestPass${timestamp}!`,
      ...overrides,
    };
  }

  /**
   * Generate unique test role data
   */
  generateRoleData(overrides = {}) {
    const timestamp = Date.now();
    return {
      name: `e2e_role_${timestamp}`,
      description: `Test role created at ${new Date().toISOString()}`,
      permissions: [],
      ...overrides,
    };
  }

  /**
   * Generate unique test profile (group) data
   */
  generateProfileData(overrides = {}) {
    const timestamp = Date.now();
    return {
      name: `e2e_profile_${timestamp}`,
      description: `Test profile created at ${new Date().toISOString()}`,
      members: [],
      ...overrides,
    };
  }

  /**
   * Generate unique test alert rule data
   */
  generateAlertRuleData(overrides = {}) {
    const timestamp = Date.now();
    return {
      name: `e2e_alert_${timestamp}`,
      description: `Test alert rule created at ${new Date().toISOString()}`,
      sql: "SELECT 1",
      threshold: 0,
      operator: "gt",
      severity: "warning",
      schedule: "*/5 * * * *",
      enabled: true,
      channel_ids: [],
      ...overrides,
    };
  }

  /**
   * Generate unique test dashboard data
   */
  generateDashboardData(overrides = {}) {
    const timestamp = Date.now();
    return {
      name: `e2e_dashboard_${timestamp}`,
      description: `Test dashboard created at ${new Date().toISOString()}`,
      cols: 2,
      charts: [],
      ...overrides,
    };
  }

  /**
   * Generate unique test notification channel data
   */
  generateChannelData(overrides = {}) {
    const timestamp = Date.now();
    return {
      name: `e2e_channel_${timestamp}`,
      type: "webhook",
      config: {
        url: `https://example.com/webhook/${timestamp}`,
      },
      ...overrides,
    };
  }

  /**
   * Create a test user via UI form
   */
  async createUserViaUI(userData = {}) {
    const user = this.generateUserData(userData);

    // Navigate to user management
    await this.page.goto("/#/admin/users");
    await expect(this.page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Switch to Users tab
    const usersTab = this.page.getByRole("button", { name: "Users", exact: true });
    if (await usersTab.count() > 0) {
      await usersTab.click();
    }

    // Click New User button
    const newUserBtn = this.page.getByRole("button", { name: /new user/i }).first();
    if (await newUserBtn.count() > 0) {
      await newUserBtn.click();
      await this.page.waitForTimeout(500);

      // Fill form
      const form = this.page.locator("form.card, form, .user-form").first();
      if (await form.count() > 0) {
        const usernameInput = form.locator("input[type='text']").first();
        const emailInput = form.locator("input[type='email']").first();
        const passwordInput = form.locator("input[type='password']").first();
        const submitBtn = form.locator("button[type='submit']").first();

        if (await usernameInput.count() > 0) {
          await usernameInput.fill(user.username);
        }
        if (await emailInput.count() > 0) {
          await emailInput.fill(user.email);
        }
        if (await passwordInput.count() > 0) {
          await passwordInput.fill(user.password);
        }
        if (await submitBtn.count() > 0) {
          await submitBtn.click();
          await this.page.waitForTimeout(1000);
        }
      }
    }

    this.createdUsers.push(user.username);
    return user;
  }

  /**
   * Create a test alert rule via UI form
   */
  async createAlertRuleViaUI(ruleData = {}) {
    const rule = this.generateAlertRuleData(ruleData);

    await this.page.goto("/#/alerting/rules");
    await expect(this.page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Click create rule button
    const createBtn = this.page.getByRole("button", { name: /new rule|add rule|create rule/i }).first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      await this.page.waitForTimeout(500);

      const form = this.page.locator("form.card, form, .rule-form").first();
      if (await form.count() > 0) {
        // Fill rule name
        const nameInput = form.locator("input[placeholder*='name' i]").first();
        if (await nameInput.count() > 0) {
          await nameInput.fill(rule.name);
        }

        // Fill description
        const descInput = form.locator("textarea, input[placeholder*='description' i]").first();
        if (await descInput.count() > 0) {
          await descInput.fill(rule.description);
        }

        // Fill threshold
        const thresholdInput = form.locator("input[type='number']").first();
        if (await thresholdInput.count() > 0) {
          await thresholdInput.fill(rule.threshold.toString());
        }

        // Submit
        const submitBtn = form.locator("button[type='submit']").first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click();
          await this.page.waitForTimeout(1000);
        }
      }
    }

    this.createdAlertRules.push(rule.name);
    return rule;
  }

  /**
   * Create a test dashboard via UI
   */
  async createDashboardViaUI(dashboardData = {}) {
    const dashboard = this.generateDashboardData(dashboardData);

    await this.page.goto("/#/dashboards");
    await expect(this.page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    // Click create dashboard button
    const createBtn = this.page.getByRole("button", { name: /new dashboard|add dashboard|create dashboard/i }).first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      await this.page.waitForTimeout(500);

      const form = this.page.locator("form.card, form, .create-form").first();
      if (await form.count() > 0) {
        // Fill name
        const nameInput = form.locator("input[placeholder*='name' i], input[placeholder*='dashboard' i]").first();
        if (await nameInput.count() > 0) {
          await nameInput.fill(dashboard.name);
        }

        // Fill description if exists
        const descInput = form.locator("textarea, input[placeholder*='description' i]").nth(1);
        if (await descInput.count() > 0) {
          await descInput.fill(dashboard.description);
        }

        // Fill columns if exists
        const colsInput = form.locator("input[type='number']").first();
        if (await colsInput.count() > 0) {
          await colsInput.fill(dashboard.cols.toString());
        }

        // Submit
        const submitBtn = form.locator("button[type='submit']").first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click();
          await this.page.waitForTimeout(1000);
        }
      }
    }

    this.createdDashboards.push(dashboard.name);
    return dashboard;
  }

  /**
   * Find and delete a user by username via UI
   */
  async deleteUserViaUI(username) {
    await this.page.goto("/#/admin/users");
    await expect(this.page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const usersTab = this.page.getByRole("button", { name: "Users", exact: true });
    if (await usersTab.count() > 0) {
      await usersTab.click();
    }

    // Search or find user row
    const userRow = this.page.locator("tr", { hasText: username }).first();
    if (await userRow.count() > 0) {
      const deleteBtn = userRow.locator('button[title*="Delete" i], button[title*="delete" i]').first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();
        await this.page.waitForTimeout(300);

        // Confirm deletion
        const modal = this.page.locator(".modal-box, .confirm-modal, [role='dialog']").first();
        if (await modal.count() > 0) {
          const confirmBtn = modal.locator("button.btn-danger, button[class*='danger']").first();
          if (await confirmBtn.count() > 0) {
            await confirmBtn.click();
            await this.page.waitForTimeout(1000);
          }
        }
      }
    }

    // Remove from tracking
    const index = this.createdUsers.indexOf(username);
    if (index > -1) {
      this.createdUsers.splice(index, 1);
    }
  }

  /**
   * Clean up all created test data
   */
  async cleanup() {
    // Delete users
    for (const username of this.createdUsers) {
      try {
        await this.deleteUserViaUI(username);
      } catch (e) {
        // Silently fail - data might already be deleted
      }
    }

    // Delete alert rules
    for (const ruleName of this.createdAlertRules) {
      try {
        await this.deleteAlertRuleViaUI(ruleName);
      } catch (e) {
        // Silently fail
      }
    }

    // Delete dashboards
    for (const dashName of this.createdDashboards) {
      try {
        await this.deleteDashboardViaUI(dashName);
      } catch (e) {
        // Silently fail
      }
    }

    this.createdUsers = [];
    this.createdRoles = [];
    this.createdProfiles = [];
    this.createdAlertRules = [];
    this.createdDashboards = [];
    this.createdChannels = [];
  }

  /**
   * Find and delete an alert rule by name via UI
   */
  async deleteAlertRuleViaUI(ruleName) {
    await this.page.goto("/#/alerting/rules");
    await expect(this.page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const ruleRow = this.page.locator("tr", { hasText: ruleName }).first();
    if (await ruleRow.count() > 0) {
      const deleteBtn = ruleRow.locator('button[title*="Delete" i]').first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();
        await this.page.waitForTimeout(300);

        const modal = this.page.locator(".modal-box, .confirm-modal, [role='dialog']").first();
        if (await modal.count() > 0) {
          const confirmBtn = modal.locator("button.btn-danger, button[class*='danger']").first();
          if (await confirmBtn.count() > 0) {
            await confirmBtn.click();
            await this.page.waitForTimeout(1000);
          }
        }
      }
    }

    const index = this.createdAlertRules.indexOf(ruleName);
    if (index > -1) {
      this.createdAlertRules.splice(index, 1);
    }
  }

  /**
   * Find and delete a dashboard by name via UI
   */
  async deleteDashboardViaUI(dashboardName) {
    await this.page.goto("/#/dashboards");
    await expect(this.page.locator(".sidebar")).toBeVisible({ timeout: 15000 });

    const dashboardCard = this.page.locator(".card", { hasText: dashboardName }).first();
    if (await dashboardCard.count() > 0) {
      await dashboardCard.click();
      await this.page.waitForTimeout(500);

      const deleteBtn = this.page.getByRole("button", { name: /delete|remove/i }).first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();
        await this.page.waitForTimeout(300);

        const modal = this.page.locator(".modal-box, .confirm-modal, [role='dialog']").first();
        if (await modal.count() > 0) {
          const confirmBtn = modal.locator("button.btn-danger, button[class*='danger']").first();
          if (await confirmBtn.count() > 0) {
            await confirmBtn.click();
            await this.page.waitForTimeout(1000);
          }
        }
      }
    }

    const index = this.createdDashboards.indexOf(dashboardName);
    if (index > -1) {
      this.createdDashboards.splice(index, 1);
    }
  }

  /**
   * Verify error message appears on screen
   */
  async expectErrorMessage(pattern = /error|failed|invalid/i) {
    const errorElement = this.page.locator(".alert-banner.danger, .error-message, [role='alert']").first();
    await expect(errorElement).toBeVisible({ timeout: 5000 });

    const errorText = await errorElement.textContent();
    expect(errorText).toMatch(pattern);
  }

  /**
   * Verify success message appears
   */
  async expectSuccessMessage(pattern = /success|created|saved|updated/i) {
    const successElement = this.page.locator(".alert-banner.success, .success-message, [role='alert']").first();
    await expect(successElement).toBeVisible({ timeout: 5000 });

    const successText = await successElement.textContent();
    expect(successText).toMatch(pattern);
  }

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoadingComplete() {
    const spinner = this.page.locator(".spinner, .loading, [data-testid='loader']").first();
    if (await spinner.count() > 0) {
      await expect(spinner).not.toBeVisible({ timeout: 10000 });
    }
    await this.page.waitForTimeout(300);
  }

  /**
   * Navigate to page and wait for sidebar
   */
  async navigateToPage(path) {
    await this.page.goto(`/#${path}`);
    await expect(this.page.locator(".sidebar")).toBeVisible({ timeout: 15000 });
    await this.waitForLoadingComplete();
  }
}

/**
 * Test helper - setup factory as fixture for tests
 */
export function setupTestDataFactory(test) {
  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.factory = new TestDataFactory(page);
  });

  test.afterEach(async (_, testInfo) => {
    if (testInfo.factory) {
      await testInfo.factory.cleanup();
    }
  });
}
