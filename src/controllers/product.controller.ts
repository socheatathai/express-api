import type { RequestHandler, Response } from 'express';
import { authenticatedUserId } from '../middleware/require-auth.js';
import { validatedRequestData as data } from '../middleware/validate-request.js';
import type {
  AdminProductQuery,
  CreateProductInput,
  MerchantProductParams,
  ProductListQuery,
  ProductParams,
  SellerStoreParams,
  SellerProductQuery,
  ProductImageParams,
  ProductVariantParams,
  CreateProductImageInput,
  UpdateProductImageInput,
  CreateProductVariantInput,
  UpdateProductVariantInput,
  InventoryInput,
  UpdateProductInput,
} from '../schemas/catalog.schema.js';
import * as service from '../services/product.service.js';

function params(response: Response) {
  return data<MerchantProductParams>(response, 'params');
}

export const publicList: RequestHandler = async (_request, response) => {
  response.json({ products: await service.listPublicProducts(data<ProductListQuery>(response, 'query')) });
};

export const publicGet: RequestHandler = async (_request, response) => {
  response.json({ product: await service.getPublicProduct(data<ProductParams>(response, 'params').productId) });
};

export const sellerList: RequestHandler = async (request, response) => {
  response.json({ products: await service.listSellerProducts(
    authenticatedUserId(request),
    data<SellerStoreParams>(response, 'params').merchantId,
    data<SellerProductQuery>(response, 'query'),
  ) });
};

export const sellerGet: RequestHandler = async (request, response) => {
  const { merchantId, productId } = params(response);
  response.json({ product: await service.getSellerProduct(authenticatedUserId(request), merchantId, productId) });
};

export const sellerCreate: RequestHandler = async (request, response) => {
  const { merchantId } = data<SellerStoreParams>(response, 'params');
  response.status(201).json({ product: await service.createSellerProduct(
    authenticatedUserId(request),
    merchantId,
    data<CreateProductInput>(response, 'body'),
  ) });
};

export const sellerUpdate: RequestHandler = async (request, response) => {
  const { merchantId, productId } = params(response);
  response.json({ product: await service.updateSellerProduct(
    authenticatedUserId(request), merchantId, productId, data<UpdateProductInput>(response, 'body'),
  ) });
};

export const sellerSubmit: RequestHandler = async (request, response) => {
  const { merchantId, productId } = params(response);
  response.json({ product: await service.submitSellerProduct(authenticatedUserId(request), merchantId, productId) });
};

export const adminList: RequestHandler = async (_request, response) => {
  response.json({ products: await service.listAdminProducts(data<AdminProductQuery>(response, 'query')) });
};

export const adminGet: RequestHandler = async (_request, response) => {
  response.json({ product: await service.getAdminProduct(data<ProductParams>(response, 'params').productId) });
};

export function review(action: 'approve' | 'reject'): RequestHandler {
  return async (_request, response) => {
    response.json({ product: await service.reviewProduct(data<ProductParams>(response, 'params').productId, action) });
  };
}

export const sellerImages: RequestHandler = async (request, response) => {
  const { merchantId, productId } = data<ProductImageParams>(response, 'params');
  response.json({ images: await service.listProductImages(authenticatedUserId(request), merchantId, productId) });
};

export const sellerCreateImage: RequestHandler = async (request, response) => {
  const { merchantId, productId } = data<ProductImageParams>(response, 'params');
  response.status(201).json({ image: await service.createProductImage(authenticatedUserId(request), merchantId, productId, data<CreateProductImageInput>(response, 'body')) });
};

export const sellerUpdateImage: RequestHandler = async (request, response) => {
  const { merchantId, productId, imageId } = data<ProductImageParams>(response, 'params');
  response.json({ image: await service.updateProductImage(authenticatedUserId(request), merchantId, productId, imageId, data<UpdateProductImageInput>(response, 'body')) });
};

export const sellerDeleteImage: RequestHandler = async (request, response) => {
  const { merchantId, productId, imageId } = data<ProductImageParams>(response, 'params');
  await service.deleteProductImage(authenticatedUserId(request), merchantId, productId, imageId);
  response.status(204).send();
};

export const sellerVariants: RequestHandler = async (request, response) => {
  const { merchantId, productId } = data<ProductVariantParams>(response, 'params');
  response.json({ variants: await service.listProductVariants(authenticatedUserId(request), merchantId, productId) });
};

export const sellerCreateVariant: RequestHandler = async (request, response) => {
  const { merchantId, productId } = data<ProductVariantParams>(response, 'params');
  response.status(201).json({ variant: await service.createProductVariant(authenticatedUserId(request), merchantId, productId, data<CreateProductVariantInput>(response, 'body')) });
};

export const sellerUpdateVariant: RequestHandler = async (request, response) => {
  const { merchantId, productId, variantId } = data<ProductVariantParams>(response, 'params');
  response.json({ variant: await service.updateProductVariant(authenticatedUserId(request), merchantId, productId, variantId, data<UpdateProductVariantInput>(response, 'body')) });
};

export const sellerUpdateInventory: RequestHandler = async (request, response) => {
  const { merchantId, productId, variantId } = data<ProductVariantParams>(response, 'params');
  response.json({ inventory: await service.updateInventory(authenticatedUserId(request), merchantId, productId, variantId, data<InventoryInput>(response, 'body')) });
};