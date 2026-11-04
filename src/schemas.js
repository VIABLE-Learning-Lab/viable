/**
 * The open formats' schemas (schemas/*.schema.json, JSON Schema 2020-12) and the checker for them.
 * No dependency: checkSchema covers the keywords these schemas use (type, enum, const, required,
 * properties, additionalProperties, propertyNames, items, min/max Items/Length/Properties, pattern,
 * minimum, maximum, $ref, allOf, anyOf, oneOf, if/then/else). `format` is an annotation, as 2020-12
 * has it by default. No Node built-ins, so a Worker or a browser bundles it: graph.js checks a
 * Component step's manifest here.
 */
import agent from '../schemas/agent.schema.json' with { type: 'json' };
import coursePackage from '../schemas/course-package.schema.json' with { type: 'json' };
import learningEvents from '../schemas/learning-events.schema.json' with { type: 'json' };
import teaching from '../schemas/teaching.schema.json' with { type: 'json' };
import component from '../schemas/component.schema.json' with { type: 'json' };

export const KINDS = ['agent', 'course-package', 'learning-events', 'teaching', 'component'];
// Every schema's $id, where the Developer Platform publishes it; a $ref resolves against its schema's $id.
export const SCHEMA_BASE = 'https://developers.viablelab.org/schemas/';
const SCHEMAS = Object.fromEntries([agent, coursePackage, learningEvents, teaching, component].map((schema) => [schema.$id, schema]));
export const schemaFor = (kind) => SCHEMAS[`${SCHEMA_BASE}${kind}.schema.json`];

const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value);
const isType = (value, type) => typeOf(value) === type || (type === 'number' && typeof value === 'number' && Number.isFinite(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function resolveRef(ref, root) {
  const [file, pointer = ''] = ref.split('#');
  const doc = file ? SCHEMAS[new URL(file, root.$id || SCHEMA_BASE).href] : root;
  let target = doc;
  if (!target) throw new Error(`Unknown schema reference ${ref}.`);
  for (const part of pointer.split('/').filter(Boolean)) target = target[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  if (target === undefined) throw new Error(`Unknown schema reference ${ref}.`);
  return { schema: target, root: doc };
}

/** Errors for value against a schema, each "path: message"; empty when it fits. */
export function checkSchema(schema, value, root = schema, path = '$') {
  if (schema === true || schema == null) return [];
  if (schema === false) return [`${path}: is not allowed`];
  const errors = [];
  const add = (message) => errors.push(`${path}: ${message}`);
  if (schema.$ref) {
    const target = resolveRef(schema.$ref, root);
    errors.push(...checkSchema(target.schema, value, target.root, path));
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((type) => isType(value, type))) return [...errors, `${path}: must be of type ${types.join(' or ')}`];
  }
  if ('const' in schema && !equal(value, schema.const)) add(`must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((item) => equal(item, value))) add(`must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength != null && length < schema.minLength) add(`must have at least ${schema.minLength} characters`);
    if (schema.maxLength != null && length > schema.maxLength) add(`must have at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) add(`must match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) add(`must be at least ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) add(`must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) add(`must have at least ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) add(`must have at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, i) => errors.push(...checkSchema(schema.items, item, root, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    const keys = Object.keys(value);
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) add(`needs "${key}"`);
    if (schema.maxProperties != null && keys.length > schema.maxProperties) add(`must have at most ${schema.maxProperties} properties`);
    for (const key of keys) {
      const where = `${path}.${key}`;
      if (schema.propertyNames) errors.push(...checkSchema(schema.propertyNames, key, root, `${where} (name)`));
      if (schema.properties && Object.hasOwn(schema.properties, key)) errors.push(...checkSchema(schema.properties[key], value[key], root, where));
      else if (schema.additionalProperties === false) errors.push(`${where}: is not a field of this format`);
      else if (schema.additionalProperties) errors.push(...checkSchema(schema.additionalProperties, value[key], root, where));
    }
  }
  for (const sub of schema.allOf || []) errors.push(...checkSchema(sub, value, root, path));
  if (schema.anyOf && !schema.anyOf.some((sub) => !checkSchema(sub, value, root, path).length)) {
    // The closest alternative's errors say the most: one of the value's type, with the fewest errors.
    const score = (list) => list.length + (list.some((error) => error.startsWith(`${path}: must be of type`)) ? 1000 : 0);
    errors.push(...schema.anyOf.map((sub) => checkSchema(sub, value, root, path)).sort((a, b) => score(a) - score(b))[0]);
  }
  if (schema.oneOf && schema.oneOf.filter((sub) => !checkSchema(sub, value, root, path).length).length !== 1) add('must match exactly one of the allowed shapes');
  if (schema.if) {
    const branch = checkSchema(schema.if, value, root, path).length ? schema.else : schema.then;
    if (branch) errors.push(...checkSchema(branch, value, root, path));
  }
  return errors;
}
