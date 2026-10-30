import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkSchema, kindOf, schemaFor, validateDocument } from '../src/index.js';
import { NODE_TYPES } from '../../src/agents/graph.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const examples = readdirSync(new URL('../examples/', import.meta.url)).filter((name) => name.endsWith('.json'));

test('the six example course packages and an agent file are valid, as are the schemas’ examples', () => {
  assert.equal(examples.length, 6);
  for (const name of examples) assert.deepEqual(validateDocument(json(`../examples/${name}`)), { kind: 'course-package', errors: [] }, name);
  assert.deepEqual(validateDocument(json('../schemas/examples/agent.example.json')), { kind: 'agent', errors: [] });
  assert.deepEqual(validateDocument(json('../schemas/examples/learning-events.example.json')), { kind: 'learning-events', errors: [] });
  assert.deepEqual(validateDocument(json('../schemas/examples/teaching.example.json')), { kind: 'teaching', errors: [] });
  for (const name of ['agent', 'course-package', 'learning-events', 'teaching']) assert.equal(schemaFor(name).$schema, 'https://json-schema.org/draft/2020-12/schema');
});

test('what doesn’t fit says where and why', () => {
  const agent = json('../schemas/examples/agent.example.json');
  agent.graph.nodes[1].next = 'nowhere';
  assert.match(validateDocument(agent).errors[0], /^\$\.graph: .*references missing node "nowhere"/, 'VIABLE’s own graph checks run too');
  const pkg = json('../examples/fractions-practice.json');
  pkg.course.activities[1].teaching = { help: 'do_it_for_them' };
  assert.deepEqual(validateDocument(pkg).errors, ['$.course.activities[1].teaching.help: must be one of "ask_first", "hint", "explain", "check_only", null']);
  const unresolved = json('../examples/fractions-practice.json');
  unresolved.course.activities[0].workspace.panels[0].set_ref = 'gone';
  assert.deepEqual(validateDocument(unresolved).errors, ['$.course.activities[0].workspace.panels[0].set_ref: the package has no question set "gone"'], 'refs are checked once the shape fits');
  const withFiles = json('../examples/fractions-practice.json');
  withFiles.files = [{ ref: 'notes', name: 'notes.md', url: 'https://example.org/notes.md' }];
  withFiles.knowledge_bases = [{ ref: 'kb', name: 'Notes', file_refs: ['notes', 'gone'] }];
  assert.deepEqual(validateDocument(withFiles).errors, ['$.knowledge_bases[0].file_refs[1]: the package has no file "gone"'], 'files and knowledge bases resolve too');
  const events = { events: [{ type: 'writing.progress', data: { field: 'essay', keys: -1, keystrokes: 'abc' } }, { type: 'mouse.move' }] };
  assert.deepEqual(validateDocument(events).errors.sort(), [
    '$.events[0].data.field: must be one of "plan", "draft"',
    '$.events[0].data.keys: must be at least 0',
    '$.events[0].data.keystrokes: is not a field of this format',
    `$.events[1].type: must be one of ${schemaFor('learning-events').$defs.event.properties.type.enum.map((type) => JSON.stringify(type)).join(', ')}`
  ].sort());
  assert.deepEqual(validateDocument({ goal: 'x', extra: 1 }).errors, ['$.extra: is not a field of this format']);
  assert.equal(kindOf({ format: 'viable.agent' }), 'agent');
  assert.throws(() => validateDocument({}, 'spreadsheet'), /Unknown format/);
});

test('checkSchema covers the keywords the schemas use', () => {
  const schema = { type: 'object', required: ['a'], properties: { a: { anyOf: [{ type: 'null' }, { type: 'string', minLength: 2 }] }, b: { oneOf: [{ const: 1 }, { const: 2 }] } }, if: { properties: { b: { const: 2 } } }, then: { required: ['c'] } };
  assert.deepEqual(checkSchema(schema, { a: 'ok', b: 1 }), []);
  assert.deepEqual(checkSchema(schema, { a: 'x', b: 2 }), ['$.a: must have at least 2 characters', '$: needs "c"']);
  assert.deepEqual(checkSchema(schema, { b: 3 }), ['$: needs "a"', '$.b: must match exactly one of the allowed shapes']);
  assert.deepEqual(checkSchema({ type: 'integer' }, 1.5), ['$: must be of type integer']);
});

test('the agent schema lists the engine’s step types', () => {
  assert.deepEqual(schemaFor('agent').$defs.node.properties.type.enum, [...NODE_TYPES]);
});

// Checks against the repository the kit comes from; an export has neither, so they skip there.
const workspace = new URL('../../src/utils/workspace.js', import.meta.url);
test('the learning event kinds are the ones VIABLE records', { skip: !existsSync(workspace) && 'not in the repository' }, async () => {
  const { WORKSPACE_EVENTS } = await import(workspace.href);
  assert.deepEqual(schemaFor('learning-events').$defs.event.properties.type.enum, [...WORKSPACE_EVENTS, 'app.event']);
});

const portal = new URL('../../../viablelab-developers/public/docs/examples/', import.meta.url);
test('the examples are the portal’s', { skip: !existsSync(portal) && 'the portal checkout is not beside this one' }, () => {
  for (const name of examples) assert.equal(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'), readFileSync(fileURLToPath(new URL(name, portal)), 'utf8'), `${name} differs from the portal's public/docs/examples copy`);
});
