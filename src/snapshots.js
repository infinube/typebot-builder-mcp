import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { hash, contentHash, canonical } from './utils.js';
import { VERSION } from './config.js';
const safeId = value => { if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid snapshot identifier'); return value; };
const privateIp = ip => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::$|f[cd]|fe[89ab])/i.test(ip) || ip.toLowerCase().startsWith('::ffff:');
export class SnapshotStore {
  constructor(config) { this.config = config; this.root = path.resolve(config.snapshotDir); }
  async directory(botId) {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(this.root)).isSymbolicLink()) throw new Error('Snapshot root must not be a symlink');
    const dir = path.join(this.root, safeId(botId)); await fs.mkdir(dir, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
    if ((await fs.lstat(dir)).isSymbolicLink() || !(await fs.lstat(dir)).isDirectory()) throw new Error('Unsafe snapshot directory');
    return dir;
  }
  async save(bot, operation, phase, published = undefined) {
    if (this.config.snapshotMode === 'off') return { receipts: [], warnings: ['Snapshots are disabled'] };
    const snapshot = {
      eventType: 'typebot.snapshot.v1', id: randomUUID(), phase, operation,
      typebotId: bot.id, workspaceId: bot.workspaceId, timestamp: new Date().toISOString(),
      contentHash: contentHash(bot), payloadHash: hash(bot), bot: canonical(bot),
      ...(published !== undefined ? { published } : {}), serverVersion: VERSION,
    };
    const receipts = [], warnings = [];
    const attempt = async (store, policy, fn) => {
      try { receipts.push({ store, ...(await fn()) }); }
      catch { const message = `${store} snapshot failed (${phase})`; if (policy === 'abort') throw new Error(message); warnings.push(message); }
    };
    if (['filesystem', 'both'].includes(this.config.snapshotMode)) await attempt('filesystem', this.config.snapshotFailure, async () => {
      const dir = await this.directory(bot.id);
      // Content-addressed payload deduplication; every event retains independent metadata.
      const payload = path.join(dir, `${snapshot.payloadHash}.payload.json`);
      try { await fs.writeFile(payload, JSON.stringify(snapshot.bot), { flag: 'wx', mode: 0o600 }); }
      catch (e) { if (e.code !== 'EEXIST') throw e; if (hash(await this.readJson(payload)) !== snapshot.payloadHash) throw new Error('Existing payload corrupted'); }
      const { bot: _bot, ...metadata } = snapshot;
      await fs.writeFile(path.join(dir, `${snapshot.id}.json`), JSON.stringify(metadata), { flag: 'wx', mode: 0o600 });
      return { snapshotId: snapshot.id, contentHash: snapshot.contentHash };
    });
    if (['webhook', 'both'].includes(this.config.snapshotMode)) await attempt('webhook', this.config.webhookFailure, async () => {
      const u = new URL(this.config.webhookUrl);
      if (!this.config.allowPrivateWebhook) {
        const addresses = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
        if (u.protocol !== 'https:' || addresses.some(x => privateIp(x.address))) throw new Error('Webhook requires public HTTPS');
      }
      const response = await fetch(u, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': snapshot.id, ...(this.config.webhookToken ? { Authorization: `Bearer ${this.config.webhookToken}` } : {}) },
        body: JSON.stringify(snapshot) });
      await response.body?.cancel(); if (!response.ok) throw new Error('Webhook delivery rejected');
      return { snapshotId: snapshot.id, contentHash: snapshot.contentHash };
    });
    return { receipts, warnings };
  }
  async readJson(file) {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > this.config.maxBytes) throw new Error('Unsafe snapshot file');
      return JSON.parse(await handle.readFile('utf8'));
    } finally { await handle.close(); }
  }
  async read(botId, snapshotId) {
    if (!['filesystem', 'both'].includes(this.config.snapshotMode)) throw new Error('Filesystem snapshots are not enabled');
    const dir = await this.directory(botId);
    const metadata = await this.readJson(path.join(dir, `${safeId(snapshotId)}.json`));
    if (metadata.typebotId !== botId || metadata.id !== snapshotId || !/^[0-9a-f]{64}$/.test(metadata.payloadHash)) throw new Error('Invalid snapshot metadata');
    const bot = await this.readJson(path.join(dir, `${metadata.payloadHash}.payload.json`));
    if (hash(bot) !== metadata.payloadHash || contentHash(bot) !== metadata.contentHash || bot.id !== botId) throw new Error('Snapshot integrity check failed');
    return { ...metadata, bot };
  }
  async list(botId, limit = 100) {
    if (!['filesystem', 'both'].includes(this.config.snapshotMode)) throw new Error('Filesystem snapshots are not enabled');
    const dir = await this.directory(botId);
    const files = (await fs.readdir(dir)).filter(x => /^[a-f0-9-]{36}\.json$/.test(x));
    const items = [];
    for (const f of files) { const { bot: _bot, published: _published, ...meta } = await this.read(botId, f.slice(0, -5)); items.push(meta); }
    return { total: items.length, snapshots: items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit) };
  }
}
