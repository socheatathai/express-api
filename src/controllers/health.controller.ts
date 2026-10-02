import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export function getHealth(_request: Request, response: Response): void {
  response.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}

export async function getReadiness(_request: Request, response: Response): Promise<void> {
  try {
    // Detect database connection failures and unapplied domain migrations.
    await prisma.$queryRaw`SELECT "proofStoragePath" FROM "Payment" LIMIT 1`;
    response.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    response.status(503).json({ status: 'unavailable' });
  }
}
