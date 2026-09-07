/**
 * The API contract, as the test suite expects to observe it.
 *
 * These types are declared here — NOT imported from `mock-services/` — on
 * purpose. The suite treats the API as a black box with a published contract.
 * If the service's response shape drifts, these types (and the assertions built
 * on them) should fail; importing the server's own types would hide exactly the
 * regression we want to catch. When this suite is pointed at a real service,
 * nothing in this file changes.
 *
 * Money crosses the API as a decimal `number` (e.g. 100.5), not minor units.
 */

export type AccountType = 'free' | 'premium';
export type TransactionType = 'transfer' | 'deposit' | 'withdrawal';
export type TransactionStatus = 'completed' | 'failed';

export type NotificationKind =
  | 'transfer_sent'
  | 'transfer_received'
  | 'deposit_completed'
  | 'withdrawal_completed';

/** Stable error codes the suite asserts on (mirror of the service's catalogue). */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'EMAIL_EXISTS'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_RECIPIENT'
  | 'LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  accountType: AccountType;
  balance: number;
  createdAt: string;
}

export interface TransactionResponse {
  id: string;
  userId: string;
  recipientId: string | null;
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  failureReason: string | null;
  createdAt: string;
}

export interface NotificationResponse {
  id: string;
  userId: string;
  transactionId: string;
  channel: 'email';
  kind: NotificationKind;
  message: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: UserResponse;
}

/** The body of every non-2xx response. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: string[];
  };
  requestId: string;
}

/** Shape returned by `GET /test/state` (control plane, local/ci only). */
export interface ControlPlaneState {
  users: UserResponse[];
  transactions: TransactionResponse[];
  notifications: NotificationResponse[];
  idempotencyKeys: string[];
}
