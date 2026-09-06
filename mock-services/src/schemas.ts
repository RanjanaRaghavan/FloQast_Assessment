import { z } from 'zod';

import { DomainError } from './domain/errors';

/**
 * Request-body schemas for the mock API. Anything a schema rejects becomes a
 * 400 VALIDATION_ERROR whose `details[]` lists each offending field as
 * `"<path>: <message>"` — which is what the users.validation / transactions.
 * validation suites assert on.
 *
 * The public API speaks decimal `amount` (e.g. 100.50); everything past this
 * layer is integer minor units via `toMinor`.
 */

const decimalPlaces = (n: number): number => {
  if (Number.isInteger(n)) return 0;
  const s = n.toString();
  if (s.includes('e') || s.includes('E')) return Number.POSITIVE_INFINITY; // 1e-7 etc. → reject
  return s.split('.')[1]?.length ?? 0;
};

export const toMinor = (amount: number): number => Math.round(amount * 100);

export const loginSchema = z
  .object({
    email: z.string().trim().email('must be a valid email'),
  })
  .strict();

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, 'must not be empty').max(256, 'is too long'),
    email: z.string().trim().email('must be a valid email'),
    accountType: z.enum(['free', 'premium']),
  })
  .strict();

export const createTransactionSchema = z
  .object({
    userId: z.string().min(1).optional(),
    type: z.enum(['transfer', 'deposit', 'withdrawal']),
    amount: z
      .number()
      .finite()
      .positive('must be greater than 0')
      .refine((n) => decimalPlaces(n) <= 2, 'must have at most 2 decimal places'),
    recipientId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'transfer' && !data.recipientId) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipientId'],
        message: 'is required for a transfer',
      });
    }
    if (data.type !== 'transfer' && data.recipientId) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipientId'],
        message: 'is only valid for a transfer',
      });
    }
  });

export type LoginBody = z.infer<typeof loginSchema>;
export type CreateUserBody = z.infer<typeof createUserSchema>;
export type CreateTransactionBody = z.infer<typeof createTransactionSchema>;

/**
 * Validate `body` against `schema` or throw a 400 VALIDATION_ERROR carrying
 * every failure. Route handlers call this and then work with typed data.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => {
    const path = issue.path.join('.') || '(root)';
    return `${path}: ${issue.message}`;
  });
  throw new DomainError('VALIDATION_ERROR', 'Request validation failed', details);
}
