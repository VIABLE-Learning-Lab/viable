// The scorecard: every guarantee holds on every case, the page says what a run says, and the measured numbers don't slip.
import './no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runScorecard, scorecardTables, share } from '../src/scorecard.js';

const scored = await runScorecard();

test('each guarantee holds on every case it was checked on', () => {
  for (const entry of scored.guarantees) assert.equal(entry.failed, 0, `${entry.claim} Failed on: ${entry.examples.join(', ')}`);
  assert.ok(scored.guarantees.reduce((sum, entry) => sum + entry.checks, 0) >= 4000);
});

test('docs/scorecard.md holds what a run prints', () => {
  const page = readFileSync(new URL('../docs/scorecard.md', import.meta.url), 'utf8');
  const shown = page.slice(page.indexOf('<!-- scorecard:begin -->') + 25, page.indexOf('<!-- scorecard:end -->')).trim();
  assert.equal(shown, scorecardTables(scored), 'Run viable-harness scorecard and paste its tables between the markers.');
});

test('the figure shows what a run shows', () => {
  const figure = readFileSync(new URL('../../docs/images/scorecard.svg', import.meta.url), 'utf8');
  const english = scored.moments.find((row) => row.split === 'held_out' && row.language === 'en');
  const found = scored.review.find((row) => row.split === 'held_out').found;
  const checks = scored.guarantees.reduce((sum, entry) => sum + entry.checks, 0).toLocaleString('en-US');
  for (const part of [`${checks} checks, 0 failed`, `${english.right} of ${english.of} English messages`, `${found.right} of ${found.of} problems`]) assert.ok(figure.includes(part), `${part}: run node harness/scripts/build-scorecard-figure.mjs`);
});

test('the rules read held-out messages, and review finds held-out problems, at least as well as when this was written', () => {
  const english = scored.moments.find((row) => row.split === 'held_out' && row.language === 'en');
  // 126 before pleas stopped counting as tries ("my teacher said you can tell me"): one held-out message went the other way.
  assert.ok(english.right >= 125, `held-out English moments: ${english.right} of ${english.of}`);
  const found = scored.review.find((row) => row.split === 'held_out');
  assert.ok(found.found.right >= 46, `held-out planted problems found: ${found.found.right} of ${found.found.of}`);
  for (const row of scored.review) assert.equal(row.extra, 0, 'review points at nothing that wasn’t planted');
  const named = scored.diagnosis.find((row) => row.split === 'held_out');
  assert.ok(named.right.right >= 56 && named.other.right <= 8, `held-out wrong answers: ${named.right.right} named as labelled, ${named.other.right} as something else`);
  for (const row of scored.diagnosis) assert.equal(row.slips_named, 0, 'a slip is never given a procedure');
  const policy = scored.policy.find((row) => row.split === 'held_out');
  assert.ok(policy.act.right >= 310 && policy.seen.right >= 18, `held-out turns: the act on ${policy.act.right}, a right answer seen on ${policy.seen.right}`);
  for (const row of scored.policy) assert.equal(row.mistaken, 0, 'a learner is never taken to have the answer when they don’t');
});

test('the cases go with both packages, so the command works wherever it is installed', () => {
  for (const file of ['../package.json', '../../package.json']) {
    const { files } = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
    assert.ok(files.includes('scorecard') || files.includes('harness/scorecard'), `${file} leaves the scorecard's cases out of what it packs`);
  }
});

test('both halves of each set are the same size for every label, so neither is the easier one', () => {
  const moments = JSON.parse(readFileSync(new URL('../scorecard/learner-moments.json', import.meta.url), 'utf8'));
  for (const language of ['en', 'es', 'zh']) for (const label of moments.labels) {
    const of = (split) => moments.cases.filter((item) => item.language === language && item.moment === label && item.split === split).length;
    assert.equal(of('dev'), of('held_out'), `${language} ${label}`);
  }
  assert.deepEqual(share(84, 100), { right: 84, of: 100, percent: 84, low: 75.6, high: 89.9 });
});
