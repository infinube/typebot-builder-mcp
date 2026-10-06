import { randomBytes } from 'node:crypto';
import { variableUsage, walk } from './graph.js';
export const newId = () => randomBytes(12).toString('hex');
function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe key');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      merge(target[key], value);
    } else target[key] = structuredClone(value);
  }
  return target;
}
export function disconnect(bot, edgeId) {
  if (!bot.edges.some(e => e.id === edgeId)) throw new Error('Edge does not exist');
  bot.edges = bot.edges.filter(e => e.id !== edgeId);
  walk({ groups: bot.groups, events: bot.events }, (key, value, _path, parent) => { if (key === 'outgoingEdgeId' && value === edgeId) delete parent[key]; });
}
function removeReferences(bot, blockIds, groupIds = []) {
  for (const e of [...bot.edges]) if (blockIds.includes(e.from?.blockId) || blockIds.includes(e.to?.blockId) || groupIds.includes(e.to?.groupId)) disconnect(bot, e.id);
}
export function editBot(original, operation, args) {
  const bot = structuredClone(original);
  const group = () => { const g = bot.groups.find(g => g.id === args.groupId); if (!g) throw new Error('Group does not exist'); return g; };
  const block = () => { const b = group().blocks.find(b => b.id === args.blockId); if (!b) throw new Error('Block does not exist'); return b; };
  switch (operation) {
    case 'update_metadata': merge(bot, args.patch); break;
    case 'add_group': bot.groups.push({ id: args.id ?? newId(), title: args.title, graphCoordinates: args.coordinates ?? { x: 0, y: 0 }, blocks: [] }); break;
    case 'update_group': merge(group(), args.patch); break;
    case 'remove_group': {
      const g = group(); removeReferences(bot, g.blocks.map(b => b.id), [g.id]);
      bot.groups = bot.groups.filter(x => x.id !== g.id); break;
    }
    case 'add_block': {
      const g = group(), index = args.index ?? g.blocks.length;
      if (index < 0 || index > g.blocks.length) throw new Error('Invalid insertion index');
      g.blocks.splice(index, 0, { ...args.block, id: args.block.id ?? newId() }); break;
    }
    case 'update_block': {
      if ('id' in args.patch || 'type' in args.patch || 'outgoingEdgeId' in args.patch) throw new Error('Block ID, type and connection must be changed through dedicated operations');
      merge(block(), args.patch); break;
    }
    case 'remove_block': { const b = block(); removeReferences(bot, [b.id]); group().blocks = group().blocks.filter(x => x.id !== b.id); break; }
    case 'connect': {
      const from = args.from;
      if (Boolean(from.eventId) === Boolean(from.blockId) || (from.itemId && from.pathId)) throw new Error('Exactly one source event/block and at most one item/path');
      let source = from.eventId ? bot.events?.find(e => e.id === from.eventId) : bot.groups.flatMap(g => g.blocks).find(b => b.id === from.blockId);
      if (from.itemId) source = source?.items?.find(i => i.id === from.itemId);
      if (from.pathId) source = source?.paths?.find(i => i.id === from.pathId);
      if (!source) throw new Error('Connection source does not exist');
      if (source.outgoingEdgeId) throw new Error('Disconnect existing edge before connecting');
      const edge = { id: newId(), from, to: args.to }; source.outgoingEdgeId = edge.id; bot.edges.push(edge); break;
    }
    case 'disconnect': disconnect(bot, args.edgeId); break;
    case 'add_variable': bot.variables.push({ id: args.id ?? newId(), name: args.name, ...(args.value !== undefined ? { value: args.value } : {}) }); break;
    case 'update_variable': {
      const v = bot.variables.find(v => v.id === args.variableId); if (!v) throw new Error('Variable does not exist');
      if (args.patch.name && args.patch.name !== v.name) {
        const old = `{{${v.name}}}`, next = `{{${args.patch.name}}}`;
        walk({ groups: bot.groups, events: bot.events, settings: bot.settings }, (_key, value, _path, parent) => {
          if (typeof value === 'string' && value.includes(old)) parent[_key] = value.split(old).join(next);
        });
      }
      merge(v, args.patch); break;
    }
    case 'remove_variable': if (variableUsage(bot, args.variableId).length) throw new Error('Variable is in use'); else bot.variables = bot.variables.filter(v => v.id !== args.variableId); break;
    case 'update_settings': merge(bot.settings, args.patch); break;
    default: throw new Error('Unsupported semantic operation');
  }
  return bot;
}
