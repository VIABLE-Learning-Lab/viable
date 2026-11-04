// The Engine stands on the Harness, one way: it imports Node's built-ins, its own files, the Harness,
// entities (BSD-2-Clause, permissive), which decodes HTML for Fetch URL, and uqr (MIT), which draws a course's
// QR codes on the server. Its browser code is bundled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BROWSER_PACKAGES = ['dompurify', 'esbuild', 'highlight.js', 'marked', 'mermaid', 'pdfjs-dist', 'temml'];
const FLAGS = [
  ['D1', /(?<!process\.)\benv\.DB\b|\.prepare\(/],
  ['secrets', /(?<!process\.)\benv\.[A-Z0-9_]*(?:KEY|SECRET|PEPPER|TOKEN|PASSWORD)\b/],
  ['billing', /\bstripe\b/i],
  ['Worker', /(?<!process\.)\benv\.(?:AI|ASSETS_BUCKET)\b|caches\.default|cloudflare:|executionCtx|waitUntil\(|\bhono\b/]
];
const flagsOf = (text) => FLAGS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY = resolve(ROOT, '..');
const IMPORTS = /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
const files = (dir) => readdirSync(dir).flatMap((name) => {
  if (name === 'node_modules' || name.startsWith('.')) return [];
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.m?js$/.test(name) ? [path] : [];
});
const code = () => ['bin', 'src', 'scripts'].flatMap((part) => files(join(ROOT, part)));
const isBrowserCode = (file) => relative(ROOT, file).startsWith(join('src', 'learner', 'browser')) || relative(ROOT, file).startsWith(join('src', 'try')) || relative(ROOT, file) === join('scripts', 'build-learner-assets.mjs') || relative(ROOT, file) === join('scripts', 'prepare.mjs');

test('the Engine imports only built-ins, its own files, the Harness, entities and uqr', () => {
  const packages = new Set();
  for (const file of code()) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORTS)) {
      const spec = match[1] || match[2] || match[3];
      if (spec.startsWith('node:')) continue;
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        assert.ok(existsSync(target), `${relative(ROOT, file)} imports ${spec}, which doesn't exist`);
        const place = relative(REPOSITORY, target);
        assert.ok(place.startsWith('engine/') || place.startsWith('harness/') || place === 'package.json', `${relative(ROOT, file)} imports ${spec}, outside the repository's two parts`);
        continue;
      }
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!isBrowserCode(file)) packages.add(name);
      else assert.ok(BROWSER_PACKAGES.includes(name), `${relative(ROOT, file)} imports ${name}, which isn't listed for the browser code`);
    }
  }
  assert.deepEqual([...packages].sort(), ['entities', 'uqr']);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(REPOSITORY, 'package.json'), 'utf8')).dependencies).sort(), ['entities', 'uqr']);
});

test('nothing ties the Engine to a hosted platform', () => {
  for (const file of code()) assert.deepEqual(flagsOf(readFileSync(file, 'utf8')), [], relative(ROOT, file));
});
