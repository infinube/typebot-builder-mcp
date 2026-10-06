import { readFileSync } from 'node:fs';

export const VERSION = '0.1.2';
export function loadConfig(env = process.env) {
  const oneOf = (key, values, fallback) => {
    const value = env[key] ?? fallback;
    if (!values.includes(value)) throw new Error(`Invalid ${key}`);
    return value;
  };
  const secret = (key) => {
    if (env[key] && env[`${key}_FILE`]) throw new Error(`Configure only one ${key} source`);
    return env[`${key}_FILE`] ? readFileSync(env[`${key}_FILE`], 'utf8').trim() : env[key];
  };
  const url = (key, required = false) => {
    if (!env[key]) { if (required) throw new Error(`${key} is required`); return undefined; }
    const u = new URL(env[key]);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash)
      throw new Error(`Invalid ${key}`);
    return u.href.replace(/\/$/, '');
  };
  const integer = (key, fallback, min, max) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const c = {
    transport: oneOf('MCP_TRANSPORT', ['streamable-http', 'stdio'], 'streamable-http'),
    authMode: oneOf('MCP_AUTH_MODE', ['none', 'bearer', 'oauth'], 'bearer'),
    bearer: secret('MCP_BEARER_TOKEN'), apiToken: secret('TYPEBOT_API_TOKEN'),
    apiUrl: url('TYPEBOT_API_URL', true), workspaceId: env.TYPEBOT_WORKSPACE_ID,
    host: env.MCP_HOST ?? '127.0.0.1', port: integer('MCP_PORT', 3000, 0, 65535),
    origins: (env.MCP_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    hosts: (env.MCP_ALLOWED_HOSTS ?? 'localhost,127.0.0.1').split(',').filter(Boolean),
    snapshotMode: oneOf('SNAPSHOT_MODE', ['filesystem', 'webhook', 'both', 'off'], 'filesystem'),
    snapshotDir: env.SNAPSHOT_DIR ?? '/data/snapshots',
    snapshotFailure: oneOf('SNAPSHOT_FAILURE_POLICY', ['abort', 'warn'], 'abort'),
    webhookFailure: oneOf('SNAPSHOT_WEBHOOK_FAILURE_POLICY', ['abort', 'warn'], 'abort'),
    webhookUrl: url('SNAPSHOT_WEBHOOK_URL'), webhookToken: secret('SNAPSHOT_WEBHOOK_TOKEN'),
    allowPrivateWebhook: env.SNAPSHOT_WEBHOOK_ALLOW_PRIVATE === 'true',
    timeoutMs: integer('REQUEST_TIMEOUT_MS', 15000, 100, 120000),
    maxBytes: integer('MAX_RESPONSE_BYTES', 8388608, 1024, 33554432),
    issuer: url('OAUTH_ISSUER'), jwksUrl: url('OAUTH_JWKS_URL'), resource: url('OAUTH_RESOURCE_URL'),
    scopes: (env.OAUTH_REQUIRED_SCOPES ?? 'typebot:manage').split(' ').filter(Boolean),
  };
  if (!c.apiToken) throw new Error('TYPEBOT_API_TOKEN is required');
  if (c.transport === 'streamable-http' && c.authMode === 'bearer' && (!c.bearer || c.bearer.length < 32))
    throw new Error('MCP_BEARER_TOKEN must contain at least 32 characters');
  if (c.authMode === 'oauth' && (!c.issuer || !c.jwksUrl || !c.resource)) throw new Error('OAuth issuer, JWKS and resource are required');
  if (c.authMode === 'oauth' && [c.issuer, c.jwksUrl, c.resource].some(x => !x.startsWith('https://')))
    throw new Error('OAuth URLs must use HTTPS');
  if (['webhook', 'both'].includes(c.snapshotMode) && !c.webhookUrl) throw new Error('SNAPSHOT_WEBHOOK_URL is required');
  const credentials = [c.bearer, c.apiToken, c.webhookToken].filter(Boolean);
  if (new Set(credentials).size !== credentials.length) throw new Error('Credentials must differ across trust boundaries');
  return Object.freeze(c);
}
