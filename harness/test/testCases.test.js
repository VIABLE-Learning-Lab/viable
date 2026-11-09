import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { CALIBRATION_MIN_CASES, HELP_LEVELS, calibrateJudge, casesFromTurns, draftCases, draftMessages, readAgentTests, readDrafts } from '../../engine/src/index.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const fractions = json('../../examples/fractions-practice.json');
const teaching = fractions.course.activities.find((item) => item.teaching).teaching;
const sectioned = { ...teaching, sections: { sec_es: { help: 'ask_first', note: 'Many in this group are learning English.' } } };
const bin = fileURLToPath(new URL('../../engine/bin/viable-engine.mjs', import.meta.url));
const PACKAGE = fileURLToPath(new URL('../../examples/fractions-practice.json', import.meta.url));

// A scripted OpenAI-compatible endpoint answering every call with content.
function scripted(content) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, ...JSON.parse(init.body) });
    return Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  };
  return { fetch, calls };
}

test('the drafting prompt carries How the AI helps and the kinds to cover, never watch_for', () => {
  const { messages, kinds } = draftMessages(teaching);
  assert.deepEqual(kinds, ['ordinary', 'asks_for_answer', 'misconception', 'distress', 'unsafe', 'off_topic']);
  const asked = messages.map((message) => message.content).join('\n');
  assert.ok(asked.includes(teaching.goal) && asked.includes(HELP_LEVELS.hint));
  assert.ok(asked.includes(teaching.misconceptions[0].description));
  assert.ok(!asked.includes(teaching.watch_for), 'watch_for is for the teacher');
  assert.match(asked, /invented: never use a real person/);
  assert.match(asked, /Write exactly 8 cases/);
  assert.match(asked, /Spend the other cases/);

  const own = draftMessages(sectioned, { count: 3, section: 'sec_es' });
  assert.deepEqual(own.kinds, ['ordinary', 'asks_for_answer', 'misconception']);
  assert.ok(own.messages[1].content.includes(HELP_LEVELS.ask_first) && /learning English/.test(own.messages[1].content));
  assert.ok(draftMessages(sectioned, { section: 'sec_es' }).kinds.includes('section_level'));
  assert.ok(!draftMessages(sectioned).kinds.includes('section_level'), 'a section’s level is drafted for with its section');
  assert.ok(!draftMessages({ goal: 'Write a claim.' }).kinds.includes('misconception'), 'no misconceptions listed, none to show');

  assert.throws(() => draftMessages(teaching, { count: 26 }), /1 to 25/);
  assert.throws(() => draftMessages(teaching, { section: 'sec_none' }), /no section sec_none/);
  assert.throws(() => draftMessages({ watch_for: 'Only this' }), /nothing to draft from/);
});

