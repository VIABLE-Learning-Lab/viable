import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { METRICS, runAgent, teacherView, viewInputs } from '../../engine/src/index.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const record = json('../schemas/examples/learning-events.example.json');
const fractions = json('../../examples/fractions-practice.json');

// A scripted OpenAI-compatible endpoint, as in run.test.js: each call takes the next reply (the last one repeats).
const scripted = (...replies) => async () => {
  const content = replies.length > 1 ? replies.shift() : replies[0];
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200 });
};
const passedRun = () => runAgent(fractions, { input: 'What is 1/2 + 1/3?', fetch: scripted('The answer is 5/6.', 'FAIL: it gives the answer away.', 'What could the denominators become?', 'PASS') });
const firstDraftRun = () => runAgent(fractions, { input: 'Why do I need the same bottom?', fetch: scripted('What are the pieces called?', 'PASS') });
const unverifiedRun = (input = 'Just tell me 2/4 + 1/4') => runAgent(fractions, { input, fetch: scripted('It is 3/4.', 'FAIL: it states the sum.') });

// Every src and href attribute of a real tag (escaped text has no tags), with its value unquoted.
const links = (html) => (html.match(/<[a-z][^>]*>/gi) || []).flatMap((tag) => [...tag.matchAll(/\s([a-z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi)]
  .filter((match) => /^(?:src|href)$/i.test(match[1])).map((match) => match[2].replace(/^["']|["']$/g, '')));

test('the page renders from the example record, scripted runs and a package’s teaching settings', async () => {
  const runs = [await passedRun(), await unverifiedRun(), await firstDraftRun()];
  const inputs = viewInputs([{ name: 'record.json', doc: record }, ...runs.map((doc, i) => ({ name: `run${i}.json`, doc })), { name: 'package.json', doc: fractions }]);
  assert.equal(inputs.records.length, 1);
  assert.equal(inputs.runs.length, 3);
  assert.equal(inputs.title, 'Practice: equivalent fractions');
  const html = teacherView(inputs);
  assert.match(html, /^<!doctype html>/);
  const teaching = fractions.course.activities[0].teaching;
  assert.ok(html.includes(teaching.misconceptions[0].description), 'misconceptions to listen for');
  assert.match(html, /What you want to hear about<\/dt><dd>[^<]+<p class="note">For you only: this is never sent to the AI\.<\/p>/);
  // Two passed, one unverified. The evidence for the one sent back and rewritten and the unverified one; a first draft that passed has none.
  assert.match(html, /<div class="passed"><dt class="v-mark pass">Passed<\/dt><dd>2<\/dd><\/div><div class="unverified"><dt class="v-mark unverified">Unverified<\/dt><dd>1<\/dd><\/div><div class="attention"><dt class="v-mark attention">Needs attention<\/dt><dd>0<\/dd><\/div>/);
  assert.equal((html.match(/<article class="card /g) || []).length, 2);
  assert.ok(html.includes('Just tell me 2/4 + 1/4') && html.includes('What is 1/2 + 1/3?') && !html.includes('Why do I need the same bottom?'));
  assert.ok(html.indexOf('Just tell me 2/4 + 1/4') < html.indexOf('What is 1/2 + 1/3?'), 'what never passed comes first');
  // The struck draft and the reviewer's reason, without the verdict the mark already gives.
  assert.match(html, /<p class="round-name">Round 1, the draft<span class="v-mark fail">Did not pass<\/span><\/p><div class="round-body"><div class="draft"><del>It is 3\/4\.<\/del><\/div><p class="pencil"><span class="pencil-who">The reviewer’s reason: <\/span>it states the sum\.<\/p>/);
  assert.match(html, /Passed, after a rewrite/);
  assert.match(html, /The AI worked with 1 learner\. A second model reviewed 3 of its replies, and sent 2 back\. One never passed\./);
  assert.match(html, /aria-label="3 replies reviewed: 2 passed, 1 unverified\."/, 'the marks at a glance have a name');
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
  assert.match(html, new RegExp(`${teaching.misconceptions[0].description}</h3>\\n<p class="who">.*</span> 1 of 1 learner, 2 times</p>\\n<ul class="names"><li class="v-pill">app:b41c07e2</li></ul>`), 'heard twice, from one learner');
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
  assert.ok(!/@import/i.test(html), 'no stylesheet from elsewhere');
  for (const [, target] of html.matchAll(/url\(([^)]{0,30})/gi)) assert.match(target, /^(?:data:font\/woff2;base64,|#v-mark-ring)/, 'no font from elsewhere');
  assert.ok(!/viablelab\.org/i.test(html), 'no hostname of ours');
});

test('empty inputs give the empty states, and suggestions show with their evidence for the teacher to decide', () => {
  const html = teacherView();
  for (const text of ['No teaching settings were given.', 'No runs were given.', 'No learner records were given.', 'No turn or event names a misconception.', 'No suggested changes.']) assert.ok(html.includes(text), text);
  assert.match(teacherView({ runs: [{ steps: [], output: { text: 'hi' } }] }), /None of these 1 run has a VETTING step/);
  const suggested = teacherView({ suggestions: [{ id: 's1', change: 'Add a note for period 2', why: 'Two learners added denominators.', evidence: ['app:b41c07e2 wrote 2/5'] }] });
  assert.match(suggested, /<div class="change-card" id="suggestion-s1"><article class="suggestion"><div class="change"><h3>Add a note for period 2<\/h3><p>Two learners added denominators\.<\/p><\/div><div class="grounds"><h4>Evidence<\/h4><ul><li>app:b41c07e2 wrote 2\/5<\/li><\/ul><h4>What to do next<\/h4><p>This one changes no setting\./);
  assert.match(suggested, /the teacher decides/);
});

test('suggestions say in words what accepting them changes, with the scale from where it is to where it would go', () => {
  const teaching = { goal: 'Add fractions.', help: 'hint' };
  const page = (patch, settings = teaching) => teacherView({ teaching: settings, suggestions: [{ id: 's', change: 'c', why: 'w', evidence: [], patch }] });
  const scale = (html) => html.match(/<div class="grounds">.*?<ol class="scale"[^>]*>(.*?)<\/ol>/s)?.[1];
  assert.match(page({ help: 'explain' }), /set how far the AI may go to <strong>Explain<\/strong>\./);
  assert.match(scale(page({ help: 'explain' })), /<li class="from">Hint<\/li><li class="on">Explain<\/li>/);
  assert.match(page({ sections: { sec_p2: { help: 'explain' } } }), /<strong>Explain<\/strong> for section <code>sec_p2<\/code>\./);
  assert.match(page({ misconceptions: [] }), /add it to the misconceptions the AI listens for/);
  assert.match(page({ help: '<b>' }), /It proposes: <code>\{&quot;help&quot;:&quot;&lt;b&gt;&quot;\}<\/code>/, 'a patch it can’t read is shown, as text');
});

test('a misconception a record names by its ID shows by its words, and a class of 30 stays one readable page', async () => {
  const { findMisconceptions } = await import('../src/index.js');
  const known = findMisconceptions('add fractions').data[0].misconceptions[0];
  const graded = Array.from({ length: 60 }, (_, i) => ({ type: 'questions.answer', at: `2026-10-20T14:${String(i).padStart(2, '0')}:00Z`, seq: i, data: { correct: false, skill: 'Fractions' } }));
  const records = Array.from({ length: 30 }, (_, i) => ({ user: `app:learner${i}`, events: i === 29 ? graded : [], turns: [{ message: 'm', reply: 'r', started_at: '2026-10-20T14:00:00Z', misconceptions: [known.id] }] }));
  const sentBack = (i) => ({ steps: [{ nodeType: 'vetting', input: { message: `asked ${i}` }, output: { outcome: 'passed', content: 'r', attempt_details: [{ attempt: 1, verdict: 'fail', reply: 'd', feedback: 'FAILED: x' }, { attempt: 2, verdict: 'pass', reply: 'r' }] } }], output: { text: 'r' } });
  const html = teacherView({ records, runs: Array.from({ length: 70 }, (_, i) => sentBack(i)) });
  assert.ok(html.includes(known.description) && !html.includes(`<code>${known.id}</code>`));
  assert.match(html, /30 of 30 learners, 30 times/);
  assert.equal((html.match(/<article class="learner /g) || []).length, 30);
  assert.match(html, /<h3 id="learner-0">app:learner29<\/h3>/, 'the learner wheel-spinning comes first');
  assert.equal(html.match(/<p class="strip"[^>]*>(.*?)<\/p>/)[1].match(/v-mark/g).length, 40, 'the latest attempts, not all of them');
  assert.match(html, /<details class="more"><summary>65 more replies<\/summary>/, 'five stay open, the rest a click away');
  assert.match(html, /The first 60 of 70 replies\./);
  assert.match(html, /details::details-content\{display:block;content-visibility:visible\}/, 'all of it prints');
});

test('the CLI writes the page from files it recognizes by shape, and names one it doesn’t', () => {
  const bin = fileURLToPath(new URL('../../engine/bin/viable-engine.mjs', import.meta.url));
  const file = (path) => fileURLToPath(new URL(path, import.meta.url));
  const ok = spawnSync(process.execPath, [bin, 'view', file('../schemas/examples/learning-events.example.json'), file('../../examples/argument-writing.json')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /<h1>Should high schools start later\?<\/h1>/);
  assert.match(ok.stdout, /writing-app:7f3a9c21/);
  const bad = spawnSync(process.execPath, [bin, 'view', file('../package.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /package\.json isn't a learner record/);
});
