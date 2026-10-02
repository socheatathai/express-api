import type { RequestHandler } from 'express';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData } from '../middleware/validate-request.js';
import type { CheckoutInput, CustomerOrderQuery } from '../schemas/order.schema.js';
import { checkout, getCustomerOrder, listCustomerOrders } from '../services/order.service.js';

export const createCheckout: RequestHandler = async (request, response) => {
  const order = await checkout(
    authenticatedUserId(request), validatedRequestData<CheckoutInput>(response, 'body'),
  );
  response.status(201).json({
    order,
    paymentInstructions: {
      method: 'BANK_TRANSFER',
      qrCodeUrl: process.env.BANK_TRANSFER_QR_URL ?? null,
      proofUploadField: 'proof',
    },
  });
};

export const list: RequestHandler = async (request, response) => {
  response.json(await listCustomerOrders(authenticatedUserId(request), validatedRequestData<CustomerOrderQuery>(response, 'query')));
};

export const get: RequestHandler = async (request, response) => {
  const { orderId } = validatedRequestData<{ orderId: string }>(response, 'params');
  response.json({ order: await getCustomerOrder(authenticatedUserId(request), orderId) });
};
