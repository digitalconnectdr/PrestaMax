import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Always log full error server-side for debugging
  console.error('Error:', err.stack || err.message);

  const statusCode = err.status || err.statusCode || 500;

  // In production, never expose internal error details to the client
  const message = isDev
    ? (err.message || 'Internal server error')
    : statusCode < 500
      ? (err.message || 'Bad request')  // 4xx: safe to surface
      : 'Ha ocurrido un error interno. Por favor intente nuevamente.'; // 5xx: hide internals

  res.status(statusCode).json({ error: message });
};
