# Typebot Builder MCP

Safe, AI-assisted Typebot engineering through the Model Context Protocol.

Typebot Builder MCP is an independent community implementation for discovering, creating,
editing, validating, snapshotting, restoring and publishing Typebot chatbots. Typebot remains
the source of truth; no SQL, Redis, GitHub or n8n runtime dependency is required.

**Status:** v0.1.0, initial implementation. The API contract targets Typebot 3.19.0.
Review the verification report and limitations before production adoption. No stable release
or verified ChatGPT connection is implied by the existence of this repository.

## Capabilities

- Default stateless Streamable HTTP; optional STDIO with the same tools.
- Independent incoming bearer auth; OAuth resource-server validation of audience-bound
  RFC 9068 JWT access tokens; explicitly configurable none mode for isolated environments.
- Semantic groups/blocks/edges/variables/settings editing with current-hash preconditions.
- Official contract and local graph validation, semantic diffs and explicit uncertainty.
- Before/after filesystem snapshots, generic webhook delivery, both or off.
- Verified snapshot inspection, diff and draft rollback.
- Publish/unpublish with validation; published-state inspection.
- Builder API preview conversations and smoke tests, classified as effectful.
- Docker-first non-root runtime, persistent snapshots and health endpoint.

No unrestricted full-bot overwrite tool is exposed. Preview can execute integrations.
The server is not a full VCS, a Typebot runtime replacement or a browser-testing framework.

## Quick start

```sh
cp .env.example .env
# Set separate TYPEBOT_API_TOKEN and MCP_BEARER_TOKEN; use a Builder /api base URL.
docker compose up -d --build
```

The example binds to loopback. Configure authenticated HTTPS before remote use.
For local execution: `npm ci --ignore-scripts`, `npm run check`, then
`node --env-file=.env src/main.js`. Set `MCP_TRANSPORT=stdio` for a spawning client.

## Documentation

- [MVP specification](docs/MVP-SPEC.md)
- [Architecture and security](docs/ARCHITECTURE.md)
- [Configuration](docs/CONFIGURATION.md)
- [Docker, STDIO and HTTP](docs/DEPLOYMENT.md)
- [Tool reference](docs/TOOLS.md)
- [Snapshots and webhook contract](docs/SNAPSHOTS.md)
- [OAuth/OIDC integration](docs/OAUTH.md)
- [ChatGPT Custom App procedure and verification status](docs/CHATGPT.md)
- [Typebot compatibility](docs/COMPATIBILITY.md)
- [Examples](docs/EXAMPLES.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Important limits

Typebot permits a five-second timestamp conflict margin; hash checks narrow external
editor races but cannot provide strict compare-and-swap. Run one writer instance and
avoid simultaneous editor changes. Local validation cannot verify runtime integrations.
Snapshots contain sensitive bot payloads and require private storage. Webhook delivery
has no durable retry/outbox. OAuth is a resource server, not a Google identity platform.
See the architecture document for exact failure and security behavior.

## Prior art

These community projects demonstrated the Typebot + MCP use case:

- [osdeibi/MCP-typebot](https://github.com/osdeibi/MCP-typebot)
- [hithereiamaliff/typebot-mcp](https://github.com/hithereiamaliff/typebot-mcp)

This project is not a fork and copies no implementation code from those projects.
Official Typebot OpenAPI contract data is preserved with its upstream notice/license in
[vendor](vendor/README.md). Original implementation code is Apache-2.0; see [LICENSE](LICENSE).

Typebot Builder MCP is not affiliated with, maintained by or endorsed by Typebot.

**Ing. Pablo A Pico — IngeWeb — https://www.ingeweb.co/**
