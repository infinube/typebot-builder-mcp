import { boundedJson } from './utils.js';
import { validateRequest } from './contracts.js';
export class TypebotApi {
  constructor(config) { this.config = config; }
  async request(method, route, body, query) {
    const url = new URL(`${this.config.apiUrl}${route}`);
    for (const [key, val] of Object.entries(query ?? {})) if (val !== undefined && val !== null) url.searchParams.set(key, String(val));
    let response;
    try { response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs),
      headers: { Authorization: `Bearer ${this.config.apiToken}`, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new Error('Typebot request failed or timed out; inspect current state before retrying a mutation'); }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Typebot API returned HTTP ${response.status}`); }
    return boundedJson(response, this.config.maxBytes);
  }
  get(id) { return this.request('GET', `/v1/typebots/${encodeURIComponent(id)}`); }
  published(id) { return this.request('GET', `/v1/typebots/${encodeURIComponent(id)}/publishedTypebot`); }
  update(id, body) { validateRequest('/v1/typebots/{typebotId}', 'patch', body); return this.request('PATCH', `/v1/typebots/${encodeURIComponent(id)}`, body); }
  create(body) { validateRequest('/v1/typebots', 'post', body); return this.request('POST', '/v1/typebots', body); }
}
