import { request } from '@playwright/test';

import { ControlPlaneClient } from './clients/control-plane';
import { HttpClient, RequestLog } from './clients/http';
import { loadEnvConfig } from './config/env';
import { sleep } from './helpers/poll';

/**
 * Runs once before the whole suite. Gives the shared mock a clean slate so a
 * previous run's data can't skew `/test/state`-based checks or debugging.
 *
 * Per-test isolation does NOT rely on this — specs use unique data and assert
 * on their own users (see design doc §7). With `fullyParallel` + a shared mock,
 * resetting between tests would race; resetting once here is safe.
 *
 * No-op when the environment has no control plane (e.g. staging).
 */
export default async function globalSetup(): Promise<void> {
  const config = loadEnvConfig();
  if (!config.allowTestControlPlane) return;

  const context = await request.newContext({ baseURL: config.apiBaseURL });
  const controlPlane = new ControlPlaneClient(new HttpClient(context, new RequestLog()));

  try {
    // The webServer may still be coming up; give the health endpoint a moment.
    for (let attempt = 1; attempt <= 20; attempt++) {
      const health = await context.get('/health').catch(() => null);
      if (health?.ok()) break;
      if (attempt === 20) throw new Error(`mock server not healthy at ${config.apiBaseURL}`);
      await sleep(250);
    }

    await controlPlane.reset();
    console.log(`[global-setup] reset "${config.name}" mock state`);
  } finally {
    await context.dispose();
  }
}
