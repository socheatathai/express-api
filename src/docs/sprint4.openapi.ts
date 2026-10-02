const bearer = [{ bearerAuth: [] }];
const merchantId = { name: 'merchantId', in: 'path', required: true, schema: { type: 'string' } };
const productId = { name: 'productId', in: 'path', required: true, schema: { type: 'string' } };
const imageId = { name: 'imageId', in: 'path', required: true, schema: { type: 'string' } };
const variantId = { name: 'variantId', in: 'path', required: true, schema: { type: 'string' } };
const productPath = [merchantId, productId];
const imagePath = [...productPath, imageId];
const variantPath = [...productPath, variantId];

function body(properties: object, required: string[] = []) {
  return { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties, required } } } };
}

function operation(summary: string, success = '200') {
  return {
    summary,
    tags: ['Seller catalog'],
    security: bearer,
    responses: {
      [success]: { description: summary },
      '400': { description: 'Invalid request' },
      '401': { description: 'Authentication required' },
      '404': { description: 'Seller, product, image, or variant not found' },
      '409': { description: 'Conflicting SKU or invalid state' },
    },
  };
}

export const sprint4Paths = {
  '/seller/stores/{merchantId}/products/{productId}/images': {
    parameters: productPath,
    get: operation('List product images ordered by sort order'),
    post: { ...operation('Add product image metadata', '201'), requestBody: body({ url: { type: 'string', format: 'uri' }, sortOrder: { type: 'integer', minimum: 0, default: 0 } }) },
  },
  '/seller/stores/{merchantId}/products/{productId}/images/{imageId}': {
    parameters: imagePath,
    patch: { ...operation('Update product image metadata'), requestBody: body({ url: { type: 'string', format: 'uri' }, sortOrder: { type: 'integer', minimum: 0 } }) },
    delete: operation('Delete a product image', '204'),
  },
  '/seller/stores/{merchantId}/products/{productId}/variants': {
    parameters: productPath,
    get: operation('List product variants and inventory'),
    post: { ...operation('Create a product variant with a unique SKU and decimal price', '201'), requestBody: body({ name: { type: 'string' }, sku: { type: 'string' }, price: { type: 'string', pattern: '^\\d{1,10}(?:\\.\\d{1,2})?$', description: 'Positive decimal, maximum 9999999999.99' } }, ['name', 'sku', 'price']) },
  },
  '/seller/stores/{merchantId}/products/{productId}/variants/{variantId}': {
    parameters: variantPath,
    patch: { ...operation('Update a product variant SKU, name, or price'), requestBody: body({ name: { type: 'string' }, sku: { type: 'string' }, price: { type: 'string' } }) },
  },
  '/seller/stores/{merchantId}/products/{productId}/variants/{variantId}/inventory': {
    parameters: variantPath,
    patch: { ...operation('Set physical stock without changing order reservations'), requestBody: body({ quantity: { type: 'integer', minimum: 0, maximum: 2147483647 } }, ['quantity']) },
  },
};
