import 'dotenv/config';
import app from './app.js';
import { prisma } from './lib/prisma.js';
import { expireUnpaidOrders, paymentTimeoutMinutes } from './services/order-expiry.service.js';
import { getTokenSecret } from './services/auth.service.js';

getTokenSecret();
paymentTimeoutMinutes();

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST ?? '127.0.0.1';

const server = app.listen(port, host, () => {
  const baseUrl = `http://${host}:${port}`;
  console.log(`[server] environment=${process.env.NODE_ENV ?? 'development'}`);
  console.log(`[server] listening=${baseUrl}`);
  console.log(`[server] health=${baseUrl}/api/v1/health`);
  console.log(`[server] docs=${baseUrl}/docs/`);
  console.log(`[server] request-logging=morgan request-id=x-request-id`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[server] port_in_use=${host}:${port}`);
  } else {
    console.error('[server] startup_error', error);
  }
  process.exitCode = 1;
  void shutdown();
});

let shuttingDown = false;
let expiryRun: Promise<void> | undefined;
function sweepExpiredOrders() {
  if (expiryRun || shuttingDown) return;
  expiryRun = expireUnpaidOrders().then(() => undefined).catch((error: unknown) => {
    console.error('[server] order_expiry_error', error);
  }).finally(() => { expiryRun = undefined; });
}
const expiryTimer = setInterval(sweepExpiredOrders, 60000);
expiryTimer.unref();
sweepExpiredOrders();

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(expiryTimer);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => {
    await expiryRun;
    await prisma.$disconnect();
    clearTimeout(deadline);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
