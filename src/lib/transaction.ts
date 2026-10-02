import { Prisma } from '../generated/prisma/client.js';
import { prisma } from './prisma.js';
import { HttpError } from '../utils/http-error.js';
import { setTimeout as delay } from 'node:timers/promises';

export function isTransactionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  type ConflictCause = { originalCode?: string; kind?: string };
  const known = error as { code?: string; meta?: Record<string, unknown>; cause?: ConflictCause };
  if (known.code === 'P2034') return true;
  // PostgreSQL conflicts from explicit row locks/raw inventory updates use P2010.
  const adapterError = known.meta?.driverAdapterError as { cause?: ConflictCause } | undefined;
  const cause = known.cause ?? adapterError?.cause;
  // Commit-time conflicts may escape directly as DriverAdapterError.
  return ['40001', '40P01'].includes(String(known.meta?.code ?? cause?.originalCode))
    || cause?.kind === 'TransactionWriteConflict';
}

/** Retry the entire unit of work; callbacks must not perform external side effects. */
export async function serializableTransaction<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) {
      if (isTransactionConflict(error)) {
        if (attempt < 7) {
          await delay(Math.min(5 * 2 ** attempt, 100) + Math.floor(Math.random() * 10));
          continue;
        }
        throw new HttpError(409, 'The data changed concurrently; please retry');
      }
      throw error;
    }
  }
}
