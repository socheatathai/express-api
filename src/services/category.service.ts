import { serializableTransaction } from '../lib/transaction.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../utils/http-error.js';
import type { CreateCategoryInput, UpdateCategoryInput } from '../schemas/catalog.schema.js';

export async function listPublicCategories() {
  return prisma.category.findMany({
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, slug: true, parentId: true },
  });
}

export async function getPublicCategory(categoryId: string) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, slug: true, parentId: true },
  });

  if (!category) throw new HttpError(404, 'Category not found');
  return category;
}

export async function listAdminCategories() {
  return prisma.category.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
}

export async function createCategory(input: CreateCategoryInput) {
  if (input.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: input.parentId }, select: { id: true } });
    if (!parent) throw new HttpError(404, 'Parent category not found');
  }

  return prisma.category.create({ data: input });
}

export async function updateCategory(categoryId: string, input: UpdateCategoryInput) {
  return serializableTransaction(async (transaction) => {
    const current = await transaction.category.findUnique({ where: { id: categoryId } });
    if (!current) throw new HttpError(404, 'Category not found');
    if (input.parentId) {
      const visited = new Set([categoryId]);
      let ancestorId: string | null = input.parentId;
      while (ancestorId) {
        if (visited.has(ancestorId)) throw new HttpError(400, 'Category parent would create a cycle');
        visited.add(ancestorId);
        const ancestor: { id: string; parentId: string | null } | null = await transaction.category.findUnique({
          where: { id: ancestorId }, select: { id: true, parentId: true },
        });
        if (!ancestor) throw new HttpError(404, 'Parent category not found');
        ancestorId = ancestor.parentId;
      }
    }
    return transaction.category.update({ where: { id: categoryId }, data: input });
  });
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { children: true, products: true } } },
  });

  if (!category) throw new HttpError(404, 'Category not found');
  if (category._count.children > 0 || category._count.products > 0) {
    throw new HttpError(409, 'Category with child categories or products cannot be deleted');
  }

  await prisma.category.delete({ where: { id: categoryId } });
}