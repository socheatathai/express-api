import { Counter, Rate } from 'k6/metrics';
import { check } from 'k6';

export const flowErrors = new Rate('flow_errors');
export const authSuccess = new Counter('auth_success_total');
export const logoutSuccess = new Counter('logout_success_total');
export const checkoutSuccess = new Counter('checkout_success_total');
export const checkoutConflict = new Counter('checkout_conflict_total');

export function checked(response, assertions) {
  const passed = check(response, assertions);
  flowErrors.add(!passed);
  return passed;
}

export function logStart(profile) {
  console.log(JSON.stringify({
    event: 'k6_start',
    profile,
    baseUrl: __ENV.BASE_URL || 'http://localhost:3000/api/v1',
    checkoutEnabled: __ENV.K6_ENABLE_CHECKOUT === 'true',
    timestamp: new Date().toISOString(),
  }));
}

export function summary(profile) {
  return (data) => {
    const output = {
      profile,
      generatedAt: new Date().toISOString(),
      thresholds: data.thresholds,
      metrics: data.metrics,
    };
    return {
      stdout: `k6 ${profile} completed; summary written to perf/k6/results/${profile}.json\n`,
      [`perf/k6/results/${profile}.json`]: JSON.stringify(output, null, 2),
    };
  };
}
