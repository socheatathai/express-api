import { Router } from 'express';
import healthRouter from './health.routes.js';
import authRouter from './auth.routes.js';
import addressesRouter from './addresses.routes.js';

import sellerRouter from './seller.routes.js';
import adminRouter from './admin.routes.js';
import catalogRouter from './catalog.routes.js';
import adminCatalogRouter from './admin-catalog.routes.js';
import cartRouter from './cart.routes.js';
import ordersRouter from './orders.routes.js';
import paymentsRouter from './payments.routes.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/addresses', addressesRouter);
router.use('/cart', cartRouter);
router.use('/orders', ordersRouter);
router.use('/payments', paymentsRouter);
router.use('/seller', sellerRouter);
router.use('/admin', adminRouter);
router.use('/admin', adminCatalogRouter);
router.use('/', catalogRouter);

export default router;