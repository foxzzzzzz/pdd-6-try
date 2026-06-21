import { FastifyInstance } from 'fastify';
import { getBrowserEnvironmentStatus } from '@pdd-inspector/core';

export async function systemRoutes(app: FastifyInstance) {
  app.get('/api/system/browser', async () => {
    return getBrowserEnvironmentStatus();
  });
}
