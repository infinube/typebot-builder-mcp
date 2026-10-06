# MVP Specification

## Project identity

Repository: `infinube/typebot-builder-mcp`

Product name: **Typebot Builder MCP**

Purpose: provide a safe, AI-oriented MCP engineering layer for creating, inspecting, editing, validating, testing, snapshotting, restoring, publishing, and maintaining Typebot chatbots.

This project is not intended to be only a direct one-tool-per-endpoint wrapper around the Typebot REST API.

## Core design decisions

### Runtime source of truth

Typebot remains the operational source of truth.

The MCP must not require its own database to mirror Typebot state.

### Transport

Supported transports:

- `streamable-http` — default
- `stdio` — optional

The MCP tool surface must be transport-independent.

### Incoming authentication

Initial HTTP auth modes:

- `none`
- `bearer`
- `oauth`

OAuth/OIDC support must be provider-neutral and aligned with MCP resource-server conventions.

The MCP must not automatically read or reuse Typebot's own Google OAuth client secret.

Google-based deployments should use a separate OAuth client / standards-compliant issuer configuration when needed.

### Typebot authentication

Separate credentials:

- `TYPEBOT_API_URL`
- `TYPEBOT_API_TOKEN`
- optional default `TYPEBOT_WORKSPACE_ID`

These credentials authenticate the MCP to Typebot and are not MCP client credentials.

### Snapshot sinks

Supported modes:

- `filesystem` — default
- `webhook`
- `both`
- `off`

Snapshots are safety backups, not a full VCS.

The webhook implementation must be generic HTTP, not n8n-specific.

### Snapshot event model

For mutating operations, the default safe sequence is:

1. fetch current bot;
2. validate current state when applicable;
3. create a `before` snapshot;
4. perform the mutation;
5. fetch the resulting bot;
6. validate resulting state;
7. create an `after` snapshot;
8. compute and return a useful change summary/diff.

A snapshot record/event should include at minimum:

- event type;
- phase: `before` or `after`;
- operation;
- Typebot ID;
- workspace ID when available;
- timestamp;
- normalized content hash;
- Typebot payload;
- MCP/server version metadata when useful.

Deduplication by normalized SHA-256 should be supported or at least designed for.

### Snapshot failure behavior

Support a configurable policy:

- `abort`
- `warn`

Safe default for filesystem mode should be `abort` for a failed required pre-mutation snapshot.

When `both` is used, a valid local safety snapshot may allow a remote webhook failure to degrade to warning if configured.

No snapshot failure may be silently ignored.

### Storage abstraction

Implement a small internal interface such as:

```ts
interface SnapshotStore {
  save(snapshot: Snapshot): Promise<SnapshotReceipt>;
  list(typebotId: string): Promise<SnapshotMetadata[]>;
  read(typebotId: string, snapshotId: string): Promise<Snapshot>;
}
```

Initial implementations:

- filesystem;
- webhook delivery adapter;
- composite/both.

Do not add GitHub, SQL, Redis, S3, or n8n as hard dependencies for MVP.

## Tool design principles

Tools should be:

- AI-friendly;
- explicit about mutation;
- schema-validated;
- safe by default;
- reasonably granular;
- semantically meaningful;
- transport-independent.

Avoid requiring an AI to replace a complete Typebot JSON document for routine edits.

A controlled advanced/raw operation may exist, but it must be clearly separated from normal semantic tooling.

## Proposed v1 tool groups

The Work implementation may adjust exact names after inspecting the current Typebot API/OpenAPI, but the following capabilities are expected.

### Discovery / read-only

- list workspaces if supported;
- list folders if supported;
- list Typebots;
- get Typebot;
- inspect published state;
- find groups/blocks;
- inspect flow graph;
- find variable usage;
- get results / stats where supported.

### Construction and semantic editing

- create Typebot;
- clone Typebot when feasible;
- update bot metadata;
- add group;
- update group;
- remove group safely;
- add block;
- update block;
- remove block safely;
- connect blocks;
- disconnect blocks;
- manage variables;
- update settings where supported.

Exact block schemas must be derived from Typebot's current supported contracts rather than guessed.

### Validation

Provide a validation surface that can identify at least:

- malformed structures detectable locally;
- dangling references/edges;
- missing referenced groups/blocks;
- duplicate IDs where relevant;
- orphaned flow elements where detectable;
- invalid semantic mutation targets;
- unsupported or unsafe raw modifications.

Validation should clearly distinguish:

- errors that block a mutation/publication;
- warnings;
- informational findings.

### Diff

Return meaningful summaries after mutation.

Prefer semantic summaries where possible rather than only raw JSON diffs.

Examples:

- group added;
- block added/removed;
- edge changed;
- variable changed;
- settings changed.

Raw JSON diff may also be included optionally.

### Snapshots and rollback

Expected tools/capabilities:

- list snapshots;
- inspect snapshot metadata;
- diff current bot against snapshot;
- restore snapshot.

Restore must:

