# Verification record

This record distinguishes verified behavior from connection procedures that still need
an actual client/identity session. It is not a release certification.

## Automated checks

`npm run check` passes all 20 tests, covering configuration, official-contract and graph
validation, semantic edits, optimistic concurrency, redaction, snapshot hashes/path
constraints, before/after persistence, webhook delivery and abort/warn policies,
restore, publication prerequisites, Bearer rejection/acceptance, Streamable HTTP,
signed OAuth access-token claims and STDIO SDK startup. The webhook receiver and
Typebot API used here are deterministic test servers. OAuth tests use signed JWTs
with an injected verifier; an external authorization provider has not been tested.

`npm audit --omit=dev` reported zero vulnerabilities for the committed lockfile.
The initial GitHub Actions workflow passed on implementation commit
`6ba1aef750a193aeb6a9cf078e8439447ccee728`. The v0.1.1 guidance/Text-normalization update passed CI, and the v0.1.2 conversation-inspection PR head also passed all 20 tests and the Docker build:
https://github.com/infinube/typebot-builder-mcp/actions/runs/37419513355.

## Isolated live verification

Against self-hosted Typebot 3.19.0 (bot schema 6.1), the Docker service passed health
and authenticated SDK calls. Temporary test bots exercised workspace/folder/bot
reads, creation, graph inspection, group/block/variable edits, connections,
validation, preview start/continue and smoke testing, results, statistics after
publication, published-state inspection, unpublish, a controlled further edit,
snapshot restoration, cloning and deletion. All temporary bots were removed.
An inventory and content-hash comparison confirmed existing bots were unchanged.

A service restart preserved 19 snapshots from the test sequence; restoration after
restart reproduced the original normalized content hash. An internal gateway probe initially discovered all 38 v0.1.0 tools and executed a read-only capability call. A real ChatGPT Custom App connection subsequently authenticated successfully through the deployment identity layer and exercised read/write operations with policy audit. LOG and NOTIFY paths were observed, including delivered default and critical notifications. After the v0.1.1 deployment, the backend advertised 39 tools and a live temporary bot verified semantic Text shorthand normalization to native `richText`, preview rendering and cleanup. The v0.1.2 deployment advertises 43 tools. A production smoke test against an existing demo result verified `get_result`, `get_result_transcript`, `get_result_logs` and bounded `find_results` without printing conversation content; the known result was retrieved, its transcript returned five items, logs returned an empty valid list and bounded search returned one match. The existing `get_results` tool was also called through the real ChatGPT Custom App path and Action Gateway recorded LOG requested/completed events while capturing only `typebotId`, not customer variables or answer content. After Refresh Tools, the connected ChatGPT Custom App inventory was observed with all 43 v0.1.2 tools.

## Remaining verification

- Run compatibility tests before claiming support for Typebot versions other than
  the tested 3.19.0 baseline.

Typebot's update endpoint is not strict compare-and-swap: its timestamp conflict
check has a five-second margin. The MCP uses expected hashes, a per-process bot lock
and a fresh pre-write read, but a concurrent external writer can still race the API.
Use one MCP replica and avoid concurrent Builder editing during consequential work.
