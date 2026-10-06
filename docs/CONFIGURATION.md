# Configuration

Use `.env.example` as the complete starting point. Environment values are never returned
by the capabilities tool. Node does not automatically load `.env`: use Compose `env_file`
or `node --env-file=.env src/main.js`.

| Variable | Default / requirement |
|---|---|
| TYPEBOT_API_URL | Required Builder API base, including `/api`; no query, fragment or URL credentials |
| TYPEBOT_API_TOKEN / TYPEBOT_API_TOKEN_FILE | Required, exactly one source |
| TYPEBOT_WORKSPACE_ID | Optional default for list/create operations |
| MCP_TRANSPORT | `streamable-http` or `stdio` |
| MCP_AUTH_MODE | `bearer`; alternatives `none`, `oauth` |
| MCP_BEARER_TOKEN / MCP_BEARER_TOKEN_FILE | Required for HTTP bearer; at least 32 random characters |
| MCP_HOST | `127.0.0.1`; Docker image sets `0.0.0.0` |
| MCP_PORT | `3000` |
| MCP_ALLOWED_HOSTS | Comma-separated hostnames; `localhost,127.0.0.1` |
| MCP_ALLOWED_ORIGINS | Comma-separated exact origins; empty rejects browser Origin |
| SNAPSHOT_MODE | `filesystem`, `webhook`, `both`, `off`; default filesystem |
| SNAPSHOT_DIR | `/data/snapshots` |
| SNAPSHOT_FAILURE_POLICY | `abort` or `warn`; filesystem default abort |
| SNAPSHOT_WEBHOOK_URL | Required for webhook/both |
| SNAPSHOT_WEBHOOK_TOKEN / SNAPSHOT_WEBHOOK_TOKEN_FILE | Independent optional receiver bearer |
| SNAPSHOT_WEBHOOK_FAILURE_POLICY | `abort` or `warn`; default abort |
| SNAPSHOT_WEBHOOK_ALLOW_PRIVATE | `false`; `true` permits configured internal HTTP/HTTPS receiver |
| REQUEST_TIMEOUT_MS | 15000; 100–120000 |
| MAX_RESPONSE_BYTES | 8388608; 1024–33554432; response, tool result and snapshot read limit |
| OAUTH_ISSUER | Required HTTPS issuer in oauth mode |
| OAUTH_JWKS_URL | Required HTTPS JWT verification key set |
| OAUTH_RESOURCE_URL | Required HTTPS canonical resource URL, usually full `/mcp` URL |
| OAUTH_REQUIRED_SCOPES | Space-separated; `typebot:manage` |

There is no separate Viewer credential or database configuration. Typebot 3.19.0 exposes
preview and continue-chat through the Builder API, which proxies the chat engine.
Tokens must differ across the three boundaries. Secret files must be readable by UID 1000
in Docker. Avoid placing credentials in shell history or public config/compose files.
