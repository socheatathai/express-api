const bearer = [{ bearerAuth: [] }];
const paymentId = { name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } };
const protectedOperation = (summary: string, success = '200') => ({
  summary,
  tags: ['Payments'],
  security: bearer,
  responses: {
    [success]: { description: summary },
    '400': { description: 'Invalid proof image or request' },
    '413': { description: 'Payment proof exceeds the 5 MB limit' },
    '401': { description: 'Authentication required' },
    '403': { description: 'Admin access required' },
    '404': { description: 'Payment or proof not found' },
    '409': { description: 'Invalid payment state' },
  },
});

export const sprint8Paths = {
  '/payments/{paymentId}/proof': {
    parameters: [paymentId],
    get: protectedOperation('Download an owned or administratively reviewable payment proof'),
    post: {
      ...protectedOperation('Upload a bank-transfer payment proof image', '201'),
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['proof'], properties: { proof: { type: 'string', format: 'binary' } } } } } },
    },
  },
  '/admin/payments': {
    get: {
      ...protectedOperation('List bank-transfer payments for manual review'),
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED'] } },
      ],
    },
  },
  '/admin/payments/{paymentId}/verify': {
    parameters: [paymentId],
    post: protectedOperation('Verify a submitted bank-transfer proof and confirm the order'),
  },
  '/admin/payments/{paymentId}/reject': {
    parameters: [paymentId],
    post: {
      ...protectedOperation('Reject a submitted bank-transfer proof and cancel the order'),
      requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { note: { type: 'string', maxLength: 500 } } } } } },
    },
  },
};
