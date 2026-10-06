import { timingSafeEqual, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
const digest = value => createHash('sha256').update(value).digest();
export function authMiddleware(config, verifier) {
  const jwks = config.authMode === 'oauth' ? createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: config.timeoutMs }) : undefined;
  return async (req, res, next) => {
    if (config.authMode === 'none') return next();
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
    const reject = (status = 401, error = 'invalid_token') => {
      const metadata = config.authMode === 'oauth' ? `, resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp', config.resource).href}"` : '';
      res.set('WWW-Authenticate', `Bearer error="${error}"${metadata}${status === 403 ? `, scope="${config.scopes.join(' ')}"` : ''}`);
      return res.status(status).json({ error });
    };
    if (!match) return reject();
    if (config.authMode === 'bearer') return timingSafeEqual(digest(match[1]), digest(config.bearer)) ? next() : reject();
    try {
      const result = verifier ? await verifier(match[1]) : await jwtVerify(match[1], jwks, { issuer: config.issuer, audience: config.resource, algorithms: ['RS256', 'ES256', 'EdDSA'], typ: 'at+jwt', requiredClaims: ['exp', 'sub', 'iat'] });
      const scopes = (result.payload.scope ?? '').split(' ');
      if (!config.scopes.every(s => scopes.includes(s))) return reject(403, 'insufficient_scope');
      req.auth = { subject: result.payload.sub }; return next();
    } catch { return reject(); }
  };
}
export function resourceMetadata(config) {
  return { resource: config.resource, authorization_servers: [config.issuer], scopes_supported: config.scopes, bearer_methods_supported: ['header'] };
}
