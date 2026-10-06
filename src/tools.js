import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VERSION } from './config.js';
import { blockContracts, openapi } from './contracts.js';
import { inspectGraph, validateBot, variableUsage } from './graph.js';
import { contentHash, diff, redact } from './utils.js';
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const botId = { typebotId: id };
const mutation = { ...botId, expectedHash: z.string().regex(/^[0-9a-f]{64}$/).describe('Current contentHash from get_typebot; rejects stale edits') };
const object = z.record(z.string(), z.unknown());
const coordinates = z.object({ x: z.number(), y: z.number() }).strict();
const nullable = z.string().nullable();
const value = z.union([z.string(), z.array(z.string().nullable()), z.null()]);
export function toolDefinitions(service) {
  const api = service.api, config = service.config;
  const defs = [];
  const add = (name, classification, description, inputSchema, run) => defs.push({ name, classification, description, inputSchema: z.object(inputSchema).strict(), run });
  const read = (name, description, schema, run) => add(name, 'read-only', description, schema, run);
  const edit = (name, operation, description, schema, destructive = false) => add(name, destructive ? 'destructive' : 'mutating', description, { ...mutation, ...schema }, a => service.edit(a, operation));
  read('capabilities', 'Supported contracts, transports and tool classifications; no credentials.', {}, () => ({ version: VERSION, apiContract: 'Typebot 3.19.0', transports: ['streamable-http', 'stdio'], tools: defs.map(({ name, classification }) => ({ name, classification })) }));
  read('list_workspaces', 'List accessible Typebot workspaces.', {}, () => api.request('GET', '/v1/workspaces'));
  read('list_folders', 'List workspace folders.', { workspaceId: id.optional(), parentFolderId: id.optional() }, a => {
    const workspaceId = a.workspaceId ?? config.workspaceId; if (!workspaceId) throw new Error('workspaceId required');
    return api.request('GET', '/v1/folders', undefined, { ...a, workspaceId });
  });
  read('list_typebots', 'List bot IDs and metadata; optionally filter by name.', { workspaceId: id.optional(), folderId: id.optional(), query: z.string().max(200).optional() }, async a => {
    const workspaceId = a.workspaceId ?? config.workspaceId; if (!workspaceId) throw new Error('workspaceId required');
    const result = await api.request('GET', '/v1/typebots', undefined, { workspaceId, folderId: a.folderId });
    return { ...result, typebots: a.query ? result.typebots.filter(b => b.name.toLowerCase().includes(a.query.toLowerCase())) : result.typebots };
  });
  read('get_typebot', 'Get definition and contentHash needed for edits. Bot definitions may contain sensitive integration settings.', botId, a => service.get(a.typebotId));
  read('get_published_state', 'Get published Typebot definition/version, or null.', botId, a => api.published(a.typebotId));
  read('inspect_graph', 'Inspect group/block IDs, events and edges.', botId, async a => inspectGraph((await api.get(a.typebotId)).typebot));
  read('find_elements', 'Find groups and blocks by title, ID, type or serialized content.', { ...botId, query: z.string().min(1).max(200) }, async a => {
    const b = (await api.get(a.typebotId)).typebot, q = a.query.toLowerCase();
    return { groups: b.groups.filter(g => `${g.id} ${g.title}`.toLowerCase().includes(q)).map(g => ({ id: g.id, title: g.title })), blocks: b.groups.flatMap(g => g.blocks.filter(b => JSON.stringify(b).toLowerCase().includes(q)).map(b => ({ groupId: g.id, block: b }))) };
  });
  read('variable_usage', 'Locate variable ID and template-name references.', { ...botId, variableId: id }, async a => variableUsage((await api.get(a.typebotId)).typebot, a.variableId));
  read('validate_typebot', 'Local schema/graph validation; does not execute integrations.', botId, async a => validateBot((await api.get(a.typebotId)).typebot));
  read('block_schemas', 'Official block schema contracts. Request one schema name to obtain its JSON schema.', { schemaName: z.string().optional() }, a => {
    const contracts = blockContracts(); if (a.schemaName) { if (!contracts[a.schemaName]) throw new Error('Schema name not found'); return { ...contracts[a.schemaName], components: openapi.components }; }
    return Object.entries(contracts).map(([name, { type }]) => ({ name, type }));
  });
  read('get_results', 'Read results with bounded page size. Contains conversation data.', { ...botId, limit: z.number().int().min(1).max(100).default(20), cursor: z.number().int().min(0).optional() }, a => api.request('GET', `/v1/typebots/${a.typebotId}/results`, undefined, { limit: a.limit, cursor: a.cursor }));
  read('get_stats', 'Read analytics stats; unavailable until the bot has a published version.', botId, async a => {
    const state = await api.published(a.typebotId);
    if (!state.publishedTypebot) return { available: false, reason: 'Typebot analytics require a published version', stats: null };
    return { available: true, stats: await api.request('GET', `/v1/typebots/${a.typebotId}/analytics/stats`) };
  });
  add('create_typebot', 'mutating', 'Create an empty bot with a name; Typebot supplies version and start event.', { name: z.string().min(1).max(200), workspaceId: id.optional(), folderId: id.optional() }, a => service.create(a));
  add('clone_typebot', 'mutating', 'Create an unpublished clone. Integration credential references may be workspace-specific.', { ...mutation, name: z.string().min(1).max(200), workspaceId: id.optional() }, a => service.clone(a));
  edit('update_metadata', 'update_metadata', 'Update selected metadata. Does not publish.', { patch: z.object({ name: z.string().min(1).max(200).optional(), icon: nullable.optional(), publicId: nullable.optional(), folderId: nullable.optional(), spaceId: nullable.optional() }).strict() });
  edit('add_group', 'add_group', 'Add an empty group.', { title: z.string().min(1), id: id.optional(), coordinates: coordinates.optional() });
  edit('update_group', 'update_group', 'Update group title or graph coordinates.', { groupId: id, patch: z.object({ title: z.string().min(1).optional(), graphCoordinates: coordinates.optional() }).strict() });
  edit('remove_group', 'remove_group', 'Remove group and its blocks and attached edges. Other references must pass validation.', { groupId: id }, true);
  edit('add_block', 'add_block', 'Insert an official schema-valid block; use block_schemas for current contract. Connections use connect_flow.', { groupId: id, block: object, index: z.number().int().min(0).optional() });
  edit('update_block', 'update_block', 'Merge a narrow block patch. Arrays replace atomically; IDs/type/outgoingEdgeId cannot change.', { groupId: id, blockId: id, patch: object });
  edit('remove_block', 'remove_block', 'Remove block and attached edges; validates remaining references.', { groupId: id, blockId: id }, true);
  edit('connect_flow', 'connect', 'Create edge and set matching source outgoingEdgeId; disconnect existing edge first.', {
    from: z.object({ blockId: id.optional(), eventId: id.optional(), itemId: id.optional(), pathId: id.optional() }).strict(), to: z.object({ groupId: id, blockId: id.optional() }).strict(),
  });
  edit('disconnect_flow', 'disconnect', 'Remove an edge and its outgoingEdgeId reference.', { edgeId: id });
  edit('add_variable', 'add_variable', 'Add a uniquely named variable.', { id: id.optional(), name: z.string().min(1).max(200), value: value.optional() });
  edit('update_variable', 'update_variable', 'Update variable; renaming updates exact {{name}} references.', { variableId: id, patch: z.object({ name: z.string().min(1).max(200).optional(), value: value.optional(), isSessionVariable: z.boolean().optional() }).strict() });
  edit('remove_variable', 'remove_variable', 'Remove an unused variable; rejects referenced variables.', { variableId: id }, true);
  edit('update_settings', 'update_settings', 'Merge supported Typebot settings; validate official schema before writing.', { patch: object });
  read('list_snapshots', 'List verified filesystem snapshot metadata.', { ...botId, limit: z.number().int().min(1).max(500).default(100) }, a => service.snapshots.list(a.typebotId, a.limit));
  read('inspect_snapshot', 'Read verified snapshot payload and metadata.', { ...botId, snapshotId: id }, a => service.snapshots.read(a.typebotId, a.snapshotId));
  read('diff_snapshot', 'Compare current draft against a verified snapshot.', { ...botId, snapshotId: id }, async a => ({ diff: diff((await service.snapshots.read(a.typebotId, a.snapshotId)).bot, (await api.get(a.typebotId)).typebot) }));
  add('restore_snapshot', 'destructive', 'Restore draft content from verified snapshot; back up current draft first. Does not restore published lifecycle state.', { ...mutation, snapshotId: id }, a => service.restore(a));
  for (const name of ['publish', 'unpublish', 'delete_typebot']) add(name, name === 'delete_typebot' ? 'destructive' : 'mutating', `${name}: validate current bot and snapshot before operation.`, mutation, a => service.lifecycle(a, name));
  add('start_preview', 'mutating', 'Start draft preview. May execute webhooks/code/paid integrations.', { ...botId, startFrom: z.union([z.object({ type: z.literal('group'), groupId: id }), z.object({ type: z.literal('event'), eventId: id })]).optional() }, a => service.preview(a.typebotId, a.startFrom ? { startFrom: a.startFrom } : {}));
  add('continue_preview', 'mutating', 'Continue a preview session. May execute integrations.', { sessionId: id, message: z.string().max(10000) }, a => service.continue(a.sessionId, a.message));
  add('smoke_test', 'mutating', 'Start preview and send up to 10 replies. May execute integrations; returns transcript steps.', { ...botId, messages: z.array(z.string().max(10000)).max(10).default([]) }, async a => {
    const start = await service.preview(a.typebotId), steps = [start];
    for (const text of a.messages) { if (!start.sessionId) throw new Error('Preview returned no sessionId'); steps.push(await service.continue(start.sessionId, text)); }
    return { sessionId: start.sessionId, steps };
  });
  return defs;
}
export function createMcpServer(service) {
  const server = new McpServer({ name: 'typebot-builder-mcp', version: VERSION });
  for (const t of toolDefinitions(service)) server.registerTool(t.name, {
    description: t.description, inputSchema: t.inputSchema,
    annotations: { readOnlyHint: t.classification === 'read-only', destructiveHint: t.classification === 'destructive', idempotentHint: t.classification === 'read-only', openWorldHint: true },
  }, async args => {
    try {
      const result = await t.run(args), text = JSON.stringify(result);
      if (Buffer.byteLength(text) > service.config.maxBytes) throw new Error('Tool result exceeds configured limit');
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: redact(e.message, [service.config.apiToken, service.config.bearer, service.config.webhookToken]).slice(0, 4000) }] };
    }
  });
  return server;
}
