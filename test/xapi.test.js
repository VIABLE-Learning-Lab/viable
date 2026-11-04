import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SKIPPED, loadSuite, schemaFor, toStatements, uuid5, validateDocument } from '../src/index.js';
import { ACTIVITY_TYPES, EXTENSIONS, NAMESPACE, PROFILE, VERBS, VOCABULARY } from '../src/xapi.js';
import { profile, profilePath, profileText } from '../scripts/build-xapi-profile.mjs';

const record = JSON.parse(readFileSync(new URL('../schemas/examples/learning-events.example.json', import.meta.url), 'utf8'));
const HOME = 'https://writing.example.org';
const BASE = 'https://lrs.example.org/activities';
const UUID5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IRI = /^https?:\/\/\S+$/;
const reorder = (value) => (Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value);

test('every statement has what xAPI 1.0.3 requires, with IRIs where it wants them', () => {
  const statements = toStatements(record, { homePage: HOME, activityBase: BASE });
  assert.equal(statements.length, 14, 'ten events, three turns and the answer one agent graded');
  for (const statement of statements) {
    assert.deepEqual(Object.keys(statement).filter((key) => !['id', 'actor', 'verb', 'object', 'result', 'context', 'timestamp'].includes(key)), []);
    assert.match(statement.id, UUID5);
    assert.deepEqual(statement.actor, { objectType: 'Agent', account: { homePage: HOME, name: record.user } }, 'an account, never a name or email');
    assert.match(statement.verb.id, IRI);
    assert.equal(typeof statement.verb.display['en-US'], 'string');
    assert.equal(statement.object.objectType, 'Activity');
    assert.ok(statement.object.id.startsWith(`${BASE}/argument-essay/`), statement.object.id);
    assert.match(statement.object.definition.type, IRI);
    assert.deepEqual(statement.context.contextActivities.parent.map((parent) => parent.id), [`${BASE}/argument-essay`]);
    for (const key of Object.keys({ ...statement.context.extensions, ...statement.result?.extensions })) assert.ok(key.startsWith(EXTENSIONS), key);
    assert.equal(statement.timestamp, new Date(statement.timestamp).toISOString());
    if (statement.result) assert.ok(Object.keys(statement.result).length, 'no empty result');
  }
  const answer = statements.find((statement) => statement.object.id.endsWith('/items/q1'));
  assert.deepEqual([answer.verb.id, answer.result.success], ['http://adlnet.gov/expapi/verbs/answered', false]);
});

test('no learner text, AI reply or app string unless includeText', () => {
  const sent = (options = {}) => JSON.stringify(toStatements(record, { homePage: HOME, ...options }));
  const written = [record.events[4].data.text, ...record.turns.flatMap((turn) => [turn.message, turn.reply]), 'first-draft'];
  for (const part of written) assert.ok(!sent().includes(part), `${part} is not sent by default`);
  assert.ok(toStatements(record, { homePage: HOME }).every((statement) => statement.result?.response === undefined));
  for (const part of written) assert.ok(sent({ includeText: true }).includes(part), `${part} is sent with includeText`);
  const answers = toStatements(record, { homePage: HOME, includeText: true }).filter((statement) => statement.object.id.includes('/items/'));
  assert.deepEqual(answers.map((statement) => statement.result.response), ['B', 'A']);
});

test('ids are stable: the same events give the same ids, whatever their key order or the export options', () => {
  const ids = (doc, options = {}) => toStatements(doc, { homePage: HOME, ...options }).map((statement) => statement.id);
  assert.equal(new Set(ids(record)).size, 14);
  assert.deepEqual(ids(reorder(record)), ids(record));
  assert.deepEqual(ids(record, { includeText: true, activityBase: BASE }), ids(record));
  assert.notDeepEqual(ids({ ...record, user: 'writing-app:0000' }), ids(record), 'another learner, other ids');
  assert.deepEqual(ids({ ...record, events: [...record.events, record.events[0]] }), ids(record), 'a repeated event is one statement');
  assert.equal(uuid5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '886313e1-3b8a-5372-9b90-0c9aee199e5d', 'RFC 4122 version 5, as Python’s uuid.uuid5');
  assert.equal(uuid5(PROFILE, '6ba7b811-9dad-11d1-80b4-00c04fd430c8'), NAMESPACE);
});

test('every event type the schema lists makes a statement or is skipped with its reason, as the profile says', () => {
  const types = schemaFor('learning-events').$defs.event.properties.type.enum;
  const doc = readFileSync(new URL('../docs/xapi.md', import.meta.url), 'utf8');
  for (const type of types) {
    const made = toStatements({ user: 'app:1', events: [{ type, panel: 'p', data: {} }] }, { homePage: HOME });
    assert.equal(made.length, Object.hasOwn(SKIPPED, type) ? 0 : 1, type);
    assert.ok(doc.includes(`\`${type}\``), `docs/xapi.md covers ${type}`);
  }
  assert.deepEqual(Object.keys(SKIPPED).filter((type) => !types.includes(type)), []);
});

