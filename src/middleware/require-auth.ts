import type { Request, RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../utils/http-error.js';
import { getTokenSecret } from '../services/auth.service.js';

export const requireAuth: RequestHandler = async (request, _response, next) => {
  const match = /^Bearer\s+(.+)$/i.exec(request.get('authorization') ?? '');

  if (!match) {
    next(new HttpError(401, 'A bearer access token is required'));
    return;
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(match[1], getTokenSecret(), {
      issuer: 'gz-buy-api',
      audience: 'gz-buy-client',
    });

    if (!payload.sub) {
      throw new Error('Token subject is missing');
    }
    userId = payload.sub;
  } catch {
    next(new HttpError(401, 'Access token is invalid or expired'));
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    next(new HttpError(401, 'Account is unavailable'));
    return;
  }

  request.userId = user.id;
  next();
};

export function authenticatedUserId(request: Request): string {
  if (!request.userId) {
    throw new HttpError(401, 'Authentication is required');
  }

  return request.userId;
}