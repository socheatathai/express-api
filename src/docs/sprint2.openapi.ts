const security = [{ bearerAuth: [] }];
const merchantId = { name: 'merchantId', in: 'path', required: true, schema: { type: 'string' } };
const userId = { name: 'userId', in: 'path', required: true, schema: { type: 'string' } };
const memberProperties = { userId: { type: 'string' }, role: { type: 'string', enum: ['MANAGER', 'STAFF'] } };
function body(properties: object, required: string[]) {
  return { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties, required } } } };
}
function operation(summary: string, admin = false, success = '200') {
  return { summary, tags: [admin ? 'Admin sellers' : 'Seller stores'], security,
    responses: { [success]: { description: 'Success' }, '400': { description: 'Invalid input' }, '401': { description: 'Authentication required' }, '403': { description: 'Insufficient role' }, '404': { description: 'Seller or member not found' }, '409': { description: 'Duplicate record, inactive seller, or invalid transition' } } };
}
export const sprint2Paths = {
  '/seller/stores': {
    get: operation('List stores where the current user has membership'),
    post: { ...operation('Apply for a store; atomically creates PENDING store and OWNER membership', false, '201'), requestBody: body({ name: { type: 'string', minLength: 2, maxLength: 100 }, slug: { type: 'string', minLength: 2, maxLength: 100, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }, phone: { type: 'string', example: '+85512345678' } }, ['name', 'slug', 'phone']) },
  },
  '/seller/stores/{merchantId}': { parameters: [merchantId], get: operation('Get a store as OWNER, MANAGER or STAFF') },
  '/seller/stores/{merchantId}/members': {
    parameters: [merchantId], get: operation('List member IDs and roles as a store member'),
    post: { ...operation('OWNER adds an existing active user to an ACTIVE store', false, '201'), requestBody: body(memberProperties, ['userId', 'role']) },
  },
  '/seller/stores/{merchantId}/members/{userId}': {
    parameters: [merchantId, userId],
    patch: { ...operation('OWNER changes a non-owner member role in an ACTIVE store'), requestBody: body({ role: memberProperties.role }, ['role']) },
    delete: operation('OWNER removes a non-owner member in an ACTIVE store', false, '204'),
  },
  '/admin/sellers': { get: { ...operation('ADMIN lists sellers with pagination and optional status filter', true), parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'] } },
  ] } },
  '/admin/sellers/{merchantId}': { parameters: [merchantId], get: operation('ADMIN gets seller details', true) },
  '/admin/sellers/{merchantId}/approve': { parameters: [merchantId], post: operation('ADMIN approves PENDING or reactivates SUSPENDED seller', true) },
  '/admin/sellers/{merchantId}/reject': { parameters: [merchantId], post: operation('ADMIN rejects PENDING seller', true) },
  '/admin/sellers/{merchantId}/suspend': { parameters: [merchantId], post: operation('ADMIN suspends ACTIVE seller', true) },
};
