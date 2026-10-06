import { validateRequest, updatePayload } from './contracts.js';

export function walk(value, visit, path = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    visit(key, item, `${path}/${key}`, value);
    walk(item, visit, `${path}/${key}`);
  }
}
export function variableUsage(bot, variableId) {
  const variable = bot.variables?.find(v => v.id === variableId);
  if (!variable) throw new Error('Variable does not exist');
  const usages = [];
  walk({ groups: bot.groups, events: bot.events, settings: bot.settings }, (key, value, path) => {
    if (typeof value === 'string' && ((/variableId$/i.test(key) && value === variableId) || value.includes(`{{${variable.name}}}`))) usages.push({ path });
  });
  return usages;
}
export function inspectGraph(bot) {
  return {
    groups: bot.groups.map(g => ({ id: g.id, title: g.title, blocks: g.blocks.map(b => ({ id: b.id, type: b.type })) })),
    events: bot.events, edges: bot.edges,
  };
}
export function validateBot(bot) {
  const findings = [];
  const add = (severity, code, path, message) => findings.push({ severity, code, path, message });
  try { validateRequest('/v1/typebots/{typebotId}', 'patch', { typebot: updatePayload(bot) }); }
  catch (e) { add('error', 'schema', '', e.message); }
  if (!Array.isArray(bot.groups) || !Array.isArray(bot.edges) || !Array.isArray(bot.variables)) {
    add('error', 'structure', '', 'groups, edges and variables must be arrays');
    return { valid: false, findings };
  }
  const groups = new Map(), blocks = new Map(), events = new Map(), edges = new Map(), vars = new Map(), ids = new Set();
  const register = (item, map, path) => {
    if (!item || typeof item.id !== 'string' || !item.id) { add('error', 'id', path, 'Missing ID'); return; }
    if (ids.has(item.id)) add('error', 'duplicate_id', path, `Duplicate ID ${item.id}`);
    ids.add(item.id); map.set(item.id, item);
  };
  for (const [i, g] of bot.groups.entries()) {
    register(g, groups, `/groups/${i}`);
    if (!Array.isArray(g.blocks)) { add('error', 'blocks', `/groups/${i}`, 'blocks must be an array'); continue; }
    for (const [j, b] of g.blocks.entries()) {
      register(b, blocks, `/groups/${i}/blocks/${j}`);
      for (const [k, item] of (b.items ?? []).entries()) register(item, new Map(), `/groups/${i}/blocks/${j}/items/${k}`);
      for (const [k, item] of (b.paths ?? []).entries()) register(item, new Map(), `/groups/${i}/blocks/${j}/paths/${k}`);
    }
    if (g.blocks.length === 0) add('warning', 'empty_group', `/groups/${i}`, 'Group has no blocks');
  }
  for (const [i, e] of (bot.events ?? []).entries()) register(e, events, `/events/${i}`);
  for (const [i, e] of bot.edges.entries()) register(e, edges, `/edges/${i}`);
  for (const [i, v] of bot.variables.entries()) register(v, vars, `/variables/${i}`);
  const names = new Set();
  for (const v of vars.values()) { if (names.has(v.name)) add('error', 'duplicate_variable_name', '/variables', 'Variable names must be unique'); names.add(v.name); }
  if (String(bot.version).startsWith('6') && (!bot.events?.length || bot.events[0].type !== 'start')) add('error', 'start_event', '/events', 'First event must be start');
  const owner = new Map(bot.groups.flatMap(g => (Array.isArray(g.blocks) ? g.blocks : []).map(b => [b.id, g.id])));
  for (const [i, e] of bot.edges.entries()) {
    const p = `/edges/${i}`;
    if (!e.from || !e.to) { add('error', 'edge_structure', p, 'Edge source and target required'); continue; }
    const source = e.from.eventId ? events.get(e.from.eventId) : blocks.get(e.from.blockId);
    if (!source) add('error', 'edge_source', p, 'Source does not exist');
    if (!groups.has(e.to.groupId)) add('error', 'edge_target', p, 'Target group does not exist');
    if (e.to.blockId && owner.get(e.to.blockId) !== e.to.groupId) add('error', 'edge_target_block', p, 'Target block does not belong to target group');
    let endpoint = source;
    if (e.from.itemId) endpoint = source?.items?.find(x => x.id === e.from.itemId);
    if (e.from.pathId) endpoint = source?.paths?.find(x => x.id === e.from.pathId);
    if (!endpoint) add('error', 'edge_source_item', p, 'Source item/path does not exist');
    else if (endpoint.outgoingEdgeId !== e.id) add('error', 'edge_source_link', p, 'Source outgoingEdgeId does not match edge');
  }
  walk({ groups: bot.groups, events: bot.events, settings: bot.settings }, (key, value, path, parent) => {
    if (key === 'outgoingEdgeId' && value) {
      const edge = edges.get(value);
      if (!edge) add('error', 'dangling_edge', path, 'Referenced edge does not exist');
      else if (![edge.from?.eventId, edge.from?.blockId, edge.from?.itemId, edge.from?.pathId].includes(parent.id)) add('error', 'edge_owner', path, 'Outgoing edge belongs to another source');
    }
    if (/variableId$/i.test(key) && typeof value === 'string' && value && !vars.has(value)) add('error', 'dangling_variable', path, 'Variable does not exist');
    if (typeof value === 'string') for (const match of value.matchAll(/{{([^{}]+)}}/g)) if (!names.has(match[1])) add('warning', 'unknown_variable_name', path, `Unknown template variable ${match[1]}`);
    if (key === 'groupId' && typeof value === 'string' && value && !groups.has(value) && !parent.typebotId) add('error', 'group_reference', path, 'Referenced group does not exist in this bot');
  });
  const reachable = new Set();
  const queue = [...events.values()].map(e => edges.get(e.outgoingEdgeId)?.to.groupId).filter(Boolean);
  for (const b of blocks.values()) if (b.type === 'start') { const target = edges.get(b.outgoingEdgeId)?.to.groupId; if (target) queue.push(target); }
  while (queue.length) {
    const id = queue.shift(); if (reachable.has(id)) continue; reachable.add(id);
    for (const e of edges.values()) if (owner.get(e.from?.blockId) === id) queue.push(e.to?.groupId);
  }
  for (const g of groups.values()) if (!reachable.has(g.id) && !g.blocks?.some(b => b.type === 'start')) add('warning', 'unreachable_group', `/groups/${g.id}`, 'Not reachable by static edges; jumps and dynamic routing may still reach it');
  add('informational', 'runtime_limits', '', 'Local validation cannot verify integration credentials, remote services, dynamic code or runtime output');
  return { valid: !findings.some(f => f.severity === 'error'), findings };
}
