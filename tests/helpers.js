import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { loadConfig } from '../src/config.js';
import { TypebotApi } from '../src/api.js';
import { SnapshotStore } from '../src/snapshots.js';
import { BuilderService } from '../src/service.js';
export const fixture = () => ({
  id: 'testbot', version: '6.1', name: 'Test', workspaceId: 'workspace',
  updatedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
  groups: [{ id: 'group', title: 'Hello', graphCoordinates: { x: 0, y: 0 }, blocks: [{ id: 'text', type: 'text', content: { richText: [{ type: 'p', children: [{ text: 'Hello' }] }] } }] }],
  events: [{ id: 'start', type: 'start', graphCoordinates: { x: 0, y: 0 }, outgoingEdgeId: 'edge' }],
  edges: [{ id: 'edge', from: { eventId: 'start' }, to: { groupId: 'group' } }], variables: [], settings: {}, theme: {}, publicId: null,
});
export async function listen(app) {
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  return { server, url: `http://127.0.0.1:${server.address().port}`,
    close: async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); } };
}
export async function setup(overrides = {}) {
  const app = express(); app.use(express.json()); let bot = fixture(), published = null, writes = 0; const requests = [];
  app.use((req, res, next) => { requests.push({ method: req.method, path: req.path }); if (req.headers.authorization !== 'Bearer upstream-secret') return res.sendStatus(401); next(); });
  app.get('/api/v1/typebots/testbot', (_req, res) => res.json({ typebot: bot, currentUserMode: 'write' }));
  app.patch('/api/v1/typebots/testbot', (req, res) => { writes++; bot = { ...bot, ...req.body.typebot, updatedAt: new Date().toISOString() }; res.json({ typebot: bot }); });
  app.get('/api/v1/typebots/testbot/publishedTypebot', (_req, res) => res.json({ publishedTypebot: published }));
  app.get('/api/v1/typebots/testbot/analytics/stats', (_req, res) => published ? res.json({ totalViews: 0 }) : res.sendStatus(404));
  app.post('/api/v1/typebots/testbot/publish', (_req, res) => { writes++; published = structuredClone(bot); res.json({ message: 'success' }); });
  app.post('/api/v1/typebots/testbot/unpublish', (_req, res) => { writes++; published = null; res.json({ message: 'success' }); });
  app.get('/api/v1/workspaces', (_req, res) => res.json({ workspaces: [{ id: 'workspace' }] }));
  app.get('/api/v1/typebots', (_req, res) => res.json({ typebots: [{ id: bot.id, name: bot.name }] }));
  app.post('/api/v1/typebots/testbot/preview/startChat', (_req, res) => res.json({ sessionId: 'session', messages: [{ type: 'text', content: 'Hello' }] }));
  app.post('/api/v1/sessions/session/continueChat', (_req, res) => res.json({ messages: [{ type: 'text', content: 'Done' }] }));
  app.delete('/api/v1/typebots/testbot', (_req, res) => { writes++; res.json({ message: 'success' }); });
  const upstream = await listen(app), dir = await mkdtemp(path.join(tmpdir(), 'typebot-mcp-'));
  const c = loadConfig({ TYPEBOT_API_URL: `${upstream.url}/api`, TYPEBOT_API_TOKEN: 'upstream-secret', MCP_BEARER_TOKEN: 'a'.repeat(40), SNAPSHOT_DIR: dir, ...overrides });
  const service = new BuilderService(new TypebotApi(c), new SnapshotStore(c), c);
  return { c, service, dir, requests, writes: () => writes, bot: () => bot, setBot: b => { bot = b; }, close: upstream.close };
}
