import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VERSION } from './config.js';
import { blockContracts, openapi } from './contracts.js';
import { inspectGraph, validateBot, variableUsage } from './graph.js';
import { contentHash, diff, redact } from './utils.js';
import { GUIDANCE_TOPICS, TYPEBOT_COMPATIBILITY, getBlockGuidance, getGuidance } from './guidance.js';
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const botId = { typebotId: id };
const mutation = { ...botId, expectedHash: z.string().regex(/^[0-9a-f]{64}$/).describe('Current contentHash from get_typebot; rejects stale edits') };
const object = z.record(z.string(), z.unknown());
const coordinates = z.object({ x: z.number(), y: z.number() }).strict();
const nullable = z.string().nullable();
const value = z.union([z.string(), z.array(z.string().nullable()), z.null()]);
const timeFilter = z.enum(['today', 'last7Days', 'last30Days', 'monthToDate', 'lastMonth', 'yearToDate', 'allTime']);
const timeZone = z.string().min(1).max(100).optional();
const resultId = id;
export function toolDefinitions(service) {
  const api = service.api, config = service.config;
  const defs = [];
  const add = (name, classification, description, inputSchema, run) => defs.push({ name, classification, description, inputSchema: z.object(inputSchema).strict(), run });
  const read = (name, description, schema, run) => add(name, 'read-only', description, schema, run);
  const edit = (name, operation, description, schema, destructive = false) => add(name, destructive ? 'destructive' : 'mutating', description, { ...mutation, ...schema }, a => service.edit(a, operation));
  read('capabilities', 'Supported contracts, transports, compatibility baseline, guidance topics and tool classifications; no credentials.', {}, () => ({ version: VERSION, apiContract: 'Typebot 3.19.0', typebotCompatibility: TYPEBOT_COMPATIBILITY, guidanceTopics: [...GUIDANCE_TOPICS, 'all'], transports: ['streamable-http', 'stdio'], tools: defs.map(({ name, classification }) => ({ name, classification })) }));
  read('get_guidance', 'Versioned Typebot-building knowledge pills for AI clients. Use topic=all only when broad guidance is genuinely needed.', { topic: z.enum([...GUIDANCE_TOPICS, 'all']).default('building') }, a => getGuidance(a.topic));
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
  read('block_schemas', 'Official block schema contracts plus MCP-specific construction guidance for known tricky block types. Request one schema name to obtain its JSON schema.', { schemaName: z.string().optional() }, a => {
    const contracts = blockContracts(); if (a.schemaName) { if (!contracts[a.schemaName]) throw new Error('Schema name not found'); return { ...contracts[a.schemaName], guidance: getBlockGuidance(a.schemaName), components: openapi.components }; }
    return Object.entries(contracts).map(([name, { type }]) => ({ name, type }));
  });
  read('get_results', 'Read paginated Typebot results. Contains customer/conversation data and may include PII.', { ...botId, limit: z.number().int().min(1).max(500).default(50), cursor: z.number().int().min(0).optional(), timeFilter: timeFilter.default('last7Days'), timeZone }, a => api.request('GET', `/v1/typebots/${encodeURIComponent(a.typebotId)}/results`, undefined, { limit: a.limit, cursor: a.cursor, timeFilter: a.timeFilter, timeZone: a.timeZone }));
  read('get_result', 'Read one Typebot result by resultId, including captured variables and answers. Contains customer/conversation data and may include PII.', { ...botId, resultId }, a => api.request('GET', `/v1/typebots/${encodeURIComponent(a.typebotId)}/results/${encodeURIComponent(a.resultId)}`));
  read('get_result_transcript', 'Read the bot/user transcript for one Typebot result. Contains conversation content and may include PII.', { ...botId, resultId }, a => api.request('GET', `/v1/typebots/${encodeURIComponent(a.typebotId)}/results/${encodeURIComponent(a.resultId)}/transcript`));
  read('get_result_logs', 'Read execution logs for one Typebot result. Logs may contain integration/error context and sensitive data.', { ...botId, resultId }, a => api.request('GET', `/v1/typebots/${encodeURIComponent(a.typebotId)}/results/${encodeURIComponent(a.resultId)}/logs`));
  read('find_results', 'Search Typebot results by captured variable name/value and/or answer text. Paginates within bounded limits and returns matching result summaries. Contains customer/conversation data and may include PII.', {
    ...botId,
    variableName: z.string().min(1).max(200).optional(),
    variableValue: z.string().min(1).max(500).optional(),
    answerContains: z.string().min(1).max(500).optional(),
    timeFilter: timeFilter.default('last30Days'),
    timeZone,
    limit: z.number().int().min(1).max(100).default(20),
    pageSize: z.number().int().min(1).max(500).default(100),
    maxPages: z.number().int().min(1).max(20).default(5),
  }, async a => {
    if (!a.variableName && !a.variableValue && !a.answerContains) throw new Error('At least one result search criterion is required');
    const wantedName = a.variableName?.toLowerCase(), wantedValue = a.variableValue?.toLowerCase(), wantedAnswer = a.answerContains?.toLowerCase();
    const matches = []; let cursor; let pagesScanned = 0; let exhausted = false;
    const valueText = v => Array.isArray(v) ? v.filter(x => x !== null).join(' ') : String(v ?? '');
    for (let pageNo = 0; pageNo < a.maxPages && matches.length < a.limit; pageNo++) {
      const page = await api.request('GET', `/v1/typebots/${encodeURIComponent(a.typebotId)}/results`, undefined, {
        limit: a.pageSize, cursor, timeFilter: a.timeFilter, timeZone: a.timeZone,
      });
      pagesScanned++;
      for (const result of page.results ?? []) {
        const vars = result.variables ?? [], answers = result.answers ?? [];
        const variableCandidates = vars.filter(v => (!wantedName || String(v.name ?? '').toLowerCase() === wantedName)
          && (!wantedValue || valueText(v.value).toLowerCase().includes(wantedValue)));
        const answerCandidates = wantedAnswer ? answers.filter(x => String(x.content ?? '').toLowerCase().includes(wantedAnswer)) : [];
        const variableOk = (!wantedName && !wantedValue) || variableCandidates.length > 0;
        const answerOk = !wantedAnswer || answerCandidates.length > 0;
        if (!variableOk || !answerOk) continue;
        matches.push({
          id: result.id,
          createdAt: result.createdAt,
          isCompleted: result.isCompleted,
          isArchived: result.isArchived,
          lastChatSessionId: result.lastChatSessionId,
          matchedVariables: variableCandidates.slice(0, 20).map(v => ({ id: v.id, name: v.name, value: v.value })),
          matchedAnswers: answerCandidates.slice(0, 20).map(x => ({ blockId: x.blockId, content: String(x.content ?? '').slice(0, 1000), attachedFileUrls: x.attachedFileUrls ?? [] })),
        });
        if (matches.length >= a.limit) break;
      }
      if (page.nextCursor === null || page.nextCursor === undefined) { exhausted = true; break; }
      cursor = page.nextCursor;
    }
    return { results: matches, count: matches.length, pagesScanned, exhausted, nextCursor: exhausted ? null : cursor };
  });
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
  edit('add_block', 'add_block', 'Insert an official schema-valid block. For Text, prefer semantic shorthand block {type:"text", text:"..."}; the MCP normalizes it to richText. Use block_schemas for advanced contracts. Connections use connect_flow.', { groupId: id, block: object, index: z.number().int().min(0).optional() });
  edit('update_block', 'update_block', 'Merge a narrow block patch. For Text, prefer patch {text:"..."}; the MCP normalizes it to richText. Arrays replace atomically; IDs/type/outgoingEdgeId cannot change.', { groupId: id, blockId: id, patch: object });
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
