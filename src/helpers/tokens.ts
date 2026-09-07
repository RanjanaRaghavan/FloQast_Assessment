import jwt from 'jsonwebtoken';

import { loadEnvConfig } from '../config/env';

/**
 * Forged tokens for the authentication negative tests. All use the same
 * `jwtSecret` the mock verifies with (from config), except `foreignSecretToken`
 * which is the "signed by someone else" case.
 */

export const GARBAGE_TOKEN = 'this.is.not-a-jwt';

/** Valid signature and claims, but already expired. */
export function expiredToken(userId = 'expired-user'): string {
  return jwt.sign({ email: 'expired@test.local' }, loadEnvConfig().jwtSecret, {
    subject: userId,
    algorithm: 'HS256',
    expiresIn: -3600,
  });
}

/** Well-formed and unexpired, but signed with the wrong secret. */
export function foreignSecretToken(userId = 'foreign-user'): string {
  return jwt.sign({ email: 'foreign@test.local' }, 'not-the-real-secret', {
    subject: userId,
    algorithm: 'HS256',
  });
}

/** A real token with its signature byte corrupted. */
export function tamperedToken(validToken: string): string {
  const parts = validToken.split('.');
  const signature = parts[2] ?? '';
  const lastChar = signature.slice(-1);
  parts[2] = signature.slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');
  return parts.join('.');
}
