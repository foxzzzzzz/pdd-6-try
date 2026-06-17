import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { storeRoutes } from './routes/stores';
import { inspectionRoutes } from './routes/inspections';
import { templateRoutes } from './routes/templates';
import { getRedis, closeRedis } from './redis';
import { getInspectionQueue, closeQueue } from './queue';
import { getDb, closeDb } from '@pdd-inspector/core';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = Fastify({ logger: true });

async function start() {
  // Register plugins
  await app.register(cors, { origin: true });

  // Initialize services
  try {
    await getRedis().connect();
    app.log.info('Redis connected');
  } catch (err) {
    app.log.warn('Redis not available — queue features disabled');
  }

  await getDb();
  app.log.info('Database connected');

  // Initialize queue (requires Redis)
  try {
    getInspectionQueue();
    app.log.info('BullMQ queue initialized');
  } catch (err) {
    app.log.warn('BullMQ not available — queue features disabled');
  }

  // Register routes
  await app.register(storeRoutes);
  await app.register(inspectionRoutes);
  await app.register(templateRoutes);

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  });

  // Start server
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Server running at http://${HOST}:${PORT}`);

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    await closeQueue();
    await closeRedis();
    await closeDb();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
