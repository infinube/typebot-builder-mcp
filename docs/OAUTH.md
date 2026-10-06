# OAuth/OIDC resource-server integration

This MCP validates tokens; it does not issue them. It implements RFC 9728 Protected
Resource Metadata and bearer challenges, with provider-neutral issuer, JWKS, audience
and scope configuration. The OAuth authorization server must support MCP client
registration/metadata, authorization code + PKCE and resource/audience-specific access
tokens. Configure that authorization server separately.

`MCP_AUTH_MODE=oauth` requires HTTPS OAUTH_ISSUER, OAUTH_JWKS_URL and OAUTH_RESOURCE_URL.
JWT access tokens must be RFC 9068 `typ: at+jwt`, signed with RS256, ES256 or EdDSA,
contain exp/sub/iat, match issuer and audience, and contain all required space-separated
scopes. Google ID tokens and opaque access tokens are not accepted by this implementation.
Key rotation uses a remote cached JWKS. Validation is performed for every MCP POST.

Discovery endpoints:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/mcp`

A 401 challenge identifies resource_metadata. Missing scopes return 403 and the required
scope. Host and Origin checks still apply. Configure the resource URL to the externally
visible canonical endpoint. Deploy through HTTPS; the server does not provide TLS itself.

To use Google Workspace identity, put a standards-compliant authorization layer in front
of the resource server, federate that layer with Google, and issue audience-bound access
tokens for this MCP. A reverse proxy with Google login may instead enforce human identity
and inject a separate backend M2M bearer. In that architecture, configure this private
backend in bearer mode and keep the public OAuth metadata/authorization flow upstream.
Do not reuse Typebot's own GOOGLE_AUTH_CLIENT_ID/SECRET. Google OAuth login alone is not
an MCP-compatible authorization server or a substitute for resource audience checks.

Automated tests verify signed JWT acceptance, wrong audience/expiry rejection, scopes
and metadata. They do not claim a live external authorization provider or ChatGPT OAuth
connection has been validated; record those deployment-specific checks separately.

References: [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
[RFC 9728](https://www.rfc-editor.org/rfc/rfc9728),
[RFC 9068](https://www.rfc-editor.org/rfc/rfc9068).
