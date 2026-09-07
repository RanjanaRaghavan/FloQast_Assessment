import type { ApiResponse, RequestOptions } from './http';
import { HttpClient } from './http';
import type {
  AccountType,
  LoginResponse,
  NotificationResponse,
  TransactionResponse,
  TransactionType,
  UserResponse,
} from './types';

/**
 * One typed method per API endpoint, grouped by resource. Specs read as intent:
 *
 *   const res = await api.users.create(user);
 *   expect(res.status).toBe(201);
 *
 * Bodies are strictly typed for the happy path. A negative test that needs to
 * send a structurally invalid body puts `// @ts-expect-error intentionally
 * invalid` on the call — which also fails if the type ever loosens enough to
 * accept it. Business-invalid-but-well-typed input (e.g. `amount: -5`) needs no
 * cast.
 */

export interface CreateUserRequest {
  name: string;
  email: string;
  accountType: AccountType;
}

export interface CreateTransactionRequest {
  type: TransactionType;
  amount: number;
  recipientId?: string;
  /** Only set by the authz test that tries to act as another user. */
  userId?: string;
}

export type CreateTransactionOptions = RequestOptions & { idempotencyKey?: string };

class AuthApi {
  constructor(private readonly http: HttpClient) {}

  login(email: string, options?: RequestOptions): Promise<ApiResponse<LoginResponse>> {
    return this.http.post<LoginResponse>('/api/auth/login', { email }, options);
  }
}

class UsersApi {
  constructor(private readonly http: HttpClient) {}

  create(
    body: CreateUserRequest,
    options?: RequestOptions,
  ): Promise<ApiResponse<UserResponse>> {
    return this.http.post<UserResponse>('/api/users', body, options);
  }

  get(id: string, options?: RequestOptions): Promise<ApiResponse<UserResponse>> {
    return this.http.get<UserResponse>(`/api/users/${id}`, options);
  }
}

class TransactionsApi {
  constructor(private readonly http: HttpClient) {}

  create(
    body: CreateTransactionRequest,
    options: CreateTransactionOptions = {},
  ): Promise<ApiResponse<TransactionResponse>> {
    const { idempotencyKey, headers, ...rest } = options;
    return this.http.post<TransactionResponse>('/api/transactions', body, {
      ...rest,
      headers: { ...headers, ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    });
  }

  list(
    userId: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<TransactionResponse[]>> {
    return this.http.get<TransactionResponse[]>(`/api/transactions/${userId}`, options);
  }
}

class NotificationsApi {
  constructor(private readonly http: HttpClient) {}

  list(
    userId: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<NotificationResponse[]>> {
    return this.http.get<NotificationResponse[]>(`/api/notifications/${userId}`, options);
  }
}

export class ApiClient {
  readonly auth: AuthApi;
  readonly users: UsersApi;
  readonly transactions: TransactionsApi;
  readonly notifications: NotificationsApi;

  constructor(private readonly http: HttpClient) {
    this.auth = new AuthApi(http);
    this.users = new UsersApi(http);
    this.transactions = new TransactionsApi(http);
    this.notifications = new NotificationsApi(http);
  }

  /** A view of this client that authenticates as `token` by default. */
  asUser(token: string | undefined): ApiClient {
    return new ApiClient(this.http.withToken(token));
  }

  /** Escape hatch for the few tests that deliberately break the transport contract. */
  get raw(): HttpClient {
    return this.http;
  }
}
