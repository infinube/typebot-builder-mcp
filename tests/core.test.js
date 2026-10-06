import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.js';
import { hash, contentHash, redact, diff } from '../src/utils.js';
import { editBot } from '../src/edits.js';
import { validateBot, variableUsage } from '../src/graph.js';
import { SnapshotStore } from '../src/snapshots.js';
import { getGuidance } from '../src/guidance.js';
import { fixture, setup } from './helpers.js';
const env = { TYPEBOT_API_URL: 'https://builder.example.com/api', TYPEBOT_API_TOKEN: 'upstream', MCP_BEARER_TOKEN: 'a'.repeat(40) };
test('configuration modes, secret boundaries and fail-closed validation', () => {
  assert.equal(loadConfig(env).transport, 'streamable-http');
  assert.equal(loadConfig({ ...env, MCP_TRANSPORT: 'stdio', MCP_BEARER_TOKEN: '' }).transport, 'stdio');
  assert.throws(() => loadConfig({ ...env, MCP_AUTH_MODE: 'bad' }));
  assert.throws(() => loadConfig({ ...env, MCP_BEARER_TOKEN: 'short' }));
  assert.throws(() => loadConfig({ ...env, TYPEBOT_API_TOKEN: env.MCP_BEARER_TOKEN }));
  assert.throws(() => loadConfig({ ...env, MCP_AUTH_MODE: 'oauth' }));
  assert.throws(() => loadConfig({ ...env, SNAPSHOT_MODE: 'webhook' }));
  assert.throws(() => loadConfig({ ...env, REQUEST_TIMEOUT_MS: '-1' }));
  assert.throws(() => loadConfig({ ...env, TYPEBOT_API_URL: 'https://user:pass@example.com' }));
});
test('hashes normalize keys, preserve array order and exclude volatile timestamps', () => {
  assert.equal(hash({ b: 1, a: 2 }), hash({ a: 2, b: 1 }));
  assert.notEqual(hash([1, 2]), hash([2, 1]));
  assert.equal(contentHash(fixture()), contentHash({ ...fixture(), updatedAt: 'later' }));
});
test('secret/header redaction', () => {
  const result = redact({ Authorization: 'Bearer a', cookie: 'x', message: 'upstream Bearer leaked', nested: { apiKey: 'key' } }, ['upstream']);
  assert.equal(result.Authorization, '[REDACTED]'); assert.equal(result.nested.apiKey, '[REDACTED]');
  assert.ok(!JSON.stringify(result).includes('leaked')); assert.ok(!result.message.includes('upstream'));
});
test('graph reports schema, duplicate IDs, dangling sources, targets and variables', () => {
  assert.equal(validateBot(fixture()).valid, true);
  for (const change of [b => b.groups.push(b.groups[0]), b => b.edges[0].to.groupId = 'missing', b => b.edges[0].from.eventId = 'missing', b => b.groups[0].blocks[0].type = 'invented', b => b.groups[0].blocks.push({ id: 'input', type: 'text input', options: { variableId: 'missing' } })]) {
    const b = fixture(); change(b); assert.equal(validateBot(b).valid, false);
  }
});
test('semantic helpers preserve unrelated blocks and maintain connection integrity', () => {
  const original = fixture();
  const added = editBot(original, 'add_group', { id: 'next', title: 'Next' });
  assert.equal(original.groups.length, 1); assert.deepEqual(added.groups[0], original.groups[0]);
  const connected = editBot(added, 'connect', { from: { blockId: 'text' }, to: { groupId: 'next' } });
  assert.equal(validateBot(connected).valid, true);
  const removed = editBot(connected, 'remove_group', { groupId: 'next' });
  assert.equal(removed.edges.length, 1); assert.equal(removed.groups[0].blocks[0].outgoingEdgeId, undefined);
  assert.throws(() => editBot(original, 'update_block', { groupId: 'group', blockId: 'missing', patch: {} }));
  assert.throws(() => editBot(original, 'connect', { from: { eventId: 'start' }, to: { groupId: 'group' } }));
});
test('semantic Text shorthand normalizes to richText and keeps raw advanced content available', () => {
  const original = fixture();
  const added = editBot(original, 'add_block', { groupId: 'group', block: { type: 'text', text: 'Line one\nLine two' } });
  const created = added.groups[0].blocks.at(-1);
  assert.equal(created.type, 'text');
  assert.equal(created.text, undefined);
  assert.deepEqual(created.content.richText, [
    { type: 'p', children: [{ text: 'Line one' }] },
    { type: 'p', children: [{ text: 'Line two' }] },
  ]);
  assert.equal(validateBot(added).valid, true);

  const updated = editBot(original, 'update_block', { groupId: 'group', blockId: 'text', patch: { text: 'Updated' } });
  assert.equal(updated.groups[0].blocks[0].content.richText[0].children[0].text, 'Updated');

  const compat = editBot(original, 'update_block', { groupId: 'group', blockId: 'text', patch: { content: { plainText: 'Compatibility' } } });
  assert.equal(compat.groups[0].blocks[0].content.richText[0].children[0].text, 'Compatibility');

  assert.throws(() => editBot(original, 'add_block', { groupId: 'group', block: { type: 'image', text: 'invalid' } }), /Text shorthand/);
  assert.throws(() => editBot(original, 'update_block', { groupId: 'group', blockId: 'text', patch: { text: 'x', content: { richText: [] } } }), /either semantic text or raw content/);
});

