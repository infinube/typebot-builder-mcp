# Verification record

This record distinguishes verified behavior from connection procedures that still need
an actual client/identity session. It is not a release certification.

## Automated checks

`npm run check` passes all 18 tests, covering configuration, official-contract and graph
validation, semantic edits, optimistic concurrency, redaction, snapshot hashes/path
constraints, before/after persistence, webhook delivery and abort/warn policies,
restore, publication prerequisites, Bearer rejection/acceptance, Streamable HTTP,
signed OAuth access-token claims and STDIO SDK startup. The webhook receiver and
Typebot API used here are deterministic test servers. OAuth tests use signed JWTs
with an injected verifier; an external authorization provider has not been tested.

`npm audit --omit=dev` reported zero vulnerabilities for the committed lockfile.
The GitHub Actions workflow is supplied but has not yet run for this implementation.

## Isolated live verification

Against self-hosted Typebot 3.19.0 (bot schema 6.1), the Docker service passed health
and authenticated SDK calls. Temporary test bots exercised workspace/folder/bot
reads, creation, graph inspection, group/block/variable edits, connections,
validation, preview start/continue and smoke testing, results, statistics after
publication, published-state inspection, unpublish, a controlled further edit,
snapshot restoration, cloning and deletion. All temporary bots were removed.
An inventory and content-hash comparison confirmed existing bots were unchanged.

A service restart preserved 19 snapshots from the test sequence; restoration after
restart reproduced the original normalized content hash. An internal gateway probe
discovered all 38 tools and executed a read-only capability call. An anonymous public
probe was denied. These checks do not establish a successful ChatGPT Custom App login.

## Remaining verification

- Publish the implementation and run GitHub Actions.
- Connect a real ChatGPT Custom App through the intended OAuth/identity layer, test
  permitted and denied identities, and verify policy audit/notification delivery.
- Run compatibility tests before claiming support for Typebot versions other than
  the tested 3.19.0 baseline.

Typebot's update endpoint is not strict compare-and-swap: its timestamp conflict
check has a five-second margin. The MCP uses expected hashes, a per-process bot lock
and a fresh pre-write read, but a concurrent external writer can still race the API.
Use one MCP replica and avoid concurrent Builder editing during consequential work.
