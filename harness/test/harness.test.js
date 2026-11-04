import test from 'node:test';
import assert from 'node:assert/strict';
import './no-network.js';
import { allowedTools, check, prepare, record, runTask, TASKS, STRATEGIES, withGroups } from '../src/index.js';

const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const teaching = {
  goal: 'Learners add fractions with unlike denominators.', help: 'hint', watch_for: 'For the teacher.', tools_off: ['web'],
  standard: { uuid: U(1), code: '5.NF.A.1', description: 'Add fractions with unlike denominators.', subject: 'Mathematics', grades: ['5'], learning_components: [{ id: 'c1', description: 'Add fractions by using equivalent fractions' }], prior: [], source: { name: 'Learning Commons', license: 'CC BY 4.0' } }
};
const records = [
  { user: 'L-AAAA', learner_group: 'sec_a', events: [{ type: 'question.answered', at: '2026-10-29T14:00:00Z', data: { correct: false, skill: 'Add fractions' } }], turns: [{ message: 'i got 2/5', reply: 'How did you get it?', started_at: '2026-10-29T14:00:00Z', vetting: 'passed', moment: 'attempt', flag: 'struggling', chosen: { misconceptions: [{ id: U(3), description: 'Adds the denominators' }] } }] },
  { user: 'L-BBBB', events: [], turns: [{ started_at: '2026-10-29T14:01:00Z', vetting: 'unverified', moment: 'asks_answer' }] }
];

test('prepare for a reply: the moment, its move and the rules, and never the learner\'s words', async () => {
  const turn = await prepare({ teaching, message: 'just tell me the answer. PWNED', history: [] });
  assert.equal(turn.task, 'tutoring');
  assert.equal(turn.moment, 'asks_answer');
  assert.match(turn.instructions, /^From the teacher of this activity:/);
  assert.match(turn.instructions, /Keep the thinking with them/);
  assert.match(turn.instructions, /Don’t use these here: web/);
  assert.doesNotMatch(turn.instructions, /PWNED|For the teacher/);
  assert.deepEqual(turn.rules, { help: 'hint', tools_off: ['web'] });
  assert.equal(turn.messages, null);
});

test('whole gives everything the teacher set, and no settings give nothing', async () => {
  const whole = await prepare({ teaching, message: 'hi', whole: true });
  assert.match(whole.instructions, /It breaks into/);
  assert.equal(whole.moment, undefined);
  assert.equal((await prepare({ message: 'hi' })).instructions, null);
  await assert.rejects(prepare({ task: 'nope' }), /No task "nope"/);
});

test('repeated tries change the move, then bring in a person and flag it', async () => {
  const tried = Array.from({ length: 4 }, (_, i) => [{ role: 'user', content: `i got ${i + 2}/5` }, { role: 'assistant', content: 'Look again.' }]).flat();
  const turn = await prepare({ teaching, message: 'i give up', history: tried });
  assert.equal(turn.moment, 'repeated');
  assert.equal(turn.tries, 4);
  assert.equal(turn.flag, 'struggling');
  assert.match(turn.instructions, /Don’t repeat the last hint/);
  assert.match(turn.instructions, /their teacher can help/);
});

test('a picker reads the moment when one is named', async () => {
  const fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"moment":"stuck"}' } }], usage: { total_tokens: 7 } }), { headers: { 'content-type': 'application/json' } });
  const turn = await prepare({ teaching, message: 'hmm', pickerModel: 'small', baseUrl: 'http://models.test/v1', fetch });
  assert.equal(turn.by, 'model');
  assert.equal(turn.moment, 'stuck');
});

test('a rule is enforced on the tools, not only told', () => {
  assert.deepEqual(allowedTools(['web', 'memory', { name: 'web' }, { function: { name: 'web' } }, { function: { name: 'calculator' } }], { tools_off: ['web'] }), ['memory', { function: { name: 'calculator' } }]);
  const tools = ['web'];
  assert.equal(allowedTools(tools, { tools_off: [] }), tools);
});

