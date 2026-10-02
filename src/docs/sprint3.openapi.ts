const bearer = [{ bearerAuth: [] }];
const merchantId = { name: 'merchantId', in: 'path', required: true, schema: { type: 'string' } };
const productId = { name: 'productId', in: 'path', required: true, schema: { type: 'string' } };
const categoryId = { name: 'categoryId', in: 'path', required: true, schema: { type: 'string' } };
const productStatus = ['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED', 'INACTIVE'];
const pagination = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

function responses(success: string, description: string) {
  return {
    [success]: { description },
    '400': { description: 'Invalid request' },
    '401': { description: 'Authentication required' },
    '403': { description: 'Insufficient permissions' },
    '404': { description: 'Category, product, or seller not found' },
    '409': { description: 'Invalid state transition or conflicting data' },
  };
}

function protectedOperation(summary: string, tag: string, success = '200') {
  return { summary, tags: [tag], security: bearer, responses: responses(success, summary) };
}

function jsonBody(properties: object, required: string[]) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { type: 'object', additionalProperties: false, properties, required },
      },
    },
  };
}

const categoryProperties = {
  name: { type: 'string', minLength: 2, maxLength: 100 },
  slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
  parentId: { type: 'string' },
};

const productProperties = {
  categoryId: { type: 'string' },
  name: { type: 'string', minLength: 2, maxLength: 150 },
  slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
  description: { type: 'string', minLength: 1, maxLength: 10000 },
};

const merchantProductParams = { parameters: [merchantId, productId] };

export const sprint3Paths = {
  '/categories': {
    get: {
      summary: 'List marketplace categories',
      tags: ['Catalog'],
      responses: { '200': { description: 'Categories' } },
    },
  },
  '/categories/{categoryId}': {
    parameters: [categoryId],
    get: {
      summary: 'Get a marketplace category',
      tags: ['Catalog'],
      responses: { '200': { description: 'Category details' }, '404': { description: 'Category not found' } },
    },
  },
  '/products': {
    get: {
      summary: 'List active marketplace products',
      tags: ['Catalog'],
      parameters: [
        ...pagination,
        { name: 'categoryId', in: 'query', schema: { type: 'string' } },
        { name: 'search', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'oldest', 'name_asc', 'name_desc'], default: 'newest' } },
      ],
      responses: { '200': { description: 'Active products and pagination metadata' }, '400': { description: 'Invalid query' } },
    },
  },
  '/products/{productId}': {
    parameters: [productId],
    get: {
      summary: 'Get an active marketplace product',
      tags: ['Catalog'],
      responses: { '200': { description: 'Active product details' }, '404': { description: 'Active product not found' } },
    },
  },
  '/seller/stores/{merchantId}/products': {
    parameters: [merchantId],
    get: {
      ...protectedOperation('List products owned by an active seller store', 'Seller products'),
      parameters: [merchantId, ...pagination, { name: 'status', in: 'query', schema: { type: 'string', enum: productStatus } }],
    },
    post: {
      ...protectedOperation('Create a DRAFT product for an active seller store', 'Seller products', '201'),
      requestBody: jsonBody(productProperties, ['categoryId', 'name', 'slug', 'description']),
    },
  },
  '/seller/stores/{merchantId}/products/{productId}': {
    ...merchantProductParams,
    get: protectedOperation('Get a seller-owned product', 'Seller products'),
    patch: {
      ...protectedOperation('Update a seller-owned DRAFT, REJECTED, or ACTIVE product', 'Seller products'),
      requestBody: jsonBody(productProperties, []),
    },
  },
  '/seller/stores/{merchantId}/products/{productId}/submit': {
    ...merchantProductParams,
    post: protectedOperation('Submit a DRAFT or REJECTED product for admin review', 'Seller products'),
  },
  '/admin/categories': {
    get: protectedOperation('List all categories', 'Admin categories'),
    post: {
      ...protectedOperation('Create a category', 'Admin categories', '201'),
      requestBody: jsonBody(categoryProperties, ['name', 'slug']),
    },
  },
  '/admin/categories/{categoryId}': {
    parameters: [categoryId],
    patch: {
      ...protectedOperation('Update a category', 'Admin categories'),
      requestBody: jsonBody(categoryProperties, []),
    },
    delete: protectedOperation('Delete an unused category', 'Admin categories', '204'),
  },
  '/admin/products': {
    get: {
      ...protectedOperation('List products for review and administration', 'Admin products'),
      parameters: [
        ...pagination,
        { name: 'status', in: 'query', schema: { type: 'string', enum: productStatus } },
        { name: 'merchantId', in: 'query', schema: { type: 'string' } },
        { name: 'categoryId', in: 'query', schema: { type: 'string' } },
      ],
    },
  },
  '/admin/products/{productId}': {
    parameters: [productId],
    get: protectedOperation('Get product details for review', 'Admin products'),
  },
  '/admin/products/{productId}/approve': {
    parameters: [productId],
    post: protectedOperation('Approve a PENDING product and make it public', 'Admin products'),
  },
  '/admin/products/{productId}/reject': {
    parameters: [productId],
    post: protectedOperation('Reject a PENDING product', 'Admin products'),
  },
};
