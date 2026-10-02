import type { RequestHandler, Response } from 'express';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData as data } from '../middleware/validate-request.js';
import type { MerchantOrderParams, MerchantOrderQuery } from '../schemas/order.schema.js';
import * as service from '../services/merchant-order.service.js';

function params(response: Response) { return data<MerchantOrderParams>(response, 'params'); }

export const list: RequestHandler = async (request, response) => {
  response.json({ orders: await service.listMerchantOrders(authenticatedUserId(request), params(response).merchantId, data<MerchantOrderQuery>(response, 'query')) });
};

export const get: RequestHandler = async (request, response) => {
  const { merchantId, merchantOrderId } = params(response);
  response.json({ order: await service.getMerchantOrder(authenticatedUserId(request), merchantId, merchantOrderId) });
};

export function transition(action: 'accept' | 'process' | 'ready'): RequestHandler {
  return async (request, response) => {
    const { merchantId, merchantOrderId } = params(response);
    response.json({ order: await service.transitionMerchantOrder(authenticatedUserId(request), merchantId, merchantOrderId, action) });
  };
}

export const cancel: RequestHandler = async (request, response) => {
  const { merchantId, merchantOrderId } = params(response);
  response.json({ result: await service.cancelMerchantOrder(authenticatedUserId(request), merchantId, merchantOrderId) });
};