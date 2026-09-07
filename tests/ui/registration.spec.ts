import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';

/**
 * UI-REG-01..05 — the registration flow on the mock frontend.
 * Locators are semantic (getByLabel / getByRole) with data-testid only for the
 * non-semantic bits (error banner). See docs/TEST-PLAN.md.
 */
test.describe('UI — registration', () => {
  test(
    'UI-REG-01: a valid registration lands on the dashboard',
    { tag: '@p1 @ui' },
    async ({ page }) => {
      const { name, email } = userFactory.build();

      await page.goto('index.html');
      await page.getByLabel('Full name').fill(name);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Account type').selectOption('premium');
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page).toHaveURL(/dashboard\.html$/);
      await expect(page.getByTestId('greeting')).toContainText(name);
      await expect(page.getByTestId('account-type')).toContainText('premium');
      await expect(page.getByTestId('balance')).toHaveText('$1,000.00');
    },
  );

  test(
    'UI-REG-02: an empty required field shows an inline error and does not navigate',
    { tag: '@p1 @ui' },
    async ({ page }) => {
      await page.goto('index.html');
      await page.getByLabel('Email').fill(userFactory.build().email); // name left blank
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page.getByTestId('form-error')).toBeVisible();
      await expect(page.getByTestId('form-error')).toContainText(/name/i);
      await expect(page).toHaveURL(/index\.html$/);
    },
  );

  test(
    'UI-REG-03: a malformed email shows a specific inline error',
    { tag: '@p2 @ui' },
    async ({ page }) => {
      await page.goto('index.html');
      await page.getByLabel('Full name').fill('Mallory Malformed');
      await page.getByLabel('Email').fill('not-an-email');
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page.getByTestId('form-error')).toContainText(/valid email/i);
      await expect(page).toHaveURL(/index\.html$/);
    },
  );

  test(
    'UI-REG-04: a duplicate email is surfaced in the UI',
    { tag: '@p2 @ui' },
    async ({ page, api }) => {
      const existing = userFactory.build();
      await api.users.create(existing); // already registered via the API

      await page.goto('index.html');
      await page.getByLabel('Full name').fill('Second Signup');
      await page.getByLabel('Email').fill(existing.email);
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page.getByTestId('form-error')).toContainText(/already exists/i);
      await expect(page).toHaveURL(/index\.html$/);
    },
  );

  test(
    'UI-REG-05: the project is configured to capture screenshots and traces on failure',
    { tag: '@p3 @ui' },
    async ({}, testInfo) => {
      // A framework-behaviour check: verifies the capture is wired, without
      // needing a deliberately failing test to produce the artifacts.
      expect(testInfo.project.use.screenshot).toBe('only-on-failure');
      expect(testInfo.project.use.trace).toBe('retain-on-failure');
    },
  );
});
