import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { validateRequest as validate } from '../../middleware/validate-request.js';
import * as schema from '../../schemas/cart.schema.js';
import * as controller from '../../controllers/cart.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/', controller.get);
router.post('/items', validate('body', schema.addCartItemSchema), controller.addItem);
router.patch('/items/:itemId', validate('params', schema.cartItemParamsSchema), validate('body', schema.updateCartItemSchema), controller.updateItem);
router.delete('/items/:itemId', validate('params', schema.cartItemParamsSchema), controller.removeItem);

export default router;