test('the vocabulary is exactly what statements use for the fields the learning-events schema lists', () => {
  const schema = schemaFor('learning-events');
  // A value of each listed field's type; booleans both ways, so checked/unchecked and the like both show.
  const sample = (prop, flag) => (prop.$ref === '#/$defs/flat' ? { n: 1 } : prop.$ref ? 1 : prop.enum ? prop.enum[0] : prop.type === 'boolean' ? flag : prop.type === 'string' ? 'x' : 1);
  const events = (flag) => schema.$defs.event.allOf.map((rule) => {
    const props = rule.then.properties.data.properties ?? {};
    // An embedded page's own verb is open-ended, so it is left out: interacted (ADL) stands in.
    const data = Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'verb').map(([key, prop]) => [key, sample(prop, flag)]));
    return { type: rule.if.properties.type.const, panel: 'p', item: 'q1', seq: 1, data };
  });
  const turn = { started_at: '2026-11-03T10:00:00Z', message: 'm', reply: 'r', first_output_ms: 1, signals: { source: 'typed' }, after: { copied: true }, assessment: [{ skill: 's', correct: true }], ...Object.fromEntries(['conversation_id', 'turn_index', 'agent_version', 'activity_version', 'vetting', 'vetting_attempts'].map((key) => [key, 1])) };
  const statements = [true, false].flatMap((flag) => toStatements({ user: 'app:1', activity: 'a', session: 's', events: events(flag), turns: [turn] }, { homePage: HOME, includeText: true }));
  const names = (iris, base) => [...new Set(iris.filter((iri) => iri.startsWith(base)).map((iri) => iri.slice(base.length)))].sort();
  const sorted = (terms) => Object.keys(terms).sort();
  assert.deepEqual(names(statements.map((item) => item.verb.id), VERBS), sorted(VOCABULARY.verbs));
  assert.deepEqual(names(statements.flatMap((item) => [item.object.definition.type, ...item.context.contextActivities.parent.map((parent) => parent.definition.type)]), ACTIVITY_TYPES), sorted(VOCABULARY.activityTypes));
  assert.deepEqual(names(statements.flatMap((item) => Object.keys(item.context.extensions ?? {})), EXTENSIONS), sorted(VOCABULARY.contextExtensions));
  assert.deepEqual(names(statements.flatMap((item) => Object.keys(item.result?.extensions ?? {})), EXTENSIONS), sorted(VOCABULARY.resultExtensions));
});

test('schemas/xapi-profile.jsonld equals what npm run xapi:build writes, an xAPI Profile of the vocabulary', () => {
  assert.equal(readFileSync(profilePath, 'utf8'), profileText(), 'Run npm run xapi:build.');
  const doc = profile();
  for (const key of ['@context', 'id', 'type', 'conformsTo', 'prefLabel', 'definition', 'versions', 'author']) assert.ok(doc[key], key);
  assert.equal(doc.id, PROFILE);
  const ids = doc.concepts.map((concept) => concept.id);
  assert.equal(new Set(ids).size, ids.length, 'each concept once: no extension is both a context and a result extension');
  for (const concept of doc.concepts) {
    assert.ok(concept.id.startsWith(`${PROFILE}/`), concept.id);
    assert.equal(concept.inScheme, doc.versions[0].id);
    assert.ok(concept.prefLabel.en && concept.definition.en, concept.id);
  }
});

test('the xapi fixtures’ records are valid learning-events records', () => {
  for (const item of loadSuite('xapi').cases) {
    if (item.expect.error) continue;
    assert.deepEqual(validateDocument(item.input.record, 'learning-events').errors, [], item.id);
  }
});

test('a record without a pseudonymous learner id, or a home page, is refused', () => {
  assert.throws(() => toStatements({ events: [] }, { homePage: HOME }), /pseudonymous id/);
  assert.throws(() => toStatements({ user: 'ada@school.example.org', events: [] }, { homePage: HOME }), /never an email/);
  assert.throws(() => toStatements(record, {}), /homePage must be an absolute URL/);
  assert.throws(() => toStatements(record, { homePage: HOME, activityBase: 'activities' }), /activityBase must be an absolute URL/);
});

test('the CLI prints the statements as JSON, and asks for --home-page', () => {
  const bin = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
  const file = fileURLToPath(new URL('../schemas/examples/learning-events.example.json', import.meta.url));
  const run = spawnSync(process.execPath, [bin, 'xapi', file, '--home-page', HOME, '--activity-base', BASE], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), toStatements(record, { homePage: HOME, activityBase: BASE }));
  const withText = spawnSync(process.execPath, [bin, 'xapi', file, '--home-page', HOME, '--include-text'], { encoding: 'utf8' });
  assert.ok(withText.stdout.includes(record.turns[0].message));
  const missing = spawnSync(process.execPath, [bin, 'xapi', file], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--home-page <url>/);
});
