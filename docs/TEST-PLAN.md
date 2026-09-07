# Test Plan

The scenarios this framework automates, with traceability back to the assessment
requirements. Companion to [`DESIGN.md`](./DESIGN.md).

## Legend

- **Priority**: p0 money correctness, idempotency, authorization. p1 validation,
  async delivery, the UI journeys. p2 and p3 supporting coverage.
- **Tag**: the Playwright tag on the test, used for filtered runs
  (`npx playwright test --grep @p0`).

## Requirements

| ID | Requirement (from the brief) |
|---|---|
| R1 | `POST /api/users` create user |
| R2 | `GET /api/users/:id` get user details |
| R3 | `POST /api/transactions` create transaction |
| R4 | `GET /api/transactions/:userId` list user transactions |
| R5 | Error scenario handling |
| R6 | Data validation |
| R7 | Authentication and authorization |
| R8 | Async notification delivery (Redis-backed in the real system) |
| R9 | UI registration flow |
| R10 | UI transaction flow |
| R11 | UI error message validation |
| R12 | The framework itself: environment config, data management, reporting, assertions |

---

## API: users

### `tests/api/users.crud.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| USR-CRUD-01 | R1 | p1 | valid body creates a user with an opening balance | `@p1` |
| USR-CRUD-02 | R1 | p2 | both account types are accepted | `@p2` |
| USR-CRUD-03 | R2 | p1 | a user can read their own profile | `@p1` |
| USR-CRUD-04 | R2, R7 | p1 | reading another id is forbidden and does not disclose existence | `@p1` |
| USR-CRUD-05 | R1 | p2 | the opening balance matches configuration | `@p2` |
| USR-CRUD-06 | R1, R5 | p3 | the same email cannot be registered twice | `@p3` |

### `tests/api/users.validation.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| USR-VAL-01 | R6 | p1 | missing name is rejected and names the field | `@p1` |
| USR-VAL-02 | R6 | p1 | missing email is rejected and names the field | `@p1` |
| USR-VAL-03 | R6 | p1 | a malformed email is rejected | `@p1` |
| USR-VAL-04 | R6 | p2 | an unknown account type is rejected | `@p2` |
| USR-VAL-05 | R6 | p2 | an unknown extra field is rejected (strict schema) | `@p2` |
| USR-VAL-06 | R6 | p2 | a whitespace-only name is rejected | `@p2` |
| USR-VAL-07 | R6 | p3 | an over-long name is rejected | `@p3` |
| USR-VAL-08 | R5, R6 | p2 | a malformed JSON body still returns a well-formed error envelope | `@p2` |
| USR-VAL-09 | R5 | p3 | a non-JSON content type is rejected with 415 | `@p3` |

---

## API: authentication and authorization

### `tests/api/auth.authz.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| AUTH-01 | R7 | p1 | login with a known email returns a token | `@p1` |
| AUTH-02 | R7 | p1 | a request with no token is rejected | `@p1` |
| AUTH-03 | R7 | p1 | a non-JWT token is rejected | `@p1` |
| AUTH-04 | R7 | p1 | a tampered signature is rejected | `@p1` |
| AUTH-05 | R7 | p1 | an expired token is rejected | `@p1` |
| AUTH-05b | R7 | p1 | a token signed with the wrong secret is rejected | `@p1` |
| AUTH-06 | R5, R7 | p1 | login with an unknown email is 404 | `@p1` |
| AUTHZ-06 | R7 | p0 | a user cannot read another user profile | `@p0 @risk:authz` |
| AUTHZ-07 | R7 | p0 | a user cannot list another user transactions | `@p0 @risk:authz` |
| AUTHZ-08 | R7 | p0 | a user cannot create a transaction as another user | `@p0 @risk:authz` |
| AUTHZ-09 | R7 | p2 | a spoofed `x-user-id` header is ignored | `@p2 @risk:authz` |

---

## API: transactions

### `tests/api/transactions.crud.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| TXN-CRUD-01 | R3 | p0 | a transfer debits the sender and credits the recipient | `@p0 @risk:money` |
| TXN-CRUD-02 | R3 | p0 | a transfer conserves the total balance | `@p0 @risk:money` |
| TXN-CRUD-03 | R4 | p1 | a new transaction appears in the sender history | `@p1` |
| TXN-CRUD-04 | R4 | p2 | history is ordered newest first | `@p2` |
| TXN-CRUD-05 | R4 | p2 | a user with no transactions gets an empty list | `@p2` |
| TXN-CRUD-06 | R4 | p2 | the transaction record has the expected shape | `@p2` |
| TXN-CRUD-07 | R3 | p3 | a deposit increases the balance and needs no recipient | `@p3` |

