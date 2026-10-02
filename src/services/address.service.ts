import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import type { CreateAddressInput, UpdateAddressInput } from '../schemas/address.schema.js';
import { HttpError } from '../utils/http-error.js';

export async function listAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createAddress(userId: string, input: CreateAddressInput) {
  const { isDefault, ...fields } = input;

  return prisma.$transaction(async (transaction) => {
    const shouldBeDefault = isDefault ?? (await transaction.address.count({ where: { userId } })) === 0;

    if (shouldBeDefault) {
      await transaction.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return transaction.address.create({
      data: { ...fields, userId, isDefault: shouldBeDefault },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getAddress(userId: string, addressId: string) {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });

  if (!address) {
    throw new HttpError(404, 'Address not found');
  }

  return address;
}

export async function updateAddress(userId: string, addressId: string, input: UpdateAddressInput) {
  const { isDefault, ...fields } = input;

  return prisma.$transaction(async (transaction) => {
    const address = await transaction.address.findFirst({ where: { id: addressId, userId } });

    if (!address) {
      throw new HttpError(404, 'Address not found');
    }

    if (isDefault) {
      await transaction.address.updateMany({
        where: { userId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    return transaction.address.update({
      where: { id: addressId },
      data: { ...fields, ...(isDefault === undefined ? {} : { isDefault }) },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  const result = await prisma.address.deleteMany({ where: { id: addressId, userId } });

  if (result.count === 0) {
    throw new HttpError(404, 'Address not found');
  }
}