import { execFileSync } from 'node:child_process';

import { expect, test } from '../../src/fixtures';
import type { ApiResponse } from '../../src/clients/http';
import { HttpClient } from '../../src/clients/http';
import * as userFactory from '../../src/factories/user.factory';

/**
 * FW-01..03 — the framework testing itself: config resolution, data
 * uniqueness, and the custom matchers. See docs/TEST-PLAN.md.
 */
test.describe('Framework — smoke', () => {
  test(
    'FW-01: config resolves for TEST_ENV and the server agrees; a bad TEST_ENV fails fast',
    { tag: '@p2' },
    async ({ api, config }) => {
      expect(['local', 'ci', 'staging']).toContain(config.name);
      expect(() => new URL(config.apiBaseURL)).not.toThrow();

      // The running mock reports the same environment the tests resolved.
      const health = await api.raw.get<{ status: string; env: string }>('/health');
      expect(health.status).toBe(200);
      expect(health.body.env).toBe(config.name);

      // An unknown TEST_ENV is rejected before anything runs.
      let failed = false;
      try {
        execFileSync('npx', ['tsx', '-e', "import('./src/config/env').then(m => m.loadEnvConfig())"], {
          env: { ...process.env, TEST_ENV: 'bogus' },
          stdio: 'pipe',
        });
      } catch (err) {
        failed = true;
        expect(String((err as { stderr?: Buffer }).stderr)).toContain('Unknown TEST_ENV');
      }
      expect(failed).toBe(true);
    },
  );

  test(
    'FW-02: factories produce unique data and persisted users get distinct ids',
    { tag: '@p2' },
    async ({ api }) => {
      const emails = Array.from({ length: 10 }, () => userFactory.build().email);
      expect(new Set(emails).size).toBe(emails.length);

      const [a, b] = await Promise.all([userFactory.create(api), userFactory.create(api)]);
      expect(a.user.id).not.toBe(b.user.id);
      expect(a.user.email).not.toBe(b.user.email);
    },
  );

  test('FW-03: the custom matchers behave correctly', { tag: '@p3' }, async () => {
    const envelope: ApiResponse = {
      status: 422,
      ok: false,
      headers: {},
      requestId: 'req-1',
      body: {
        error: { code: 'INSUFFICIENT_FUNDS', message: 'nope', details: ['amount: too big'] },
        requestId: 'req-1',
      },
    };
    expect(envelope).toMatchErrorEnvelope('INSUFFICIENT_FUNDS', { field: 'amount' });
    expect({ ...envelope, status: 200 }).not.toMatchErrorEnvelope('INSUFFICIENT_FUNDS');

    expect(0.1 + 0.2).toEqualMoney(0.3);
    expect(959.75).not.toEqualMoney(959.76);

    expect(new Date().toISOString()).toBeIsoDateString();
    expect('yesterday').not.toBeIsoDateString();

    expect(HttpClient.isErrorEnvelope(envelope.body)).toBe(true);
    expect(HttpClient.isErrorEnvelope({ id: 'x' })).toBe(false);
  });
});
