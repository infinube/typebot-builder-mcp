import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { request as httpRequest } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHttpApp } from '../src/server.js';
import { contentHash } from '../src/utils.js';
import { toolDefinitions } from '../src/tools.js';
import { SnapshotStore } from '../src/snapshots.js';
import { setup, fixture, listen } from './helpers.js';

test('mock API semantic mutation, snapshots, restore and lifecycle', async t => {
  const s = await setup(); t.after(s.close);
  const original = contentHash(s.bot());
  const result = await s.service.edit({ typebotId: 'testbot', expectedHash: original, groupId: 'group', blockId: 'text', patch: { content: { plainText: 'Changed' } } }, 'update_block');
  assert.equal(result.validation.valid, true); assert.equal(result.snapshots.before.length, 1); assert.equal(result.snapshots.after.length, 1);
  assert.ok(result.diff.some(c => c.entity === 'blocks'));
  const restored = await s.service.restore({ typebotId: 'testbot', expectedHash: result.contentHash, snapshotId: result.snapshots.before[0].snapshotId });
  assert.equal(restored.contentHash, original);
  const published = await s.service.lifecycle({ typebotId: 'testbot', expectedHash: original }, 'publish'); assert.equal(published.published, true);
  const unpublished = await s.service.lifecycle({ typebotId: 'testbot', expectedHash: original }, 'unpublish'); assert.equal(unpublished.published, false);
  assert.equal((await s.service.snapshots.list('testbot')).total, 8);
});
test('stale hash, invalid schema and dangling target reject without writes', async t => {
  const s = await setup(); t.after(s.close); const expectedHash = contentHash(s.bot());
  await assert.rejects(s.service.edit({ typebotId: 'testbot', expectedHash: '0'.repeat(64), title: 'New' }, 'add_group'), /Conflict/);
  await assert.rejects(s.service.edit({ typebotId: 'testbot', expectedHash, groupId: 'group', block: { type: 'invented' } }, 'add_block'), /Validation/);
  await assert.rejects(s.service.edit({ typebotId: 'testbot', expectedHash, from: { blockId: 'text' }, to: { groupId: 'missing' } }, 'connect'), /Validation/);
  const b = fixture(); b.edges[0].to.groupId = 'missing'; s.setBot(b);
  await assert.rejects(s.service.lifecycle({ typebotId: 'testbot', expectedHash: contentHash(b) }, 'publish'), /Validation/);
  assert.equal(s.writes(), 0);
});
test('snapshot I/O race and simultaneous edits fail safely', async t => {
  const s = await setup(); t.after(s.close); const expectedHash = contentHash(s.bot());
  const results = await Promise.allSettled([1, 2].map(i => s.service.edit({ typebotId: 'testbot', expectedHash, title: `Group ${i}` }, 'add_group')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(s.writes(), 1);
  const saved = s.service.snapshots.save.bind(s.service.snapshots);
  s.service.snapshots.save = async (...args) => { const receipt = await saved(...args); s.setBot({ ...s.bot(), name: 'External edit' }); return receipt; };
  await assert.rejects(s.service.edit({ typebotId: 'testbot', expectedHash: contentHash(s.bot()), title: 'Race' }, 'add_group'), /Conflict/);
  assert.equal(s.writes(), 1);
});
test('after-snapshot failure reports applied change without unsafe retry', async t => {
  const s = await setup(); t.after(s.close); const save = s.service.snapshots.save.bind(s.service.snapshots);
  s.service.snapshots.save = (...args) => args[2] === 'after' ? Promise.reject(new Error('after snapshot failed')) : save(...args);
  const r = await s.service.edit({ typebotId: 'testbot', expectedHash: contentHash(s.bot()), title: 'New' }, 'add_group');
  assert.equal(r.mutationApplied, true); assert.ok(r.warnings.some(w => w.includes('already been applied'))); assert.equal(s.writes(), 1);
});
test('generic webhook contract, separate bearer, abort/warn and filesystem persistence', async t => {
  const events = [], app = express(); app.use(express.json()); let fail = false;
  app.post('/snapshot', (req, res) => { assert.equal(req.headers.authorization, 'Bearer receiver-secret'); events.push(req.body); res.sendStatus(fail ? 500 : 200); });
  const receiver = await listen(app); t.after(receiver.close);
  const s = await setup({ SNAPSHOT_MODE: 'both', SNAPSHOT_WEBHOOK_URL: `${receiver.url}/snapshot`, SNAPSHOT_WEBHOOK_TOKEN: 'receiver-secret', SNAPSHOT_WEBHOOK_ALLOW_PRIVATE: 'true', SNAPSHOT_WEBHOOK_FAILURE_POLICY: 'warn' }); t.after(s.close);
  let r = await s.service.edit({ typebotId: 'testbot', expectedHash: contentHash(s.bot()), title: 'New' }, 'add_group');
  assert.equal(events.length, 2); assert.equal(events[0].phase, 'before'); assert.equal(events[1].phase, 'after'); assert.ok(events[0].bot.id); assert.equal(events[0].eventType, 'typebot.snapshot.v1');
  const reopened = new SnapshotStore(s.c); assert.equal((await reopened.list('testbot')).total, 2);
  fail = true;
  r = await s.service.edit({ typebotId: 'testbot', expectedHash: r.contentHash, title: 'Warning' }, 'add_group'); assert.ok(r.warnings.length >= 2);
  s.service.snapshots = new SnapshotStore({ ...s.c, webhookFailure: 'abort' });
  await assert.rejects(s.service.edit({ typebotId: 'testbot', expectedHash: r.contentHash, title: 'Aborted' }, 'add_group'), /webhook snapshot failed/); assert.equal(s.writes(), 2);
  const disabled = new SnapshotStore({ ...s.c, snapshotMode: 'off' }); assert.equal((await disabled.save(fixture(), 'edit', 'before')).warnings.length, 1);
});
test('filesystem warn policy and SSRF default rejection are explicit', async t => {
  const s = await setup({ SNAPSHOT_FAILURE_POLICY: 'warn' }); t.after(s.close);
  await writeFile(`${s.dir}/blocked`, 'file'); s.service.snapshots = new SnapshotStore({ ...s.c, snapshotDir: `${s.dir}/blocked` });
  const r = await s.service.edit({ typebotId: 'testbot', expectedHash: contentHash(s.bot()), title: 'Warn' }, 'add_group'); assert.equal(s.writes(), 1); assert.equal(r.warnings.length, 2);
  const store = new SnapshotStore({ ...s.c, snapshotMode: 'webhook', webhookUrl: 'http://127.0.0.1/snapshot', webhookFailure: 'abort' });
  await assert.rejects(store.save(fixture(), 'edit', 'before'), /webhook snapshot failed/);
});
test('Streamable HTTP SDK discovery/read/edit, bearer negative tests and Host/Origin checks', async t => {
  const s = await setup(); t.after(s.close); const http = await listen(createHttpApp(s.service)); t.after(http.close);
  for (const authorization of [undefined, 'Bearer wrong']) {
    const r = await fetch(`${http.url}/mcp`, { method: 'POST', headers: authorization ? { Authorization: authorization } : {} }); assert.equal(r.status, 401);
  }
  assert.equal((await fetch(`${http.url}/health`)).status, 200);
  assert.equal((await fetch(`${http.url}/health`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal(await new Promise(resolve => { const r = httpRequest(`${http.url}/health`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); r.end(); }), 403);
  const client = new Client({ name: 'test', version: '1' }); t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${http.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${s.c.bearer}` } } }));
  const listed = await client.listTools(); assert.ok(listed.tools.length > 30);
  const call = async (name, args = {}) => { const result = await client.callTool({ name, arguments: args }); assert.ok(!result.isError, result.content?.[0]?.text); return JSON.parse(result.content[0].text); };
  assert.equal((await call('list_workspaces')).workspaces.length, 1);
  const guidance = await call('get_guidance', { topic: 'text-blocks' });
  assert.equal(guidance.baseline.testedVersion, '3.19.0'); assert.ok(guidance.pills.some(p => p.includes('richText')));
  const bot = await call('get_typebot', { typebotId: 'testbot' });
  const edited = await call('update_metadata', { typebotId: 'testbot', expectedHash: bot.contentHash, patch: { name: 'Via MCP' } }); assert.equal(edited.mutationApplied, true);
  const smoke = await call('smoke_test', { typebotId: 'testbot', messages: ['Hi'] }); assert.equal(smoke.steps.length, 2);
  const invalid = await client.callTool({ name: 'update_metadata', arguments: { typebotId: 'testbot', expectedHash: edited.contentHash, patch: { injected: true } } }); assert.equal(invalid.isError, true);
});
test('OAuth resource metadata and signed JWT issuer/audience/scope/expiry enforcement', async t => {
  const s = await setup(); t.after(s.close); const { privateKey, publicKey } = await generateKeyPair('RS256');
  const c = { ...s.c, authMode: 'oauth', issuer: 'https://issuer.example', resource: 'https://resource.example/mcp', jwksUrl: 'https://issuer.example/jwks', scopes: ['typebot:manage'] };
  s.service.config = c;
  const http = await listen(createHttpApp(s.service, token => jwtVerify(token, publicKey, { issuer: c.issuer, audience: c.resource, algorithms: ['RS256'], typ: 'at+jwt', requiredClaims: ['exp', 'sub', 'iat'] }))); t.after(http.close);
  const metadata = await (await fetch(`${http.url}/.well-known/oauth-protected-resource/mcp`)).json(); assert.equal(metadata.resource, c.resource);
  const token = async (aud = c.resource, scope = 'typebot:manage', exp = '2h') => new SignJWT({ scope }).setProtectedHeader({ alg: 'RS256', typ: 'at+jwt' }).setIssuer(c.issuer).setSubject('user').setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
  const request = async tok => fetch(`${http.url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) });
  assert.equal((await request(await token())).status, 200);
  assert.equal((await request(await token('wrong'))).status, 401);
  assert.equal((await request(await token(c.resource, 'other'))).status, 403);
  assert.equal((await request(await token(c.resource, 'typebot:manage', '1s ago'))).status, 401);
  assert.ok((await request('bad')).headers.get('www-authenticate').includes('resource_metadata'));
});
test('STDIO SDK startup, same tool surface and clean close', async t => {
  const s = await setup(); t.after(s.close);
  const transport = new StdioClientTransport({ command: process.execPath, args: ['src/main.js'], env: { ...process.env, MCP_TRANSPORT: 'stdio', TYPEBOT_API_URL: s.c.apiUrl, TYPEBOT_API_TOKEN: s.c.apiToken, SNAPSHOT_DIR: s.dir }, stderr: 'pipe' });
  const client = new Client({ name: 'stdio-test', version: '1' }); t.after(() => client.close());
  await client.connect(transport); const result = await client.listTools(); assert.ok(result.tools.some(t => t.name === 'restore_snapshot'));
  const read = await client.callTool({ name: 'get_typebot', arguments: { typebotId: 'testbot' } }); assert.ok(!read.isError);
});

test('statistics explicitly report unpublished availability, then query published analytics', async t => {
  const s = await setup(); t.after(s.close);
  const stats = toolDefinitions(s.service).find(t => t.name === 'get_stats');
  assert.equal((await stats.run({ typebotId: 'testbot' })).available, false);
  await s.service.lifecycle({ typebotId: 'testbot', expectedHash: contentHash(s.bot()) }, 'publish');
  const result = await stats.run({ typebotId: 'testbot' }); assert.equal(result.available, true); assert.equal(result.stats.totalViews, 0);
});
