import { runUserFlow } from './flow.js';
import { logStart, summary } from './observability.js';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '10s', target: 2000 },
    { duration: '1m', target: 2000 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.10'],
    'http_req_duration{endpoint:products_list}': ['p(95)<2500'],
    'http_req_duration{endpoint:product_search}': ['p(95)<3000'],
  },
};

export default function () {
  runUserFlow();
}

export function setup() {
  logStart('spike');
}

export const handleSummary = summary('spike');
