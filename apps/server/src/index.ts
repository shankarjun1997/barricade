import { createServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dataFile = process.env.DATA_FILE ?? './data/state.json';

const { app, hub, close } = await createServer({
  persistPath: process.env.DATA_FILE === 'none' ? null : dataFile,
  ...(process.env.RECONNECT_GRACE_MS ? { graceMs: Number(process.env.RECONNECT_GRACE_MS) } : {}),
});

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Shutting down');
  try {
    hub.flush();
    await close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, 'Shutdown failed');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port, host });
  app.log.info({ port, host, dataFile }, 'Barricade online server ready');
} catch (error) {
  app.log.error(error, 'Failed to start');
  process.exit(1);
}