1. snapshot the current state first;
2. validate the target snapshot;
3. restore through the supported Typebot API;
4. read back;
5. validate;
6. report result/diff.

### Preview / tests

Where Typebot's APIs allow:

- start preview/chat;
- continue preview/chat;
- run simple smoke test;
- expose enough results for an AI to verify expected path/output.

Do not invent browser automation as the primary testing mechanism.

### Lifecycle

- publish;
- unpublish;
- inspect published version/state.

Publication should support preconditions such as successful validation.

### Destructive operations

- delete Typebot;
- destructive raw overwrite if one exists;
- snapshot restore over current content.

These tools must be explicitly described as consequential and should be easy for external policy gateways to classify.

## Authentication boundaries

Three credentials/trust boundaries must remain separate:

```text
MCP client -> MCP
MCP -> Typebot
MCP -> snapshot webhook
```

Do not reuse tokens across boundaries.

### Bearer mode

Provide a simple incoming Bearer mode for M2M and small deployments.

### OAuth/OIDC mode

Design OAuth support as standards-compliant resource-server validation and metadata, provider-neutral.

Do not embed a large custom identity platform into the MCP merely to provide Google login.

Document Google scenarios via standards-compliant OAuth/OIDC providers or reverse proxies / identity gateways.

## Deployment

MVP should be Docker-first.

Expected artifacts:

- Dockerfile;
- docker-compose example;
- `.env.example`;
- health endpoint for HTTP deployment;
- documented persistent snapshot mount;
- documented port/path;
- non-root container if practical;
- clean shutdown.

The project must also support local STDIO execution.

## Security requirements

- never log secrets;
- redact Authorization headers;
- validate outbound snapshot webhook URL/config reasonably;
- document SSRF implications of a configurable webhook URL;
- support webhook Bearer authentication or a generic configurable auth header mechanism;
- use explicit request timeouts;
- avoid accepting arbitrary filesystem paths from MCP tool input;
- use a configured snapshot root;
- normalize and constrain filesystem paths;
- return bounded error information;
- no automatic discovery/scraping of Typebot environment secrets.

## Testing requirements

At minimum:

### Unit tests

- configuration parsing;
- auth mode selection;
- snapshot hash/normalization;
- filesystem snapshot store;
- webhook snapshot delivery;
- snapshot failure policies;
- graph/structural validation helpers;
- semantic mutation helpers;
- secret redaction.

### Integration tests

Use mocked Typebot API contracts for deterministic CI.

Test:

- read operations;
- mutation sequence;
- before/after snapshots;
- failed pre-snapshot abort;
- warning behavior;
- validation failure;
- publish preconditions;
- restore workflow;
- bearer authentication;
- unauthenticated rejection;
- HTTP and STDIO startup.

### Live validation

Against a non-production Typebot instance/workspace:

- list/get;
- create temporary test bot;
- semantic edit;
- validate;
- snapshot;
- preview/smoke test where supported;
- publish/unpublish;
- rollback;
- delete temporary bot;
- verify no production bot was modified.

## Documentation deliverables

All public documentation should be in English.

Required:

- README;
- architecture/security document;
- configuration reference;
- tool reference;
- Docker/self-hosted installation;
- STDIO usage;
- Streamable HTTP usage;
- snapshot modes;
- generic webhook contract;
- OAuth/OIDC guidance;
- ChatGPT Custom App guide;
- contributing guide;
- license;
- acknowledgement/prior-art section.

## Attribution policy

This should be an independent implementation, not a fork, unless actual development changes that decision.

The README should acknowledge:

- `osdeibi/MCP-typebot`;
- `hithereiamaliff/typebot-mcp`;

as prior art/reference implementations.

If any code is copied or adapted, preserve license notices and required attribution exactly.

## Project credit

Include a small credit in the README:

**Ing. Pablo A Pico — IngeWeb — https://www.ingeweb.co/**

Do not over-brand the project or make it look proprietary.

## Out of scope for MVP

- full Git-style version control;
- branches/merges of bot definitions;
- GitHub as runtime snapshot storage;
- SQL/Redis requirement;
- n8n-specific core integration;
- Typebot UI/browser automation as the primary control plane;
- embedded Google identity broker;
- copying Typebot internal source code unnecessarily;
- replacing Typebot as source of truth.

## Definition of done

MVP is done when:

1. repository builds cleanly;
2. tests pass;
3. Docker deployment works;
4. Streamable HTTP is default;
5. STDIO works;
6. incoming Bearer auth works;
7. OAuth/OIDC architecture is implemented to the degree specified by the Work after standards review and is documented accurately;
8. a real self-hosted Typebot test workspace can be safely inspected and modified;
9. semantic edit + validation + before/after snapshots work;
10. filesystem snapshot mode works;
11. generic webhook snapshot mode works;
12. rollback works;
13. publish/unpublish works with validation;
14. README and required docs are complete;
15. a ChatGPT Custom App connection procedure is documented and tested when environment permissions allow;
16. the Work returns a precise implementation and verification report.
