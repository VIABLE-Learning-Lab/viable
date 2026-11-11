// A teacher's steps held by code, in a whole turn: the question the learner has open gives the tries and the answers code can
// look for, the brief decides the step, and the VETTING step holds the reply to it. Without a ladder nothing here changes.
import '../../harness/test/no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openContext } from '../src/agents/expression.js';
import { keyAnswers } from '../src/learner/questions.js';
import { turnRecord } from '../src/learner/watch.js';
import { keyedTurn, workspaceContext, workspaceSettings } from '../src/learner/workspace.js';
import { runWithServices } from '../src/server/runtime.js';

const SET = `qs_${'0'.repeat(24)}`;
const ITEM = { id: 'q1', type: 'fill', prompt: 'What is 1/2 + 1/3?', choices: null, answer: { accept: ['5/6', '10/12'] }, explanation: 'Turn both into sixths.', hints: [], skill: null };
const WORKSPACE = workspaceSettings({ ai: 'right', panels: [{ id: 'qs', type: 'questions', title: 'Fractions', set_id: SET }] });
const LADDER = { goal: 'Add fractions with unlike denominators.', help: 'step_up', ladder: true };
const contextFor = (teaching, state = {}) => workspaceContext(WORKSPACE, { panel: 'qs', item: 'q1', ...state }, new Map([[SET, { items: [ITEM] }]]), {}, {}, teaching);
const GRAPH = { entry: 'check', nodes: [
  { id: 'check', type: 'vetting', config: { mode: 'full', model: 'writer', verification_model: 'reviewer', question: '{{context.question}}', answer_key: '{{context.answer_key}}', max_attempts: 3 }, branches: { passed: 'out', unverified: 'sorry', attention: 'sorry' } },
  { id: 'out', type: 'output', config: { text: '{{check.content}}' } },
  { id: 'sorry', type: 'output', config: { text: 'FALLBACK' } }
] };
// A scripted pair of models: what the reply model writes in turn, and what the reviewer says in turn (the last repeats).
function models(written, verdicts = ['PASS']) {
  const seen = [];
  const next = (list) => (list.length > 1 ? list.shift() : list[0]);
  const callChatModel = async (_env, request) => { seen.push(request); return { content: request.model === 'reviewer' ? next(verdicts) : next(written), usage: { prompt: 1, completion: 1, total: 2 }, cost: 0 }; };
  return { seen, callChatModel, of: (model) => seen.filter((request) => request.model === model) };
}
const turn = (teaching, state, input, script) => runWithServices({ format: 'viable.agent', name: 'T', graph: GRAPH }, { input, context: contextFor(teaching, state), briefing: teaching, brief: true, services: { callChatModel: script.callChatModel } });
const checked = (result) => result.steps.find((step) => step.nodeType === 'vetting').output;

test('the open question gives code the answers it can look for and the tries the page has checked, and neither goes to a model', () => {
  assert.deepEqual(keyAnswers(ITEM), ['5/6', '10/12']);
  assert.deepEqual(keyAnswers({ type: 'single', choices: [{ id: 'a', text: 'Paris' }, { id: 'b', text: 'Rome' }], answer: { choice: 'b' } }), ['Rome']);
  assert.deepEqual(keyAnswers({ type: 'open', answer: { model: 'A long answer.' } }), [], 'a model answer isn’t one code can look for');
  const context = contextFor(LADDER, { tries: 2 });
  assert.deepEqual([context.answer_accepts, context.question_tries], [['5/6', '10/12'], 2]);
  assert.ok(!JSON.stringify(context.workspace).includes('5/6') && !context.workspace_view.includes('5/6'), 'not in what the AI is shown');
  assert.ok(!('answer_accepts' in openContext(context)) && !('answer_key' in openContext(context)), 'and sealed, as the key is');
  assert.deepEqual(keyedTurn(context), { question: 'What is 1/2 + 1/3?', answer: '5/6', tries: 2 });
  assert.deepEqual(keyedTurn({ teaching_view: 'x' }), {}, 'with no question open, a conversation counts its own tries');
});

