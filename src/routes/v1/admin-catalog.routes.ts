import { Router } from 'express';
import * as categoryController from '../../controllers/category.controller.js';
import * as productController from '../../controllers/product.controller.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validateRequest as validate } from '../../middleware/validate-request.js';
import {
  adminProductQuerySchema,
  categoryParamsSchema,
  createCategorySchema,
  productParamsSchema,
  updateCategorySchema,
} from '../../schemas/catalog.schema.js';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/categories', categoryController.adminList);
router.post('/categories', validate('body', createCategorySchema), categoryController.create);
router.patch('/categories/:categoryId', validate('params', categoryParamsSchema), validate('body', updateCategorySchema), categoryController.update);
router.delete('/categories/:categoryId', validate('params', categoryParamsSchema), categoryController.remove);

router.get('/products', validate('query', adminProductQuerySchema), productController.adminList);
router.get('/products/:productId', validate('params', productParamsSchema), productController.adminGet);
router.post('/products/:productId/approve', validate('params', productParamsSchema), productController.review('approve'));
router.post('/products/:productId/reject', validate('params', productParamsSchema), productController.review('reject'));

export default router;