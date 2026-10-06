// Run only with explicit authorization in a dedicated test workspace.
// prepare/finish allow the operator to restart the container between stages.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadConfig } from '../src/config.js';
import { TypebotApi } from '../src/api.js';
import { contentHash } from '../src/utils.js';
const config = loadConfig(), api = new TypebotApi(config);
const stage = process.argv[2], stateFile = process.env.LIVE_REPORT_PATH ?? '/data/snapshots/live-test-state.json';
if (!['prepare', 'finish'].includes(stage) || !process.env.LIVE_WORKSPACE_ID) throw new Error('Specify prepare/finish and LIVE_WORKSPACE_ID');
const client = new Client({ name: 'typebot-builder-live-verification', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(process.env.LIVE_MCP_URL ?? 'http://127.0.0.1:3000/mcp'), { requestInit: { headers: { Authorization: `Bearer ${config.bearer}` } } }));
const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content?.[0]?.text}`);
  return JSON.parse(result.content[0].text);
};
let state;
const persist = () => writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
const read = () => call('get_typebot', { typebotId: state.botId });
const change = async (name, args = {}) => {
  const b = await read(); const r = await call(name, { typebotId: state.botId, expectedHash: b.contentHash, ...args });
  assert.ok(r.mutationApplied || r.deleted); assert.ok(!r.verificationFailed); assert.deepEqual(r.warnings ?? [], []);
  if (r.validation) assert.equal(r.validation.valid, true);
  state.checks.push(name); return r;
};
async function inventory() {
  const bots = {};
  const { workspaces } = await call('list_workspaces');
  for (const workspace of workspaces) {
    const listed = await call('list_typebots', { workspaceId: workspace.id });
    for (const bot of listed.typebots) bots[bot.id] = contentHash((await api.get(bot.id)).typebot);
  }
  return bots;
}
try {
  if (stage === 'prepare') {
    state = { started: new Date().toISOString(), checks: [], baseline: await inventory() };
    const created = await call('create_typebot', { workspaceId: process.env.LIVE_WORKSPACE_ID, name: `MCP temporary verification ${Date.now()}` });
    state.botId = created.typebot.id; await persist();
    const capabilities = await call('capabilities'); state.toolCount = capabilities.tools.length; state.botVersion = created.typebot.version;
    await call('list_typebots', { workspaceId: process.env.LIVE_WORKSPACE_ID, query: 'MCP temporary verification' });
    await call('list_folders', { workspaceId: process.env.LIVE_WORKSPACE_ID });
    const group = await change('add_group', { id: 'livegroup', title: 'Live verification' }); assert.ok(group.snapshots.before.length);
    await change('add_variable', { id: 'livevar', name: 'answer' });
    await change('add_block', { groupId: 'livegroup', block: { id: 'livegreeting', type: 'text', content: { richText: [{ type: 'p', children: [{ text: 'MCP live test greeting' }] }] } } });
    await change('add_block', { groupId: 'livegroup', block: { id: 'liveinput', type: 'text input', options: { variableId: 'livevar' } } });
    await change('add_block', { groupId: 'livegroup', block: { id: 'livereply', type: 'text', content: { richText: [{ type: 'p', children: [{ text: 'Received {{answer}}' }] }] } } });
    const current = await read();
    await change('connect_flow', { from: { eventId: current.typebot.events[0].id }, to: { groupId: 'livegroup' } });
    assert.equal((await call('validate_typebot', { typebotId: state.botId })).valid, true);
    await call('inspect_graph', { typebotId: state.botId });
    assert.ok((await call('variable_usage', { typebotId: state.botId, variableId: 'livevar' })).length);
    const smoke = await call('smoke_test', { typebotId: state.botId, messages: ['hello'] });
    assert.equal(smoke.steps.length, 2); assert.ok(JSON.stringify(smoke.steps[0]).includes('MCP live test greeting')); assert.ok(JSON.stringify(smoke.steps[1]).includes('Received'));
    state.checks.push('preview_start_continue_smoke');
    await call('get_results', { typebotId: state.botId, limit: 5 }); assert.equal((await call('get_stats', { typebotId: state.botId })).available, false);
    await change('publish'); assert.ok((await call('get_published_state', { typebotId: state.botId })).publishedTypebot);
    assert.equal((await call('get_stats', { typebotId: state.botId })).available, true);
    await change('unpublish'); assert.equal((await call('get_published_state', { typebotId: state.botId })).publishedTypebot, null);
    const before = await read(); state.restoreHash = before.contentHash;
    const modified = await change('update_block', { groupId: 'livegroup', blockId: 'livegreeting', patch: { content: { richText: [{ type: 'p', children: [{ text: 'Changed after snapshot' }] }] } } });
    state.snapshotId = modified.snapshots.before[0].snapshotId;
    state.snapshotCount = (await call('list_snapshots', { typebotId: state.botId })).total;
    await call('inspect_snapshot', { typebotId: state.botId, snapshotId: state.snapshotId });
    assert.ok((await call('diff_snapshot', { typebotId: state.botId, snapshotId: state.snapshotId })).diff.length);
    state.phase = 'awaiting_restart'; await persist();
    console.log(JSON.stringify({ phase: state.phase, toolCount: state.toolCount, snapshotCount: state.snapshotCount, checks: state.checks }));
  } else {
    state = JSON.parse(await readFile(stateFile, 'utf8'));
    assert.equal(state.phase, 'awaiting_restart');
    assert.equal((await call('list_snapshots', { typebotId: state.botId })).total, state.snapshotCount);
    state.checks.push('restart_snapshot_persistence');
    await change('restore_snapshot', { snapshotId: state.snapshotId }); assert.equal((await read()).contentHash, state.restoreHash);
    const bot = await read();
    const clone = await call('clone_typebot', { typebotId: state.botId, expectedHash: bot.contentHash, name: 'MCP temporary clone verification', workspaceId: process.env.LIVE_WORKSPACE_ID });
    state.cloneId = clone.typebot.id; await persist();
    const cloned = await call('get_typebot', { typebotId: state.cloneId });
    assert.equal(cloned.typebot.groups.length, bot.typebot.groups.length);
    await call('delete_typebot', { typebotId: state.cloneId, expectedHash: cloned.contentHash }); state.cloneId = undefined;
    await change('delete_typebot');
    assert.deepEqual(await inventory(), state.baseline); state.checks.push('all_preexisting_bots_unchanged');
    state.phase = 'completed'; state.finished = new Date().toISOString(); await persist();
    console.log(JSON.stringify({ phase: state.phase, toolCount: state.toolCount, botVersion: state.botVersion, snapshots: state.snapshotCount, preexistingBotsChecked: Object.keys(state.baseline).length, checks: state.checks }));
  }
} catch (error) {
  if (state?.cloneId) await api.request('DELETE', `/v1/typebots/${state.cloneId}`).catch(() => {});
  if (state?.botId) await api.request('DELETE', `/v1/typebots/${state.botId}`).catch(() => {});
  if (state) { state.phase = 'failed_cleaned'; state.error = error.message; await persist(); }
  throw error;
} finally { await client.close(); }
