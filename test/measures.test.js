import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { METRICS, WRITING, attemptsOf, learnerMetrics, measureLearner, writingMeasures } from '../src/index.js';

const record = JSON.parse(readFileSync(new URL('../schemas/examples/learning-events.example.json', import.meta.url), 'utf8'));

test('a learner’s measures from a small list of events and turns', () => {
  const measured = measureLearner(record);
  assert.deepEqual(Object.keys(measured.metrics).sort(), METRICS.map((metric) => metric.id).sort(), 'every defined metric, and only those');
  assert.equal(measured.metrics.turns, 3);
  assert.equal(measured.metrics.conversations, 2);
  assert.equal(measured.metrics.sessions, 2, 'an hour’s gap starts a new session');
  assert.equal(measured.metrics.starter_share, 0.333);
  assert.equal(measured.metrics.median_think_s, 12, 'think time counts turns after a conversation’s first');
  assert.equal(measured.metrics.attempts, 3, 'two graded answers and one the agent graded');
  assert.equal(measured.metrics.accuracy, 0.667);
  assert.deepEqual(measured.skills.map((skill) => [skill.skill, skill.attempts, skill.correct]), [['Claims', 2, 1], ['Counterargument', 1, 1]]);
  assert.deepEqual(measured.metrics, learnerMetrics(record.turns, attemptsOf(record.events, record.turns)));
});

test('writing is summed per panel and field, as the export’s writing.csv', () => {
  const [draft] = writingMeasures(record.events);
  assert.equal(draft.panel, 'essay');
  assert.equal(draft.field, 'draft');
  assert.deepEqual([draft.keys, draft.deleted, draft.pasted, draft.pauses, draft.longest_pause_ms, draft.active_ms], [200, 30, 40, 4, 7000, 135000]);
  assert.equal(draft.snapshots, 1);
  assert.equal(draft.words, 40, 'from the latest event that reports it');
  assert.equal(draft.mean_burst_chars, 33.3);
  assert.equal(draft.product_process, 0.875, '210 characters kept of 240 typed and pasted');
  assert.equal(draft.started_after_ms, 60000, 'from opening the panel to the first change');
  assert.deepEqual([draft.rubric_views, draft.rubric_ms], [1, 20000]);
  const defined = new Set(WRITING.map((spec) => spec.id));
  for (const key of Object.keys(draft)) if (!['panel', 'field', 'burst_chars'].includes(key)) assert.ok(defined.has(key), `${key} is a defined writing measure`);
});

test('ungraded answers and malformed assessments aren’t attempts', () => {
  const attempts = attemptsOf(
    [{ type: 'questions.answer', at: '2026-10-29T10:00:00Z', data: { response: 'essay', skill: 'Writing' } }, { type: 'questions.answer', at: '2026-10-29T10:01:00Z', data: { correct: 1, set: 'qs_1' } }],
    [{ started_at: '2026-10-29T10:02:00Z', assessment: [{ skill: 'Fractions', correct: 'maybe' }, { correct: true }, { skill: 'Fractions', correct: false }] }]
  );
  assert.deepEqual(attempts.map((item) => [item.skill, item.correct]), [['qs_1', true], ['Fractions', false]]);
  assert.deepEqual(measureLearner({}).metrics.turns, 0);
});
