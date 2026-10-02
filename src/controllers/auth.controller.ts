import type { RequestHandler } from 'express';
import { loginSchema, registerSchema } from '../schemas/auth.schema.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';
import { getCurrentUser, loginUser, registerUser } from '../services/auth.service.js';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData } from '../middleware/validate-request.js';

export const register: RequestHandler = async (request, response) => {
  const input = validatedRequestData<RegisterInput>(response, 'body');
  response.status(201).json(await registerUser(input));
};

export const login: RequestHandler = async (request, response) => {
  const input = validatedRequestData<LoginInput>(response, 'body');
  response.status(200).json(await loginUser(input));
};

export const currentUser: RequestHandler = async (request, response) => {
  response.status(200).json({ user: await getCurrentUser(authenticatedUserId(request)) });
};

export const logout: RequestHandler = async (_request, response) => {
  response.status(204).end();
};