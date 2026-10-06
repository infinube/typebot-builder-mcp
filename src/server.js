import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './tools.js';
import { authMiddleware, resourceMetadata } from './auth.js';
import { VERSION } from './config.js';
export function createHttpApp(service, verifier) {
  const c = service.config, app = express(); app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const host = req.hostname;
    if (!c.hosts.includes(host)) return res.status(403).json({ error: 'Host denied' });
    if (req.headers.origin && !c.origins.includes(req.headers.origin)) return res.status(403).json({ error: 'Origin denied' });
    next();
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: VERSION }));
  if (c.authMode === 'oauth') {
    for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'])
      app.get(p, (_req, res) => res.json(resourceMetadata(c)));
  }
  app.use('/mcp', authMiddleware(c, verifier));
  app.use(express.json({ limit: c.maxBytes }));
  app.post('/mcp', async (req, res) => {
    const server = createMcpServer(service);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' }); }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Stateless transport supports POST only' }));
  app.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid request body' }));
  return app;
}
