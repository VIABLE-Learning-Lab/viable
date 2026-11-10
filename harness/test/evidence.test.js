// What the docs show of the policy check is what its kept replies and judgments give: the figures, and the results page's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const run = (file, ...args) => execFileSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), ...args], { encoding: 'utf8', maxBuffer: 64e6 });

test('the figures are what the kept runs give', () => {
  assert.match(run('../scripts/build-evidence-figures.mjs', '--check'), /^Up to date/);
});

test('the results page holds the share each tutor did as required, for every model', () => {
  const report = JSON.parse(run('../evals/policy-fidelity/run.mjs', 'report', '--split', 'held_out', '--json').trim().split('\n').pop());
  const page = readFileSync(new URL('../evals/policy-fidelity/results.md', import.meta.url), 'utf8');
  assert.equal(report.unjudged, 0);
  for (const [model, { by }] of Object.entries(report.models)) for (const [tutor, value] of Object.entries(by)) {
    const shown = `${(100 * value.exact).toFixed(1)}%`;
    assert.ok(page.includes(shown), `${model}, ${tutor}: ${shown} isn't on the results page`);
  }
});
