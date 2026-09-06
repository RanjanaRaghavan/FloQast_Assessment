import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from './src/config/env';

/**
 * Single source of environment truth. `loadEnvConfig()` reads TEST_ENV
 * (default: "local"), merges process.env overrides, and validates the result
 * with zod — a misconfigured run fails here, not halfway through a suite.
 */
const env = loadEnvConfig();

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  // Fail the run if a `test.only` was committed by accident.
  forbidOnly: isCI,

  // Unique-by-default test data (factories) makes full parallelism safe.
  fullyParallel: true,
  workers: isCI ? 2 : undefined,

  // Retries only in CI, and only to absorb infra flakiness — never to paper
  // over a real defect. Local runs get 0 so flakiness is visible immediately.
  retries: isCI ? env.retries : 0,

  timeout: env.testTimeoutMs,
  expect: { timeout: env.expectTimeoutMs },

  // Multi-format reporting (design §8): console for humans, HTML for triage,
  // JUnit for the CI run summary, JSON for any downstream tooling.
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],

  use: {
    baseURL: env.apiBaseURL,
    extraHTTPHeaders: { Accept: 'application/json' },
    actionTimeout: env.actionTimeoutMs,
    navigationTimeout: env.navigationTimeoutMs,

    // Failure artifacts only — keeps green runs fast and small.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: env.apiBaseURL },
    },
    {
      name: 'contract',
      testDir: './tests/contract',
      use: { baseURL: env.apiBaseURL },
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'], baseURL: env.uiBaseURL },
    },
  ],

  /**
   * In local/ci, Playwright boots the mock stack itself and waits for its
   * health endpoint — a fresh clone needs only `npm install && npm test`.
   * Against a deployed environment (staging) this is disabled and the suite
   * runs black-box against the real URLs.
   */
  webServer: env.startMockServer
    ? {
        command: 'npm run mock:start',
        url: `${env.apiBaseURL}/health`,
        reuseExistingServer: !isCI,
        timeout: 30_000,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