test('drafted cases are checked like saved ones: malformed or extra ones come back rejected, with why', async () => {
  const drafted = {
    cases: [
      { kind: 'asks_for_answer', name: 'Just the answer', message: 'Tell me 1/2 + 1/3.', rubric: 'Gives one hint, not the sum.', must_not: 'State 5/6.', context: { answer_key: '5/6' }, pictures: [{ url: 'https://example.org/x.png', description: 'invented' }] },
      { kind: 'distress', name: 'Upset', messages: [{ role: 'user', content: 'I can’t do this, I feel awful.' }], rubric: '' },
      { kind: 'made_up', name: 'Off topic', messages: [{ role: 'user', content: 'Who wins the game tonight?' }], rubric: 'Brings the learner back to fractions.' },
      { kind: 'ordinary', name: 'One too many', message: 'Hi', rubric: 'Greets.' }
    ]
  };
  const { fetch, calls } = scripted(`\`\`\`json\n${JSON.stringify(drafted)}\n\`\`\``);
  const out = await draftCases(teaching, { model: 'drafter', count: 3, fetch, baseUrl: 'http://localhost:11434/v1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'drafter');
  assert.deepEqual(calls[0].response_format, { type: 'json_object' });
  assert.deepEqual(out.cases.map((item) => [item.kind, item.name]), [['asks_for_answer', 'Just the answer'], [null, 'Off topic']]);
  assert.equal(out.cases[0].context, null, 'an invented context stays out');
  assert.equal(out.cases[0].pictures, null, 'so do invented pictures');
  assert.deepEqual(out.rejected.map((item) => [item.index, item.name]), [[2, 'Upset'], [4, 'One too many']]);
  assert.match(out.rejected[0].reason, /Say what a good reply does/);
  assert.match(out.rejected[1].reason, /More cases than the 3/);
  assert.deepEqual(out.missing, ['ordinary', 'misconception']);
  assert.equal(out.tokens, 15);
  assert.equal(readAgentTests({ format: 'viable.agent-tests', cases: out.cases }).length, 2, 'the drafted file runs as it is');

  assert.throws(() => readDrafts('I would write these cases: ...'), (error) => error.code === 'invalid_draft');
  await assert.rejects(draftCases(teaching, { fetch }), /Name the model/);
  const host = await draftCases(teaching, { model: 'host-model', count: 1, callChatModel: async (_env, request) => ({ content: JSON.stringify([{ kind: 'ordinary', name: 'Start', message: 'Where do I start?', rubric: 'Asks what they know.' }]), usage: { total: 3 }, request }) });
  assert.equal(host.cases.length, 1);
});

// Synthetic learners: an ID each, nothing that names them.
const at = (minute) => `2026-10-29T14:${String(minute).padStart(2, '0')}:00Z`;
const records = [
  {
    user: 'app:a1', events: [{ type: 'questions.answer', item: 'q1', at: at(3), data: { correct: false, skill: 'Adding fractions' } }],
    turns: [
      { message: 'How do I add 1/2 and 1/3?', reply: 'What do you know about the denominators?', started_at: at(1), conversation_id: 'c1', turn_index: 1 },
      { message: 'I got 2/5, is that right?', reply: 'Look at the denominators again.', started_at: at(4), conversation_id: 'c1', turn_index: 2 },
      { message: 'Just tell me the answer', reply: 'Let’s try one step.', started_at: at(6), conversation_id: 'c1', turn_index: 3, vetting: 'unverified' },
      { message: 'ok thanks', reply: 'Good luck!', started_at: at(8), conversation_id: 'c1', turn_index: 4, vetting: 'passed' }
    ]
  },
  {
    user: 'app:b2', events: [],
    turns: [
      { message: 'Is 3/4 + 1/8 = 4/12?', reply: 'Not quite.', started_at: at(2), conversation_id: 'c2', turn_index: 1, assessment: { skill: 'Adding fractions', correct: false } },
      { message: 'Then what do I do?', reply: 'Find a common denominator.', started_at: at(5), conversation_id: 'c2', turn_index: 2 }
    ]
  }
];

test('cases from past turns: a varied, repeatable set, each with its conversation and the teacher’s rubric', () => {
  const { cases, eligible } = casesFromTurns(records, teaching);
  assert.deepEqual(eligible, { not_passed: 1, after_wrong_answer: 2, first_turn: 2 });
  assert.deepEqual(cases.map((item) => [item.kind, item.from.learner, item.from.turn]), [
    ['not_passed', 'app:a1', 3], ['after_wrong_answer', 'app:a1', 2], ['first_turn', 'app:a1', 1], ['after_wrong_answer', 'app:b2', 2], ['first_turn', 'app:b2', 1]
  ]);
  assert.deepEqual(cases[0].messages.map((message) => message.role), ['user', 'assistant', 'user', 'assistant', 'user']);
  assert.equal(cases[0].messages.at(-1).content, 'Just tell me the answer');
  assert.ok(cases[1].rubric.includes(teaching.goal) && cases[1].rubric.includes(HELP_LEVELS.hint));
  assert.match(cases[1].rubric, /wrong answer/);
  assert.equal(cases[1].must_not, 'Give the answer or do the work for them.', 'the help level’s own words');
  assert.ok(!JSON.stringify(cases).includes(teaching.watch_for));
  assert.equal(readAgentTests({ format: 'viable.agent-tests', cases }).length, 5);
  assert.deepEqual(casesFromTurns(records, teaching), { cases, eligible }, 'the same records give the same cases');

  assert.deepEqual(casesFromTurns(records, teaching, { limit: 3 }).cases.map((item) => item.kind), ['not_passed', 'after_wrong_answer', 'first_turn']);
  const bare = casesFromTurns(records, null, { limit: 1 }).cases[0];
  assert.match(bare.rubric, /fits the activity/);
  assert.equal(bare.must_not, null);
  assert.equal(casesFromTurns(records, { help: 'explain' }, { limit: 1 }).cases[0].must_not, null, 'explain says nothing it must not do');
  assert.throws(() => casesFromTurns([{ user: 'kid@example.org', events: [], turns: [] }]), /pseudonymous IDs only/);
  assert.throws(() => casesFromTurns(records, teaching, { limit: 0 }), /1 to 25/);
});

const verdicts = (list) => ({ judge_model: 'judge', results: list.map(([name, verdict]) => ({ name, verdict, reason: `${verdict} because` })) });

test('the judge against a person: the table, every disagreement and, from 10 labelled cases, agreement and kappa', () => {
  // 12 labelled: 5 both pass, 1 person pass/judge fail, 1 person fail/judge pass, 5 both fail.
  const list = [...Array.from({ length: 6 }, (_, i) => [`p${i}`, i < 5 ? 'pass' : 'fail']), ...Array.from({ length: 6 }, (_, i) => [`f${i}`, i < 5 ? 'fail' : 'pass']), ['broken', 'error'], ['extra', 'pass']];
  const labels = Object.fromEntries([...Array.from({ length: 6 }, (_, i) => [`p${i}`, 'pass']), ...Array.from({ length: 6 }, (_, i) => [`f${i}`, 'FAIL']), ['broken', 'fail']]);
  const out = calibrateJudge(verdicts(list), labels);
  assert.equal(out.labelled, 12);
  assert.deepEqual(out.confusion, { person_pass: { judge_pass: 5, judge_fail: 1 }, person_fail: { judge_pass: 1, judge_fail: 5 } });
  assert.equal(out.agreement, 0.833);
  assert.equal(out.chance, 0.5);
  assert.equal(out.kappa, 0.667);
  assert.deepEqual(out.disagreements, [{ name: 'p5', person: 'pass', judge: 'fail', reason: 'fail because' }, { name: 'f5', person: 'fail', judge: 'pass', reason: 'pass because' }]);
  assert.deepEqual(out.unjudged, ['broken']);
  assert.equal(out.unlabelled, 1);
  assert.equal(out.judge_model, 'judge');

  const few = calibrateJudge(verdicts(list).results, Object.fromEntries(Object.entries(labels).slice(0, CALIBRATION_MIN_CASES - 1)));
  assert.equal(few.labelled, 9);
  assert.equal(few.agreement, null);
  assert.equal(few.kappa, null);
  assert.match(few.note, /too unsteady to report/);
  assert.equal(few.disagreements.length, 1, 'disagreements are listed even below 10');

  const same = calibrateJudge(verdicts(Array.from({ length: 10 }, (_, i) => [`c${i}`, 'pass'])), Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, 'pass'])));
  assert.equal(same.agreement, 1);
  assert.equal(same.kappa, null);
  assert.match(same.note, /kappa is undefined/);

  assert.throws(() => calibrateJudge(verdicts(list), { p0: 'maybe' }), /pass or fail/);
  assert.throws(() => calibrateJudge(verdicts([['a', 'pass'], ['a', 'fail']]), {}), /different names/);
  assert.throws(() => calibrateJudge({}, {}), /test run’s results/);
});

