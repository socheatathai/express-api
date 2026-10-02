import type { RequestHandler } from 'express';
import { HttpError } from '../utils/http-error.js';

const bodyMethods = new Set(['POST', 'PUT', 'PATCH']);

export const requireJsonContentType: RequestHandler = (request, _response, next) => {
  const contentLength = Number(request.get('content-length') ?? 0);
  const hasBody = contentLength > 0 || request.get('transfer-encoding') !== undefined;

  const isPaymentProofUpload = request.path.endsWith('/proof') && request.is('multipart/form-data');
  if (bodyMethods.has(request.method) && hasBody && !request.is('application/json') && !isPaymentProofUpload) {
    next(new HttpError(415, 'Content-Type must be application/json'));
    return;
  }

  next();
};