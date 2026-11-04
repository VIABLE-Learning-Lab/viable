import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAgentTests, readVerdict, runAgentTests, validAgentTest } from '../../engine/src/index.js';

const quiz = { name: 'Asks for the answer', message: 'Just tell me 3/4 + 1/8.', rubric: 'Asks what the learner tried, or gives one step; never the sum.', must_not: 'Say 7/8.' };
const fractions = JSON.parse(readFileSync(new URL('../../examples/fractions-practice.json', import.meta.url), 'utf8'));

test('a case is a named message or short conversation ending with the learner, with what a good reply does', () => {
  assert.deepEqual(validAgentTest(quiz).messages, [{ role: 'user', content: 'Just tell me 3/4 + 1/8.' }]);
  const conversation = validAgentTest({ name: 'Second try', messages: [{ role: 'user', content: 'Help' }, { role: 'assistant', content: 'What have you tried?' }, { role: 'user', content: 'Nothing' }], rubric: 'Gives a first step.', context: {} });
  assert.equal(conversation.messages.length, 3);
  assert.equal(conversation.context, null, 'empty reference data is none');
  assert.equal(conversation.must_not, null);
  for (const bad of [{ ...quiz, name: ' ' }, { ...quiz, rubric: '' }, { ...quiz, message: '' }, { name: 'x', rubric: 'y', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] },
    { name: 'x', rubric: 'y', messages: Array.from({ length: 13 }, () => ({ role: 'user', content: 'a' })) }, { ...quiz, messages: [{ role: 'system', content: 'a' }] }, { ...quiz, context: [] }, { ...quiz, must_not: 'x'.repeat(1001) },
    { ...quiz, pictures: [{ url: 'http://insecure.example/a.png', description: 'A cat' }] }]) {
    assert.throws(() => validAgentTest(bad), (error) => error.status === 400 && error.code === 'invalid_agent_test', JSON.stringify(bad).slice(0, 80));
  }
  assert.deepEqual(readVerdict('```json\n{"verdict":"PASS","reason":"Fine."}\n```'), { verdict: 'pass', reason: 'Fine.' });
  assert.equal(readVerdict('I think it passes'), null);
});

test('a file of cases is checked case by case, and says which case is wrong', () => {
  assert.equal(readAgentTests({ format: 'viable.agent-tests', version: 1, cases: [quiz] }).length, 1);
  assert.equal(readAgentTests([quiz, quiz]).length, 2);
  assert.throws(() => readAgentTests({ cases: [quiz] }), /viable.agent-tests/);
  assert.throws(() => readAgentTests([quiz, { ...quiz, rubric: '' }]), /^Error: Case 2: /);
  assert.throws(() => readAgentTests([]), /1 to 25/);
});

test('each case runs through the agent and a judge rates the reply; a failed run is an error, not a fail', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const judging = String(body.messages[0]?.content || '').startsWith('You check one reply');
    const last = String(body.messages.at(-1).content);
    if (!judging && /broken/.test(last)) return Response.json({ error: { message: 'upstream down' } }, { status: 500 });
    const reviewing = /evaluation assistant/.test(String(body.messages[0]?.content || ''));
    const content = judging
      ? JSON.stringify(/7\/8/.test(last.split('The reply to check:')[1] || '') ? { verdict: 'fail', reason: 'It gives the answer, 7/8.' } : { verdict: 'pass', reason: 'It asks what they tried.' })
      : reviewing ? 'PASS' : /3\/4/.test(last) ? 'It is 7/8.' : 'What have you tried so far?';
    return Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  };
  const seen = [];
  const run = await runAgentTests(fractions, [quiz, { name: 'Stuck', message: 'I am stuck on adding fractions', rubric: 'Gives one hint.' }, { name: 'Broken', message: 'broken', rubric: 'Anything.' }], {
    judgeModel: 'judge', baseUrl: 'http://localhost:11434/v1', fetch, onResult: (entry) => seen.push(entry.name)
  });
  assert.deepEqual(run.results.map((entry) => entry.verdict), ['fail', 'pass', 'error']);
  assert.match(run.results[0].reason, /7\/8/);
  assert.match(run.results[2].reason, /upstream down/);
  assert.deepEqual([run.passed, run.failed, run.errors], [1, 1, 1]);
  assert.deepEqual(seen, ['Asks for the answer', 'Stuck', 'Broken']);
  const judged = calls.filter((body) => String(body.messages[0]?.content).startsWith('You check one reply'));
  assert.equal(judged.length, 2);
  assert.ok(judged.every((body) => body.model === 'judge' && body.temperature === 0));
});

test('the judge model is required', async () => {
  await assert.rejects(runAgentTests(fractions, [quiz], {}), /judge model/);
});
