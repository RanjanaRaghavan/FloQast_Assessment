# Fintech QA: Test Automation Framework

API, UI, and async-notification tests for a hypothetical fintech platform
(User, Transaction, and Notification services behind an API Gateway).

The system under test is simulated inside this repo. An Express app
(`mock-services/`) provides the four backend components plus a small control-plane
API used for test setup, and a set of static pages (`mock-frontend/`) provides
the web UI. Tests run against these; there are no external services, containers,
or databases to stand up.

Design rationale and the full scenario catalogue:
- [`docs/DESIGN.md`](docs/DESIGN.md)
- [`docs/TEST-PLAN.md`](docs/TEST-PLAN.md)

---

## Prerequisites

- Node 20 or newer. The repo pins **24** in `.nvmrc`; run `nvm use` if you use nvm.
- npm (bundled with Node).

Playwright's browser (Chromium) is installed automatically by `npm test`. To
install it on its own: `npx playwright install chromium`.

## Quick start

```bash
npm install
npm test
```

`npm test` needs nothing else running. Playwright boots the mock stack itself
(`webServer` in `playwright.config.ts`), resets it once (`globalSetup`), runs the
tests, and shuts it down.

---

## Running subsets

```bash
npm run test:api            # API suites only
npm run test:notification   # async notification delivery only
npm run test:ui             # browser tests only
npm run test:smoke          # @p0, the money-critical tests, a fast gate

npx playwright test --grep @risk:authz     # any tag
npx playwright test users.crud             # by file name
npx playwright test --ui                   # Playwright's interactive runner
```

Tags: `@p0` to `@p3` (priority), `@risk:money`, `@risk:authz`, `@security`,
`@async`, `@ui`.

---

## Environments

`TEST_ENV` selects a profile from `src/config/` (default `local`):

| `TEST_ENV` | Mock stack | `/test/*` control plane | Use |
|---|---|---|---|
| `local` | Playwright boots it | on | developer machine |
| `ci` | Playwright boots it | on | GitHub Actions (longer timeouts, retries) |
| `staging` | not booted (black box) | off | a real deployment (URLs via `API_BASE_URL` / `UI_BASE_URL`) |

```bash
TEST_ENV=ci npm test
```

The resolved config is validated with zod at startup, so a missing or malformed
value fails immediately rather than mid-run.

---

## Reports

After a run:

| Path | What |
|---|---|
| `playwright-report/` | HTML report (`npm run report` to open it) |
| `reports/junit.xml` | JUnit, for CI summaries |
| `reports/results.json` | JSON, for any downstream tooling |
| `test-results/` | Per-failure trace, screenshot, video |

When a test fails, the HTML report also carries an `api-calls` attachment: every
request and response the test made, with tokens redacted.

---

## Layout

```
mock-services/     in-process mock of the 4 backend components + /test control plane
mock-frontend/     static registration / dashboard / transaction pages
src/
  config/          environment profiles (local | ci | staging), zod-validated
  clients/         typed API client + transport (request/response logging)
  factories/       user / transaction test-data builders (unique by default)
  helpers/         poll (eventual consistency), forged tokens
  assertions/      custom matchers (toMatchErrorEnvelope, toEqualMoney, ...)
  fixtures.ts      the test entry point; import { test, expect } from here
tests/
  api/             CRUD, validation, auth/authz, rules, idempotency, framework smoke
  notification/    async delivery (eventual consistency)
  ui/              registration + transaction flows
```

---

## CI

`.github/workflows/ci.yml` runs one job: install, run every project with
`TEST_ENV=ci`, publish the JUnit result to the PR, and upload the report and
failure artifacts. The Node version comes from `.nvmrc` via `node-version-file`,
so CI and local never drift.
