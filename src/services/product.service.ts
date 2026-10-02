import { Prisma } from '../generated/prisma/client.js';
import type { AdminProductQuery, CreateProductImageInput, CreateProductInput, CreateProductVariantInput, InventoryInput, ProductListQuery, SellerProductQuery, UpdateProductImageInput, UpdateProductInput, UpdateProductVariantInput } from '../schemas/catalog.schema.js';
import { prisma } from '../lib/prisma.js';
import { serializableTransaction } from '../lib/transaction.js';
import { HttpError } from '../utils/http-error.js';

async function requireActiveStoreMember(userId: string, merchantId: string, transaction: Pick<Prisma.TransactionClient, 'merchantMember'> = prisma): Promise<void> {
  const membership = await transaction.merchantMember.findUnique({
    where: { merchantId_userId: { merchantId, userId } },
    include: { merchant: { select: { status: true } } },
  });

  if (!membership) throw new HttpError(404, 'Seller not found');
  if (membership.merchant.status !== 'ACTIVE') throw new HttpError(409, 'Seller must be active to manage products');
}

async function requireCategory(categoryId: string, transaction: Pick<Prisma.TransactionClient, 'category'> = prisma): Promise<void> {
  const category = await transaction.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) throw new HttpError(404, 'Category not found');
}

const productDetails = {
  category: { select: { id: true, name: true, slug: true } },
  merchant: { select: { id: true, name: true, slug: true, status: true } },
  images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  variants: {
    where: { status: 'ACTIVE' as const },
    include: { inventory: true },
    orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
  },
};

function pageArgs(query: { page: number; limit: number }) {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

function publicOrderBy(sort: ProductListQuery['sort']) {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
    case 'name_asc':
      return [{ name: 'asc' as const }, { id: 'asc' as const }];
    case 'name_desc':
      return [{ name: 'desc' as const }, { id: 'asc' as const }];
    default:
      return [{ createdAt: 'desc' as const }, { id: 'asc' as const }];
  }
}

function addAvailability<T extends { variants: Array<{ inventory: { quantity: number; reservedQuantity: number } | null }> }>(product: T) {
  return {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      availableQuantity: variant.inventory
        ? Math.max(variant.inventory.quantity - variant.inventory.reservedQuantity, 0)
        : 0,
    })),
  };
}

export async function listSellerProducts(userId: string, merchantId: string, query: SellerProductQuery) {
  await requireActiveStoreMember(userId, merchantId);
  const where = { merchantId, ...(query.status ? { status: query.status } : {}) };
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({ where, ...pageArgs(query), orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: productDetails }),
    prisma.product.count({ where }),
  ]);

  return { products, total, page: query.page, limit: query.limit };
}

export async function getSellerProduct(userId: string, merchantId: string, productId: string) {
  await requireActiveStoreMember(userId, merchantId);
  const product = await prisma.product.findFirst({ where: { id: productId, merchantId }, include: productDetails });
  if (!product) throw new HttpError(404, 'Product not found');
  return product;
}

export async function createSellerProduct(userId: string, merchantId: string, input: CreateProductInput) {
  await requireActiveStoreMember(userId, merchantId);
  await requireCategory(input.categoryId);

  return prisma.product.create({
    data: { ...input, merchantId, status: 'DRAFT' },
    include: productDetails,
  });
}

export async function updateSellerProduct(userId: string, merchantId: string, productId: string, input: UpdateProductInput) {
  return editProduct(userId, merchantId, productId, async (transaction) => {
    if (input.categoryId) await requireCategory(input.categoryId, transaction);
    return transaction.product.update({ where: { id: productId }, data: input, include: productDetails });
  });
}

export async function submitSellerProduct(userId: string, merchantId: string, productId: string) {
  await requireActiveStoreMember(userId, merchantId);
  const result = await prisma.product.updateMany({
    where: { id: productId, merchantId, status: { in: ['DRAFT', 'REJECTED'] } },
    data: { status: 'PENDING' },
  });

  if (result.count === 0) {
    const product = await prisma.product.findFirst({ where: { id: productId, merchantId }, select: { status: true } });
    if (!product) throw new HttpError(404, 'Product not found');
    throw new HttpError(409, 'Only DRAFT or REJECTED products can be submitted');
  }

  return prisma.product.findUniqueOrThrow({ where: { id: productId }, include: productDetails });
}

export async function listAdminProducts(query: AdminProductQuery) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.merchantId ? { merchantId: query.merchantId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
  } satisfies Prisma.ProductWhereInput;
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({ where, ...pageArgs(query), orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: productDetails }),
    prisma.product.count({ where }),
  ]);

  return { products, total, page: query.page, limit: query.limit };
}

export async function getAdminProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: productDetails });
  if (!product) throw new HttpError(404, 'Product not found');
  return product;
}

export async function reviewProduct(productId: string, action: 'approve' | 'reject') {
  const target = action === 'approve' ? 'ACTIVE' : 'REJECTED';
  const result = await prisma.product.updateMany({
    where: { id: productId, status: 'PENDING' },
    data: { status: target },
  });

  if (result.count === 0) {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { status: true } });
    if (!product) throw new HttpError(404, 'Product not found');
    throw new HttpError(409, 'Only PENDING products can be reviewed');
  }

  return prisma.product.findUniqueOrThrow({ where: { id: productId }, include: productDetails });
}

