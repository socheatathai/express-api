import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import apiRouter from './routes/v1/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { openApiDocument } from './docs/openapi.js';

const app = express();

app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api-docs', (_request, response, next) => {
  response.removeHeader('Content-Security-Policy');
  next();
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use('/api/v1', apiRouter);

app.use(notFound);
app.use(errorHandler);

export default app;