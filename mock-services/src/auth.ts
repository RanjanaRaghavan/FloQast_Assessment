import jwt from 'jsonwebtoken';

import { DomainError } from './domain/errors';

/**
 * Mock authentication. Stands in for whatever the real API Gateway does to
 * validate a caller: verify a signed JWT, extract the user id, hand it to the
 * services as a trusted value.
 *
 * HS256 with a shared secret (`jwtSecret` from config). The auth tests forge
 * expired / tampered / garbage tokens using that same secret via
 * `src/helpers/auth.ts`.
 */

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

export interface AuthOptions {
  secret: string;
  /** Token lifetime in seconds (default 1 hour). */
  expiresInSeconds?: number;
}

export function createAuth(opts: AuthOptions) {
  const expiresIn = opts.expiresInSeconds ?? 3600;

  const issueToken = (user: { id: string; email: string }): string =>
    jwt.sign({ email: user.email }, opts.secret, {
      subject: user.id,
      algorithm: 'HS256',
      expiresIn,
    });

  /**
   * Verify a raw token string. Every failure mode — missing claim, bad
   * signature, expired, not-a-JWT — collapses to a single 401 UNAUTHENTICATED,
   * so the API never leaks *why* a token was rejected.
   */
  const verifyToken = (token: string): AuthTokenPayload => {
    let decoded: string | jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, opts.secret, { algorithms: ['HS256'] });
    } catch {
      throw new DomainError('UNAUTHENTICATED', 'Invalid or expired token');
    }

    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new DomainError('UNAUTHENTICATED', 'Malformed token payload');
    }

    return { userId: decoded.sub, email: typeof decoded.email === 'string' ? decoded.email : '' };
  };

  return { issueToken, verifyToken };
}

export type Auth = ReturnType<typeof createAuth>;