test('versioned guidance exposes compatibility and text construction pills', () => {
  const guidance = getGuidance('text-blocks');
  assert.equal(guidance.baseline.testedVersion, '3.19.0');
  assert.equal(guidance.baseline.schemaVersion, '6.1');
  assert.ok(guidance.pills.some(p => p.includes('richText')));
});

test('variables reject deletion in use and rename template references', () => {
  const b = fixture(); b.variables.push({ id: 'v', name: 'person' }); b.groups[0].blocks[0].content.plainText = '{{person}}';
  assert.equal(variableUsage(b, 'v').length, 1);
  assert.throws(() => editBot(b, 'remove_variable', { variableId: 'v' }));
  const next = editBot(b, 'update_variable', { variableId: 'v', patch: { name: 'name' } });
  assert.equal(next.groups[0].blocks[0].content.plainText, '{{name}}');
  assert.ok(diff(b, next).some(x => x.entity === 'blocks'));
});
test('filesystem snapshots deduplicate payloads, verify hashes and reject traversal/symlinks', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'snapshot-test-'));
  const c = loadConfig({ ...env, SNAPSHOT_DIR: dir }); const store = new SnapshotStore(c);
  const a = await store.save(fixture(), 'edit', 'before'); await store.save(fixture(), 'edit', 'after');
  assert.equal((await readdir(path.join(dir, 'testbot'))).filter(f => f.endsWith('.payload.json')).length, 1);
  const snapshot = await store.read('testbot', a.receipts[0].snapshotId); assert.deepEqual(snapshot.bot, fixture());
  assert.equal((await store.list('testbot')).total, 2);
  await assert.rejects(store.read('../outside', 'x'));
  await symlink('/tmp', path.join(dir, 'linked')); await assert.rejects(store.directory('linked'));
  await writeFile(path.join(dir, 'testbot', `${snapshot.payloadHash}.payload.json`), '{}');
  await assert.rejects(store.read('testbot', snapshot.id), /integrity/); await assert.rejects(store.save(fixture(), 'edit', 'before'));
});
test('snapshot failure aborts before mutation; warn explicitly allows write', async t => {
  const s = await setup(); t.after(s.close);
  s.service.snapshots.save = async () => { throw new Error('filesystem snapshot failed'); };
  await assert.rejects(s.service.edit({ typebotId: 'testbot', expectedHash: contentHash(s.bot()), title: 'New' }, 'add_group'));
  assert.equal(s.writes(), 0);
});
