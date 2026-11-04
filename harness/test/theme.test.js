import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FONT_PATH, HARNESS_ONLY_TOKENS, SHARED_TOKENS, TOKENS, fontRoutes, markSvg, themeCss } from '../src/ui/theme.js';
import { MONO, NEXT } from '../src/ui/fontData.js';

const file = (name) => readFileSync(new URL(`../src/ui/fonts/${name}`, import.meta.url));
const NEXT_FILE = 'atkinson-hyperlegible-next-latin.woff2';
const MONO_FILE = 'atkinson-hyperlegible-mono-latin.woff2';

test('the inlined fonts are the files beside their licences, and nothing else loads', () => {
  assert.equal(NEXT, file(NEXT_FILE).toString('base64'), 'npm run fonts:build');
  assert.equal(MONO, file(MONO_FILE).toString('base64'), 'npm run fonts:build');
  for (const name of ['OFL-Atkinson-Hyperlegible-Next.txt', 'OFL-Atkinson-Hyperlegible-Mono.txt']) assert.match(file(name).toString(), /SIL Open Font License, Version 1\.1/);
  const urls = [...themeCss().matchAll(/url\(([^)]{0,40})/g)].map((match) => match[1]);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.startsWith('data:font/woff2;base64,')), 'a single file loads nothing');
  assert.ok(!themeCss({ mono: false }).includes('Atkinson Hyperlegible Mono Project'));
  assert.ok(!/url\(/.test(themeCss({ fonts: 'none' })));
  assert.ok(!/viablelab\.org/.test(themeCss()), 'no hostname of ours');
  assert.ok(themeCss().length < 90_000, `${themeCss().length} characters: the inlined page stays small`);
});

test('a served page takes the fonts by URL from the route module', async () => {
  assert.ok(themeCss({ fonts: 'url' }).includes(`url(${FONT_PATH}/${NEXT_FILE})`));
  const route = fontRoutes()();
  const at = (path, method = 'GET') => route(new Request(`http://x${path}`, { method }), new URL(`http://x${path}`));
  const served = await at(`${FONT_PATH}/${MONO_FILE}`);
  assert.equal(served.headers.get('content-type'), 'font/woff2');
  assert.match(served.headers.get('cache-control'), /immutable/);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), file(MONO_FILE));
  assert.equal(await at(`${FONT_PATH}/../../secret`), null);
  assert.equal(await at('/other'), null, 'another route’s address');
  assert.equal(await at(`${FONT_PATH}/${NEXT_FILE}`, 'POST'), null);
});

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('light and dark hold the same tokens, and text is readable on every surface in both', () => {
  assert.deepEqual(Object.keys(TOKENS.dark), Object.keys(TOKENS.light));
  for (const [scheme, t] of Object.entries(TOKENS)) {
    for (const surface of ['public-page', 'surface', 'field-mist', 'field-sage', 'field-stone', 'field-lilac']) {
      for (const text of ['public-ink', 'public-text', 'muted', 'ink-blue', 'pass-green', 'pencil-red', 'query-ochre']) {
        assert.ok(contrast(t[text], t[surface]) >= 4.5, `${scheme}: ${text} on ${surface} is ${contrast(t[text], t[surface]).toFixed(2)}`);
      }
    }
    assert.ok(contrast(t['on-ink-blue'], t['ink-blue']) >= 4.5, `${scheme}: a primary button`);
    assert.ok(contrast(t['code-ink'], t['code-bg']) >= 7, `${scheme}: code`);
    for (const [soft, text] of [['pass-soft', 'pass-green'], ['pencil-soft', 'pencil-red'], ['query-soft', 'query-ochre']]) {
      for (const color of [text, 'public-ink', 'muted']) assert.ok(contrast(t[color], t[soft]) >= 4.5, `${scheme}: ${color} on ${soft}`);
    }
  }
});

// The developer portal's stylesheet isn't in this repository: point PORTAL_CHECKOUT at a checkout of it to compare.
const portal = process.env.PORTAL_CHECKOUT;
test('the tokens keep the names and values of the portal’s stylesheet', { skip: portal ? false : 'PORTAL_CHECKOUT isn’t set' }, () => {
  const css = readFileSync(`${portal}/app/assets/css/main.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const theirs = new Map([...css.matchAll(/:root\s*\{([^}]*)\}/g)].flatMap(([, block]) => [...block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])));
  for (const [name, value] of Object.entries({ ...TOKENS.light, ...SHARED_TOKENS })) {
    if (theirs.has(name)) assert.equal(value, theirs.get(name), `--${name} has drifted from the portal`);
    else assert.ok(HARNESS_ONLY_TOKENS.includes(name), `--${name} isn’t in the portal: use its name, or list it as the harness’s own`);
  }
});

test('the mark is inline SVG that loads nothing, named only when asked', () => {
  assert.match(markSvg(), /aria-hidden="true"/);
  assert.match(markSvg({ label: 'VIABLE', size: 40 }), /role="img" aria-label="VIABLE"/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(markSvg()));
});
