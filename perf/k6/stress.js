import { runUserFlow } from './flow.js';
import { logStart, summary } from './observability.js';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '1m', target: 500 },
    { duration: '1m', target: 1000 },
    { duration: '1m', target: 2000 },
    { duration: '2m', target: 5000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{endpoint:products_list}': ['p(95)<1500'],
    'http_req_duration{endpoint:product_search}': ['p(95)<2000'],
    'http_req_duration{endpoint:checkout}': ['p(95)<5000'],
  },
};

export default function () {
  runUserFlow();
}

export function setup() {
  logStart('stress');
}

export const handleSummary = summary('stress');
