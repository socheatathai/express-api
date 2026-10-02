import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const prismaCode = typeof error.code === 'string' ? error.code : undefined;
  const uploadError = error.name === 'MulterError' || error.statusCode === undefined && typeof error.message === 'string' && error.message.startsWith('Payment proof');
  const statusCode = error instanceof ZodError
    ? 400
    : uploadError && prismaCode === 'LIMIT_FILE_SIZE'
      ? 413
      : uploadError
        ? 400
    : error.statusCode || error.status || (prismaCode === 'P2002' ? 409 : prismaCode === 'P2025' ? 404 : prismaCode === 'P2034' ? 409 : 500);
  const message = error instanceof ZodError
    ? 'Request validation failed'
    : prismaCode === 'P2002'
      ? 'A record with this value already exists'
      : prismaCode === 'P2025'
        ? 'Record not found'
        : prismaCode === 'P2034'
          ? 'The data changed concurrently; please retry'
          : error.status === 400 && error.type === 'entity.parse.failed'
            ? 'Request body contains invalid JSON'
            : uploadError
              ? error.message
              : statusCode >= 500 && process.env.NODE_ENV === 'production'
              ? 'Internal Server Error'
              : error.message;

  response.status(statusCode).json({
    error: {
      message,
      ...(error instanceof ZodError
        ? { details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) }
        : {}),
    },
  });
};
