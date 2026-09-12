# E2E Test Suite Documentation

Comprehensive Playwright test suites for RTK application with test data factory for consistent setup and teardown.

## Test Files Overview

| Test Suite | Coverage | Tests | Focus |
|------------|----------|-------|-------|
| **login.spec.js** | Authentication | 2 | Valid/invalid credentials, error handling |
| **auth.setup.js** | Session setup | 1 | Authenticated session creation |
| **navigation-smoke.spec.js** | Page loading | 3 | Page rendering, JS errors |
| **confirm-modal.spec.js** | Modal interactions | 1 | Delete confirmation, close paths |
| **query-pages.spec.js** | Query management | 12 | Current queries, history, bookmarks, errors |
| **admin-pages.spec.js** | Admin UI | 18 | Users, API, cluster, backup, notifications |
| **alerting.spec.js** | Alert management | 15 | Rules, channels, validation, errors |
| **rbac.spec.js** | Access control | 17 | Users, roles, profiles, permissions |
| **dashboards.spec.js** | Dashboard management | 17 | Creation, viewing, filtering, deletion |
| **common-components.spec.js** | UI components | 22 | Select, input, modal, button, form, badge |

**Total: 107 comprehensive tests**

## Running Tests

### Run all tests
```bash
bun run test:e2e
```

### Run specific test file
```bash
bun run test:e2e -- query-pages.spec.js
bun run test:e2e -- admin-pages.spec.js
```

### Run tests matching pattern
```bash
bun run test:e2e -- --grep "user creation"
bun run test:e2e -- --grep "alert"
```

### Run with different modes
```bash
# Interactive UI mode
bun run test:e2e -- --ui

# Headed browser (see what's happening)
bun run test:e2e -- --headed

# Debug mode
bun run test:e2e -- --debug

# Single threaded
bun run test:e2e -- --workers=1
```

### Run specific test
```bash
bun run test:e2e -- query-pages.spec.js -g "invalid query ID"
```

## Test Data Factory

The `test-data-factory.js` provides utilities for creating, managing, and cleaning up test data across tests.

### Basic Usage

```javascript
import { TestDataFactory } from "./fixtures/test-data-factory.js";

test("my test", async ({ page }) => {
  const factory = new TestDataFactory(page);
  
  // Generate test data
  const userData = factory.generateUserData();
  
  // Create via UI
  const user = await factory.createUserViaUI(userData);
  
  // Do test assertions...
  
  // Automatic cleanup
  await factory.cleanup();
});
```

### Setup in beforeEach/afterEach

```javascript
test.describe("My Suite", () => {
  let factory;

  test.beforeEach(async ({ page }) => {
    factory = new TestDataFactory(page);
  });

  test.afterEach(async () => {
    if (factory) {
      await factory.cleanup();
    }
  });

  test("test that uses factory", async ({ page }) => {
    // Factory is available for all tests in suite
  });
});
```

## Factory Methods

### Data Generation

```javascript
// Generate user data
const user = factory.generateUserData({
  username: "custom-name",
  email: "custom@example.com"
});

// Generate alert rule
const rule = factory.generateAlertRuleData({
  name: "custom-rule",
  threshold: 100,
  severity: "critical"
});

// Generate dashboard
const dashboard = factory.generateDashboardData({
  name: "custom-dashboard",
  cols: 3
});

// Generate role
const role = factory.generateRoleData({
  name: "custom-role",
  permissions: ["read", "write"]
});

// Generate profile
const profile = factory.generateProfileData({
  name: "custom-profile",
  members: []
});

// Generate channel
const channel = factory.generateChannelData({
  name: "webhook-channel",
  type: "webhook"
});
```

### Creation Methods

```javascript
// Create user via UI form
const user = await factory.createUserViaUI();

// Create with custom data
const user = await factory.createUserViaUI({
  username: "specific-user",
  email: "specific@example.com"
});

// Create alert rule
const rule = await factory.createAlertRuleViaUI();

// Create dashboard
const dashboard = await factory.createDashboardViaUI();
```

### Deletion Methods

```javascript
// Delete user by username
await factory.deleteUserViaUI("e2e_user_123");

// Delete alert rule by name
await factory.deleteAlertRuleViaUI("e2e_alert_123");

// Delete dashboard by name
await factory.deleteDashboardViaUI("e2e_dashboard_123");

// Clean up all created data
await factory.cleanup();
```

### Helper Methods

```javascript
// Expect error message
await factory.expectErrorMessage(/email.*invalid/i);

// Expect success message
await factory.expectSuccessMessage(/user.*created/i);

// Wait for loading to complete
await factory.waitForLoadingComplete();

// Navigate to page with automatic wait
await factory.navigateToPage("/admin/users");
```

## Test Structure

### Smoke Tests (Basic Rendering)
Check that pages load without JavaScript errors and key UI elements are visible.

```javascript
test("page renders without JS crash", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/#/path");
  await expect(page.locator(".sidebar")).toBeVisible({ timeout: 15000 });
  // ... assertions ...
  expect(errors).toEqual([]);
});
```

### Error Cases
Test validation, invalid input, and error states.

```javascript
test("form shows validation error on invalid input", async ({ page }) => {
  // Fill form with invalid data
  // Try to submit
  // Verify error message appears
  const errorMsg = page.locator(".alert-banner.danger");
  await expect(errorMsg).toBeVisible();
});
```

### User Flows
Test complete user interactions from start to finish.

```javascript
test("user creation with cleanup", async ({ page }) => {
  const factory = new TestDataFactory(page);
  
  // Create user
  const user = await factory.createUserViaUI();
  
  // Verify creation succeeded
  const row = page.locator("tr", { hasText: user.username });
  await expect(row).toBeVisible();
  
  // Cleanup happens in afterEach
  await factory.cleanup();
});
```

