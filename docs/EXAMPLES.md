# Building a small flow

The following sequence uses SDK tools/call arguments. Substitute IDs/hashes from each
actual response rather than assuming example IDs. Use a dedicated temporary test bot.

1. list_workspaces, then create_typebot with workspaceId and name.
2. get_typebot: retain contentHash and the first start event's ID.
3. add_group: typebotId, expectedHash, title. Inspect the diff for the new group ID.
4. add_block: typebotId, latest expectedHash, groupId and the semantic Text shorthand:

```json
{
  "type": "text",
  "text": "Hello from Typebot Builder MCP"
}
```

The MCP normalizes this to native Typebot `content.richText` for the tested baseline. Use
`block_schemas` or `get_guidance(topic="text-blocks")` when advanced formatting is needed;
raw `content.richText` remains supported.

5. connect_flow: from.eventId is the start event; to.groupId is the new group.
6. validate_typebot, inspect_graph, then smoke_test with no replies.
7. list_snapshots; inspect/diff a selected before snapshot.
8. publish with the latest hash. Verify get_published_state. Unpublish before cleanup.
9. Change a block, restore_snapshot to its before snapshot and verify get_typebot.
10. delete_typebot with the current hash. Its before snapshot remains locally available.

Variable references use `{{name}}` in Typebot rich text and supported string settings.
Use add_variable before adding a referencing input block; remove_variable rejects an
in-use variable. update_variable renames exact template references and preserves ID.

For branches/choice inputs, request block_schemas for the official items/paths schema,
then connect_flow using from.blockId plus from.itemId or from.pathId. A source must be
disconnected before creating a replacement edge. Never invent a branch connection format.
