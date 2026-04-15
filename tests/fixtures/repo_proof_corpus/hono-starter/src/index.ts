import { Hono } from 'hono';
const app = new Hono();
app.get('/health', (c) => c.json({ ok: true }));
app.post('/sessions', (c) => c.json({ ok: true }));
export default app;