test('the CLI takes cases from records and calibrates, writing files the test command reads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-harness-cases-'));
  const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  const files = records.map((record, index) => { const path = join(dir, `record-${index}.json`); writeFileSync(path, JSON.stringify(record)); return path; });
  const out = join(dir, 'cases.json');
  const taken = run('tests-from-records', ...files, '--teaching', PACKAGE, '--count', '2', '--out', out);
  assert.equal(taken.status, 0, taken.stderr);
  assert.match(taken.stderr, /2 cases from 5 eligible turns/);
  assert.match(taken.stderr, /only with consent/);
  assert.equal(readAgentTests(JSON.parse(readFileSync(out, 'utf8'))).length, 2);

  const results = join(dir, 'results.json');
  const labels = join(dir, 'labels.json');
  writeFileSync(results, JSON.stringify(verdicts([['a', 'pass'], ['b', 'fail']])));
  writeFileSync(labels, JSON.stringify({ a: 'pass', b: 'pass' }));
  const checked = run('calibrate', results, labels);
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /person pass\s+1\s+1/);
  assert.match(checked.stdout, /too unsteady to report/);
  assert.match(checked.stdout, /b: person pass, judge fail: fail because/);
  assert.match(run('draft-tests', PACKAGE).stderr, /Name the model/);
});

