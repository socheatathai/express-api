const bearer = [{ bearerAuth: [] }];
const merchantId = { name: 'merchantId', in: 'path', required: true, schema: { type: 'string' } };
const merchantOrderId = { name: 'merchantOrderId', in: 'path', required: true, schema: { type: 'string' } };
const operation = (summary: string) => ({
  summary,
  tags: ['Seller orders'],
  security: bearer,
  responses: {
    '200': { description: summary },
    '400': { description: 'Invalid request' },
    '401': { description: 'Authentication required' },
    '404': { description: 'Seller or merchant order not found' },
    '409': { description: 'Invalid order transition' },
  },
});

export const sprint9Paths = {
  '/seller/stores/{merchantId}/orders': {
    parameters: [merchantId],
    get: {
      ...operation('List orders belonging to the seller store'),
      parameters: [merchantId,
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'PROCESSING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELLED'] } },
      ],
    },
  },
  '/seller/stores/{merchantId}/orders/{merchantOrderId}': {
    parameters: [merchantId, merchantOrderId],
    get: operation('Get a seller-owned merchant order'),
  },
  '/seller/stores/{merchantId}/orders/{merchantOrderId}/accept': { parameters: [merchantId, merchantOrderId], post: operation('Accept a pending merchant order') },
  '/seller/stores/{merchantId}/orders/{merchantOrderId}/process': { parameters: [merchantId, merchantOrderId], post: operation('Move an accepted merchant order to processing') },
  '/seller/stores/{merchantId}/orders/{merchantOrderId}/ready': { parameters: [merchantId, merchantOrderId], post: operation('Mark a processing merchant order ready for pickup') },
  '/seller/stores/{merchantId}/orders/{merchantOrderId}/cancel': { parameters: [merchantId, merchantOrderId], post: operation('Cancel an eligible merchant order and release reservations') },
};
