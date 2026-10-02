import { Router } from 'express';
import * as categoryController from '../../controllers/category.controller.js';
import * as productController from '../../controllers/product.controller.js';
import { validateRequest as validate } from '../../middleware/validate-request.js';
import { categoryParamsSchema, productListQuerySchema, productParamsSchema } from '../../schemas/catalog.schema.js';

const router = Router();

router.get('/categories', categoryController.publicList);
router.get('/categories/:categoryId', validate('params', categoryParamsSchema), categoryController.publicGet);
router.get('/products', validate('query', productListQuerySchema), productController.publicList);
router.get('/products/:productId', validate('params', productParamsSchema), productController.publicGet);

export default router;