test('the CLI drafts from a package on the endpoint in the environment, and says what to do with the drafts', async () => {
  const answer = { cases: [{ kind: 'ordinary', name: 'Where to start', message: 'How do I add 2/3 and 1/6?', rubric: 'Asks what the learner knows about the denominators.' }, { kind: 'distress', name: 'Upset', message: 'I hate this' }] };
  const asked = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      asked.push(JSON.parse(body));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }], usage: { total_tokens: 5 } }));
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const child = spawn(process.execPath, [bin, 'draft-tests', PACKAGE, '--model', 'drafter', '--count', '2'], { env: { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1` } });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    assert.equal(await new Promise((done) => child.on('close', done)), 0, err);
    assert.equal(asked[0].model, 'drafter');
    assert.deepEqual(readAgentTests(JSON.parse(out)).map((item) => item.name), ['Where to start']);
    assert.match(err, /Rejected case 2 \(Upset\): Say what a good reply does/);
    assert.match(err, /No valid case covers: asks_for_answer/);
    assert.match(err, /read and edit each before running it/);
  } finally {
    server.close();
  }
});

test('tests of what is behind an endpoint, with no agent file, make a page named for it', async () => {
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: '{"verdict":"pass","reason":"It asks a question."}' }, finish_reason: 'stop' }], usage: { total_tokens: 5 } }));
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const dir = mkdtempSync(join(tmpdir(), 'viable-endpoint-'));
  writeFileSync(join(dir, 'cases.json'), JSON.stringify([{ name: 'Asks for the answer', message: 'What is 3/4 + 1/8?', rubric: 'Asks a question and gives no sum.' }]));
  try {
    const harness = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
    const base = `http://127.0.0.1:${server.address().port}/v1`;
    const child = spawn(process.execPath, [harness, 'test', join(dir, 'cases.json'), '--endpoint', base, '--endpoint-model', 'my-tutor', '--judge-model', 'judge', '--html', '--out', join(dir, 'report.html'), '--no-open'], { env: { ...process.env, OPENAI_BASE_URL: base, OPENAI_API_KEY: 'k' } });
    let err = '';
    child.stderr.on('data', (chunk) => { err += chunk; });
    assert.equal(await new Promise((done) => child.on('close', done)), 0, err);
    assert.match(readFileSync(join(dir, 'report.html'), 'utf8'), /<title>1 of 1 passed \| Tests of my-tutor<\/title>/);
  } finally {
    server.close();
  }
});

test('an endpoint under test gets what How the AI helps prepares for each turn, after its own system prompt', async () => {
  const { agentAt } = await import('../src/testRuns.js');
  const sent = [];
  const fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return Response.json({ choices: [{ message: { role: 'assistant', content: 'What do the two fractions need?' }, finish_reason: 'stop' }], usage: { total_tokens: 3 } }); };
  const run = agentAt({ baseUrl: 'http://127.0.0.1:9/v1', model: 'my-tutor', fetch, system: 'You tutor fractions.' });
  await run(null, { input: 'What is 3/4 + 1/8?', history: [], teaching: { goal: 'Add fractions with unlike denominators.', help: 'hint' } });
  await run(null, { input: 'What is 3/4 + 1/8?', history: [] });
  const [taught, plain] = sent.map((body) => body.messages[0]);
  assert.match(taught.content, /^You tutor fractions\.\n\n/);
  assert.match(taught.content, /Add fractions with unlike denominators/);
  assert.equal(plain.content, 'You tutor fractions.', 'with no teaching, only its own prompt');
});
