import type { RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

export type RequestSegment = 'body' | 'params' | 'query';

type ValidatedParts = Partial<Record<RequestSegment, unknown>>;
type LocalsWithValidated = Record<string, unknown> & { validatedRequest?: ValidatedParts };

export function validateRequest<T>(segment: RequestSegment, schema: ZodType<T>): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request[segment]);

    if (!result.success) {
      next(result.error);
      return;
    }

    const locals = response.locals as LocalsWithValidated;
    locals.validatedRequest ??= {};
    locals.validatedRequest[segment] = result.data;
    next();
  };
}

export function validatedRequestData<T>(response: Response, segment: RequestSegment): T {
  const locals = response.locals as LocalsWithValidated;
  const value = locals.validatedRequest?.[segment];

  if (value === undefined) {
    throw new Error(`Validated request data for ${segment} is unavailable`);
  }

  return value as T;
}