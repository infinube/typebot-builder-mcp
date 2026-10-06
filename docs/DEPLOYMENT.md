# Docker and local deployment

## Docker

1. Obtain a Typebot API token in Builder account settings. Use an account with access only
   to the workspaces needed by the MCP.
2. Copy `.env.example` to `.env`; set API URL/token and generate a separate random MCP bearer.
3. Keep `.env` private (mode 0600). Set allowed hostnames for your proxy/backend.
4. Run `docker compose up -d --build`.
5. Check `docker compose ps` and `http://127.0.0.1:3000/health`.

The example binds only to loopback, runs as UID 1000, drops capabilities, makes the
container filesystem read-only, and mounts a persistent named snapshot volume.
Do not delete the snapshot volume during updates. Use a dedicated authenticated HTTPS
reverse proxy for remote access. The container joins only its Compose network by default;
add an existing Typebot private network when using service-name API addressing.

For production image provenance, build from a reviewed commit and pin the resulting
image digest in your own deployment. The example Dockerfile uses the maintained Node 22
base tag; organizations can replace it with an approved digest. Back up the snapshot
volume and configuration separately. Health indicates process readiness, not Typebot
API reachability; run list/get probes for upstream connectivity.

## Local and STDIO

```sh
npm ci --ignore-scripts
npm run check
MCP_TRANSPORT=stdio node --env-file=.env src/main.js
```

A client configuration uses command `node`, arguments containing the absolute path to
`src/main.js`, and environment containing `MCP_TRANSPORT=stdio`, `TYPEBOT_API_URL`,
`TYPEBOT_API_TOKEN`, and a writable `SNAPSHOT_DIR`. The client owns the subprocess.
All diagnostic output uses stderr; stdout carries MCP only. HTTP auth does not apply
to STDIO. Secret environment values are still sensitive to the local process owner.

## Streamable HTTP

The default endpoint is `POST /mcp`. Use the SDK Streamable HTTP client, not the old
HTTP+SSE transport. The server is stateless and uses JSON replies; GET/DELETE return
405. Send the MCP Accept/protocol headers required by your client SDK. Authenticate
every POST with `Authorization: Bearer ...` in bearer mode. Host/Origin allowlists are
independent of authentication and must match proxy forwarding behavior.

SIGTERM/SIGINT close listeners/transports; HTTP shutdown allows 15 seconds to drain.
Do not interrupt a consequential tool then assume it did not execute: inspect the bot
and snapshots before retrying. Deploy one instance per write workload to preserve
process-local mutation serialization.
