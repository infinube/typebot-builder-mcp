import { createHash } from 'node:crypto';
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
export const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const content = bot => Object.fromEntries(Object.entries(bot).filter(([key]) => !['updatedAt', 'createdAt'].includes(key)));
export const contentHash = bot => hash(content(bot));
export function redact(value, secrets = []) {
  if (typeof value === 'string') {
    let result = value.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
    for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('[REDACTED]');
    return result;
  }
  if (Array.isArray(value)) return value.map(x => redact(x, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, /authorization|cookie|token|password|secret|api.?key/i.test(key) ? '[REDACTED]' : redact(val, secrets)]));
  return value;
}
export function diff(before, after) {
  const changes = [];
  for (const collection of ['groups', 'edges', 'variables', 'events']) {
    const old = new Map((before?.[collection] ?? []).map(x => [x.id, x]));
    const next = new Map((after?.[collection] ?? []).map(x => [x.id, x]));
    for (const [id, item] of next) {
      if (!old.has(id)) changes.push({ entity: collection, id, change: 'added' });
      else if (hash(old.get(id)) !== hash(item)) changes.push({ entity: collection, id, change: 'modified' });
    }
    for (const id of old.keys()) if (!next.has(id)) changes.push({ entity: collection, id, change: 'removed' });
  }
  const blocks = bot => (bot?.groups ?? []).flatMap(g => g.blocks.map(b => ({ ...b, groupId: g.id })));
  const a = new Map(blocks(before).map(b => [b.id, b])), b = new Map(blocks(after).map(b => [b.id, b]));
  for (const [id, item] of b) if (!a.has(id) || hash(a.get(id)) !== hash(item)) changes.push({ entity: 'blocks', id, change: a.has(id) ? 'modified' : 'added' });
  for (const id of a.keys()) if (!b.has(id)) changes.push({ entity: 'blocks', id, change: 'removed' });
  for (const key of ['name', 'icon', 'publicId', 'folderId', 'spaceId', 'settings', 'theme'])
    if (hash(before?.[key] ?? null) !== hash(after?.[key] ?? null)) changes.push({ entity: key, change: 'modified' });
  return changes;
}
export async function boundedJson(response, maxBytes) {
  const reader = response.body?.getReader(); let size = 0; const parts = [];
  if (!reader) return null;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > maxBytes) throw new Error('Response exceeds configured limit');
      parts.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const text = Buffer.concat(parts).toString('utf8'); return text ? JSON.parse(text) : null;
}
export class KeyedLock {
  #tails = new Map();
  async run(key, fn) {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let release; const gate = new Promise(r => { release = r; });
    const tail = previous.then(() => gate); this.#tails.set(key, tail);
    await previous;
    try { return await fn(); } finally { release(); if (this.#tails.get(key) === tail) this.#tails.delete(key); }
  }
}
