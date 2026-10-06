# Contributing

Use Node.js 22 or later. Run `npm ci --ignore-scripts` and `npm run check`. CI also builds
the Docker image. Add deterministic tests for consequential logic changes, including
failure/uncertainty paths. Use official public Typebot contracts and verify the deployed
version before adding endpoints. Never assume individual group/block REST operations exist.

Keep the implementation independent of earlier community MCPs. Preserve notices when
reusing contract data or code. Do not commit tokens, snapshots, customer definitions or
private infrastructure details. Document exact implemented behavior in English and
classify new tools as read-only, mutating or destructive. Do not label preview read-only.

No tests should mutate production bots. Live testing requires an explicitly selected test
workspace and temporary bot, with cleanup and before/after inventory verification.