test('with a ladder, the page’s tries decide the step, a draft that states the answer never reaches the reviewer, and the reviewer hears what the step allows', async () => {
  const script = models(['The answer is 5/6.', 'Take 2/3 + 1/7: 14/21 + 3/21 = 17/21. Now try yours again.']);
  const result = await turn(LADDER, { tries: 2 }, 'i dont get it', script);
  assert.equal(result.brief.act.act, 'example');
  assert.match(result.brief.act.example, /^\d\/\d \+ \d\/\d$/);
  assert.match(script.of('writer')[0].messages[0].content, /For this turn, decided from what they have done so far/);
  const output = checked(result);
  assert.deepEqual([output.passed, output.act, output.code_checks, output.stepped_down], [true, 'example', ['states_answer'], undefined]);
  assert.equal(script.of('reviewer').length, 1, 'only the second draft was reviewed');
  assert.match(script.of('reviewer')[0].messages[0].content, /calls for a worked example/);
  assert.ok(!script.of('writer').some((request) => JSON.stringify(request.messages).includes('10/12')), 'the reply model is never handed an accepted answer');
  assert.equal(result.output.text, 'Take 2/3 + 1/7: 14/21 + 3/21 = 17/21. Now try yours again.');
  // The count is the page's: none checked yet means a question, whatever the learner types.
  const first = await turn(LADDER, { tries: 0 }, 'is it 2/5', models(['How did you get 2/5?']));
  assert.deepEqual([first.brief.act, checked(first).act], [{ act: 'ask', tries: 0 }, 'ask']);
  // What is kept of the turn says which step it was, and what the wrong answer shows, and never the answer.
  const record = turnRecord(first.brief);
  assert.deepEqual([record.brief.act, record.brief.tries, record.brief.diagnosis, record.brief.reached], ['ask', 0, 'tops-and-bottoms', false]);
  assert.deepEqual(record.brief.went_in.slice(0, 2).map((item) => item.kind), ['step', 'diagnosis']);
  assert.ok(!JSON.stringify(record).includes('5/6'));
  // A piece that came from a component keeps the component and its version, so a paper can name it.
  const from = turnRecord({ moment: 'attempt', guidance: [{ text: 'Ask how they got it.', source: 'A framework', component: 'lab/moves@1.0.0' }] });
  assert.equal(from.brief.went_in[0].component, 'lab/moves@1.0.0');
});

test('a worked example that can’t be given is written as a hint, where the run would have taken its unverified branch', async () => {
  const script = models(['An example, in full.', 'Another, in full.', 'A third, in full.', 'What do halves and thirds both turn into?'], ['FAILED: no.', 'FAILED: no.', 'FAILED: no.', 'PASS']);
  const result = await turn(LADDER, { tries: 3 }, 'still wrong, help', script);
  const output = checked(result);
  assert.deepEqual([output.passed, output.stepped_down, output.outcome, output.attempt_details.length], [true, 'hint', 'passed', 4]);
  assert.equal(result.output.text, 'What do halves and thirds both turn into?');
  const last = script.of('writer').at(-1);
  assert.ok(last.messages[0].content.includes('Give one hint') && !last.messages[0].content.includes('Work this example'));
  assert.ok(!JSON.stringify(last.messages.slice(1)).includes('in full'), 'written from the conversation as the learner left it');
  assert.ok(!script.of('reviewer').at(-1).messages[0].content.includes('calls for a worked example'), 'and reviewed as a hint');
  // When the hint fails too, the run goes on as it did: unverified.
  const failing = await turn(LADDER, { tries: 3 }, 'help', models(['x'], ['FAILED: no.']));
  assert.deepEqual([checked(failing).passed, checked(failing).stepped_down, failing.output.text], [false, undefined, 'FALLBACK']);
});

test('without a ladder, a turn is as it was: no step, no check by code, no step down', async () => {
  const plain = { goal: 'Add fractions with unlike denominators.', help: 'step_up' };
  const script = models(['The answer is 5/6.'], ['FAILED: gives the answer.']);
  const result = await turn(plain, { tries: 3 }, 'i dont get it', script);
  const output = checked(result);
  assert.equal(result.brief.act, undefined);
  assert.deepEqual([output.act, output.code_checks, output.stepped_down, output.attempt_details.length], [undefined, undefined, undefined, 3]);
  assert.equal(script.of('reviewer').length, 3, 'every draft went to the reviewer');
  assert.ok(!script.of('reviewer')[0].messages[0].content.includes('calls for a worked example'));
});