export async function listPublicProducts(query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = {
    status: 'ACTIVE',
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search ? {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ],
    } : {}),
    merchant: { status: 'ACTIVE' },
  };
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({ where, ...pageArgs(query), orderBy: publicOrderBy(query.sort), include: productDetails }),
    prisma.product.count({ where }),
  ]);

  return { products: products.map(addAvailability), total, page: query.page, limit: query.limit, sort: query.sort };
}

export async function getPublicProduct(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, status: 'ACTIVE', merchant: { status: 'ACTIVE' } },
    include: productDetails,
  });
  if (!product) throw new HttpError(404, 'Product not found');
  return addAvailability(product);
}

async function requireOwnedProduct(userId: string, merchantId: string, productId: string) {
  await requireActiveStoreMember(userId, merchantId);
  const product = await prisma.product.findFirst({ where: { id: productId, merchantId }, select: { id: true } });
  if (!product) throw new HttpError(404, 'Product not found');
}

export async function listProductImages(userId: string, merchantId: string, productId: string) {
  await requireOwnedProduct(userId, merchantId, productId);
  return prisma.productImage.findMany({ where: { productId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
}

async function editProduct<T>(userId: string, merchantId: string, productId: string, work: (transaction: Prisma.TransactionClient) => Promise<T>) {
  return serializableTransaction(async (transaction) => {
    await requireActiveStoreMember(userId, merchantId, transaction);
    const product = await transaction.product.findFirst({ where: { id: productId, merchantId } });
    if (!product) throw new HttpError(404, 'Product not found');
    if (['PENDING', 'INACTIVE'].includes(product.status)) throw new HttpError(409, 'Product cannot be edited in its current status');
    if (product.status === 'ACTIVE') await transaction.product.update({ where: { id: productId }, data: { status: 'PENDING' } });
    return work(transaction);
  });
}

export async function createProductImage(userId: string, merchantId: string, productId: string, input: CreateProductImageInput) {
  return editProduct(userId, merchantId, productId, (transaction) => transaction.productImage.create({ data: { ...input, productId } }));
}

export async function updateProductImage(userId: string, merchantId: string, productId: string, imageId: string, input: UpdateProductImageInput) {
  return editProduct(userId, merchantId, productId, async (transaction) => {
    const changed = await transaction.productImage.updateMany({ where: { id: imageId, productId }, data: input });
    if (!changed.count) throw new HttpError(404, 'Product image not found');
    return transaction.productImage.findUniqueOrThrow({ where: { id: imageId } });
  });
}

export async function deleteProductImage(userId: string, merchantId: string, productId: string, imageId: string) {
  return editProduct(userId, merchantId, productId, async (transaction) => {
    const changed = await transaction.productImage.deleteMany({ where: { id: imageId, productId } });
    if (!changed.count) throw new HttpError(404, 'Product image not found');
  });
}

export async function listProductVariants(userId: string, merchantId: string, productId: string) {
  await requireOwnedProduct(userId, merchantId, productId);
  return prisma.productVariant.findMany({ where: { productId }, include: { inventory: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
}

export async function createProductVariant(userId: string, merchantId: string, productId: string, input: CreateProductVariantInput) {
  return editProduct(userId, merchantId, productId, (transaction) => transaction.productVariant.create({ data: { ...input, productId, price: new Prisma.Decimal(input.price) }, include: { inventory: true } }));
}

export async function updateProductVariant(userId: string, merchantId: string, productId: string, variantId: string, input: UpdateProductVariantInput) {
  return editProduct(userId, merchantId, productId, async (transaction) => {
    const data = { ...input, ...(input.price !== undefined ? { price: new Prisma.Decimal(input.price) } : {}) };
    const changed = await transaction.productVariant.updateMany({ where: { id: variantId, productId }, data });
    if (!changed.count) throw new HttpError(404, 'Product variant not found');
    return transaction.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { inventory: true } });
  });
}

export async function updateInventory(userId: string, merchantId: string, productId: string, variantId: string, input: InventoryInput) {
  return serializableTransaction(async (transaction) => {
    await requireActiveStoreMember(userId, merchantId, transaction);
    const variant = await transaction.productVariant.findFirst({ where: { id: variantId, productId, product: { merchantId } }, select: { id: true } });
    if (!variant) throw new HttpError(404, 'Product variant not found');
    const inventory = await transaction.inventory.findUnique({ where: { variantId } });
    if (!inventory) return transaction.inventory.create({ data: { variantId, quantity: input.quantity, reservedQuantity: 0 } });
    const changed = await transaction.inventory.updateMany({ where: { variantId, reservedQuantity: { lte: input.quantity } }, data: { quantity: input.quantity } });
    if (!changed.count) throw new HttpError(409, 'Physical stock cannot be lower than reserved stock');
    return transaction.inventory.findUniqueOrThrow({ where: { variantId } });
  });
}
