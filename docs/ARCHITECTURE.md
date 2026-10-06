# Architecture and safety model

The server is an independent implementation using Typebot's public Builder API.
Typebot is the source of truth. No database, Redis, GitHub or n8n is required at runtime.
Node.js 22+, the official MCP SDK, JSON Schema 2020-12 validation, and provider-neutral
JWT validation provide the runtime. Both transports share the same service and tools.

## Boundaries

1. Incoming MCP: none, independent M2M bearer, or OAuth resource-server JWT validation.
2. Outgoing Typebot: independent Typebot API token, attached only to the configured API URL.
3. Snapshot webhook: optional independent receiver bearer, attached only to its configured URL.

Credential equality across boundaries is rejected. Tokens can be loaded from files.
There is no credential discovery, Google client-secret reuse or embedded identity provider.
STDIO inherits the spawning process's environment and does not use HTTP auth.

## Editing sequence

Get the bot and retain `contentHash`. Mutations require that hash. A process-local
per-bot lock serializes mutations. The server retrieves the draft, verifies the hash,
validates current and proposed definitions, saves a before snapshot, reads again to
check concurrency, writes the supported PATCH with `updatedAt` and `overwrite:false`,
reads back, validates, saves the after snapshot and reports a semantic diff.

Read-back is authoritative: Typebot may sanitize data. Compare the returned hash/diff
with the intended result. A successful REST write alone is not proof of intended content.
Changes never publish automatically. New bot creation has an after snapshot only;
there is no pre-existing bot to back up. Delete preserves a before snapshot only.
Publish/unpublish snapshots also retain observed published state.

The MCP cannot provide strict external compare-and-swap: Typebot allows a five-second
margin on `updatedAt`. Avoid simultaneous editor writes and run one MCP replica for
a bot workload. A last-moment external edit can still race the PATCH. Typebot API
permissions remain the final write authorization. MCP annotations are hints, not RBAC.

A failed required before snapshot prevents the write. A failed after snapshot or
read-back is reported as an already-applied mutation with warnings/verification state.
Never blindly retry uncertain writes. Retrieve and inspect current state first.

## Local validation

Official Typebot 3.19.0 OpenAPI contract data supplies block, group, variable, settings
and request schemas. Unknown keys in declared schema objects are rejected locally
rather than silently discarded by Typebot. IDs, edge endpoints, source outgoing links,
variable IDs and local group references are checked. Duplicate IDs/names are errors.
Empty and statically unreachable groups are warnings. Dynamic jumps and execution
paths, code correctness, paid integration behavior, credential validity, and external
services cannot be verified by local validation.

Removal cleans attached edges; remaining invalid references prevent the write.
Variable removal rejects references. Exact template references are rewritten on rename.
Block patches cannot replace identity, block type or the top-level connection.
Arrays in a patch replace atomically. No unrestricted bot overwrite tool is exposed.

## HTTP security

Stateless Streamable HTTP uses JSON responses at `/mcp`; there is no server session
store, legacy SSE endpoint or browser automation. All MCP requests require configured
HTTP auth. `/health` and OAuth metadata are public but Host/Origin checked. Configure
explicit allowed hosts and origins; non-browser clients ordinarily omit Origin.
Bind to localhost or a private network and terminate HTTPS at a trusted proxy.
No request headers, tool arguments or bot contents are logged by the application.
Errors suppress Typebot response bodies and redact configured credentials.

Snapshots and bot definitions may contain customer data, URLs or embedded integration
secrets. Protect snapshot storage and restrict access to get/inspect/results tools.
The MCP does not add per-user Typebot accounts: a deployment token determines the
accessible workspaces. Use upstream RBAC or separate instances/tokens for isolation.

## Preview effects

Preview and smoke-test tools are mutating/effectful even when draft content is unchanged:
they may execute code, webhooks, email, database writes or paid model calls. These tools
must not be granted merely because a caller can read a bot. Smoke tests are intentionally
small API conversations, not a general browser-testing framework.

## Webhook security

Webhook configuration is administrator-controlled; tools cannot select URLs or paths.
Public HTTPS is required by default, private IPs are rejected after DNS lookup, redirects
are disabled and requests have bounded timeouts. For an internal receiver, explicitly
allow private delivery. Enforce outbound network policy: DNS prechecks are not a complete
DNS-rebinding defense, and admin configuration must be trusted. Keep payload receivers
private/authenticated and avoid logging sensitive bot contents.
