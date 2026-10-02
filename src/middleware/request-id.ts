import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const requestIdPattern = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export const requestId: RequestHandler = (request, response, next) => {
  const incomingId = request.get('x-request-id');
  const id = incomingId && requestIdPattern.test(incomingId) ? incomingId.toLowerCase() : randomUUID();

  request.headers['x-request-id'] = id;
  response.setHeader('X-Request-ID', id);
  response.locals.requestId = id;
  next();
};