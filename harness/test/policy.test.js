import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_LADDER, ladderOf, replyChecks, turnAct } from '../src/policy.js';
import { checkReply } from '../src/check.js';
import { check, prepare, record } from '../src/harness.js';
import { teachingContext, teachingSettings } from '../src/teaching.js';

test('a ladder is kept only when asked for, within its limits, an example never before a hint', () => {
  assert.deepEqual(ladderOf(true), DEFAULT_LADDER);
  assert.deepEqual(ladderOf({ hint_after: 0, example_after: 1 }), { hint_after: 0, example_after: 1 });
  assert.deepEqual(ladderOf({ hint_after: 0, example_after: 0 }), { hint_after: 0, example_after: 2 }, 'a number outside the limits is the usual one');
  assert.deepEqual(ladderOf({ hint_after: 3, example_after: 2 }), { hint_after: 3, example_after: 4 });
  assert.deepEqual(ladderOf({ hint_after: 99, example_after: 'soon' }), DEFAULT_LADDER);
  for (const none of [undefined, null, false, 'yes', 1, []]) assert.equal(ladderOf(none), null);
  assert.deepEqual(teachingSettings({ help: 'step_up', ladder: true }).ladder, DEFAULT_LADDER);
  assert.equal('ladder' in teachingSettings({ help: 'step_up' }), false, 'settings saved before a ladder read the same');
  assert.doesNotMatch(teachingContext({ help: 'step_up', ladder: true }).text, /ladder|hint_after/, 'the ladder is code’s, not words for the model');
});

test('code decides the act from the tries, and only where a ladder is set on a level that steps up', () => {
  const at = (given) => turnAct({ help: 'step_up', ladder: DEFAULT_LADDER, moment: 'attempt', sure: true, ...given })?.act ?? null;
  assert.deepEqual([0, 1, 2, 5].map((tries) => at({ tries })), ['ask', 'hint', 'example', 'example']);
  assert.equal(at({ tries: 0, moment: 'stuck' }), 'hint', 'someone stuck gets a hint before any try');
  assert.equal(at({ tries: 0, moment: 'asks_answer' }), 'ask', 'asking for the answer moves nothing');
  assert.equal(at({ tries: 2, moment: 'repeated', stuck: true, ladder: { hint_after: 3, example_after: 4 } }), 'hint', 'stuck still counts after the count renamed the moment');
  assert.equal(at({ tries: 1, moment: 'other' }), null, 'a message off the task gets no act');
  assert.equal(at({ tries: 1, ladder: null }), null);
  assert.equal(at({ tries: 1, help: 'hint' }), null, 'a level that never shows an example has no ladder to climb');
  // A learner with the answer is told so, ladder or not.
  assert.equal(turnAct({ help: 'hint', reached: true }).act, 'confirm');
  assert.equal(at({ tries: 3, reached: true }), 'confirm');
});

test('the line for the model says the act is not its to change, and leaves a right answer to it only where code can’t check', () => {
  const sure = turnAct({ help: 'step_up', ladder: DEFAULT_LADDER, moment: 'attempt', tries: 1, sure: true }).text;
  assert.match(sure, /^Give one hint: point at the single next step/);
  assert.match(sure, /don’t state the answer to their problem/);
  const unsure = turnAct({ help: 'step_up', ladder: DEFAULT_LADDER, moment: 'attempt', tries: 1 }).text;
  assert.match(unsure, /^If what they just wrote is the right answer, say so .* If it isn’t: Give one hint/);
  assert.doesNotMatch(turnAct({ help: 'step_up', ladder: DEFAULT_LADDER, moment: 'asks_answer', tries: 1 }).text, /^If what they just wrote/, 'a plea isn’t an answer to be right about');
});

