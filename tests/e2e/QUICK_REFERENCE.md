# E2E Test Suite - Quick Reference

## Running Tests

```bash
# All tests
bun run test:e2e

# Specific file
bun run test:e2e -- query-pages.spec.js

# Pattern matching
bun run test:e2e -- --grep "user creation"

# Interactive UI
bun run test:e2e -- --ui

# Headed browser
bun run test:e2e -- --headed

# Debug mode
bun run test:e2e -- --debug

# Single test
bun run test:e2e -- query-pages.spec.js -g "invalid query"
```

## Test Files at a Glance

| File | Focus | Key Tests |
|------|-------|-----------|
| query-pages.spec.js | Query list, history, bookmarks | 11 tests |
| admin-pages.spec.js | Users, API, cluster, config | 17 tests |
| alerting.spec.js | Alert rules, channels | 15 tests |
| rbac.spec.js | Users, roles, profiles, grants | 19 tests |
| dashboards.spec.js | Dashboards, charts, filters | 17 tests |
| common-components.spec.js | UI components | 21 tests |

## Using Test Data Factory

### Basic Pattern
```javascript
import { TestDataFactory } from "./fixtures/test-data-factory.js";

test.describe("My Suite", () => {
  let factory;

  test.beforeEach(async ({ page }) => {
    factory = new TestDataFactory(page);
  });

  test.afterEach(async () => {
    await factory.cleanup();
  });

  test("my test", async ({ page }) => {
    // Create test data
    const user = await factory.createUserViaUI();
    // Test something
    // Auto cleanup in afterEach
  });
});
```

### Create Test Data
```javascript
// Generate data (doesn't create in DB, just object)
const user = factory.generateUserData({ username: "custom" });
const rule = factory.generateAlertRuleData({ threshold: 100 });
const dashboard = factory.generateDashboardData({ cols: 3 });
const role = factory.generateRoleData({ name: "admin" });

// Create via UI form (creates in DB + tracks for cleanup)
await factory.createUserViaUI();
await factory.createUserViaUI({ username: "specific" });
await factory.createAlertRuleViaUI();
await factory.createDashboardViaUI();
```

### Cleanup
```javascript
// Manual cleanup of specific items
await factory.deleteUserViaUI("e2e_user_123");
await factory.deleteAlertRuleViaUI("e2e_alert_123");
await factory.deleteDashboardViaUI("e2e_dashboard_123");

// Auto cleanup of everything created
await factory.cleanup(); // Call in test.afterEach()
```

### Helper Methods
```javascript
// Expect messages
await factory.expectErrorMessage(/invalid email/i);
await factory.expectSuccessMessage(/created/i);

// Wait for loading
await factory.waitForLoadingComplete();

// Navigate safely
await factory.navigateToPage("/admin/users");
```

## Common Test Patterns

### Smoke Test (Page Renders)
```javascript
test("page renders without JS crash", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/#/path");
  await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});
```

### Error Case Test
```javascript
test("invalid input shows error", async ({ page }) => {
  const form = page.locator("form").first();
  const input = form.locator("input[type='email']").first();
  
  await input.fill("invalid-email");
  await form.locator("button[type='submit']").click();
  
  const error = page.locator(".alert-banner.danger");
  await expect(error).toBeVisible();
});
```

### Modal Test
```javascript
test("modal closes on escape", async ({ page }) => {
  const btn = page.getByRole("button", { name: "Delete" }).first();
  await btn.click();
  
  const modal = page.locator(".modal-box").first();
  await expect(modal).toBeVisible();
  
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
});
```

### User Flow Test
```javascript
test("create user flow", async ({ page }) => {
  const factory = new TestDataFactory(page);
  
  // Create
  const user = await factory.createUserViaUI();
  
  // Verify exists
  const row = page.locator("tr", { hasText: user.username });
  await expect(row).toBeVisible();
  
  // Delete
  await factory.deleteUserViaUI(user.username);
  
  // Verify deleted
  await expect(row).not.toBeVisible();
});
```

## Key Selectors

