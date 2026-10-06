# Typebot Builder MCP

> Safe, AI-assisted Typebot engineering through the Model Context Protocol.

**Typebot Builder MCP** is a community MCP server focused on creating, inspecting, editing, validating, testing, and operating Typebot chatbots with AI assistants such as ChatGPT and other MCP-compatible clients.

The project is intentionally more than a thin REST API wrapper. Its goal is to provide an AI-friendly engineering layer around Typebot, including schema-aware operations, flow integrity checks, safety snapshots, diffs, rollback support, and controlled publication lifecycle operations.

> **Project status:** early development. The public API and tool contract are being defined and may change before the first stable release.

## Goals

- Make Typebot creation and maintenance efficient from AI assistants.
- Support self-hosted and hosted Typebot installations through the Typebot API.
- Prefer safe, semantic operations over unrestricted JSON replacement.
- Validate Typebot structure and graph integrity before consequential changes.
- Protect mutations with optional safety snapshots and clear diffs.
- Keep Typebot as the runtime source of truth.
- Avoid making external storage, GitHub, n8n, or any other third-party service a runtime dependency.
- Work well with ChatGPT Custom Apps and other standards-compliant MCP clients.

## Planned highlights

- **Streamable HTTP by default**, with optional **STDIO** transport.
- Typebot discovery, creation, inspection, editing, publishing, and unpublishing.
- Semantic bot-building tools and a controlled raw/advanced escape hatch.
- Validation and graph integrity checks.
- Preview and smoke-test support where Typebot APIs allow it.
- Safety snapshots before/after mutations.
- Snapshot backends:
  - local filesystem;
  - generic HTTP webhook;
  - both;
  - disabled.
- Optional snapshot webhook delivery to systems such as n8n, custom APIs, object-storage gateways, or any other HTTP receiver.
- Snapshot hashes, metadata, and diff/rollback workflows.
- HTTP authentication modes suitable for local, M2M, and OAuth/OIDC deployments.
- Docker-first deployment while keeping local/CLI use possible.
- English documentation and examples.

## Architecture principles

```text
MCP client
   |
   |  MCP authentication
   v
Typebot Builder MCP
   |
   |  Typebot API token
   v
Typebot Builder API
```

Safety snapshots are auxiliary management data, not a second source of truth:

```text
Typebot DB
   = operational source of truth

Typebot Builder MCP
   = management / engineering plane

Snapshot sink
   = optional safety backup and rollback material
```

A snapshot failure must never silently produce an unsafe mutation. Exact failure semantics are defined in the MVP specification.

## Snapshot design

Snapshots are intentionally **not presented as a full version-control system**. They are safety backups associated with bot mutations.

Supported modes are planned as:

```text
filesystem
webhook
both
off
```

A generic webhook keeps remote storage provider-neutral. A deployment can send snapshot events to n8n, another automation platform, a custom API, or a storage service without making any of them part of the MCP core.

## Transport

Planned transport configuration:

```text
MCP_TRANSPORT=streamable-http   # default
MCP_TRANSPORT=stdio
```

STDIO is intended for local clients and development. Incoming HTTP authentication applies to Streamable HTTP deployments.

## Authentication

The project will distinguish three trust boundaries:

1. **MCP client -> Typebot Builder MCP**
2. **Typebot Builder MCP -> Typebot**
3. **Typebot Builder MCP -> optional snapshot webhook**

Credentials for these boundaries must not be reused automatically.

Planned incoming HTTP authentication modes include:

```text
none
bearer
oauth
```

OAuth support should follow MCP/OAuth resource-server conventions and remain provider-neutral. Google-based deployments should use standards-compliant OAuth/OIDC infrastructure rather than scraping or automatically reusing Typebot's own Google OAuth client secrets.

## Why another Typebot MCP?

Existing community projects proved that exposing Typebot operations through MCP is useful. Typebot Builder MCP takes a different direction: it is focused specifically on **building and maintaining production-quality Typebots safely with AI**, not only mapping a small set of REST endpoints to MCP tools.

The intended differentiators are:

- deeper bot-building operations;
- semantic editing;
- validation and graph checks;
- change diffs;
- safety snapshots and rollback;
- testing and lifecycle controls;
- ChatGPT-oriented documentation;
- self-hosted Typebot support;
- Streamable HTTP and STDIO deployment options;
- explicit authentication boundaries.

## Documentation

Planned documentation includes:

- architecture and security model;
- configuration reference;
- Docker deployment;
- Typebot API token setup;
- snapshot filesystem and webhook modes;
- OAuth/OIDC deployment patterns;
- ChatGPT Custom App connection guide;
- MCP tool reference;
- examples and reusable Typebot-building patterns.

See [docs/MVP-SPEC.md](docs/MVP-SPEC.md) for the initial engineering specification.

## Community projects acknowledged

This project is an independent implementation, **not a fork**, unless that decision changes explicitly during development.

The following community projects helped demonstrate and explore the Typebot + MCP use case and are acknowledged as prior art/reference implementations:

- [osdeibi/MCP-typebot](https://github.com/osdeibi/MCP-typebot)
- [hithereiamaliff/typebot-mcp](https://github.com/hithereiamaliff/typebot-mcp)

The implementation should be written against Typebot's public API/OpenAPI contracts. If code is ever copied or adapted from another project, its applicable license and attribution requirements must be preserved.

## Typebot trademark / affiliation

Typebot Builder MCP is a community project and is not affiliated with, maintained by, or endorsed by Typebot.

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Credits

Project initiated by **Ing. Pablo A Pico** of [IngeWeb](https://www.ingeweb.co/).

Contributions and technical discussion are welcome once the initial implementation lands.
