import test from 'node:test';
import assert from 'node:assert/strict';
import { applySuggestion, findMisconceptions, suggestChanges } from '../src/index.js';

const goal = 'Students add fractions with unlike denominators.';
// A run --json trace with one VETTING step: its first round's verdict and reason, and its outcome.
const run = (verdict, feedback = null, outcome = verdict === 'pass' ? 'passed' : 'passed') => ({
  agent: 'Tutor', output: { text: 'reply' },
  steps: [{ nodeType: 'input', output: { message: 'What is 1/2 + 1/3?' } }, { nodeType: 'vetting', input: { message: 'What is 1/2 + 1/3?' }, output: { outcome, attempt_details: [{ attempt: 1, verdict, feedback }] } }]
});
const graded = (user, skill, results, extra = {}) => ({ user, ...extra, events: [], turns: results.map((correct, i) => ({ message: 'm', reply: 'r', started_at: `2026-11-0${1 + Math.floor(i / 9)}T10:${String(i % 60).padStart(2, '0')}:00Z`, assessment: [{ skill, correct }] })) });

test('drafts that keep giving answers away suggest asking the AI for less help', () => {
  const runs = [run('fail', 'FAILED: Directly states the answer 5/6.'), run('fail', 'FAILED: Gives away the solution.'), run('pass'), run('pass'), run('fail', 'FAILED: Off topic.')];
  const [suggestion] = suggestChanges({ teaching: { goal, help: 'explain' }, runs });
  assert.equal(suggestion.rule, 'answers_given_away');
  assert.deepEqual(suggestion.patch, { help: 'hint' });
  assert.match(suggestion.evidence[0], /^2 of 5 \(40%\)/);
  assert.match(suggestion.evidence[1], /states the answer/);
  assert.deepEqual(applySuggestion({ goal, help: 'explain' }, suggestion), { goal, help: 'hint', watch_for: null, standard: null });
  assert.deepEqual(suggestChanges({ teaching: { goal, help: 'explain' }, runs: runs.slice(0, 4) }), [], 'too few runs to say');
  assert.equal(suggestChanges({ teaching: { goal, help: 'check_only' }, runs })[0].patch, null, 'nothing lower than check only');
});

test('replies that never pass review ask the teacher to look, proposing nothing', () => {
  const runs = [...Array(4)].map(() => run('pass')).concat(run('fail', 'FAILED: Too long.', 'unverified'));
  const [suggestion] = suggestChanges({ runs });
  assert.equal(suggestion.rule, 'replies_unverified');
  assert.equal(suggestion.patch, null);
  assert.throws(() => applySuggestion({ goal }, suggestion), { code: 'nothing_to_apply' });
});

test('a misconception heard from several learners, and not listened for, is suggested with its construct', () => {
  const misconception = findMisconceptions('add fractions').data[0].misconceptions[0];
  const records = ['a', 'b', 'c'].map((user) => ({ user, events: [], turns: [{ message: 'm', reply: 'r', misconceptions: [misconception.id] }] }));
  const [suggestion] = suggestChanges({ teaching: { goal }, records });
  assert.equal(suggestion.rule, 'misconception_heard');
  const settings = applySuggestion({ goal }, suggestion);
  assert.equal(settings.misconceptions[0].id, misconception.id);
  assert.ok(settings.misconceptions[0].construct.description);
  assert.deepEqual(suggestChanges({ teaching: settings, records }), [], 'already listened for');
  assert.deepEqual(suggestChanges({ teaching: { goal }, records: records.slice(0, 2) }), [], 'two learners are too few');
});

test('learners wheel-spinning on a skill suggest more help, for their section when they share one', () => {
  const stuck = Array(12).fill(false);
  const records = ['a', 'b', 'c'].map((user) => graded(user, 'Adding fractions', stuck, { learner_group: 'sec_period2' })).concat(graded('d', 'Adding fractions', [true, true, true]));
  const teaching = { goal, help: 'ask_first', sections: { sec_period2: { note: 'Many are new this week.' } } };
  const [suggestion] = suggestChanges({ teaching, records });
  assert.equal(suggestion.rule, 'stuck_on_a_skill');
  assert.match(suggestion.evidence[0], /^3 of 4 \(75%\)/);
  assert.deepEqual(applySuggestion(teaching, suggestion).sections, { sec_period2: { help: 'hint', note: 'Many are new this week.' } });
});

test('nothing in the records, nothing suggested', () => {
  assert.deepEqual(suggestChanges({}), []);
  assert.deepEqual(suggestChanges({ teaching: { goal }, runs: [{ steps: [] }], records: [{ user: 'a', events: [], turns: [] }] }), []);
});

test('a chosen misconception without a source of its own keeps the release it came from, with its date', async () => {
  const { teachingSettings } = await import('../src/utils/teaching.js');
  const [construct] = findMisconceptions('adding fractions').data;
  const chosen = { id: construct.misconceptions[0].id, description: construct.misconceptions[0].description, construct: { id: construct.id, description: construct.description } };
  const [kept] = teachingSettings({ goal, misconceptions: [chosen] }).misconceptions;
  assert.ok(kept.source.modified, 'the release date');
  const [named] = teachingSettings({ goal, misconceptions: [{ ...chosen, source: { name: 'Another copy' } }] }).misconceptions;
  assert.equal(named.source.modified, null, 'not another source\'s date');
});
