import 'dotenv/config';
import { hash } from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed data is disabled in production');
  }

  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!demoPassword || Buffer.byteLength(demoPassword, 'utf8') < 12) {
    throw new Error('Set SEED_DEMO_PASSWORD to at least 12 bytes before seeding');
  }

  const hashRounds = Number(process.env.PASSWORD_HASH_ROUNDS ?? 12);
  if (!Number.isInteger(hashRounds) || hashRounds < 10 || hashRounds > 15) {
    throw new Error('PASSWORD_HASH_ROUNDS must be an integer between 10 and 15');
  }
  const passwordHash = await hash(demoPassword, hashRounds);

  await prisma.$transaction(async (transaction) => {
    const customer = await transaction.user.upsert({
      where: { phone: '+85510000001' },
      update: {
        name: 'Demo Customer',
        email: 'customer.demo@example.test',
        passwordHash,
        status: 'ACTIVE',
      },
      create: {
        id: 'seed-user-customer',
        name: 'Demo Customer',
        phone: '+85510000001',
        email: 'customer.demo@example.test',
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const coffeeOwner = await transaction.user.upsert({
      where: { phone: '+85510000002' },
      update: {
        name: 'Demo Coffee Merchant',
        email: 'coffee.owner@example.test',
        passwordHash,
        status: 'ACTIVE',
      },
      create: {
        id: 'seed-user-coffee-owner',
        name: 'Demo Coffee Merchant',
        phone: '+85510000002',
        email: 'coffee.owner@example.test',
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const homeOwner = await transaction.user.upsert({
      where: { phone: '+85510000003' },
      update: {
        name: 'Demo Home Goods Merchant',
        email: 'home.owner@example.test',
        passwordHash,
        status: 'ACTIVE',
      },
      create: {
        id: 'seed-user-home-owner',
        name: 'Demo Home Goods Merchant',
        phone: '+85510000003',
        email: 'home.owner@example.test',
        passwordHash,
        status: 'ACTIVE',
      },
    });

    const customerAddress = await transaction.address.upsert({
      where: { id: 'seed-address-customer' },
      update: {
        userId: customer.id,
        recipientName: customer.name,
        phone: customer.phone,
        province: 'Phnom Penh',
        district: 'Chamkar Mon',
        commune: 'Boeung Keng Kang 1',
        village: 'Village 3',
        addressLine: 'Street 123, House 24',
        landmark: 'Near the local market',
        isDefault: true,
      },
      create: {
        id: 'seed-address-customer',
        userId: customer.id,
        recipientName: customer.name,
        phone: customer.phone,
        province: 'Phnom Penh',
        district: 'Chamkar Mon',
        commune: 'Boeung Keng Kang 1',
        village: 'Village 3',
        addressLine: 'Street 123, House 24',
        landmark: 'Near the local market',
        isDefault: true,
      },
    });

    const coffeeMerchant = await transaction.merchant.upsert({
      where: { slug: 'demo-tonle-coffee' },
      update: {
        name: 'Demo Tonle Coffee Shop',
        phone: '+85510000012',
        status: 'ACTIVE',
      },
      create: {
        id: 'seed-merchant-coffee',
        name: 'Demo Tonle Coffee Shop',
        slug: 'demo-tonle-coffee',
        phone: '+85510000012',
        status: 'ACTIVE',
      },
    });

    const homeMerchant = await transaction.merchant.upsert({
      where: { slug: 'demo-mekong-home' },
      update: {
        name: 'Demo Mekong Home Goods',
        phone: '+85510000013',
        status: 'ACTIVE',
      },
      create: {
        id: 'seed-merchant-home',
        name: 'Demo Mekong Home Goods',
        slug: 'demo-mekong-home',
        phone: '+85510000013',
        status: 'ACTIVE',
      },
    });

    await transaction.merchantMember.upsert({
      where: { merchantId_userId: { merchantId: coffeeMerchant.id, userId: coffeeOwner.id } },
      update: { role: 'OWNER' },
      create: {
        id: 'seed-member-coffee-owner',
        merchantId: coffeeMerchant.id,
        userId: coffeeOwner.id,
        role: 'OWNER',
      },
    });

    await transaction.merchantMember.upsert({
      where: { merchantId_userId: { merchantId: homeMerchant.id, userId: homeOwner.id } },
      update: { role: 'OWNER' },
      create: {
        id: 'seed-member-home-owner',
        merchantId: homeMerchant.id,
        userId: homeOwner.id,
        role: 'OWNER',
      },
    });

    const coffeeCategory = await transaction.category.upsert({
      where: { slug: 'coffee-and-tea-demo' },
      update: { name: 'Coffee and Tea' },
      create: { id: 'seed-category-coffee', name: 'Coffee and Tea', slug: 'coffee-and-tea-demo' },
    });

    const homeCategory = await transaction.category.upsert({
      where: { slug: 'home-and-kitchen-demo' },
      update: { name: 'Home and Kitchen' },
      create: { id: 'seed-category-home', name: 'Home and Kitchen', slug: 'home-and-kitchen-demo' },
    });

    const coffeeProduct = await transaction.product.upsert({
      where: { merchantId_slug: { merchantId: coffeeMerchant.id, slug: 'demo-mondulkiri-coffee' } },
      update: {
        categoryId: coffeeCategory.id,
        name: 'Demo Mondulkiri Arabica Coffee',
        description: 'Fictional development sample product, roasted in a small batch.',
        status: 'ACTIVE',
      },
      create: {
        id: 'seed-product-coffee',
        merchantId: coffeeMerchant.id,
        categoryId: coffeeCategory.id,
        name: 'Demo Mondulkiri Arabica Coffee',
        slug: 'demo-mondulkiri-coffee',
        description: 'Fictional development sample product, roasted in a small batch.',
        status: 'ACTIVE',
      },
    });

    const homeProduct = await transaction.product.upsert({
      where: { merchantId_slug: { merchantId: homeMerchant.id, slug: 'demo-bamboo-bottle' } },
      update: {
        categoryId: homeCategory.id,
        name: 'Demo Bamboo Water Bottle',
        description: 'Fictional reusable 750 ml bottle for marketplace development examples.',
        status: 'ACTIVE',
      },
      create: {
        id: 'seed-product-bottle',
        merchantId: homeMerchant.id,
        categoryId: homeCategory.id,
        name: 'Demo Bamboo Water Bottle',
        slug: 'demo-bamboo-bottle',
        description: 'Fictional reusable 750 ml bottle for marketplace development examples.',
        status: 'ACTIVE',
      },
    });

    await transaction.productImage.upsert({
      where: { id: 'seed-image-coffee' },
      update: {
        productId: coffeeProduct.id,
        url: 'https://placehold.co/800x800/png?text=Demo+Coffee',
        sortOrder: 0,
      },
      create: {
        id: 'seed-image-coffee',
        productId: coffeeProduct.id,
        url: 'https://placehold.co/800x800/png?text=Demo+Coffee',
        sortOrder: 0,
      },
    });

    await transaction.productImage.upsert({
      where: { id: 'seed-image-bottle' },
      update: {
        productId: homeProduct.id,
        url: 'https://placehold.co/800x800/png?text=Demo+Bottle',
        sortOrder: 0,
      },
      create: {
        id: 'seed-image-bottle',
        productId: homeProduct.id,
        url: 'https://placehold.co/800x800/png?text=Demo+Bottle',
        sortOrder: 0,
      },
    });

    const coffeeSmall = await transaction.productVariant.upsert({
      where: { sku: 'DEMO-COFFEE-250G' },
      update: { productId: coffeeProduct.id, name: '250 g bag', price: '8500.00', status: 'ACTIVE' },
      create: {
        id: 'seed-variant-coffee-250g',
        productId: coffeeProduct.id,
        name: '250 g bag',
        sku: 'DEMO-COFFEE-250G',
        price: '8500.00',
        status: 'ACTIVE',
      },
    });

    const coffeeLarge = await transaction.productVariant.upsert({
      where: { sku: 'DEMO-COFFEE-1KG' },
      update: { productId: coffeeProduct.id, name: '1 kg bag', price: '22000.00', status: 'ACTIVE' },
      create: {
        id: 'seed-variant-coffee-1kg',
        productId: coffeeProduct.id,
        name: '1 kg bag',
        sku: 'DEMO-COFFEE-1KG',
        price: '22000.00',
        status: 'ACTIVE',
      },
    });

    const bottleVariant = await transaction.productVariant.upsert({
      where: { sku: 'DEMO-BOTTLE-750ML' },
      update: { productId: homeProduct.id, name: '750 ml', price: '12000.00', status: 'ACTIVE' },
      create: {
        id: 'seed-variant-bottle-750ml',
        productId: homeProduct.id,
        name: '750 ml',
        sku: 'DEMO-BOTTLE-750ML',
        price: '12000.00',
        status: 'ACTIVE',
      },
    });

    await transaction.inventory.upsert({
      where: { variantId: coffeeSmall.id },
      update: { quantity: 38, reservedQuantity: 0 },
      create: { id: 'seed-inventory-coffee-250g', variantId: coffeeSmall.id, quantity: 38, reservedQuantity: 0 },
    });

    await transaction.inventory.upsert({
      where: { variantId: coffeeLarge.id },
      update: { quantity: 12, reservedQuantity: 0 },
      create: { id: 'seed-inventory-coffee-1kg', variantId: coffeeLarge.id, quantity: 12, reservedQuantity: 0 },
    });

    await transaction.inventory.upsert({
      where: { variantId: bottleVariant.id },
      update: { quantity: 19, reservedQuantity: 1 },
      create: { id: 'seed-inventory-bottle', variantId: bottleVariant.id, quantity: 19, reservedQuantity: 1 },
    });

    const cart = await transaction.cart.upsert({
      where: { userId: customer.id },
      update: {},
      create: { id: 'seed-cart-customer', userId: customer.id },
    });

    await transaction.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: coffeeLarge.id } },
      update: { quantity: 1 },
      create: { id: 'seed-cart-item-coffee-large', cartId: cart.id, variantId: coffeeLarge.id, quantity: 1 },
    });

    const order = await transaction.order.upsert({
      where: { id: 'seed-order-multi-merchant' },
      update: {
        userId: customer.id,
        status: 'PROCESSING',
        subtotal: '29000.00',
        shippingFee: '4000.00',
        discount: '1000.00',
        total: '32000.00',
        recipientName: customerAddress.recipientName,
        recipientPhone: customerAddress.phone,
        shippingAddress: JSON.stringify({
          addressLine: customerAddress.addressLine,
          village: customerAddress.village,
          commune: customerAddress.commune,
          district: customerAddress.district,
          province: customerAddress.province,
          landmark: customerAddress.landmark,
        }),
      },
      create: {
        id: 'seed-order-multi-merchant',
        userId: customer.id,
        status: 'PROCESSING',
        subtotal: '29000.00',
        shippingFee: '4000.00',
        discount: '1000.00',
        total: '32000.00',
        recipientName: customerAddress.recipientName,
        recipientPhone: customerAddress.phone,
        shippingAddress: JSON.stringify({
          addressLine: customerAddress.addressLine,
          village: customerAddress.village,
          commune: customerAddress.commune,
          district: customerAddress.district,
          province: customerAddress.province,
          landmark: customerAddress.landmark,
        }),
      },
    });

    const coffeeMerchantOrder = await transaction.merchantOrder.upsert({
      where: { orderId_merchantId: { orderId: order.id, merchantId: coffeeMerchant.id } },
      update: { status: 'SHIPPED', subtotal: '17000.00', shippingFee: '2500.00', total: '19500.00' },
      create: {
        id: 'seed-merchant-order-coffee',
        orderId: order.id,
        merchantId: coffeeMerchant.id,
        status: 'SHIPPED',
        subtotal: '17000.00',
        shippingFee: '2500.00',
        total: '19500.00',
      },
    });

    const homeMerchantOrder = await transaction.merchantOrder.upsert({
      where: { orderId_merchantId: { orderId: order.id, merchantId: homeMerchant.id } },
      update: { status: 'ACCEPTED', subtotal: '12000.00', shippingFee: '1500.00', total: '13500.00' },
      create: {
        id: 'seed-merchant-order-home',
        orderId: order.id,
        merchantId: homeMerchant.id,
        status: 'ACCEPTED',
        subtotal: '12000.00',
        shippingFee: '1500.00',
        total: '13500.00',
      },
    });

    await transaction.orderItem.upsert({
      where: { id: 'seed-order-item-coffee' },
      update: {
        merchantOrderId: coffeeMerchantOrder.id,
        productId: coffeeProduct.id,
        variantId: coffeeSmall.id,
        productName: coffeeProduct.name,
        variantName: coffeeSmall.name,
        sku: coffeeSmall.sku,
        unitPrice: '8500.00',
        quantity: 2,
        subtotal: '17000.00',
      },
      create: {
        id: 'seed-order-item-coffee',
        merchantOrderId: coffeeMerchantOrder.id,
        productId: coffeeProduct.id,
        variantId: coffeeSmall.id,
        productName: coffeeProduct.name,
        variantName: coffeeSmall.name,
        sku: coffeeSmall.sku,
        unitPrice: '8500.00',
        quantity: 2,
        subtotal: '17000.00',
      },
    });

    await transaction.orderItem.upsert({
      where: { id: 'seed-order-item-bottle' },
      update: {
        merchantOrderId: homeMerchantOrder.id,
        productId: homeProduct.id,
        variantId: bottleVariant.id,
        productName: homeProduct.name,
        variantName: bottleVariant.name,
        sku: bottleVariant.sku,
        unitPrice: '12000.00',
        quantity: 1,
        subtotal: '12000.00',
      },
      create: {
        id: 'seed-order-item-bottle',
        merchantOrderId: homeMerchantOrder.id,
        productId: homeProduct.id,
        variantId: bottleVariant.id,
        productName: homeProduct.name,
        variantName: bottleVariant.name,
        sku: bottleVariant.sku,
        unitPrice: '12000.00',
        quantity: 1,
        subtotal: '12000.00',
      },
    });

    await transaction.payment.upsert({
      where: { orderId: order.id },
      update: {
        method: 'BANK_TRANSFER',
        status: 'PAID',
        amount: '32000.00',
        reference: 'DEMO-BANK-TRANSFER-0001',
        paidAt: new Date('2026-10-01T08:00:00.000Z'),
      },
      create: {
        id: 'seed-payment-order',
        orderId: order.id,
        method: 'BANK_TRANSFER',
        status: 'PAID',
        amount: '32000.00',
        reference: 'DEMO-BANK-TRANSFER-0001',
        paidAt: new Date('2026-10-01T08:00:00.000Z'),
      },
    });

    await transaction.shipment.upsert({
      where: { merchantOrderId: coffeeMerchantOrder.id },
      update: {
        courierName: 'Demo Local Courier',
        trackingNumber: 'DEMO-KH-0001',
        status: 'IN_TRANSIT',
        shippedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
      create: {
        id: 'seed-shipment-coffee',
        merchantOrderId: coffeeMerchantOrder.id,
        courierName: 'Demo Local Courier',
        trackingNumber: 'DEMO-KH-0001',
        status: 'IN_TRANSIT',
        shippedAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    });
  });

  console.info('Seeded fictional GZ Buy marketplace demo records.');
  console.info('Demo login: customer.demo@example.test / SEED_DEMO_PASSWORD');
}

seed()
  .catch((error: unknown) => {
    console.error('Development seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });