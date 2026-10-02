import type { RequestHandler, Response } from 'express';
import { validatedRequestData as data } from '../middleware/validate-request.js';
import type { CategoryParams, CreateCategoryInput, UpdateCategoryInput } from '../schemas/catalog.schema.js';
import * as service from '../services/category.service.js';

function categoryId(response: Response) {
  return data<CategoryParams>(response, 'params').categoryId;
}

export const publicList: RequestHandler = async (_request, response) => {
  response.json({ categories: await service.listPublicCategories() });
};

export const publicGet: RequestHandler = async (_request, response) => {
  response.json({ category: await service.getPublicCategory(categoryId(response)) });
};

export const adminList: RequestHandler = async (_request, response) => {
  response.json({ categories: await service.listAdminCategories() });
};

export const create: RequestHandler = async (_request, response) => {
  response.status(201).json({ category: await service.createCategory(data<CreateCategoryInput>(response, 'body')) });
};

export const update: RequestHandler = async (_request, response) => {
  response.json({ category: await service.updateCategory(categoryId(response), data<UpdateCategoryInput>(response, 'body')) });
};

export const remove: RequestHandler = async (_request, response) => {
  await service.deleteCategory(categoryId(response));
  response.sendStatus(204);
};