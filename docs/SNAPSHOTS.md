# Snapshots and webhook contract

Modes: filesystem (default), webhook, both, off. These are auxiliary safety backups,
not a bot database or full version control. The default local root is `/data/snapshots`.
Tools accept bot IDs and snapshot IDs only, never paths.

## Filesystem

A bot directory contains `<sha256>.payload.json` content-addressed bot payloads and
`<snapshot-id>.json` metadata events. A normalized hash orders object keys but preserves
array order. `contentHash` excludes only createdAt/updatedAt; `payloadHash` covers the
full bot payload. Repeated identical payloads deduplicate, while before/after events
retain distinct IDs and metadata. Directories/files are private (0700/0600).

Reads check identifiers, disallow symlink files/directories, bound file size, verify
payload hashes and ensure the bot ID matches. A missing/corrupt event or payload rejects
inspection/restore. Configure a trusted dedicated root; do not let untrusted users
write or replace its parent directories. Back up the entire tree.

No automatic retention or deletion tool is supplied. The operator owns retention.
Snapshot listing verifies all events, returns newest first with a limit, and includes
a total. Large installations should archive older snapshots before lists become costly.

## Generic webhook

POST the following JSON envelope to the administrator-configured URL:

```json
{
  "eventType": "typebot.snapshot.v1",
  "id": "event-uuid",
  "phase": "before",
  "operation": "update_block",
  "typebotId": "bot-id",
  "workspaceId": "workspace-id",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "contentHash": "normalized-content-sha256",
  "payloadHash": "full-payload-sha256",
  "bot": {},
  "serverVersion": "0.1.0"
}
```

Lifecycle snapshots may include `published`, containing the observed published definition
or null. Headers: `Content-Type: application/json`, `Idempotency-Key: <event UUID>`,
optional `Authorization: Bearer <independent receiver token>`. Any 2xx acknowledges
receipt. Redirects, non-2xx, connection failures and timeouts fail delivery.
There is no automatic retry/outbox: receivers should deduplicate by event ID and
optionally payload hash. A receiver may be n8n, an internal API or a storage gateway;
none is a dependency of the MCP. Webhook-only mode has no local listing/rollback.

## Failure policy

Local and remote sinks have separate policies. `abort` rejects a failed before snapshot
and prevents the write. `warn` reports failure and proceeds deliberately. In both mode,
local abort plus webhook warn preserves the local safety backup when delivery fails.
Off always reports that snapshots are disabled. No failure is silently discarded.

An after-snapshot failure cannot undo an already-applied Typebot write: the result
reports `mutationApplied:true` and warnings. Read current state before retrying.
Creation has only an after snapshot; deletion only a before snapshot.

## Restore

`restore_snapshot` verifies the selected payload and its graph, checks the supplied
current hash, snapshots current content, writes supported draft fields, reads back,
validates and snapshots the result. A pre-write failure leaves Typebot unchanged.
A write/read-back failure preserves the pre-restore snapshot and reports uncertainty.
Published state is evidence only: restore does not publish/unpublish or restore an old
published version. Use lifecycle tools separately after reviewing the restored draft.
Restoring a deleted bot ID is not supported; snapshots remain available for inspection.
