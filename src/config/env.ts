import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import { ciConfig } from './ci';
import { localConfig } from './local';
import { stagingConfig } from './staging';

// Local, uncommitted overrides (.env is gitignored). No-op if the file is absent.
loadDotenv();

export const ENV_NAMES = ['local', 'ci', 'staging'] as const;
export type EnvName = (typeof ENV_NAMES)[number];

/**
 * The full, validated configuration for one test run. This is the ONLY place
 * that encodes environment specifics — Playwright config, the mock server, and
 * every test/helper reads from here.
 */
const envSchema = z.object({
  name: z.enum(ENV_NAMES),

  // Endpoints
  apiBaseURL: z.string().url(),
  uiBaseURL: z.string().url(),
  mockServerPort: z.number().int().min(0), // 0 = not applicable (e.g. staging, where nothing is booted)

  // Timeouts (ms)
  testTimeoutMs: z.number().int().positive(),
  expectTimeoutMs: z.number().int().positive(),
  actionTimeoutMs: z.number().int().positive(),
  navigationTimeoutMs: z.number().int().positive(),
  asyncPollTimeoutMs: z.number().int().positive(),
  asyncPollIntervalMs: z.number().int().positive(),

  // Execution
  retries: z.number().int().min(0),

  // Behaviour flags
  startMockServer: z.boolean(), // Playwright boots the mock itself (false = black-box vs a real deployment)
  allowTestControlPlane: z.boolean(), // tests may call /test/reset|seed (false in staging)

  // Shared constants — the mock issues & verifies JWTs with `jwtSecret`; auth
  // tests forge expired/tampered tokens with the same value. `openingBalanceMinor`
  // is the deterministic starting balance so transfer maths is assertable.
  jwtSecret: z.string().min(1),
  openingBalanceMinor: z.number().int().nonnegative(),
  notificationDelayMs: z.number().int().nonnegative(), // deliberate async lag in the mock event bus

  // Optional secret, supplied via env/CI only
  adminToken: z.string().optional(),
});

export type EnvConfig = Readonly<z.infer<typeof envSchema>>;

/** Shape each profile file must provide (everything except the injected `name`). */
export type EnvProfileInput = Omit<z.input<typeof envSchema>, 'name'>;

const PROFILES: Record<EnvName, EnvProfileInput> = {
  local: localConfig,
  ci: ciConfig,
  staging: stagingConfig,
};

/** Optional process.env overrides — friendly to CI secrets and one-off runs. */
function envOverrides(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const e = process.env;
  if (e.API_BASE_URL) out.apiBaseURL = e.API_BASE_URL;
  if (e.UI_BASE_URL) out.uiBaseURL = e.UI_BASE_URL;
  if (e.MOCK_SERVER_PORT) out.mockServerPort = Number(e.MOCK_SERVER_PORT);
  if (e.RETRIES) out.retries = Number(e.RETRIES);
  if (e.ASYNC_POLL_TIMEOUT_MS) out.asyncPollTimeoutMs = Number(e.ASYNC_POLL_TIMEOUT_MS);
  if (e.NOTIFICATION_DELAY_MS) out.notificationDelayMs = Number(e.NOTIFICATION_DELAY_MS);
  if (e.JWT_SECRET) out.jwtSecret = e.JWT_SECRET;
  if (e.ADMIN_TOKEN) out.adminToken = e.ADMIN_TOKEN;
  if (e.START_MOCK_SERVER) out.startMockServer = e.START_MOCK_SERVER === 'true';
  return out;
}

let cached: EnvConfig | undefined;

/**
 * Resolve config for this process: pick the profile by TEST_ENV (default
 * "local"), layer process.env overrides on top, validate with zod. A bad or
 * incomplete config throws here — before any test or server code runs.
 */
export function loadEnvConfig(): EnvConfig {
  if (cached) return cached;

  const name = process.env.TEST_ENV ?? 'local';
  if (!ENV_NAMES.includes(name as EnvName)) {
    throw new Error(
      `Unknown TEST_ENV "${name}". Expected one of: ${ENV_NAMES.join(', ')}`,
    );
  }

  const merged = { ...PROFILES[name as EnvName], ...envOverrides(), name };
  const parsed = envSchema.safeParse(merged);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment config for "${name}":\n${details}`);
  }

  cached = Object.freeze(parsed.data);
  return cached;
}
