import type { RequestHandler, Response } from 'express';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData as data } from '../middleware/validate-request.js';
import type { CreateMerchantInput, SellerQuery } from '../schemas/merchant.schema.js';
import * as service from '../services/merchant.service.js';
function params(response: Response) { return data<{ merchantId: string; userId: string }>(response, 'params'); }
export const create: RequestHandler = async (req, res) => { res.status(201).json({ seller: await service.createMerchant(authenticatedUserId(req), data<CreateMerchantInput>(res, 'body')) }); };
export const list: RequestHandler = async (req, res) => { res.json({ sellers: await service.listOwnedMerchants(authenticatedUserId(req)) }); };
export const get: RequestHandler = async (req, res) => { res.json({ seller: await service.getOwnedMerchant(authenticatedUserId(req), params(res).merchantId) }); };
export const members: RequestHandler = async (req, res) => { res.json({ members: await service.listMembers(authenticatedUserId(req), params(res).merchantId) }); };
export const addMember: RequestHandler = async (req, res) => {
  const input = data<{ userId: string; role: 'MANAGER' | 'STAFF' }>(res, 'body');
  res.status(201).json({ member: await service.manageMember(authenticatedUserId(req), params(res).merchantId, input.userId, 'add', input.role) });
};
export const updateMember: RequestHandler = async (req, res) => {
  const input = data<{ role: 'MANAGER' | 'STAFF' }>(res, 'body');
  res.json({ member: await service.manageMember(authenticatedUserId(req), params(res).merchantId, params(res).userId, 'update', input.role) });
};
export const deleteMember: RequestHandler = async (req, res) => { await service.manageMember(authenticatedUserId(req), params(res).merchantId, params(res).userId, 'delete'); res.sendStatus(204); };
export const adminList: RequestHandler = async (_req, res) => { res.json(await service.listSellers(data<SellerQuery>(res, 'query'))); };
export const adminGet: RequestHandler = async (_req, res) => { res.json({ seller: await service.getSeller(params(res).merchantId) }); };
export function transition(action: 'approve' | 'reject' | 'suspend'): RequestHandler {
  return async (_req, res) => { res.json({ seller: await service.transitionSeller(params(res).merchantId, action) }); };
}
