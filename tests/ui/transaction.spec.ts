import type { Page } from '@playwright/test';

import { expect, test } from '../../src/fixtures';
import type { ApiClient } from '../../src/clients/api';
import type { CreatedUser } from '../../src/factories/user.factory';
import * as userFactory from '../../src/factories/user.factory';

/**
 * UI-TXN-01..06 — the transaction flow on the mock frontend.
 * Client-side checks (bad amount) surface without a request; business rules
 * (insufficient funds, unknown recipient) come back from the API and are
 * rendered inline. See docs/TEST-PLAN.md.
 */

/** Create a user via the API, then sign in through the UI. Leaves the page on the dashboard. */
async function signIn(page: Page, api: ApiClient): Promise<CreatedUser> {
  const account = await userFactory.create(api);
  await page.goto('login.html');
  await page.getByLabel('Email').fill(account.user.email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/dashboard\.html$/);
  return account;
}

test.describe('UI — transaction', () => {
  test(
    'UI-TXN-01: a transfer shows a confirmation and reduces the balance',
    { tag: '@p1 @ui' },
    async ({ page, api }) => {
      await signIn(page, api);
      const recipient = await userFactory.create(api);

      await page.goto('transaction.html');
      await page.getByLabel('Recipient user ID').fill(recipient.user.id);
      await page.getByLabel('Amount (USD)').fill('250');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByTestId('form-success')).toContainText(/completed/i);

      await page.goto('dashboard.html');
      await expect(page.getByTestId('balance')).toHaveText('$750.00');
    },
  );

  test(
    'UI-TXN-02: a negative amount is blocked client-side',
    { tag: '@p1 @ui' },
    async ({ page, api }) => {
      await signIn(page, api);

      await page.goto('transaction.html');
      await page.getByLabel('Recipient user ID').fill('irrelevant');
      await page.getByLabel('Amount (USD)').fill('-5');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByTestId('form-error')).toContainText(/greater than 0/i);
      await expect(page.getByTestId('form-success')).toBeHidden();
    },
  );

  test(
    'UI-TXN-03: a non-numeric amount is blocked client-side',
    { tag: '@p1 @ui' },
    async ({ page, api }) => {
      await signIn(page, api);

      await page.goto('transaction.html');
      await page.getByLabel('Recipient user ID').fill('irrelevant');
      await page.getByLabel('Amount (USD)').fill('abc');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByTestId('form-error')).toContainText(/must be a number/i);
      await expect(page.getByTestId('form-success')).toBeHidden();
    },
  );

  test(
    'UI-TXN-04: an over-balance transfer shows the server error message',
    { tag: '@p1 @ui @risk:money' },
    async ({ page, api }) => {
      await signIn(page, api);
      const recipient = await userFactory.create(api);

      await page.goto('transaction.html');
      await page.getByLabel('Recipient user ID').fill(recipient.user.id);
      await page.getByLabel('Amount (USD)').fill('5000');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByTestId('form-error')).toContainText(/insufficient funds/i);
    },
  );

  test(
    'UI-TXN-05: an unknown recipient shows an error',
    { tag: '@p2 @ui' },
    async ({ page, api }) => {
      await signIn(page, api);

      await page.goto('transaction.html');
      await page.getByLabel('Recipient user ID').fill('00000000-0000-0000-0000-000000000000');
      await page.getByLabel('Amount (USD)').fill('10');
      await page.getByRole('button', { name: 'Send' }).click();

      await expect(page.getByTestId('form-error')).toContainText(/does not exist/i);
    },
  );

  test(
    'UI-TXN-06: a completed transfer appears in the dashboard history',
    { tag: '@p2 @ui' },
    async ({ page, api }) => {
      await signIn(page, api);
      const recipient = await userFactory.create(api);

      await page.goto('transaction.html');
      await page.getByLabel('Recipient user ID').fill(recipient.user.id);
      await page.getByLabel('Amount (USD)').fill('40');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByTestId('form-success')).toBeVisible();

      await page.goto('dashboard.html');
      const rows = page.getByTestId('history-row');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText('$40.00');
    },
  );
});
