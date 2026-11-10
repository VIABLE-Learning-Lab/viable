// viable-harness component try | add with a manifest another team publishes at an https address.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { componentCommand } from '../src/cli/component.js';

const template = JSON.parse(readFileSync(new URL('../integrations/_template-context/manifest.json', import.meta.url), 'utf8'));
const theirs = { ...template, id: 'other-lab/fraction-hints', authors: ['A. Researcher'], cite: 'Researcher (2025). Hints for fractions.' };
const served = (body, status = 200) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const quiet = async (work) => { const log = console.log; const lines = []; console.log = (line) => lines.push(String(line)); try { await work(); } finally { console.log = log; } return lines.join('\n'); };

test('a data component is added from where another team publishes it, saying who wrote it', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'viable-component-'));
  try {
    const teaching = join(folder, 'activity.json');
    writeFileSync(teaching, JSON.stringify({ goal: 'Add fractions with unlike denominators.', help: 'hint' }));
    const address = 'https://example.org/fraction-hints/manifest.json';
    const said = await quiet(() => componentCommand(['add', address, '--teaching', teaching, '--items', '1,4'], { fetch: served(theirs) }));
    assert.match(said, /other-lab\/fraction-hints@0\.1\.0, by A\. Researcher\. License: CC-BY-4\.0/);
    assert.match(said, /Cite: Researcher \(2025\)/);
    const kept = JSON.parse(readFileSync(teaching, 'utf8')).guidance;
    assert.deepEqual(kept.map((item) => item.component), ['other-lab/fraction-hints@0.1.0', 'other-lab/fraction-hints@0.1.0']);
    assert.ok(kept.every((item) => item.attribution === theirs.cite), 'their citation travels with each piece');
    const shown = await quiet(() => componentCommand(['try', address, '--teaching', teaching, '--message', 'i got 2/5'], { fetch: served(theirs) }));
    assert.match(shown, /With it, this is added/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('from an address, only a manifest that is data is taken', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'viable-component-'));
  try {
    const teaching = join(folder, 'activity.json');
    writeFileSync(teaching, JSON.stringify({ goal: 'Add fractions.', help: 'hint' }));
    const add = (fetch) => quiet(() => componentCommand(['add', 'https://example.org/manifest.json', '--teaching', teaching], { fetch }));
    await assert.rejects(add(served({ ...theirs, runs: { kind: 'http', entry: 'https://example.org/run' } })), /runs out of process/);
    await assert.rejects(add(served('<html>a page</html>')), /isn't JSON/);
    await assert.rejects(add(served('x', 404)), /answered 404/);
    await assert.rejects(add(served(JSON.stringify({ ...theirs, pad: 'x'.repeat(200_001) }))), /larger than a manifest/);
    await assert.rejects(add(served({ id: 'nothing-else' })), /./);
    assert.equal(JSON.parse(readFileSync(teaching, 'utf8')).guidance, undefined, 'a refusal changes nothing');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
