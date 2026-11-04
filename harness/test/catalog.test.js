import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATALOG, CATALOG_KINDS, COMPONENTS, SLOTS, checkSchema, openForAnyUse, searchCatalog } from '../../engine/src/index.js';
import { catalogDir, catalogEntries, catalogModule, catalogPage, modulePath, pagePath } from '../scripts/build-catalog-page.mjs';

const schema = JSON.parse(readFileSync(new URL('../schemas/catalog-entry.schema.json', import.meta.url), 'utf8'));
const bin = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
const ids = (found) => found.entries.map((entry) => entry.id);

test('every entry fits the schema, named by its id, and the schema’s kinds and slots are the code’s', () => {
  assert.deepEqual(schema.properties.kind.enum, CATALOG_KINDS);
  assert.deepEqual(schema.properties.fits.properties.slots.items.enum, SLOTS);
  const files = readdirSync(catalogDir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 25, `${files.length} entries`);
  for (const name of files) {
    const entry = JSON.parse(readFileSync(`${catalogDir}${name}`, 'utf8'));
    assert.deepEqual(checkSchema(schema, entry), [], name);
    assert.equal(`${entry.id}.json`, name);
  }
});

test('the schema asks for a note where a license is missing or unclear, and a date for what is expected', () => {
  const entry = structuredClone(CATALOG.find((item) => item.id === 'gsm8k'));
  assert.deepEqual(checkSchema(schema, entry), []);
  assert.ok(checkSchema(schema, { ...entry, license: { spdx: [], source: entry.license.source } }).some((error) => /needs "note"/.test(error)));
  assert.ok(checkSchema(schema, { ...entry, license: { ...entry.license, unclear: true } }).some((error) => /needs "note"/.test(error)));
  assert.ok(checkSchema(schema, { ...entry, status: 'expected' }).some((error) => /needs "expected"/.test(error)));
  assert.ok(checkSchema(schema, { ...entry, expected: 'summer 2027' }).length, 'a released entry has no expected date');
});

test('an entry the harness carries names a built-in component, in a slot it fits', () => {
  const carried = CATALOG.filter((entry) => entry.in_harness);
  assert.ok(carried.length >= 4);
  for (const entry of carried) {
    const manifest = COMPONENTS.find((item) => item.id === entry.in_harness);
    assert.ok(manifest, `${entry.id}: ${entry.in_harness} isn't a component`);
    assert.ok(entry.fits.slots.includes(manifest.slot), `${entry.id} fits ${manifest.slot}`);
  }
});

test('docs/catalog.md and src/utils/catalogData.js are current, as npm run catalog:build writes them', () => {
  const entries = catalogEntries();
  assert.equal(readFileSync(modulePath, 'utf8'), catalogModule(entries), 'Run npm run catalog:build.');
  assert.equal(readFileSync(pagePath, 'utf8'), catalogPage(entries), 'Run npm run catalog:build.');
  assert.deepEqual(CATALOG, entries);
  const page = readFileSync(pagePath, 'utf8');
  for (const entry of entries) assert.ok(page.includes(`[${entry.name}](${entry.url})`), entry.id);
  for (const entry of entries.filter((item) => item.in_harness)) assert.ok(page.includes(`(components/${entry.in_harness.replace('/', '-')}.md)`), entry.id);
});

test('the search module reads no Node built-ins, so a browser or a Worker can bundle it', () => {
  for (const file of ['../src/catalog.js', '../src/utils/catalogData.js', '../src/utils/terms.js']) {
    assert.ok(!/from\s*['"]node:/.test(readFileSync(new URL(file, import.meta.url), 'utf8')), file);
  }
});

test('searchCatalog: every word first, else the most; filters by kind, slot and open use', () => {
  const misconceptions = searchCatalog('misconceptions');
  assert.equal(misconceptions.match, 'every_word');
  assert.ok(ids(misconceptions).includes('eedi-misconceptions-graph'));
  const dialogues = searchCatalog('math tutoring dialogues', { kind: 'dataset' });
  assert.ok(ids(dialogues).includes('mathdial'));
  assert.ok(dialogues.entries.every((entry) => entry.kind === 'dataset'));
  assert.equal(searchCatalog('misconceptions zzzzqqq').match, 'most_words');
  assert.deepEqual(searchCatalog('zzzzqqq').entries, []);
  assert.ok(searchCatalog('', { slot: 'judge' }).entries.every((entry) => entry.fits.slots.includes('judge')));
  assert.equal(searchCatalog().entries.length, CATALOG.length);
  assert.equal(searchCatalog().match, 'all');
  assert.throws(() => searchCatalog('', { kind: 'spreadsheet' }), /Unknown kind/);
  assert.throws(() => searchCatalog('', { slot: 'grader' }), /Unknown slot/);
  assert.throws(() => searchCatalog('AI'), /three letters/);
});

test('open keeps what anyone may download and use commercially, and leaves out the rest', () => {
  const open = ids(searchCatalog('', { open: true }));
  for (const id of ['gsm8k', 'eedi-misconceptions-graph', 'wwc-practice-guides']) assert.ok(open.includes(id), id);
  // Non-commercial, gated, unclear or not yet released.
  for (const id of ['talkmoves', 'ncte-transcripts', 'carnegie-skills-progressions', 'mathtutorbench', 'productive-coaching-benchmark']) assert.ok(!open.includes(id), id);
  assert.ok(CATALOG.filter((entry) => entry.status === 'expected').every((entry) => !openForAnyUse(entry)));
});

test('viable-harness catalog prints the entries with their licenses, and --json the search', () => {
  const cli = (...args) => spawnSync(process.execPath, [bin, 'catalog', ...args], { encoding: 'utf8' });
  const text = cli('misconceptions', '--slot', 'context');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Eedi Misconceptions Graph \(knowledge-graph\)/);
  assert.match(text.stdout, /license: CC-BY-4\.0/);
  assert.match(text.stdout, /describe, not endorse/);
  const json = JSON.parse(cli('--kind', 'model', '--json').stdout);
  assert.ok(json.entries.length && json.entries.every((entry) => entry.kind === 'model'));
  assert.match(cli('--kind', 'spreadsheet').stderr, /Unknown kind/);
});
