import { runUserFlow } from './flow.js';
import { logStart, summary } from './observability.js';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 250 },
    { duration: '3m', target: 500 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{endpoint:products_list}': ['p(95)<500'],
    'http_req_duration{endpoint:product_detail}': ['p(95)<500'],
    'http_req_duration{endpoint:product_search}': ['p(95)<750'],
    'http_req_duration{endpoint:checkout}': ['p(95)<1500'],
  },
};

export default function () {
  runUserFlow();
}

export function setup() {
  logStart('load');
}

export const handleSummary = summary('load');

