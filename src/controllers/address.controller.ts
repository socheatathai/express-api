import type { RequestHandler } from 'express';
import type { AddressParams, CreateAddressInput, UpdateAddressInput } from '../schemas/address.schema.js';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData } from '../middleware/validate-request.js';
import {
  createAddress,
  deleteAddress,
  getAddress,
  listAddresses,
  updateAddress,
} from '../services/address.service.js';

export const list: RequestHandler = async (request, response) => {
  response.status(200).json({ addresses: await listAddresses(authenticatedUserId(request)) });
};

export const create: RequestHandler = async (request, response) => {
  const input = validatedRequestData<CreateAddressInput>(response, 'body');
  const address = await createAddress(authenticatedUserId(request), input);
  response.status(201).json({ address });
};

export const get: RequestHandler = async (request, response) => {
  const { addressId } = validatedRequestData<AddressParams>(response, 'params');
  const address = await getAddress(authenticatedUserId(request), addressId);
  response.status(200).json({ address });
};

export const update: RequestHandler = async (request, response) => {
  const input = validatedRequestData<UpdateAddressInput>(response, 'body');
  const { addressId } = validatedRequestData<AddressParams>(response, 'params');
  const address = await updateAddress(authenticatedUserId(request), addressId, input);
  response.status(200).json({ address });
};

export const remove: RequestHandler = async (request, response) => {
  const { addressId } = validatedRequestData<AddressParams>(response, 'params');
  await deleteAddress(authenticatedUserId(request), addressId);
  response.status(204).end();
};