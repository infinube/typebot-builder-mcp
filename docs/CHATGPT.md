# ChatGPT Custom App connection guide

Status: procedure only until an actual ChatGPT connection and tool call are recorded.
A successful SDK request or private gateway probe is not a verified ChatGPT connection.

1. Deploy an HTTPS MCP endpoint reachable by ChatGPT, with valid public TLS and current
   Streamable HTTP support. Never expose an unauthenticated public management endpoint.
2. Decide whether authentication lives in this resource server or an upstream identity
   gateway. For OAuth, publish resource metadata and provide an authorization server
   supporting the client registration and PKCE behavior required by your ChatGPT workspace.
3. In ChatGPT workspace app management, create a Custom App with the full external MCP
   URL. Choose the authentication mode supported by the workspace and your deployment.
   A static backend M2M bearer is not itself a human Google OAuth connection.
4. Connect using the intended Google/workspace identity. Check app permissions and the
   complete imported tool inventory. Do not grant effectful preview tools as read-only.
5. Call capabilities, list_workspaces, and get_typebot on a temporary test bot. Confirm
   the upstream RBAC identity and private backend credentials remain separate.
6. Perform one authorized semantic edit, validation, snapshot inspection and rollback
   on that test bot. Delete the test bot afterward. Verify denied identities cannot connect.
7. Record the URL, transport, actual authentication flow, identities tested, tool count,
   positive/negative results and date in private deployment documentation.

Provider/UI details can evolve. Verify current official ChatGPT documentation and the
workspace's actual authentication options before claiming support. Issue #1 remains the
tracking item for the connection test; it must stay open if the end-to-end ChatGPT test
cannot be completed. No public documentation should contain internal route details or secrets.
