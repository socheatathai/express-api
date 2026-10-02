import { Router } from 'express';
import {
  create,
  get,
  list,
  remove,
  update,
} from '../../controllers/address.controller.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { addressParamsSchema, createAddressSchema, updateAddressSchema } from '../../schemas/address.schema.js';

const router = Router();

router.use(requireAuth);
router.route('/')
  .get(list)
  .post(validateRequest('body', createAddressSchema), create);
router.route('/:addressId')
  .get(validateRequest('params', addressParamsSchema), get)
  .patch(
    validateRequest('params', addressParamsSchema),
    validateRequest('body', updateAddressSchema),
    update,
  )
  .delete(validateRequest('params', addressParamsSchema), remove);

export default router;