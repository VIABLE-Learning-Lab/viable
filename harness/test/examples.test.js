import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readArithmetic } from '../src/diagnose.js';
import { similarProblem } from '../src/examples.js';
import { statesAnswer } from '../src/checks/answerReached.js';

const cases = JSON.parse(readFileSync(new URL('../scorecard/wrong-answers.json', import.meta.url), 'utf8')).cases;
const text = (value) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);

test('an example has the problem’s shape, none of its numbers, and never its answer', () => {
  let made = 0;
  for (const item of cases) {
    const theirs = readArithmetic(item.problem);
    const example = similarProblem(item.problem);
    if (!example) continue;
    made += 1;
    const ours = readArithmetic(example.text);
    assert.deepEqual([ours.op, ours.a.kind, ours.b.kind, ours.a.sign, ours.b.sign], [theirs.op, theirs.a.kind, theirs.b.kind, theirs.a.sign, theirs.b.sign], `${item.problem} → ${example.text}`);
    for (const number of [ours.a.value, ours.b.value, ours.correct]) for (const taken of [theirs.a.value, theirs.b.value, theirs.correct]) assert.ok(number.n !== taken.n || number.d !== taken.d, `${item.problem} → ${example.text} shares a number`);
    // Worked through to its end in a reply, it doesn't read as stating the learner's answer.
    assert.equal(statesAnswer({ answer: item.answer, question: item.problem, reply: `Here is one like it: ${example.text} = ${text(example.answer)}. Now try yours again.` }).stated, false, `${item.problem} → ${example.text}`);
  }
  assert.ok(made >= 155, `an example for ${made} of ${cases.length} problems`);
});

test('what makes the problem hard stays: unlike bottoms, regrouping, a division that comes out even', () => {
  const bottoms = (question) => { const { a, b } = readArithmetic(similarProblem(question).text); return a.q === b.q ? 'same' : a.q % b.q === 0 || b.q % a.q === 0 ? 'multiple' : 'unlike'; };
  assert.deepEqual([bottoms('2/3 + 1/4'), bottoms('3/5 + 1/5'), bottoms('1/2 + 1/4')], ['unlike', 'same', 'multiple']);
  const borrow = readArithmetic(similarProblem('72 - 38').text);
  assert.ok(borrow.a.w % 10 < borrow.b.w % 10 && borrow.a.w > borrow.b.w, 'still needs borrowing');
  const even = readArithmetic(similarProblem('612 ÷ 6').text);
  assert.equal(even.a.w % even.b.w, 0);
  const points = readArithmetic(similarProblem('5.2 + 1.34').text);
  assert.deepEqual([points.a.places, points.b.places], [1, 2]);
  assert.ok(Math.max(...['2/3 + 1/4', '1/2 + 1/3'].map((question) => { const { a, b } = readArithmetic(similarProblem(question).text); return Math.max(a.q, b.q); })) <= 7, 'no harder than theirs');
});

test('the same problem gets the same example, and what isn’t arithmetic gets none', () => {
  assert.deepEqual(similarProblem('What is 2/3 + 1/4?'), similarProblem('2/3 + 1/4'));
  for (const question of ['What is 25% of 80?', 'Solve: 2(x + 3) = 18', 'Why does the Moon show phases?', '']) assert.equal(similarProblem(question), null);
});
