import { z } from 'zod';

const recordId = z.string().trim().min(1).max(100);
const slug = z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const categoryParamsSchema = z.object({ categoryId: recordId }).strict();
export const sellerStoreParamsSchema = z.object({ merchantId: recordId }).strict();
export const merchantProductParamsSchema = z.object({ merchantId: recordId, productId: recordId }).strict();
export const productParamsSchema = z.object({ productId: recordId }).strict();
export const productImageParamsSchema = z.object({ merchantId: recordId, productId: recordId, imageId: recordId }).strict();
export const productVariantParamsSchema = z.object({ merchantId: recordId, productId: recordId, variantId: recordId }).strict();

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug,
  parentId: recordId.optional(),
}).strict();

export const updateCategorySchema = createCategorySchema
  .partial()
  .strict()
  .refine((category) => Object.keys(category).length > 0, {
    message: 'Provide at least one category field to update',
  });

export const createProductSchema = z.object({
  categoryId: recordId,
  name: z.string().trim().min(2).max(150),
  slug,
  description: z.string().trim().min(1).max(10000),
}).strict();

export const updateProductSchema = createProductSchema
  .partial()
  .strict()
  .refine((product) => Object.keys(product).length > 0, {
    message: 'Provide at least one product field to update',
  });

const price = z.string().trim().max(13).regex(/^\d{1,10}(?:\.\d{1,2})?$/, 'Price must fit Decimal(12,2)').refine((value) => Number(value) > 0, 'Price must be greater than zero');

export const createProductImageSchema = z.object({
  url: z.string().trim().url().max(2048),
  sortOrder: z.number().int().min(0).max(100000).default(0),
}).strict();

export const updateProductImageSchema = createProductImageSchema.partial().strict().refine(
  (image) => Object.keys(image).length > 0,
  { message: 'Provide at least one image field to update' },
);

export const createProductVariantSchema = z.object({
  name: z.string().trim().min(1).max(150),
  sku: z.string().trim().min(1).max(100),
  price,
}).strict();

export const updateProductVariantSchema = createProductVariantSchema.partial().strict().refine(
  (variant) => Object.keys(variant).length > 0,
  { message: 'Provide at least one variant field to update' },
);

export const inventorySchema = z.object({
  quantity: z.number().int().min(0).max(2147483647),
}).strict();

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: recordId.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['newest', 'oldest', 'name_asc', 'name_desc']).default('newest'),
}).strict();

export const sellerProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE']).optional(),
}).strict();

export const adminProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE']).optional(),
  merchantId: recordId.optional(),
  categoryId: recordId.optional(),
}).strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryParams = z.infer<typeof categoryParamsSchema>;
export type SellerStoreParams = z.infer<typeof sellerStoreParamsSchema>;
export type MerchantProductParams = z.infer<typeof merchantProductParamsSchema>;
export type ProductParams = z.infer<typeof productParamsSchema>;
export type ProductImageParams = z.infer<typeof productImageParamsSchema>;
export type ProductVariantParams = z.infer<typeof productVariantParamsSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateProductImageInput = z.infer<typeof createProductImageSchema>;
export type UpdateProductImageInput = z.infer<typeof updateProductImageSchema>;
export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;
export type InventoryInput = z.infer<typeof inventorySchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type SellerProductQuery = z.infer<typeof sellerProductQuerySchema>;
export type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;