const fastify = require('fastify')();
fastify.register(require('@fastify/cors'));
fastify.register(require('@fastify/jwt'), { secret: 'demo' });
fastify.get('/health', async () => ({ ok: true }));
fastify.get('/users', { preHandler: [fastify.authenticate] }, async () => ([]));
fastify.post('/users', async () => ({ ok: true }));
module.exports = fastify;
