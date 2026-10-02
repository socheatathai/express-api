import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { paymentProofUpload } from '../../middleware/payment-upload.js';
import { validateRequest as validate } from '../../middleware/validate-request.js';
import { paymentParamsSchema } from '../../schemas/payment.schema.js';
import * as controller from '../../controllers/payment.controller.js';

const router = Router();
router.use(requireAuth);
router.post('/:paymentId/proof', validate('params', paymentParamsSchema), paymentProofUpload.single('proof'), controller.uploadProof);
router.get('/:paymentId/proof', validate('params', paymentParamsSchema), controller.proof);

export default router;