```javascript
// Navigation
page.locator(".sidebar")

// Common elements
page.locator("table")
page.locator("form")
page.locator("tr")
page.locator(".card")
page.locator(".modal-box")

// By role (preferred)
page.getByRole("button", { name: /text/i })
page.getByRole("textbox")
page.getByRole("option")

// Alerts
page.locator(".alert-banner.danger")  // Error
page.locator(".alert-banner.success") // Success
page.locator("[role='alert']")

// Specific attributes
page.locator("button[type='submit']")
page.locator('button[title*="Delete"]')
page.locator("input[type='email']")

// Conditionally check existence
if (await btn.count() > 0) { await btn.click(); }
```

## Debugging Tips

```bash
# Run in headed mode (watch browser)
bun run test:e2e -- query-pages.spec.js --headed

# Debug mode with inspector
bun run test:e2e -- query-pages.spec.js --debug

# Run single test
bun run test:e2e -- query-pages.spec.js -g "invalid"

# Verbose output
bun run test:e2e -- --verbose

# Show all selectors being used
bun run test:e2e -- query-pages.spec.js --headed --trace on
```

## Pause for Manual Inspection
```javascript
test("manual inspection", async ({ page }) => {
  await page.goto("/#/admin/users");
  
  await page.pause(); // <- Pauses here, opens inspector
  
  // Continue test after inspector closes
  await expect(page.locator("table")).toBeVisible();
});
```

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| Element not found | Use `if (await btn.count() > 0)` before clicking |
| Test times out | Increase timeout: `{ timeout: 30000 }` |
| Flaky test | Add waits: `await page.waitForTimeout(500)` |
| Backend not ready | Check if backend runs on :3000 |
| Wrong credentials | Verify SUPER_ADMIN_1 env vars |
| Modal doesn't close | Try `page.keyboard.press("Escape")` |

## Test Data Examples

```javascript
// What gets auto-generated
factory.generateUserData()
// {
//   username: "e2e_user_1695123456789",
//   email: "e2e_user_1695123456789@example.com",
//   password: "TestPass1695123456789!"
// }

// Custom override
factory.generateUserData({
  username: "my-user",
  email: "my@example.com"
})
// {
//   username: "my-user",
//   email: "my@example.com",
//   password: "TestPass1695123456789!"
// }
```

## Test Metrics

```
Total Tests: 106
├── Query Pages: 11 tests
├── Admin Pages: 17 tests
├── Alerting: 15 tests
├── RBAC: 19 tests
├── Dashboards: 17 tests
└── Components: 21 tests

Coverage:
✅ Happy path (basic functionality)
✅ Error cases (validation, duplicate, network)
✅ Edge cases (empty states, missing data)
✅ Modal interactions (open, close, escape)
✅ Form submission (validation, errors)
✅ Cleanup (automatic data deletion)
```

## CI Integration

```yaml
# In .github/workflows/test.yml
- name: Run E2E Tests
  run: |
    bun run gen:e2e-env
    bun run test:e2e
```

## Need More Info?

- **Detailed Usage**: See [README.md](./README.md)
- **Implementation Details**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Factory API**: See [test-data-factory.js](./fixtures/test-data-factory.js)

## Cheatsheet for Writing New Tests

1. **Setup factory**
```javascript
let factory;
test.beforeEach(async ({ page }) => {
  factory = new TestDataFactory(page);
});
test.afterEach(async () => await factory.cleanup());
```

2. **Track errors**
```javascript
const errors = trackPageErrors(page);
// ... test code ...
expect(errors).toEqual([]);
```

3. **Create test data**
```javascript
const user = await factory.createUserViaUI();
const rule = await factory.createAlertRuleViaUI();
```

4. **Verify it worked**
```javascript
const row = page.locator("tr", { hasText: user.username });
await expect(row).toBeVisible();
```

5. **Test error cases**
```javascript
const form = page.locator("form").first();
const input = form.locator("input[type='email']").first();
await input.fill("invalid");
await form.locator("button[type='submit']").click();
await expect(page.locator(".alert-banner.danger")).toBeVisible();
```

6. **Test modal**
```javascript
const btn = page.getByRole("button", { name: "Delete" }).first();
await btn.click();
const modal = page.locator(".modal-box").first();
await expect(modal).toBeVisible();
await page.keyboard.press("Escape");
await expect(modal).not.toBeVisible();
```

---

**106 Tests | 6 Feature Areas | 100% Automated | Zero Manual Effort to Cleanup**
