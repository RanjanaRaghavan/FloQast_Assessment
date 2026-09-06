import { randomUUID } from 'node:crypto';

import type { ErrorRequestHandler, Request, RequestHandler } from 'express';

import type { Auth, AuthTokenPayload } from './auth';
import { DomainError, isDomainError } from './domain/errors';

/**
 * Cross-cutting Express middleware for the mock stack: request id, request
 * logging, bearer-token auth, JSON content-type guard, and the single error
 * handler that renders every failure as the wire envelope.
 */

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: AuthTokenPayload;
    }
  }
}

/** Stamp every request with an id and echo it back — used in logs and error bodies. */
export const assignRequestId: RequestHandler = (req, res, next) => {
  req.id = randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};

/** One operational log line per request: `[mock] POST /api/transactions 201 7ms`. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(
      `[mock] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
    );
  });
  next();
};

/**
 * Require a valid bearer token. On success, `req.auth = { userId, email }` — the
 * ONLY source of caller identity downstream. A client-supplied `x-user-id`
 * header is stripped here so it can never be mistaken for a trusted value
 * (this is what the API Gateway would do in the real system).
 */
export const authGuard =
  (auth: Auth): RequestHandler =>
  (req, _res, next) => {
    delete req.headers['x-user-id'];

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new DomainError('UNAUTHENTICATED', 'Missing or malformed Authorization header'));
      return;
    }

    try {
      req.auth = auth.verifyToken(header.slice('Bearer '.length).trim());
      next();
    } catch (err) {
      next(err);
    }
  };

/** Read the authenticated identity, or fail loudly if a route forgot `authGuard`. */
export const getAuth = (req: Request): AuthTokenPayload => {
  if (!req.auth) throw new DomainError('UNAUTHENTICATED', 'Not authenticated');
  return req.auth;
};

/** Reject write requests that aren't `application/json` with 415. */
export const requireJson: RequestHandler = (req, _res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (!(req.headers['content-type'] ?? '').includes('application/json')) {
      next(new DomainError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
      return;
    }
  }
  next();
};

/** Terminal 404 for any unmatched route. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new DomainError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

/**
 * The one place a response error body is built. Known failures (`DomainError`)
 * keep their code + status; a malformed JSON body from `express.json()` becomes
 * a 400 VALIDATION_ERROR; anything else is a logged 500 INTERNAL_ERROR that
 * never leaks internals to the client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let domainError: DomainError;

  if (isDomainError(err)) {
    domainError = err;
  } else if (err instanceof SyntaxError && (err as { status?: number }).status === 400) {
    domainError = new DomainError('VALIDATION_ERROR', 'Malformed JSON body');
  } else {
    console.error(`[mock] unhandled error on ${req.method} ${req.originalUrl}:`, err);
    domainError = new DomainError('INTERNAL_ERROR', 'Unexpected server error');
  }

  res.status(domainError.status).json({
    error: {
      code: domainError.code,
      message: domainError.message,
      ...(domainError.details ? { details: domainError.details } : {}),
    },
    requestId: req.id,
  });
};
