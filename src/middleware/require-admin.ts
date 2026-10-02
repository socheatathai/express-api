import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticatedUserId } from './require-auth.js';
import { HttpError } from '../utils/http-error.js';
export const requireAdmin: RequestHandler = async (request, _response, next) => {
  const user = await prisma.user.findUnique({ where: { id: authenticatedUserId(request) }, select: { role: true, status: true } });
  if (!user || user.status !== 'ACTIVE' || user.role !== 'ADMIN') throw new HttpError(403, 'Admin access is required');
  next();
};
