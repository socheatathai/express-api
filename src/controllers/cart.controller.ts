import type { RequestHandler } from 'express';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData } from '../middleware/validate-request.js';
import type { AddCartItemInput, CartItemParams, UpdateCartItemInput } from '../schemas/cart.schema.js';
import * as service from '../services/cart.service.js';

export const get: RequestHandler = async (request, response) => {
  response.json({ cart: await service.getCart(authenticatedUserId(request)) });
};

export const addItem: RequestHandler = async (request, response) => {
  response.status(201).json({ cart: await service.addCartItem(
    authenticatedUserId(request), validatedRequestData<AddCartItemInput>(response, 'body'),
  ) });
};

export const updateItem: RequestHandler = async (request, response) => {
  const { itemId } = validatedRequestData<CartItemParams>(response, 'params');
  response.json({ cart: await service.updateCartItem(
    authenticatedUserId(request), itemId, validatedRequestData<UpdateCartItemInput>(response, 'body'),
  ) });
};

export const removeItem: RequestHandler = async (request, response) => {
  const { itemId } = validatedRequestData<CartItemParams>(response, 'params');
  await service.removeCartItem(authenticatedUserId(request), itemId);
  response.status(204).end();
};