### `tests/api/transactions.validation.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| TXN-VAL-01 | R6 | p1 | missing amount is rejected | `@p1` |
| TXN-VAL-02 | R6 | p1 | missing type is rejected | `@p1` |
| TXN-VAL-03 | R6 | p1 | a transfer without a recipient is rejected | `@p1` |
| TXN-VAL-04 | R6 | p0 | a negative amount is rejected | `@p0 @risk:money` |
| TXN-VAL-05 | R6 | p0 | a zero amount is rejected | `@p0 @risk:money` |
| TXN-VAL-06 | R6 | p1 | an amount with more than 2 decimal places is rejected | `@p1 @risk:money` |
| TXN-VAL-07 | R6 | p1 | a string amount is rejected | `@p1` |
| TXN-VAL-08 | R6 | p2 | an unknown type is rejected | `@p2` |
| TXN-VAL-09 | R6 | p2 | a transfer to yourself is rejected | `@p2` |
| TXN-VAL-10 | R5 | p3 | an amount at or above the per-transaction limit is rejected | `@p3` |
| TXN-VAL-11 | R5, R6 | p3 | hostile input is handled cleanly, never a 500 | `@p3 @security` |

### `tests/api/transactions.rules.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| TXN-RULE-01 | R3, R5 | p0 | a transfer above the balance is rejected and moves no money | `@p0 @risk:money` |
| TXN-RULE-02 | R3, R5 | p0 | a transfer to an unknown recipient is rejected and does not debit the sender | `@p0 @risk:money` |
| TXN-RULE-03 | R4 | p1 | a failed transaction is still recorded in history | `@p1` |
| TXN-RULE-04 | R3 | p1 | a transfer of the entire balance succeeds and leaves zero | `@p1 @risk:money` |

### `tests/api/transactions.idempotency.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| TXN-IDMP-01 | R3 | p0 | replaying a request with the same key moves money once | `@p0 @risk:money` |
| TXN-IDMP-02 | R3, R5 | p0 | the same key with a different body is a conflict | `@p0 @risk:money` |
| TXN-IDMP-03 | R3 | p1 | different keys with the same body create distinct transactions | `@p1` |
| TXN-IDMP-04 | R3 | p1 | without a key, each call creates a new transaction | `@p1` |
| TXN-IDMP-05 | R3 | p2 | concurrent identical requests with one key create exactly one transaction | `@p2 @risk:money` |

---

## Notification: async delivery

### `tests/notification/delivery.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| NOTIF-01 | R8 | p1 | a completed transfer eventually produces a notification | `@p1 @async` |
| NOTIF-02 | R8 | p1 | a failed transaction produces no notification | `@p1 @async` |
| NOTIF-03 | R8 | p2 | the notification payload references the transaction correctly | `@p2 @async` |
| NOTIF-04 | R8 | p2 | the recipient also gets a notification | `@p2 @async` |
| NOTIF-05 | R7, R8 | p3 | a user cannot read another user notifications | `@p3 @risk:authz` |

---

## UI

### `tests/ui/registration.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| UI-REG-01 | R9 | p1 | a valid registration lands on the dashboard | `@p1 @ui` |
| UI-REG-02 | R11 | p1 | an empty required field shows an inline error and does not navigate | `@p1 @ui` |
| UI-REG-03 | R11 | p2 | a malformed email shows a specific inline error | `@p2 @ui` |
| UI-REG-04 | R11 | p2 | a duplicate email is surfaced in the UI | `@p2 @ui` |
| UI-REG-05 | R12 | p3 | the project is configured to capture screenshots and traces on failure | `@p3 @ui` |

### `tests/ui/transaction.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| UI-TXN-01 | R10 | p1 | a transfer shows a confirmation and reduces the balance | `@p1 @ui` |
| UI-TXN-02 | R11 | p1 | a negative amount is blocked client-side | `@p1 @ui` |
| UI-TXN-03 | R11 | p1 | a non-numeric amount is blocked client-side | `@p1 @ui` |
| UI-TXN-04 | R11 | p1 | an over-balance transfer shows the server error message | `@p1 @ui @risk:money` |
| UI-TXN-05 | R11 | p2 | an unknown recipient shows an error | `@p2 @ui` |
| UI-TXN-06 | R10 | p2 | a completed transfer appears in the dashboard history | `@p2 @ui` |

---

## Framework self-checks

### `tests/api/framework.smoke.spec.ts`

| ID | Req | Priority | Scenario | Tag |
|---|---|---|---|---|
| FW-01 | R12 | p2 | config resolves for `TEST_ENV`, the server agrees, and a bad `TEST_ENV` fails fast | `@p2` |
| FW-02 | R12 | p2 | factories produce unique data and persisted users get distinct ids | `@p2` |
| FW-03 | R12 | p3 | the custom matchers behave correctly | `@p3` |

---

## Coverage summary

| Suite | Tests |
|---|---|
| users (crud, validation) | 15 |
| auth and authz | 11 |
| transactions (crud, validation, rules, idempotency) | 27 |
| framework self-checks | 3 |
| notification delivery | 5 |
| UI (registration, transaction) | 11 |
| **Total** | **72** |

By priority: p0 11, p1 31, p2 21, p3 9.
