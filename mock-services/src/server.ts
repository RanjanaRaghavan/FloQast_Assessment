import { loadEnvConfig } from '../../src/config/env';
import { createApp } from './app';

/**
 * Entry point for `npm run mock:start` — the command Playwright's `webServer`
 * launches. Resolves config from TEST_ENV, starts the mock stack, and shuts
 * down cleanly when Playwright (or Ctrl-C) sends a signal.
 */

const config = loadEnvConfig();
const port = config.mockServerPort || 4010;
const server = createApp(config).listen(port, () => {
  console.log(`[mock] "${config.name}" stack listening on http://localhost:${port}`);
  console.log(
    `[mock] api=/api  ui=/app  control-plane=${config.allowTestControlPlane ? 'on' : 'off'}`,
  );
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[mock] port ${port} is already in use — is another mock server running?`);
    process.exit(1);
  }
  throw err;
});

const shutdown = (signal: string): void => {
  console.log(`[mock] ${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref(); // don't hang if a socket won't close
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
