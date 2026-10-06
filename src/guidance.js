export const TYPEBOT_COMPATIBILITY = Object.freeze({
  testedVersion: '3.19.0',
  schemaVersion: '6.1',
});

export const GUIDANCE_TOPICS = Object.freeze([
  'building',
  'text-blocks',
  'choice-routing',
  'snapshots',
  'preview',
  'publishing',
  'compatibility',
]);

const pills = Object.freeze({
  building: [
    'Inspect the target workspace and existing bots before creating a new bot.',
    'Prefer semantic edits in small steps, then validate and preview the affected path.',
    'Use the latest contentHash returned by get_typebot or a successful mutation before the next write.',
    'Publish only after clean validation and explicit user intent.',
  ],
  'text-blocks': [
    'For new Text blocks, prefer the MCP semantic shorthand: block { type: "text", text: "..." }.',
    'For Text updates, prefer patch { text: "..." }.',
    'The MCP normalizes semantic text to Typebot richText for the tested 3.19.0 / schema 6.1 baseline.',
    'Raw Typebot content.richText remains supported when advanced formatting is required.',
    'A raw content.plainText without richText is compatibility-normalized to richText before validation.',
  ],
  'choice-routing': [
    'Create Choice Input items with stable IDs before connecting routes.',
    'Connect one option with connect_flow using from.blockId + from.itemId and the destination groupId.',
    'If an item already has outgoingEdgeId, disconnect the existing edge before reconnecting it.',
  ],
  snapshots: [
    'Snapshots are safety backups, not Git-style version control and not a second source of truth.',
    'filesystem stores verified local snapshots; webhook emits the same snapshot event to a remote receiver; both does both; off disables snapshots.',
    'Ordinary mutations create before and after events; create has only after; delete has only before.',
    'restore_snapshot first backs up the current draft, then restores and validates the selected snapshot.',
  ],
  preview: [
    'Preview and smoke tests are effectful because a bot can execute webhooks, code or paid integrations.',
    'Use preview for draft verification, but do not treat it as a substitute for browser/mobile UX testing.',
  ],
  publishing: [
    'Validate before publishing.',
    'publish and unpublish are lifecycle mutations and may be externally audited or notified by deployment policy.',
    'Snapshot restore changes draft content only; published lifecycle state is controlled separately.',
  ],
  compatibility: [
    'The validated contract baseline is Typebot 3.19.0 with Typebot schema 6.1.',
    'Do not assume behavior for newer Typebot versions without checking their API/OpenAPI contract and isolated tests.',
    'When a Typebot-specific construction rule is discovered, prefer encoding it in MCP normalization or guidance instead of organization-specific documentation.',
  ],
});

export function getGuidance(topic = 'building') {
  if (topic === 'all') {
    return {
      baseline: TYPEBOT_COMPATIBILITY,
      topics: Object.fromEntries(GUIDANCE_TOPICS.map(name => [name, pills[name]])),
    };
  }
  if (!GUIDANCE_TOPICS.includes(topic)) throw new Error('Guidance topic not found');
  return { baseline: TYPEBOT_COMPATIBILITY, topic, pills: pills[topic] };
}

export function getBlockGuidance(schemaName) {
  if (schemaName === 'Text') {
    return {
      preferredMcpInput: { type: 'text', text: 'Message text' },
      preferredUpdatePatch: { text: 'Updated message text' },
      note: 'Semantic text is normalized by the MCP to Typebot richText for the tested baseline. Use raw content.richText only when advanced formatting is needed.',
    };
  }
  if (schemaName === 'ChoiceInput') {
    return {
      note: 'Create stable item IDs, then connect each option with connect_flow using from.blockId and from.itemId.',
      connectionExample: { from: { blockId: 'choice_block_id', itemId: 'choice_item_id' }, to: { groupId: 'target_group_id' } },
    };
  }
  return null;
}
