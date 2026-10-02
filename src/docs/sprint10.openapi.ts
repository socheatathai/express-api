const bearer = [{ bearerAuth: [] }];
const merchantId = { name: 'merchantId', in: 'path', required: true, schema: { type: 'string' } };
const merchantOrderId = { name: 'merchantOrderId', in: 'path', required: true, schema: { type: 'string' } };
const operation = (summary: string, success = '200') => ({
  summary,
  tags: ['Shipments'],
  security: bearer,
  responses: {
    [success]: { description: summary },
    '400': { description: 'Invalid request' },
    '401': { description: 'Authentication required' },
    '404': { description: 'Seller, merchant order, or shipment not found' },
    '409': { description: 'Invalid shipment transition' },
  },
});

export const sprint10Paths = {
  '/seller/stores/{merchantId}/orders/{merchantOrderId}/shipment': {
    parameters: [merchantId, merchantOrderId],
    get: operation('Get a seller-owned shipment'),
    post: {
      ...operation('Create shipment tracking metadata', '201'),
      requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { courierName: { type: 'string' }, trackingNumber: { type: 'string' } } } } } },
    },
    patch: {
      ...operation('Update tracking metadata or advance shipment status'),
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { courierName: { type: 'string' }, trackingNumber: { type: 'string' }, status: { type: 'string', enum: ['PENDING', 'READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED'] } } } } } },
    },
  },
};
