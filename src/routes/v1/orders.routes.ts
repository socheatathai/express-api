import { Router } from 'express';
import { createCheckout, get, list } from '../../controllers/order.controller.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validateRequest as validate } from '../../middleware/validate-request.js';
import { checkoutSchema, customerOrderParamsSchema, customerOrderQuerySchema } from '../../schemas/order.schema.js';

const router = Router();
router.use(requireAuth);
router.post('/checkout', validate('body', checkoutSchema), createCheckout);
router.get('/', validate('query', customerOrderQuerySchema), list);
router.get('/:orderId', validate('params', customerOrderParamsSchema), get);

export default router;
