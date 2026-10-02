import { sprint2Paths } from './sprint2.openapi.js';
import { sprint3Paths } from './sprint3.openapi.js';
import { sprint4Paths } from './sprint4.openapi.js';
import { sprint67Paths } from './sprint6-7.openapi.js';
import { sprint8Paths } from './sprint8.openapi.js';
import { sprint9Paths } from './sprint9.openapi.js';
import { sprint10Paths } from './sprint10.openapi.js';

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'GZ Buy API',
    version: '1.0.0',
    description: 'Cambodia-focused multi-merchant marketplace API.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    ...sprint2Paths,
    ...sprint3Paths,
    ...sprint4Paths,
    ...sprint67Paths,
    ...sprint8Paths,
    ...sprint9Paths,
    ...sprint10Paths,
    '/health/ready': {
      get: {
        summary: 'Check database and payment schema readiness', tags: ['System'],
        responses: { '200': { description: 'API database is ready' }, '503': { description: 'Database or schema is unavailable' } },
      },
    },
    '/health': {
      get: {
        summary: 'Check API health',
        tags: ['System'],
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status', 'timestamp'],
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register a customer account',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'phone', 'password'],
                properties: {
                  name: { type: 'string', minLength: 2, maxLength: 100 },
                  phone: { type: 'string', example: '+85512345678' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 12, maxLength: 72 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Account created; returns a bearer access token' },
          '400': { description: 'Invalid request' },
          '409': { description: 'Phone or email is already registered' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Log in with phone or email and password',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['identifier', 'password'],
                properties: {
                  identifier: { type: 'string', example: '+85512345678' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Returns a bearer access token' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get the authenticated customer profile',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Current customer profile' },
          '401': { description: 'Missing or invalid bearer token' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Log out the authenticated client',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: {
          '204': { description: 'Logout accepted; the client must discard its bearer token' },
          '401': { description: 'Missing or invalid bearer token' },
        },
      },
    },
    '/addresses': {
      get: {
        summary: 'List the authenticated customer addresses',
        tags: ['Addresses'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Customer addresses, default address first' },
          '401': { description: 'Missing or invalid bearer token' },
        },
      },
      post: {
        summary: 'Create an address for the authenticated customer',
        tags: ['Addresses'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['recipientName', 'phone', 'province', 'district', 'commune', 'addressLine'],
                properties: {
                  recipientName: { type: 'string' },
                  phone: { type: 'string' },
                  province: { type: 'string' },
                  district: { type: 'string' },
                  commune: { type: 'string' },
                  village: { type: 'string' },
                  addressLine: { type: 'string' },
                  landmark: { type: 'string' },
                  isDefault: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Address created; the first address defaults to primary' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Missing or invalid bearer token' },
        },
      },
    },
    '/addresses/{addressId}': {
      parameters: [{ name: 'addressId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        summary: 'Get an owned address',
        tags: ['Addresses'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Address details' },
          '401': { description: 'Missing or invalid bearer token' },
          '404': { description: 'Address not found' },
        },
      },
      patch: {
        summary: 'Update an owned address',
        tags: ['Addresses'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', minProperties: 1 } } },
        },
        responses: {
          '200': { description: 'Updated address' },
          '400': { description: 'Invalid request' },
          '401': { description: 'Missing or invalid bearer token' },
          '404': { description: 'Address not found' },
        },
      },
      delete: {
        summary: 'Delete an owned address',
        tags: ['Addresses'],
        security: [{ bearerAuth: [] }],
        responses: {
          '204': { description: 'Address deleted' },
          '401': { description: 'Missing or invalid bearer token' },
          '404': { description: 'Address not found' },
        },
      },
    },
  },
  tags: [{ name: 'System' }, { name: 'Authentication' }, { name: 'Addresses' }, { name: 'Seller stores' }, { name: 'Admin sellers' }],
} as const;
