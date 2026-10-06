import { KeyedLock, contentHash, diff } from './utils.js';
import { validateBot } from './graph.js';
import { editBot } from './edits.js';
import { updatePayload, validateRequest } from './contracts.js';
export class BuilderService {
  constructor(api, snapshots, config) { this.api = api; this.snapshots = snapshots; this.config = config; this.lock = new KeyedLock(); }
  async get(id) { const result = await this.api.get(id); return { ...result, contentHash: contentHash(result.typebot) }; }
  requireValid(bot) { const result = validateBot(bot); if (!result.valid) throw new Error(`Validation failed: ${JSON.stringify(result.findings.filter(f => f.severity === 'error').slice(0, 10))}`); return result; }
  async mutate(id, expectedHash, operation, transform, execute) {
    return this.lock.run(id, async () => {
      const before = (await this.api.get(id)).typebot;
      if (contentHash(before) !== expectedHash) throw new Error('Conflict: bot changed since inspection; get and review again');
      this.requireValid(before);
      const proposed = transform ? transform(before) : before; this.requireValid(proposed);
      const lifecycle = ['publish', 'unpublish', 'delete_typebot'].includes(operation);
      const publishedBefore = lifecycle ? (await this.api.published(id)).publishedTypebot : undefined;
      const pre = await this.snapshots.save(before, operation, 'before', publishedBefore);
      // Narrow the external editor race window after snapshot I/O. Typebot also checks updatedAt, with a 5s margin.
      const current = (await this.api.get(id)).typebot;
      if (contentHash(current) !== expectedHash) throw new Error('Conflict detected immediately before write');
      let apiResult;
      try { apiResult = execute ? await execute(before) : await this.api.update(id, { typebot: { ...updatePayload(proposed), updatedAt: current.updatedAt }, overwrite: false }); }
      catch (e) { throw new Error(`${e.message}; before snapshot exists; read current state before retrying`); }
      if (operation === 'delete_typebot') return { deleted: true, snapshots: pre, apiResult };
      let after;
      try { after = (await this.api.get(id)).typebot; }
      catch { return { mutationApplied: true, verificationFailed: true, snapshots: pre, warnings: ['Read-back failed; inspect Typebot before retrying'] }; }
      const validation = validateBot(after), warnings = [...pre.warnings];
      const publishedAfter = lifecycle ? (await this.api.published(id)).publishedTypebot : undefined;
      let post;
      try { post = await this.snapshots.save(after, operation, 'after', publishedAfter); warnings.push(...post.warnings); }
      catch (e) { warnings.push(`${e.message}; mutation has already been applied`); }
      return { mutationApplied: true, typebotId: id, contentHash: contentHash(after), validation,
        diff: diff(before, after), snapshots: { before: pre.receipts, after: post?.receipts ?? [] }, warnings,
        ...(lifecycle ? { published: Boolean(publishedAfter), publicationChanged: JSON.stringify(publishedBefore) !== JSON.stringify(publishedAfter) } : {}), apiResult: execute ? apiResult : undefined };
    });
  }
  edit(args, operation) { return this.mutate(args.typebotId, args.expectedHash, operation, bot => editBot(bot, operation, args)); }
  async create(args) {
    const body = { workspaceId: args.workspaceId ?? this.config.workspaceId, typebot: { name: args.name, ...(args.folderId ? { folderId: args.folderId } : {}) } };
    if (!body.workspaceId) throw new Error('workspaceId is required');
    const bot = (await this.api.create(body)).typebot;
    const warnings = []; let saved;
    try { saved = await this.snapshots.save(bot, 'create_typebot', 'after'); warnings.push(...saved.warnings); }
    catch (e) { warnings.push(`${e.message}; bot has been created`); }
    return { typebot: bot, contentHash: contentHash(bot), validation: validateBot(bot), snapshots: saved?.receipts ?? [], warnings };
  }
  async clone(args) {
    const source = (await this.api.get(args.typebotId)).typebot; this.requireValid(source);
    if (contentHash(source) !== args.expectedHash) throw new Error('Conflict: source bot changed');
    const workspaceId = args.workspaceId ?? source.workspaceId;
    const copy = updatePayload(source);
    for (const key of ['version', 'updatedAt', 'publicId', 'customDomain', 'folderId', 'spaceId', 'whatsAppCredentialsId', 'isClosed', 'riskLevel']) delete copy[key];
    copy.name = args.name;
    const bot = (await this.api.create({ workspaceId, typebot: copy })).typebot;
    let saved; const warnings = [];
    try { saved = await this.snapshots.save(bot, 'clone_typebot', 'after'); } catch (e) { warnings.push(`${e.message}; clone exists`); }
    return { typebot: bot, contentHash: contentHash(bot), snapshots: saved, warnings, validation: validateBot(bot) };
  }
  async restore(args) {
    const snapshot = await this.snapshots.read(args.typebotId, args.snapshotId);
    this.requireValid(snapshot.bot);
    return this.mutate(args.typebotId, args.expectedHash, 'restore_snapshot', () => snapshot.bot);
  }
  lifecycle(args, operation) {
    return this.mutate(args.typebotId, args.expectedHash, operation, undefined, () => this.api.request(operation === 'delete_typebot' ? 'DELETE' : 'POST', `/v1/typebots/${encodeURIComponent(args.typebotId)}${operation === 'delete_typebot' ? '' : `/${operation}`}`, operation === 'delete_typebot' ? undefined : {}));
  }
  async preview(id, body = {}) {
    const bot = (await this.api.get(id)).typebot; this.requireValid(bot);
    // Preview can execute code, webhooks and paid integrations. It is a mutating/effectful tool.
    const payload = { ...body, isStreamEnabled: false, textBubbleContentFormat: 'markdown' };
    validateRequest('/v1/typebots/{typebotId}/preview/startChat', 'post', payload);
    return this.api.request('POST', `/v1/typebots/${encodeURIComponent(id)}/preview/startChat`, payload);
  }
  continue(sessionId, message) {
    const body = { message: { type: 'text', text: message }, textBubbleContentFormat: 'markdown' };
    validateRequest('/v1/sessions/{sessionId}/continueChat', 'post', body);
    return this.api.request('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/continueChat`, body);
  }
}
