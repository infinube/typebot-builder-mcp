# Tool reference

Generated from the registered tool definitions. 39 tools; identical across HTTP and STDIO.

| Tool | Classification | Behavior |
|---|---|---|
| capabilities | read-only | Supported contracts, transports, compatibility baseline, guidance topics and tool classifications; no credentials. |
| get_guidance | read-only | Versioned Typebot-building knowledge pills for AI clients. Use topic=all only when broad guidance is genuinely needed. |
| list_workspaces | read-only | List accessible Typebot workspaces. |
| list_folders | read-only | List workspace folders. |
| list_typebots | read-only | List bot IDs and metadata; optionally filter by name. |
| get_typebot | read-only | Get definition and contentHash needed for edits. Bot definitions may contain sensitive integration settings. |
| get_published_state | read-only | Get published Typebot definition/version, or null. |
| inspect_graph | read-only | Inspect group/block IDs, events and edges. |
| find_elements | read-only | Find groups and blocks by title, ID, type or serialized content. |
| variable_usage | read-only | Locate variable ID and template-name references. |
| validate_typebot | read-only | Local schema/graph validation; does not execute integrations. |
| block_schemas | read-only | Official block schema contracts plus MCP-specific construction guidance for known tricky block types. Request one schema name to obtain its JSON schema. |
| get_results | read-only | Read results with bounded page size. Contains conversation data. |
| get_stats | read-only | Read analytics stats; unavailable until the bot has a published version. |
| create_typebot | mutating | Create an empty bot with a name; Typebot supplies version and start event. |
| clone_typebot | mutating | Create an unpublished clone. Integration credential references may be workspace-specific. |
| update_metadata | mutating | Update selected metadata. Does not publish. |
| add_group | mutating | Add an empty group. |
| update_group | mutating | Update group title or graph coordinates. |
| remove_group | destructive | Remove group and its blocks and attached edges. Other references must pass validation. |
| add_block | mutating | Insert an official schema-valid block. For Text, prefer semantic shorthand block {type:"text", text:"..."}; the MCP normalizes it to richText. Use block_schemas for advanced contracts. Connections use connect_flow. |
| update_block | mutating | Merge a narrow block patch. For Text, prefer patch {text:"..."}; the MCP normalizes it to richText. Arrays replace atomically; IDs/type/outgoingEdgeId cannot change. |
| remove_block | destructive | Remove block and attached edges; validates remaining references. |
| connect_flow | mutating | Create edge and set matching source outgoingEdgeId; disconnect existing edge first. |
| disconnect_flow | mutating | Remove an edge and its outgoingEdgeId reference. |
| add_variable | mutating | Add a uniquely named variable. |
| update_variable | mutating | Update variable; renaming updates exact {{name}} references. |
| remove_variable | destructive | Remove an unused variable; rejects referenced variables. |
| update_settings | mutating | Merge supported Typebot settings; validate official schema before writing. |
| list_snapshots | read-only | List verified filesystem snapshot metadata. |
| inspect_snapshot | read-only | Read verified snapshot payload and metadata. |
| diff_snapshot | read-only | Compare current draft against a verified snapshot. |
| restore_snapshot | destructive | Restore draft content from verified snapshot; back up current draft first. Does not restore published lifecycle state. |
| publish | mutating | publish: validate current bot and snapshot before operation. |
| unpublish | mutating | unpublish: validate current bot and snapshot before operation. |
| delete_typebot | destructive | delete_typebot: validate current bot and snapshot before operation. |
| start_preview | mutating | Start draft preview. May execute webhooks/code/paid integrations. |
| continue_preview | mutating | Continue a preview session. May execute integrations. |
| smoke_test | mutating | Start preview and send up to 10 replies. May execute integrations; returns transcript steps. |

Inspect MCP tools/list for exact input JSON schemas. Editing, restore and lifecycle tools require typebotId and expectedHash. Get the current contentHash using get_typebot; after each change use the returned hash for the next operation. IDs are restricted strings, not paths.

Read tools do not modify bots; they may return sensitive definitions, customer results or snapshots. Preview tools may invoke external integrations. Destructive tools remove structures/data or overwrite current draft content. Publication changes runtime availability. Upstream policy must implement real authorization; annotations are hints only.
