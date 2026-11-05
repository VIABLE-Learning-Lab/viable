import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as harness from '../src/index.js';
import { COMPONENTS, SLOTS, checkManifest, checkSchema, guidanceFrom, lookup, turnBrief, validateDocument } from '../src/index.js';
import { NODE_TYPES } from '../../engine/src/agents/graph.js';
import { componentPages, pagesDir } from '../scripts/build-component-pages.mjs';

const schema = JSON.parse(readFileSync(new URL('../schemas/component.schema.json', import.meta.url), 'utf8'));

test('every component manifest fits the schema, with a unique id', () => {
  assert.deepEqual(schema.properties.slot.enum, SLOTS);
  for (const manifest of COMPONENTS) assert.deepEqual(checkSchema(schema, JSON.parse(JSON.stringify(manifest))), [], manifest.id);
  assert.equal(new Set(COMPONENTS.map((manifest) => manifest.id)).size, COMPONENTS.length);
});

test('a core component names an export that exists, and a step type the engine has', () => {
  for (const manifest of COMPONENTS.filter((item) => item.runs.kind === 'core')) {
    assert.ok(manifest.runs.entry in harness, `${manifest.id}: ${manifest.runs.entry} isn't exported`);
    if (manifest.runs.step_type) assert.ok(NODE_TYPES.includes(manifest.runs.step_type), manifest.id);
  }
});

test('evidence keeps its three parts apart, and no component claims a learning gain', () => {
  for (const manifest of COMPONENTS) {
    for (const part of ['original', 'integration', 'unknown']) assert.ok(manifest.evidence[part].length > 20, `${manifest.id}: ${part}`);
    assert.ok(!/improves learning|learning gains? (?:of|by)/i.test(JSON.stringify(manifest.evidence)), manifest.id);
  }
});

test('data under a license other than the code’s carries its attribution', () => {
  for (const manifest of COMPONENTS.filter((item) => item.license.data)) assert.ok(manifest.attribution, manifest.id);
});

test('docs/components/ holds one current page per component, as npm run components:build writes them', () => {
  const pages = componentPages();
  assert.deepEqual(readdirSync(pagesDir).filter((name) => name.endsWith('.md')).sort(), [...pages.keys()].sort(), 'Run npm run components:build.');
  for (const [name, text] of pages) assert.equal(readFileSync(`${pagesDir}${name}`, 'utf8'), text, `${name}: run npm run components:build.`);
  const listed = readFileSync(new URL('../docs/components.md', import.meta.url), 'utf8');
  for (const name of pages.keys()) assert.ok(listed.includes(`(components/${name})`), `docs/components.md links ${name}`);
});

test('the guidance template is a valid component, its fixtures hold, and its items reach an activity with their credit', async () => {
  const dir = new URL('../integrations/_template-context/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  assert.deepEqual(validateDocument(manifest, 'component').errors, []);
  assert.equal(checkManifest(manifest, 'context'), manifest);
  assert.deepEqual((await lookup(manifest, 'anything')).items, manifest.runs.items, 'a data component holds its items: nothing is called');
  const { teaching, cases } = JSON.parse(readFileSync(new URL('fixtures/cases.json', dir), 'utf8'));
  const guidance = guidanceFrom(manifest);
  assert.ok(guidance.every((item) => item.component === 'example/feedback-moves@0.1.0' && item.source && item.attribution));
  for (const { message, chooses } of cases) {
    const brief = await turnBrief({ ...teaching, guidance }, { message });
    assert.deepEqual(brief.guidance.map((item) => manifest.runs.items.findIndex((own) => own.text === item.text) + 1), chooses, message);
  }
  assert.throws(() => guidanceFrom(manifest, { chosen: [9] }), /no 9/);
  assert.throws(() => checkManifest({ ...manifest, slot: 'measure' }), /only a context component can/);
});