## Key Testing Patterns

### Conditional Checks
Use `await .count() > 0` to gracefully handle optional UI elements:

```javascript
const btn = page.getByRole("button", { name: /new/i }).first();
if (await btn.count() > 0) {
  await btn.click();
}
```

### Error Tracking
Track JavaScript errors to catch unhandled exceptions:

```javascript
function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

// Later in test
expect(errors).toEqual([]);
```

### Modal Interactions
Test modal open/close patterns:

```javascript
// Open modal
await deleteBtn.click();
const modal = page.locator(".modal-box").first();
await expect(modal).toBeVisible({ timeout: 5000 });

// Close via Escape
await page.keyboard.press("Escape");
await expect(modal).not.toBeVisible();

// Close via overlay click
await page.locator(".modal-overlay").click({ position: { x: 5, y: 5 } });
```

### Form Submission
Fill and submit forms consistently:

```javascript
const form = page.locator("form").first();
const input = form.locator("input[type='email']").first();
await input.fill("user@example.com");

const submit = form.locator("button[type='submit']").first();
await submit.click();
await page.waitForTimeout(1000);
```

## Selectors Reference

### Common Selectors Used

```javascript
// Navigation
page.locator(".sidebar")

// Forms
page.locator("form.card, form")
page.locator("input.form-input")
page.locator("input[type='email']")
page.locator("button[type='submit']")

// Tables
page.locator("table")
page.locator("tr") // rows
page.locator("th") // headers
page.locator("td") // cells

// Modals
page.locator(".modal-box, .confirm-modal, [role='dialog']")
page.locator(".modal-overlay")

// Alerts
page.locator(".alert-banner.danger")
page.locator(".alert-banner.success")
page.locator("[role='alert']")

// Cards
page.locator(".card")
page.locator(".badge")
page.locator(".empty-state")

// Buttons
page.getByRole("button", { name: /text/i })
page.locator('button[title*="Delete"]')
page.locator('button[aria-pressed]')
```

## Best Practices

### 1. Use Factory for Consistent Setup
```javascript
// Good
const factory = new TestDataFactory(page);
const user = await factory.createUserViaUI();

// Avoid
// Manual form filling without tracking for cleanup
```

### 2. Track Created Data
```javascript
// Good - factory auto-tracks
const user = await factory.createUserViaUI();
await factory.cleanup(); // auto-deletes

// Avoid - manual tracking
const username = "user123";
// ... forget to delete
```

### 3. Graceful Element Handling
```javascript
// Good - handles missing elements
const btn = page.getByRole("button").first();
if (await btn.count() > 0) {
  await btn.click();
}

// Avoid - crashes if element doesn't exist
await page.getByRole("button", { name: "Missing" }).click();
```

### 4. Meaningful Test Names
```javascript
// Good
test("user creation with invalid email shows validation error", ...);

// Avoid
test("test user creation", ...);
```

### 5. Isolate Test Data
```javascript
// Good - each test has isolated data
test("test 1", async ({ page }) => {
  const user = await factory.createUserViaUI();
  // Test specific to this user
  await factory.cleanup();
});

// Avoid - sharing state between tests
let globalUser;
test("test 1", () => { globalUser = ... });
test("test 2", () => { /* depends on globalUser */ });
```

## Debugging Tests

### Run in headed mode to watch
```bash
bun run test:e2e -- admin-pages.spec.js --headed
```

### Use debug mode with inspector
```bash
bun run test:e2e -- admin-pages.spec.js --debug
```

### Add pause for manual inspection
```javascript
// In test code
await page.pause(); // Pauses test, opens inspector
```

### View test artifacts
```bash
# Screenshots on failure (if configured)
ls -la test-results/
```

### Check traces
Traces are retained on failure at `test-results/trace.zip`

## CI/CD Integration

Tests run in CI with:
- Single worker to avoid flakiness
- Chrome browser
- 1 retry on failure
- Traces retained on failure

Environment setup:
- `SUPER_ADMIN_1` - admin username
- `SUPER_ADMIN_1_PASSWORD` - admin password
- These are generated fresh per run by `gen-e2e-env.mjs`

## Extending Tests

### Add New Page Tests
1. Create `new-feature.spec.js`
2. Import factory and error tracking
3. Add beforeEach/afterEach for factory
4. Test: rendering, interactions, errors, cleanup

### Add New Assertions
1. Use `factory.expectErrorMessage()` or `factory.expectSuccessMessage()`
2. Use `factory.waitForLoadingComplete()` after actions
3. Use `factory.navigateToPage()` for consistent navigation

### Add New Data Types
1. Add generator method to factory: `generateNewTypeData()`
2. Add creation method: `createNewTypeViaUI()`
3. Add deletion method: `deleteNewTypeViaUI()`
4. Update `cleanup()` to delete your type

## Troubleshooting

### Test Times Out
- Increase timeout: `{ timeout: 20000 }`
- Check if element selector is wrong
- Verify page is loading correctly

### Element Not Found
- Use `.count() > 0` to check first
- Check browser console for errors
- Verify selector with `--headed` mode

### Flaky Tests
- Add more waits: `await page.waitForTimeout(500)`
- Use factory for consistent setup
- Avoid testing implementation details

### Permission Errors
- Verify authenticated session via `auth.setup.js`
- Check user has required role
- May need to test error cases separately

## Resources

- [Playwright Docs](https://playwright.dev)
- [Test Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [CI/CD Integration](https://playwright.dev/docs/ci)
