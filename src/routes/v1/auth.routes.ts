import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { currentUser, login, logout, register } from '../../controllers/auth.controller.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { loginSchema, registerSchema } from '../../schemas/auth.schema.js';

const router = Router();
const authRateLimitMax = Number.isInteger(Number(process.env.AUTH_RATE_LIMIT_MAX)) && Number(process.env.AUTH_RATE_LIMIT_MAX) > 0
  ? Number(process.env.AUTH_RATE_LIMIT_MAX)
  : 10;

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ error: { message: 'Too many authentication attempts' } });
  },
});

router.post('/register', authRateLimit, validateRequest('body', registerSchema), register);
router.post('/login', authRateLimit, validateRequest('body', loginSchema), login);
router.get('/me', requireAuth, currentUser);
router.post('/logout', requireAuth, logout);

export default router;