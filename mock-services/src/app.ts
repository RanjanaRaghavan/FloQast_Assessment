import { fileURLToPath } from 'node:url';

import express, { type Express } from 'express';

import type { EnvConfig } from '../../src/config/env';
import { createAuth } from './auth';
import { DomainError } from './domain/errors';
import { createEventBus } from './domain/event-bus';
import {
  createLedger,
  DEFAULT_MAX_TRANSFER_MINOR,
  type SeedInput,
  type Transaction,
  type User,
} from './domain/ledger';
import { createNotificationService, type Notification } from './domain/notifications';
import {
  assignRequestId,
  authGuard,
  errorHandler,
  getAuth,
  notFoundHandler,
  requestLogger,
  requireJson,
} from './middleware';
import {
  createTransactionSchema,
  createUserSchema,
  loginSchema,
  parseBody,
  toMinor,
} from './schemas';

/** Static mock frontend, served at /app. Added in a later group; 404s harmlessly until then. */
const FRONTEND_DIR = fileURLToPath(new URL('../../mock-frontend/public', import.meta.url));

// --- Response serializers: internal minor units -> decimal at the API edge ---

const serializeUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  accountType: u.accountType,
  balance: u.balanceMinor / 100,
  createdAt: u.createdAt,
});

const serializeTransaction = (t: Transaction) => ({
  id: t.id,
  userId: t.userId,
  recipientId: t.recipientId,
  amount: t.amountMinor / 100,
  currency: t.currency,
  type: t.type,
  status: t.status,
  failureReason: t.failureReason,
  createdAt: t.createdAt,
});

const serializeNotification = (n: Notification) => ({
  id: n.id,
  userId: n.userId,
  transactionId: n.transactionId,
  channel: n.channel,
  kind: n.kind,
  message: n.message,
  amount: n.amountMinor / 100,
  currency: n.currency,
  createdAt: n.createdAt,
});

/**
 * Build the mock stack as one Express app: User + Transaction + Notification
 * services and the gateway behaviour, all in-process. All identity comes from
 * the verified JWT (`req.auth`), never from a header or body field.
 */
export function createApp(config: EnvConfig): Express {
  const ledger = createLedger({
    openingBalanceMinor: config.openingBalanceMinor,
    maxTransferMinor: DEFAULT_MAX_TRANSFER_MINOR,
  });
  const auth = createAuth({ secret: config.jwtSecret });
  const bus = createEventBus({ delayMs: config.notificationDelayMs });
  const notifications = createNotificationService({ bus });

  const app = express();
  app.use(assignRequestId);
  app.use(requestLogger);
  app.use(express.json());
  app.use('/app', express.static(FRONTEND_DIR));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: config.name });
  });

  // --- Auth ------------------------------------------------------------------

  app.post('/api/auth/login', requireJson, (req, res) => {
    const { email } = parseBody(loginSchema, req.body);
    const user = ledger.getUserByEmail(email);
    if (!user) throw new DomainError('NOT_FOUND', `No user with email "${email}"`);
    res.json({
      token: auth.issueToken({ id: user.id, email: user.email }),
      user: serializeUser(user),
    });
  });

  // --- Users ---------------------------------------------------------------

  app.post('/api/users', requireJson, (req, res) => {
    const user = ledger.createUser(parseBody(createUserSchema, req.body));
    res.status(201).json(serializeUser(user));
  });

  // Self-only: the API does not disclose whether other users exist, so a
  // non-self id is 403 (not 404) whether or not it maps to a real user.
  app.get('/api/users/:id', authGuard(auth), (req, res) => {
    const { userId } = getAuth(req);
    if (req.params.id !== userId) {
      throw new DomainError('FORBIDDEN', "You cannot access another user's profile");
    }
    const user = ledger.getUser(userId);
    if (!user) throw new DomainError('NOT_FOUND', `User "${userId}" not found`);
    res.json(serializeUser(user));
  });

  // --- Transactions ------------------------------------------------------

  app.post('/api/transactions', authGuard(auth), requireJson, (req, res) => {
    const body = parseBody(createTransactionSchema, req.body);
    const { userId } = getAuth(req);

    if (body.userId && body.userId !== userId) {
      throw new DomainError('FORBIDDEN', 'You cannot create a transaction for another user');
    }
    if (body.recipientId && body.recipientId === userId) {
      throw new DomainError('VALIDATION_ERROR', 'Cannot transfer to yourself', [
        'recipientId: cannot equal the sender',
      ]);
    }

    const { transaction, replayed } = ledger.createTransaction({
      userId,
      type: body.type,
      amountMinor: toMinor(body.amount),
      recipientId: body.recipientId ?? null,
      idempotencyKey: req.get('Idempotency-Key') ?? null,
    });

    // Fresh transactions emit an event; an idempotent replay already did.
    if (!replayed) {
      bus.publish({
        type: 'transaction.completed',
        transactionId: transaction.id,
        transactionType: transaction.type,
        userId: transaction.userId,
        recipientId: transaction.recipientId,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        occurredAt: transaction.createdAt,
      });
    }

    res.status(201).json(serializeTransaction(transaction));
  });

  app.get('/api/transactions/:userId', authGuard(auth), (req, res) => {
    const { userId } = getAuth(req);
    if (req.params.userId !== userId) {
      throw new DomainError('FORBIDDEN', "You cannot list another user's transactions");
    }
    res.json(ledger.listTransactions(userId).map(serializeTransaction));
  });

  app.get('/api/notifications/:userId', authGuard(auth), (req, res) => {
    const { userId } = getAuth(req);
    if (req.params.userId !== userId) {
      throw new DomainError('FORBIDDEN', "You cannot read another user's notifications");
    }
    res.json(notifications.list(userId).map(serializeNotification));
  });

  // --- Test control plane (local / ci only) ----------------------------

  if (config.allowTestControlPlane) {
    app.post('/test/reset', (_req, res) => {
      ledger.reset();
      bus.reset();
      notifications.reset();
      res.status(204).end();
    });

    app.post('/test/seed', (req, res) => {
      const seeded = ledger.seed((req.body ?? {}) as SeedInput);
      res.json({ users: seeded.users.map(serializeUser) });
    });

    app.get('/test/state', (_req, res) => {
      const snap = ledger.snapshot();
      res.json({
        users: snap.users.map(serializeUser),
        transactions: snap.transactions.map(serializeTransaction),
        idempotencyKeys: snap.idempotencyKeys,
        notifications: notifications.snapshot().map(serializeNotification),
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
