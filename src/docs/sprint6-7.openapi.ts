const bearer = [{ bearerAuth: [] }];
const itemId = { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } };
const protectedOperation = (summary: string, success = '200') => ({
  summary,
  tags: ['Cart and checkout'],
  security: bearer,
  responses: {
    [success]: { description: summary },
    '400': { description: 'Invalid request' },
    '401': { description: 'Authentication required' },
    '404': { description: 'Cart item or address not found' },
    '409': { description: 'Cart, stock, or transaction conflict' },
  },
});

export const sprint67Paths = {
  '/orders': {
    get: {
      ...protectedOperation('List the authenticated customer orders'),
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'] } },
      ],
    },
  },
  '/orders/{orderId}': {
    parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
    get: protectedOperation('Get an owned order with payment and shipment status'),
  },
  '/cart': {
    get: protectedOperation('Get the authenticated customer cart'),
  },
  '/cart/items': {
    post: {
      ...protectedOperation('Add a sellable variant to the cart', '201'),
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['variantId', 'quantity'], properties: { variantId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } } } } },
      },
    },
  },
  '/cart/items/{itemId}': {
    parameters: [itemId],
    patch: {
      ...protectedOperation('Update cart item quantity'),
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 1 } } } } },
      },
    },
    delete: protectedOperation('Remove an item from the cart', '204'),
  },
  '/orders/checkout': {
    post: {
      ...protectedOperation('Create a transactional multi-merchant order', '201'),
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['addressId', 'paymentMethod'], properties: { addressId: { type: 'string' }, paymentMethod: { type: 'string', enum: ['BANK_TRANSFER'] } } } } },
      },
    },
  },
};
