# ChatGPT Custom App connection guide

Status: **verified with a real ChatGPT Custom App on 2026-10-06** against the
IngeWeb deployment. The server-side behavior is generic; identity-provider and
workspace-admin steps remain deployment-specific.

## Requirements

1. Deploy an HTTPS MCP endpoint reachable by ChatGPT, with valid public TLS and
   Streamable HTTP support.
2. Never expose an unauthenticated public management endpoint.
3. Keep human identity authentication separate from the backend Typebot API token.
4. If OAuth is implemented in the MCP resource server, use the documented OAuth
   resource-server model. If authentication is provided by a trusted upstream identity
   gateway, preserve that boundary and use a separate M2M credential to the private MCP
   backend when appropriate.

## ChatGPT setup

1. In ChatGPT workspace app management, create or update a Custom App with the external
   MCP URL.
2. Select the authentication mode supported by the deployment. A static backend M2M
   bearer is not itself a human Google OAuth connection.
3. Connect using the intended workspace identity.
4. Run **Scan Tools / Refresh Tools** after any MCP tool name or input-schema change.
5. Review imported tools and permissions before publishing the App to wider workspace
   audiences.

## Verification sequence

Use a non-production Typebot or temporary bot and verify:

1. `capabilities`;
2. `list_workspaces`;
3. `get_typebot`;
4. one semantic edit;
5. validation;
6. snapshot inspection;
7. restore/rollback behavior where appropriate;
8. publish/unpublish only when intentionally testing lifecycle controls.

Preview tools are effectful because a Typebot can invoke webhooks, code or paid
integrations.

## Verified ChatGPT behavior

The IngeWeb deployment completed a real ChatGPT Custom App connection using its
workspace identity layer. The connection exercised read and write operations through
the normal gateway path and produced Action Gateway audit events.

The v0.1.2 backend exposes **43 tools**. After a ChatGPT tool refresh, the inventory
includes the v0.1.1 guidance tool and the v0.1.2 persisted-conversation tools:

- `get_guidance`
- `get_result`
- `get_result_transcript`
- `get_result_logs`
- `find_results`

The result/transcript tools can expose customer PII and conversation content even
though they are read-only. Deployments should apply appropriate identity/RBAC and
audit controls.

## Important operational rule

ChatGPT may cache a Custom App tool inventory. When the MCP adds/removes tools or
changes their input schemas, perform **Refresh Tools / Scan Tools** and republish/update
the Custom App as required by the workspace UI.

A Custom App package version and the MCP server version are independent. The package
contains ChatGPT-side metadata/Skills; the live MCP endpoint owns the runtime tool
contract.

Provider/UI details can evolve. Verify current ChatGPT workspace controls whenever the
admin interface changes. Do not put private credentials, backend bearer tokens or
internal-only infrastructure details in public documentation.