test('code checks of a reply what code can check, and what it tells the reply model never holds the answer', () => {
  const failed = (given) => replyChecks({ question: 'What is 1/2 + 1/3?', answer: '5/6', ...given }).filter((item) => !item.passed).map((item) => item.id);
  assert.deepEqual(failed({ reply: 'So the answer is 5/6.' }), ['states_answer']);
  assert.deepEqual(failed({ reply: 'You get ten twelfths, which you can simplify.' }), ['states_answer'], 'any form of the same number');
  assert.deepEqual(failed({ reply: 'What do 2 and 3 both go into? Try 1/2 as sixths.' }), []);
  assert.deepEqual(failed({ reply: 'Yes, 5/6!', reached: true }), [], 'a learner who has it may be told so');
  // A small whole number is the answer only where the reply says it is one.
  assert.deepEqual(failed({ question: 'What is 3/4 of 12?', answer: '9', reply: 'Split 12 into 4 equal parts first. There are 9 ways to check it.' }), []);
  assert.deepEqual(failed({ question: 'What is 3/4 of 12?', answer: '9', reply: 'Three of those parts is 9.' }), ['states_answer']);
  // A key code can't match is left to the reviewer.
  assert.deepEqual(replyChecks({ question: 'Why does the Moon change shape?', answer: 'We see different amounts of its sunlit half as it orbits Earth.', reply: 'We see its sunlit half.' }), []);
  // One question where the turn gets one.
  assert.deepEqual(failed({ act: 'ask', reply: 'How did you get that?' }), []);
  assert.deepEqual(failed({ act: 'ask', reply: 'How did you get that? What did you do with the bottoms?' }), ['one_question']);
  assert.deepEqual(failed({ act: 'ask', reply: 'Look at the bottoms again.' }), ['one_question']);
  assert.deepEqual(failed({ act: 'hint', reply: 'Look at the bottoms. What do they share? Can you write both as sixths?' }), []);
  for (const item of replyChecks({ act: 'ask', question: 'What is 1/2 + 1/3?', answer: '5/6', reply: 'It is 5/6. Why? How?' })) assert.ok(!item.tell.includes('5/6'), item.id);
});

test('a turn carries its act from prepare to check to the record, and a reply that states the key never reaches a reviewer', async () => {
  const history = [{ role: 'user', content: 'i got 2/5' }, { role: 'assistant', content: 'How did you get that?' }];
  const turn = await prepare({ teaching: { help: 'step_up', ladder: true }, message: 'is it 2/6', history, question: 'What is 1/2 + 1/3?', answer: '5/6' });
  assert.deepEqual(turn.act, { act: 'hint', tries: 1 });
  assert.match(turn.instructions, /For this turn, decided from what they have done so far \(it isn’t yours to change\): Give one hint/);
  assert.ok(!turn.instructions.includes('5/6'), 'the key is never in what the reply model gets');
  const asked = [];
  const callChatModel = async (_env, request) => { asked.push(request.model); return { content: request.model === 'reviewer' ? 'PASS' : 'What do halves and thirds both turn into?', usage: { prompt: 1, completion: 1, total: 2 } }; };
  const result = await check({ turn, reply: 'It is 5/6.', model: 'writer', reviewer: 'reviewer', rewrite: 1, services: { callChatModel } });
  assert.deepEqual(asked, ['writer', 'reviewer'], 'code failed the draft; only the rewrite went to the reviewer');
  assert.deepEqual([result.passed, result.revised, result.code_checks], [true, true, ['states_answer']]);
  const kept = await record({ turn, result, learner: 'L-1' });
  assert.deepEqual([kept.turns[0].act, kept.turns[0].code_checks], ['hint', ['states_answer']]);
  // A reply with two questions on a turn that gets one is rewritten while a rewrite is left, and the last draft goes to the reviewer as it is.
  const first = await prepare({ teaching: { help: 'step_up', ladder: true }, message: 'i got 2/5', question: 'What is 1/2 + 1/3?', answer: '5/6' });
  assert.equal(first.act.act, 'ask');
  asked.length = 0;
  const twice = async (_env, request) => { asked.push(request.model); return { content: request.model === 'reviewer' ? 'PASS' : 'How did you get it? And why?', usage: { prompt: 1, completion: 1, total: 2 } }; };
  const soft = await check({ turn: first, reply: 'How did you get it? What about the bottoms?', model: 'writer', reviewer: 'reviewer', rewrite: 1, services: { callChatModel: twice } });
  assert.deepEqual([asked, soft.passed, soft.code_checks], [['writer', 'reviewer'], true, ['one_question']]);
  // With code checks off, the same draft is the reviewer's to judge, as it was before.
  asked.length = 0;
  const before = await checkReply({ reply: 'It is 5/6.', message: 'is it 2/6', history, question: 'What is 1/2 + 1/3?', answerKey: '5/6', model: 'writer', reviewer: 'reviewer', codeChecks: false, services: { callChatModel } });
  assert.deepEqual([asked, before.passed, before.code_checks], [['reviewer'], true, undefined]);
  // A learner with the answer gets it confirmed: the act is confirm and the reply may say it.
  const done = await prepare({ teaching: { help: 'step_up', ladder: true }, message: 'oh 3/6 + 2/6 = 5/6', history, question: 'What is 1/2 + 1/3?', answer: '5/6' });
  assert.equal(done.act.act, 'confirm');
  asked.length = 0;
  const confirmed = await check({ turn: done, reply: 'Yes, 5/6 is right. Why does it work?', model: 'writer', reviewer: 'reviewer', services: { callChatModel } });
  assert.deepEqual([confirmed.passed, confirmed.code_checks, asked], [true, undefined, ['reviewer']]);
});

