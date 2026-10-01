import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const statusCode = error.statusCode || error.status || 500;
  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : error.message;

  response.status(statusCode).json({
    error: {
      message,
    },
  });
};