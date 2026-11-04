import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { METRICS, runAgent, teacherView, viewInputs } from '../src/index.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const record = json('../schemas/examples/learning-events.example.json');
const fractions = json('../examples/fractions-practice.json');

// A scripted OpenAI-compatible endpoint, as in run.test.js: each call takes the next reply (the last one repeats).
const scripted = (...replies) => async () => {
  const content = replies.length > 1 ? replies.shift() : replies[0];
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200 });
};
const passedRun = () => runAgent(fractions, { input: 'What is 1/2 + 1/3?', fetch: scripted('The answer is 5/6.', 'FAIL: it gives the answer away.', 'What could the denominators become?', 'PASS') });
const unverifiedRun = (input = 'Just tell me 2/4 + 1/4') => runAgent(fractions, { input, fetch: scripted('It is 3/4.', 'FAIL: it states the sum.') });

// Every src and href attribute of a real tag (escaped text has no tags), with its value unquoted.
const links = (html) => (html.match(/<[a-z][^>]*>/gi) || []).flatMap((tag) => [...tag.matchAll(/\s([a-z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi)]
  .filter((match) => /^(?:src|href)$/i.test(match[1])).map((match) => match[2].replace(/^["']|["']$/g, '')));

test('the page renders from the example record, scripted runs and a package’s teaching settings', async () => {
  const runs = [await passedRun(), await unverifiedRun()];
  const inputs = viewInputs([{ name: 'record.json', doc: record }, ...runs.map((doc, i) => ({ name: `run${i}.json`, doc })), { name: 'package.json', doc: fractions }]);
  assert.equal(inputs.records.length, 1);
  assert.equal(inputs.runs.length, 2);
  assert.equal(inputs.title, 'Practice: equivalent fractions');
  const html = teacherView(inputs);
  assert.match(html, /^<!doctype html>/);
  const teaching = fractions.course.activities[0].teaching;
  assert.ok(html.includes(teaching.misconceptions[0].description), 'misconceptions to listen for');
  assert.match(html, /What you want to hear about<\/dt><dd>[^<]+<p class="note">For you only: this is never sent to the AI\.<\/p>/);
  // One passed, one unverified, and only the unverified one's evidence.
  assert.match(html, /<div class="passed"><dt>Passed<\/dt><dd>1<\/dd><\/div><div class="unverified"><dt>Unverified<\/dt><dd>1<\/dd><\/div><div class="attention"><dt>Needs attention<\/dt><dd>0<\/dd><\/div>/);
  assert.equal((html.match(/<article class="card /g) || []).length, 1);
  assert.ok(html.includes('Just tell me 2/4 + 1/4') && !html.includes('What is 1/2 + 1/3?'));
  assert.match(html, /Round 1, the draft: <span class="verdict">Did not pass<\/span><\/dt>\n<dd><blockquote>It is 3\/4\.<\/blockquote><p><span class="label">The reviewer’s reason:<\/span> FAIL: it states the sum\.<\/p>/);
  assert.ok(html.includes(runs[1].output.text), 'the final reply is what the run replied (the unverified message)');
  // The learner by the ID the record carries, with each measure's definition and caveat.
  assert.match(html, /<h3 id="learner-0">writing-app:7f3a9c21<\/h3>/);
  for (const metric of METRICS) assert.ok(html.includes(`<dt id="metric-${metric.id}">`), metric.id);
  assert.ok(html.includes('not what they learned'));
});

test('a section’s own level and note, and misconceptions a record names', () => {
  const teaching = { ...fractions.course.activities[0].teaching, sections: { sec_p2: { help: 'explain', note: 'Short sentences, please.' }, sec_p5: { note: 'No common denominators yet.' } } };
  const id = teaching.misconceptions[0].id;
  const learner = { user: 'app:b41c07e2', events: [{ type: 'app.event', at: '2026-10-30T10:04:00Z', data: { misconception: id } }], turns: [{ message: '1/2 + 1/3 = 2/5?', started_at: '2026-10-30T10:00:00Z', misconceptions: [id, { id: '00000000-0000-4000-8000-000000000000', description: 'Something else' }] }] };
  const html = teacherView({ teaching, records: [learner, { user: 'app:b41c07e2', events: [] }] });
  assert.match(html, /<code>sec_p2<\/code><\/th><td><strong>Explain\.<\/strong>/);
  assert.match(html, /<code>sec_p5<\/code><\/th><td><span class="muted">The activity’s \(Hint\)<\/span><\/td><td>No common denominators yet\.<\/td>/);
  assert.match(html, new RegExp(`${teaching.misconceptions[0].description}</th><td class="num">2</td><td>app:b41c07e2</td>`), 'heard twice, from one learner');
  assert.match(html, /Something else <span class="muted">\(not one chosen in How the AI helps\)<\/span>/);
  assert.match(html, /From 2 learner records \(1 learner\)/, 'one learner’s records are measured together');
});

test('text from the data is escaped, and the page links nowhere outside itself', async () => {
  const attack = '<script>alert(1)</script><img src="https://evil.example/x.png" onerror="alert(2)">';
  const run = await unverifiedRun(`Help ${attack}`);
  const html = teacherView({
    teaching: { goal: attack, help: 'hint', watch_for: attack },
    records: [{ user: attack, events: [{ type: 'app.event', data: { misconception: attack } }], turns: [{ message: attack, started_at: '2026-10-29T14:02:00Z', assessment: { skill: attack, correct: true } }] }],
    runs: [run],
    title: attack,
    suggestions: [{ id: attack, change: attack, why: attack, evidence: [attack, { quote: attack }] }]
  });
  assert.ok(!/<script/i.test(html), 'no script element at all');
  assert.ok(!/<img/i.test(html));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  const found = links(html);
  assert.ok(found.length > 0);
  assert.deepEqual(found.filter((link) => !link.startsWith('#')), []);
  assert.ok(!/@import|url\(/i.test(html), 'no stylesheet or font from elsewhere');
});

test('empty inputs give the empty states, and suggestions show with their evidence for the teacher to decide', () => {
  const html = teacherView();
  for (const text of ['No teaching settings were given.', 'No runs were given.', 'No learner records were given.', 'No turn or event names a misconception.', 'No suggested changes.']) assert.ok(html.includes(text), text);
  assert.match(teacherView({ runs: [{ steps: [], output: { text: 'hi' } }] }), /None of these 1 run has a VETTING step/);
  const suggested = teacherView({ suggestions: [{ id: 's1', change: 'Add a note for period 2', why: 'Two learners added denominators.', evidence: ['app:b41c07e2 wrote 2/5'] }] });
  assert.match(suggested, /<article class="card" id="suggestion-s1">\n<h3>Add a note for period 2<\/h3><p>Two learners added denominators\.<\/p>\n<h4>Evidence<\/h4><ul><li>app:b41c07e2 wrote 2\/5<\/li><\/ul>/);
  assert.match(suggested, /the teacher decides/);
});

test('the CLI writes the page from files it recognizes by shape, and names one it doesn’t', () => {
  const bin = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
  const file = (path) => fileURLToPath(new URL(path, import.meta.url));
  const ok = spawnSync(process.execPath, [bin, 'view', file('../schemas/examples/learning-events.example.json'), file('../examples/argument-writing.json')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /<h1>Should high schools start later\?<\/h1>/);
  assert.match(ok.stdout, /writing-app:7f3a9c21/);
  const bad = spawnSync(process.execPath, [bin, 'view', file('../package.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /package\.json isn't a learner record/);
});