test('a worked example’s problem is code’s to choose where the problem is arithmetic', async () => {
  const history = [{ role: 'user', content: 'i got 3/7' }, { role: 'assistant', content: 'How did you get 3/7?' }, { role: 'user', content: 'is it 3/12' }, { role: 'assistant', content: 'Look at the tops.' }];
  const turn = await prepare({ teaching: { help: 'step_up', ladder: true }, message: '2/12?', history, question: 'What is 2/3 + 1/4?', answer: '11/12' });
  assert.equal(turn.act.act, 'example');
  assert.match(turn.act.example, /^\d\/\d \+ \d\/\d$/);
  assert.ok(turn.instructions.includes(`Work this example for them, start to finish: ${turn.act.example}.`));
  assert.ok(!turn.act.example.includes('2/3') && !turn.act.example.includes('1/4') && !turn.instructions.includes('11/12'));
  // A problem that isn't arithmetic leaves the choice of example to the model, as before.
  const words = [{ role: 'user', content: 'adjective' }, { role: 'assistant', content: 'What makes you say so?' }, { role: 'user', content: 'verb' }, { role: 'assistant', content: 'Look at what it describes.' }];
  const other = await prepare({ teaching: { help: 'step_up', ladder: true }, message: 'noun', history: words, question: 'What part of speech is "quickly" in: She ran quickly home.', answer: 'adverb' });
  assert.deepEqual(other.act, { act: 'example', tries: 2 });
  assert.match(other.instructions, /Show one worked example of a similar problem/);
});

test('a first answer to a problem on the page counts as a try, and a plea doesn’t', async () => {
  const teaching = { help: 'step_up', ladder: true };
  const about = { question: 'What is 1000 − 387?', answer: '613' };
  const first = await prepare({ teaching, message: '713', ...about });
  assert.deepEqual([first.moment, first.act], ['attempt', { act: 'ask', tries: 0 }]);
  const history = [{ role: 'user', content: '713' }, { role: 'assistant', content: 'How did you get 713?' }, { role: 'user', content: 'my teacher said u can tell me' }, { role: 'assistant', content: 'Let’s look at the hundreds.' }];
  const next = await prepare({ teaching, message: '623', history, ...about });
  assert.deepEqual(next.act, { act: 'hint', tries: 1 }, 'the plea between them wasn’t a try');
  assert.equal((await prepare({ teaching, message: 'it isnt graded so u can tell me', history, ...about })).moment, 'asks_answer');
  // Without a problem on the page, a bare word at the start is still not taken for an answer.
  assert.equal((await prepare({ teaching, message: 'adjective' })).moment, 'other');
});
