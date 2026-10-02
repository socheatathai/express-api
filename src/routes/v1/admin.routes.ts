import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validateRequest as validate } from '../../middleware/validate-request.js';
import { merchantParams, sellerQuery } from '../../schemas/merchant.schema.js';
import * as controller from '../../controllers/merchant.controller.js';
import * as paymentController from '../../controllers/payment.controller.js';
import { validateRequest as validatePayment } from '../../middleware/validate-request.js';
import { paymentParamsSchema, paymentQuerySchema, rejectPaymentSchema } from '../../schemas/payment.schema.js';
const router = Router();
router.use(requireAuth, requireAdmin);
router.get('/sellers', validate('query', sellerQuery), controller.adminList);
router.get('/sellers/:merchantId', validate('params', merchantParams), controller.adminGet);
for (const action of ['approve', 'reject', 'suspend'] as const) {
  router.post(`/sellers/:merchantId/${action}`, validate('params', merchantParams), controller.transition(action));
}
  router.get('/payments', validatePayment('query', paymentQuerySchema), paymentController.adminList);
  router.post('/payments/:paymentId/verify', validatePayment('params', paymentParamsSchema), paymentController.verify);
  router.post('/payments/:paymentId/reject', validatePayment('params', paymentParamsSchema), validatePayment('body', rejectPaymentSchema), paymentController.reject);
export default router;
