import type { RequestHandler, Response } from 'express';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData as data } from '../middleware/validate-request.js';
import type { CreateShipmentInput, ShipmentParams, UpdateShipmentInput } from '../schemas/shipment.schema.js';
import * as service from '../services/shipment.service.js';

function params(response: Response) { return data<ShipmentParams>(response, 'params'); }

export const get: RequestHandler = async (request, response) => {
  const { merchantId, merchantOrderId } = params(response);
  response.json({ shipment: await service.getShipment(authenticatedUserId(request), merchantId, merchantOrderId) });
};

export const create: RequestHandler = async (request, response) => {
  const { merchantId, merchantOrderId } = params(response);
  response.status(201).json({ shipment: await service.createShipment(authenticatedUserId(request), merchantId, merchantOrderId, data<CreateShipmentInput>(response, 'body')) });
};

export const update: RequestHandler = async (request, response) => {
  const { merchantId, merchantOrderId } = params(response);
  response.json({ shipment: await service.updateShipment(authenticatedUserId(request), merchantId, merchantOrderId, data<UpdateShipmentInput>(response, 'body')) });
};