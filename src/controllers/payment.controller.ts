import type { RequestHandler } from 'express';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData as data } from '../middleware/validate-request.js';
import type { PaymentParams, PaymentQuery, RejectPaymentInput } from '../schemas/payment.schema.js';
import * as service from '../services/payment.service.js';

export const uploadProof: RequestHandler = async (request, response) => {
  const { paymentId } = data<PaymentParams>(response, 'params');
  try {
    response.status(201).json({ payment: await service.submitProof(authenticatedUserId(request), paymentId, request.file) });
  } catch (error) {
    await service.removeUploadedFile(request.file);
    throw error;
  }
};

export const proof: RequestHandler = async (request, response) => {
  const { paymentId } = data<PaymentParams>(response, 'params');
  response.sendFile(await service.getProofPath(authenticatedUserId(request), paymentId));
};

export const adminList: RequestHandler = async (_request, response) => {
  response.json(await service.listPayments(data<PaymentQuery>(response, 'query')));
};

export const verify: RequestHandler = async (request, response) => {
  const { paymentId } = data<PaymentParams>(response, 'params');
  response.json({ payment: await service.verifyPayment(authenticatedUserId(request), paymentId) });
};

export const reject: RequestHandler = async (request, response) => {
  const { paymentId } = data<PaymentParams>(response, 'params');
  response.json({ payment: await service.rejectPayment(
    authenticatedUserId(request), paymentId, data<RejectPaymentInput>(response, 'body'),
  ) });
};
