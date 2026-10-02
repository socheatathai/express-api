import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import apiRouter from './routes/v1/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { openApiDocument } from './docs/openapi.js';
import { requestId } from './middleware/request-id.js';
import { requireJsonContentType } from './middleware/require-json-content-type.js';

const corsOrigins = new Set(
  (process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
);
const globalRateLimitMax = Number.isInteger(Number(process.env.RATE_LIMIT_MAX)) && Number(process.env.RATE_LIMIT_MAX) > 0
  ? Number(process.env.RATE_LIMIT_MAX)
  : 120;

const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: globalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (request) => request.method === 'OPTIONS' || ['/api/v1/health', '/api/v1/health/ready'].includes(request.path),
  handler: (_request, response) => {
    response.status(429).json({ error: { message: 'Too many requests' } });
  },
});

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(requestId);
app.use(morgan(':method :url :status :response-time ms request-id=:req[x-request-id]'));
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || corsOrigins.has(origin)),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  maxAge: 600,
}));
app.use(globalRateLimit);
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1', requireJsonContentType);

app.use('/docs', (_request, response, next) => {
  response.removeHeader('Content-Security-Policy');
  next();
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use('/api/v1', apiRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
