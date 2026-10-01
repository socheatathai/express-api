import type { NextFunction, Request, Response } from 'express';

export function notFound(_request: Request, _response: Response, next: NextFunction): void {
  const error = new Error('Route not found') as Error & { statusCode: number };
  error.statusCode = 404;
  next(error);
}