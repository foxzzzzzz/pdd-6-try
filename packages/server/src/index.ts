import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import { storeRoutes } from './routes/stores';
import { inspectionRoutes } from './routes/inspections';
import { templateRoutes } from './routes/templates';
import { issueRoutes } from './routes/issues';
import { reportRoutes } from './routes/reports';
import { actionCandidateRoutes } from './routes/action-candidates';
import { getRedis, closeRedis } from './redis';
import { getInspectionQueue, closeQueue } from './queue';
import { getDb, closeDb } from '@pdd-inspector/core';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = Fastify({ logger: true });

async function start() {
  // Serve web build (production)
  const webDist = path.resolve(process.cwd(), '../web/dist');
  try {
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    // SPA fallback for non-API routes
    app.setNotFoundHandler((_req, reply) => {
      if (!_req.url.startsWith('/api')) {
        reply.sendFile('index.html');
      } else {
        reply.code(404).send({ message: 'Not found' });
      }
    });
    app.log.info('Web static files served from ' + webDist);
  } catch {
    app.log.warn('Web build not found — run "pnpm --filter @pdd-inspector/web build" first');
  }

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
  await app.register(issueRoutes);
  await app.register(reportRoutes);
  await app.register(actionCandidateRoutes);

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
