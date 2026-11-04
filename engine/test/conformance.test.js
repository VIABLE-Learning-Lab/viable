import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KINDS, SUITES, compare, loadSuite, runSuite } from '../src/index.js';

const names = (dir) => readdirSync(new URL(dir, import.meta.url)).filter((name) => name.endsWith('.json'));

test('each fixture file is a suite the runner knows, and each suite has a file', () => {
  assert.deepEqual([...names('../conformance/'), ...names('../../harness/conformance/')].map((name) => name.slice(0, -5)).sort(), [...SUITES].sort());
  for (const name of SUITES) {
    const suite = loadSuite(name);
    assert.equal(suite.suite, name);
    assert.equal(suite.version, 1);
    const ids = suite.cases.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, `${name} repeats a case id`);
    for (const item of suite.cases) assert.ok(item.id && item.description && item.input && Object.keys(item.expect || {}).length, `${name}/${item.id} needs an id, a description, an input and expectations`);
  }
});

for (const name of SUITES) {
  test(`the harness passes the ${name} fixtures`, async () => {
    const { cases } = await runSuite(loadSuite(name));
    assert.deepEqual(cases.filter((item) => !item.passed).map((item) => `${item.id}: ${item.problems.join('; ')}`), []);
  });
}

test('the formats suite has valid and invalid documents of each kind, and every example', () => {
  const { cases } = loadSuite('formats');
  for (const kind of KINDS) {
    const of = cases.filter((item) => item.input.kind === kind);
    assert.ok(of.some((item) => item.expect.valid) && of.some((item) => !item.expect.valid), `${kind}: valid and invalid cases`);
  }
  const files = new Set(cases.map((item) => item.input.file));
  for (const file of [...names('../../examples/').map((name) => `examples/${name}`), ...names('../../harness/schemas/examples/').map((name) => `schemas/examples/${name}`)]) assert.ok(files.has(file), `${file} is a case`);
});

test('a result that differs from the fixture fails, saying how', async () => {
  const suite = loadSuite('vetting');
  const pass = suite.cases.find((item) => item.id === 'simple-pass');
  const { cases } = await runSuite({ ...suite, cases: [
    { ...pass, expect: { passed: false } },
    { id: 'key-to-reply-model', description: 'Wrong on purpose.', input: { prompt: 'generation', config: { mode: 'full', question: 'What is 1/2 + 1/3?', answer_key: '5/6' } }, expect: { includes: ['5/6'] } }
  ] });
  assert.deepEqual(cases.map((item) => item.passed), [false, false]);
  assert.deepEqual(cases.map((item) => item.problems), [['passed: expected false, got true'], ['lacks "5/6"']]);
  assert.deepEqual(compare({ value: { a: 1, b: 2 } }, { value: { a: 1 } }), [], 'an expected object lists only the fields it checks');
  assert.deepEqual(compare({ value: { a: 1, b: 2 } }, { value: { a: 1 } }, true), ['value.b: not expected, got 2'], 'unless the suite matches whole');
  assert.deepEqual(compare({ value: undefined }, { value: null }), [], 'absent counts as null');
  await assert.rejects(runSuite({ ...suite, version: 2 }), /version 2; this runner reads version 1/);
  assert.throws(() => loadSuite('nope'), /Unknown suite "nope"/);
});

test('the CLI prints a pass or FAIL per case, and a total', () => {
  const bin = fileURLToPath(new URL('../bin/viable-engine.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [bin, 'conformance', 'graph'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^graph\n {2}pass {2}minimal\n/);
  assert.match(run.stdout, new RegExp(`\\n(\\d+) of \\1 cases pass\\.\\n$`));
  const unknown = spawnSync(process.execPath, [bin, 'conformance', 'nope'], { encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown suite "nope"/);
});
