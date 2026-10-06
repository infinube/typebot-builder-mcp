import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
export const openapi = JSON.parse(readFileSync(new URL('../vendor/typebot-3.19.0-openapi.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
ajv.addSchema({ $id: 'typebot-contract', components: strictObjects(openapi.components) });
const validators = new Map();
// Typebot strips unknown keys. Reject them locally so an AI never gets a false success.
function strictObjects(value) {
  if (Array.isArray(value)) return value.map(strictObjects);
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, strictObjects(v)]));
    if (result.properties && result.additionalProperties === undefined) result.additionalProperties = false;
    return result;
  }
  return value;
}
function rewrite(value) {
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === '$ref' ? `typebot-contract${v}` : rewrite(v)]));
  return value;
}
export function validateRequest(path, method, body) {
  const key = `${method}:${path}`;
  if (!validators.has(key)) {
    const schema = openapi.paths[path]?.[method]?.requestBody?.content['application/json']?.schema;
    if (!schema) throw new Error('No supported request contract');
    validators.set(key, ajv.compile(rewrite(strictObjects(schema))));
  }
  const validate = validators.get(key);
  if (!validate(body)) throw new Error(`Typebot request schema invalid: ${JSON.stringify(validate.errors.slice(0, 8).map(e => ({ path: e.instancePath, rule: e.keyword, message: e.message })))}`);
}
export const updateFields = Object.keys(openapi.paths['/v1/typebots/{typebotId}'].patch.requestBody.content['application/json'].schema.properties.typebot.anyOf[0].properties);
export function updatePayload(bot) { return Object.fromEntries(updateFields.filter(k => k in bot).map(k => [k, bot[k]])); }
export function blockContracts() {
  return Object.fromEntries(Object.entries(openapi.components.schemas).filter(([, s]) => s.properties?.type).map(([name, s]) => [name, { type: s.properties.type.const ?? s.properties.type.enum, schema: s }]));
}
