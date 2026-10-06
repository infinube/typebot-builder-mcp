# Typebot compatibility

The contract baseline is official Typebot v3.19.0, commit
61056ff9a98082485add8111e901d3148ca358ef. The current upstream main inspected during
implementation was b19de808de32d5f4f376b3c5750676b5f4a656aa; the required REST routes
and semantic update strategy remain consistent with the deployed baseline.

| Capability | Public API used |
|---|---|
| Workspaces | GET /api/v1/workspaces |
| Folders | GET /api/v1/folders |
| Bot list/create | GET/POST /api/v1/typebots |
| Get/update/delete | GET/PATCH/DELETE /api/v1/typebots/{id} |
| Groups, blocks, edges, events, variables, settings | Narrow local transformation, supported PATCH of draft fields |
| Clone | Get source, validate, create new bot without publication/domain/credential metadata |
| Publish/unpublish | POST /api/v1/typebots/{id}/publish or /unpublish |
| Published state | GET /api/v1/typebots/{id}/publishedTypebot |
| Results | GET /api/v1/typebots/{id}/results |
| Statistics | GET /api/v1/typebots/{id}/analytics/stats |
| Preview | POST /api/v1/typebots/{id}/preview/startChat on Builder API |
| Continue preview | POST /api/v1/sessions/{id}/continueChat on Builder API |

There are no assumed individual group/block REST endpoints. Folders/workspaces are
readable; management CRUD beyond bot operations is deliberately not exposed by this MVP.
No raw whole-bot overwrite tool is included. Block and settings support derive from the
vendored official JSON Schema 2020-12 contract rather than hand-invented options.
Unknown keys are rejected locally. Existing legacy bots are returned/migrated by Typebot;
only definitions passing the bundled update schema and graph checks can be written.

Typebot sanitizes certain fields. Variable persistence requires groups with the update,
so semantic changes include supported draft fields and current updatedAt, never overwrite:true.
API conflict detection has a five-second timestamp margin; strict compare-and-swap is
unavailable. Restore changes draft content, not the saved published version or bot identity.

Live test results belong in the verification report, not inferred from this contract table.
Other Typebot versions and hosted plans may expose different restrictions; inspect their
API schemas and run isolated compatibility tests before deployment.

Analytics stats require an existing published version. get_stats returns available:false for an unpublished draft instead of treating its expected 404 as a transport failure.
