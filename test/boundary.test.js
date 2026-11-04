// The harness stands alone: its code imports only Node's built-ins, its own files and the npm packages
// listed here (with their licenses), and touches no database, secret, Worker-only API or hosted
// service. Whatever only a host has reaches the engine as a service (README, "Services").
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Code and dependencies under MIT or Apache-2.0; entities (BSD-2-Clause, permissive) decodes HTML for
// Fetch URL and is the one exception.
export const PACKAGES = { entities: 'BSD-2-Clause' };
export const LICENSES = new Set(['MIT', 'Apache-2.0', ...Object.values(PACKAGES)]);

const IMPORTS = /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
const FLAGS = [
  ['D1', /(?<!process\.)\benv\.DB\b|\.prepare\(/],
  ['secrets', /(?<!process\.)\benv\.[A-Z0-9_]*(?:KEY|SECRET|PEPPER|TOKEN|PASSWORD)\b/],
  ['billing', /\bstripe\b/i],
  ['Worker', /(?<!process\.)\benv\.(?:AI|ASSETS_BUCKET)\b|caches\.default|cloudflare:|executionCtx|waitUntil\(|\bhono\b/]
];
// VIABLE's API also checks its copy of each release for names that stay private to the hosted service.
export const flagsOf = (text) => FLAGS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);

function files(dir, keep) {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, keep) : keep(name) ? [path] : [];
  });
}
const code = () => ['bin', 'src', 'scripts'].filter((part) => existsSync(join(ROOT, part))).flatMap((part) => files(join(ROOT, part), (name) => /\.m?js$/.test(name)));
// The learner pages' browser code, and what builds it: its libraries are dev dependencies, bundled into
// dist/ (NOTICE lists them); nothing that runs on a server imports them.
export const BROWSER_PACKAGES = ['dompurify', 'esbuild', 'highlight.js', 'marked', 'mermaid', 'pdfjs-dist', 'temml'];
const isBrowserCode = (file) => relative(ROOT, file).startsWith(join('src', 'learner', 'browser')) || [join('scripts', 'build-learner-assets.mjs'), join('scripts', 'prepare.mjs')].includes(relative(ROOT, file));

test('the code imports only built-ins, its own files and the listed packages', () => {
  const packages = new Set();
  for (const file of code()) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORTS)) {
      const spec = match[1] || match[2] || match[3];
      if (spec.startsWith('node:')) continue;
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        assert.ok(existsSync(target), `${relative(ROOT, file)} imports ${spec}, which doesn't exist`);
        assert.ok(!relative(ROOT, target).startsWith('..'), `${relative(ROOT, file)} imports ${spec}, outside the harness`);
        continue;
      }
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!isBrowserCode(file)) packages.add(name);
      else assert.ok(BROWSER_PACKAGES.includes(name), `${relative(ROOT, file)} imports ${name}, which isn't listed for the browser code`);
    }
  }
  assert.deepEqual([...packages].sort(), Object.keys(PACKAGES).sort());
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.dependencies || {}).sort(), Object.keys(PACKAGES).sort(), 'package.json lists exactly what the code imports');
});

test('every installed dependency, direct or not, is under an allowed license', () => {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || entry.dev) continue;
    assert.ok(LICENSES.has(entry.license), `${path} is under ${entry.license}`);
  }
});

test('nothing ties the code to a hosted platform', () => {
  for (const file of code()) assert.deepEqual(flagsOf(readFileSync(file, 'utf8')), [], relative(ROOT, file));
});

test('the flags catch what they guard against', () => {
  assert.deepEqual(flagsOf("const row = await env.DB.prepare('SELECT 1').first();"), ['D1']);
  assert.deepEqual(flagsOf('const key = env.OPENAI_API_KEY;'), ['secrets']);
  assert.deepEqual(flagsOf('const key = process.env.OPENAI_API_KEY;'), [], 'a key from the shell that runs the harness is the user\'s own');
  assert.deepEqual(flagsOf("import { Hono } from 'hono';"), ['Worker']);
  assert.deepEqual(flagsOf('// a host adds billing fields'), []);
});