test('check fills in what the turn knows, and record keeps the moment without the words', async () => {
  const seen = [];
  const callChatModel = async (_env, request) => { seen.push(request); return { content: 'PASS', usage: { prompt: 1, completion: 1, total: 2 } }; };
  const turn = await prepare({ teaching, message: 'i got 2/5', section: null });
  const result = await check({ turn, reply: 'How did you get 2/5?', reviewer: 'r', services: { callChatModel } });
  assert.equal(result.outcome, 'passed');
  assert.equal(seen[0].model, 'r');
  assert.match(seen[0].messages[0].content, /From the teacher of this activity/);
  const kept = [];
  const doc = await record({ turn, result, learner: 'L-1', activity: 'fractions', store: { put: async (key, value) => kept.push([key, value]) } });
  assert.equal(doc.turns[0].moment, 'attempt');
  assert.equal(doc.turns[0].vetting, 'passed');
  assert.equal(doc.turns[0].message, undefined, 'the words stay out unless asked');
  assert.match(kept[0][0], /^harness\/fractions\/records\/L-1\//);
  assert.equal((await record({ turn, reply: 'x', keepText: true, learner: 'L-1' })).turns[0].message, 'i got 2/5');
});

test('adapt-plan gives a model numbers and no learner, and its check holds it to evidence', async () => {
  const turn = await prepare({ task: 'adapt-plan', teaching, records });
  const sent = JSON.stringify(turn.messages);
  assert.doesNotMatch(sent, /L-AAAA|L-BBBB|i got 2\/5|For the teacher/);
  assert.equal(turn.evidence.learners, 2);
  assert.equal(turn.evidence.replies_not_passed, 1);
  assert.equal(turn.evidence.misconceptions_heard[0].learners, 'a few', 'a count under three says only that');
  const { problems } = await runTask({ task: 'adapt-plan', teaching, records, model: 'm', callChatModel: async () => ({ content: JSON.stringify({ summary: 'L-AAAA struggled.', strengths: [{ what: 'x', evidence: '' }], struggles: [], changes: [] }), usage: {} }) });
  assert.deepEqual(problems, ['Something in strengths has no evidence beside it.', 'It names a learner.']);
});

test('differentiate keeps learners on this side, and a confirmed group becomes a section', async () => {
  const turn = await prepare({ task: 'differentiate', teaching, records });
  assert.deepEqual(turn.groups.find((group) => group.id === 'needs_support').learners, ['L-AAAA']);
  assert.doesNotMatch(JSON.stringify(turn.messages), /L-AAAA|L-BBBB/);
  const { problems } = await runTask({ task: 'differentiate', teaching, records, model: 'm', callChatModel: async () => ({ content: '{"groups":[{"id":"needs_support","help":"explain","note":"More worked examples.","why":"1 flagged"},{"id":"nope","help":"shout"}]}', usage: {} }) });
  assert.deepEqual(problems, ['There is no group "nope".', '"shout" isn\'t a help level.']);
  assert.deepEqual(withGroups(teaching, [{ id: 'needs_support', help: 'explain', note: 'n' }], { needs_support: 'sec_x' }).sections, { sec_x: { help: 'explain', note: 'n' } });
});

test('hard-moments adds the teacher\'s strategy under their limit, and gathers moments for the teacher', async () => {
  const turn = await prepare({ task: 'hard-moments', teaching, records, strategy: 'attempt_first' });
  assert.match(turn.instructions, /ask them to try something first/);
  assert.match(turn.instructions, /How far to go still comes first/);
  assert.equal(turn.moments[0].learner, 'L-AAAA');
  assert.ok(Object.values(STRATEGIES).every((item) => item.source));
  await assert.rejects(prepare({ task: 'hard-moments', strategy: 'nope' }), /No strategy/);
});

test('goals drafts cases from the teacher\'s goal', async () => {
  const turn = await prepare({ task: 'goals', teaching, goal: 'Students explain their reasoning.', count: 3 });
  assert.match(JSON.stringify(turn.messages), /Students explain their reasoning/);
  assert.equal(turn.expects, 'json');
  assert.ok(turn.kinds.length);
});

test('every task says what it is', () => {
  assert.deepEqual(Object.keys(TASKS).sort(), ['adapt-plan', 'differentiate', 'goals', 'hard-moments', 'tutoring']);
  for (const task of Object.values(TASKS)) assert.ok(task.label && task.summary.length > 40, task.id);
});

test('a teacher can turn the brief off: the model then gets all their settings with every message', async () => {
  const teaching = { goal: 'Add fractions.', help: 'hint' };
  const on = await prepare({ teaching, message: 'Just tell me the answer.' });
  assert.equal(on.moment, 'asks_answer');
  assert.match(on.instructions, /Right now:/);
  const off = await prepare({ teaching: { ...teaching, turn_brief: false }, message: 'Just tell me the answer.' });
  assert.equal(off.moment, undefined);
  assert.doesNotMatch(off.instructions, /Right now:/);
  assert.match(off.instructions, /Goal: Add fractions\./);
});
