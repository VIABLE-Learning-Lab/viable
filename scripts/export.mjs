#!/usr/bin/env node
/**
 * Copies the kit, exactly the repository modules its imports reach (following the import graph), and
 * the npm packages those need into one folder that runs on its own: node export.mjs [out-dir]
 * (default kit/kit-dist, gitignored). Repository modules land in lib/ with their paths under src/,
 * and the kit's imports of ../../src/... are rewritten to them. Prints each module, flagging the
 * ones that touch Worker-only APIs, D1, secrets or billing: the boundary to fix before a release.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(KIT, '..');
const SRC = join(REPO, 'src');
// What a release carries; scripts/ and the export's own test stay with the repository.
const PARTS = ['bin', 'src', 'schemas', 'examples', 'test', 'README.md', 'LICENSE', 'NOTICE'];
const LEFT_OUT = new Set([join(KIT, 'test', 'export.test.js')]);

// Static imports and re-exports, side-effect imports and literal dynamic imports.
const IMPORTS = /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
const specifiers = (file) => [...readFileSync(file, 'utf8').matchAll(IMPORTS)].map((match) => match[1] || match[2] || match[3]);
const inside = (file, dir) => file.startsWith(dir + sep);

function kitFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return kitFiles(path);
    return /\.m?js$/.test(name) && !LEFT_OUT.has(path) ? [path] : [];
  });
}

/** The repository modules and npm packages the kit's code reaches. */
export function reach() {
  const modules = new Set();
  const packages = new Set();
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of specifiers(file)) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('.')) { packages.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]); continue; }
      const target = resolve(dirname(file), spec);
      if (!existsSync(target)) throw new Error(`${relative(REPO, file)} imports ${spec}, which doesn't exist.`);
      if (inside(target, SRC)) modules.add(target);
      else if (!inside(target, KIT)) throw new Error(`${relative(REPO, file)} imports ${spec}, outside the kit and src/.`);
      visit(target);
    }
  };
  for (const part of ['bin', 'src', 'test']) kitFiles(join(KIT, part)).forEach(visit);
  return { modules: [...modules].sort(), packages: [...packages].sort() };
}

// What keeps a module tied to VIABLE's hosted service.
const FLAGS = [
  ['D1', /\benv\.DB\b|\.prepare\(/],
  ['secrets', /\benv\.[A-Z0-9_]*(?:KEY|SECRET|PEPPER|TOKEN|PASSWORD)\b/],
  ['billing', /billing|credits|\bpayer\b|stripe/i],
  ['Worker', /\benv\.(?:AI|ASSETS_BUCKET)\b|caches\.default|cloudflare:|executionCtx|waitUntil\(|\bhono\b/]
];
export const flagsOf = (file) => FLAGS.filter(([, pattern]) => pattern.test(readFileSync(file, 'utf8'))).map(([name]) => name);

function copyPackage(name, out, done = new Set()) {
  if (done.has(name)) return;
  done.add(name);
  const from = join(REPO, 'node_modules', name);
  if (!existsSync(from)) throw new Error(`The npm package ${name} isn't installed; run npm install in ${REPO}.`);
  cpSync(from, join(out, 'node_modules', name), { recursive: true, dereference: true });
  for (const dependency of Object.keys(JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')).dependencies || {})) copyPackage(dependency, out, done);
}

export function exportKit(out = join(KIT, 'kit-dist')) {
  out = resolve(out);
  if (out === KIT || inside(KIT, out) || inside(out, SRC)) throw new Error(`Refusing to export into ${out}.`);
  // Only an earlier export (or an empty folder) is replaced, never a folder with something else in it.
  const earlier = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')).name === '@viable-lab/harness'; } catch { return false; } };
  if (existsSync(out) && readdirSync(out).length && !(earlier(join(out, 'package.json')) && existsSync(join(out, 'lib')))) throw new Error(`${out} isn't empty and isn't an earlier export; choose another folder.`);
  const { modules, packages } = reach();
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const part of PARTS) cpSync(join(KIT, part), join(out, part), { recursive: true, filter: (path) => !LEFT_OUT.has(path) });
  for (const file of modules) cpSync(file, join(out, 'lib', relative(SRC, file)));
  // The kit's references into src/ (imports, and the repository-only checks' paths) now point into lib/.
  for (const file of PARTS.filter((part) => statSync(join(KIT, part)).isDirectory()).flatMap((part) => kitFiles(join(KIT, part)))) {
    const copy = join(out, relative(KIT, file));
    const text = readFileSync(file, 'utf8').replace(/(['"])(\.\.?\/[^'"\n]+)\1/g, (whole, quote, spec) => {
      const target = resolve(dirname(file), spec);
      if (!inside(target, SRC)) return whole;
      const moved = relative(dirname(copy), join(out, 'lib', relative(SRC, target))).split(sep).join('/');
      return quote + (moved.startsWith('.') ? moved : `./${moved}`) + quote;
    });
    writeFileSync(copy, text);
  }
  for (const name of packages) copyPackage(name, out);
  const versions = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).dependencies || {};
  const pkg = JSON.parse(readFileSync(join(KIT, 'package.json'), 'utf8'));
  delete pkg.scripts?.export;
  pkg.files = [...new Set([...(pkg.files || []), 'lib'])];
  pkg.dependencies = Object.fromEntries(packages.map((name) => [name, versions[name] || '*']));
  writeFileSync(join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  return { out, modules: modules.map((file) => ({ path: relative(REPO, file), flags: flagsOf(file) })), packages };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, modules, packages } = exportKit(process.argv[2]);
  console.log(`Exported the kit to ${out} with ${modules.length} modules from src/ (in lib/):`);
  for (const { path, flags } of modules) console.log(`  ${path}${flags.length ? `  [${flags.join(', ')}]` : ''}`);
  console.log(`npm packages copied into node_modules/: ${packages.join(', ') || 'none'}`);
  const flagged = modules.filter((item) => item.flags.length).length;
  if (flagged) console.log(`${flagged} modules touch D1, secrets, billing or Worker-only APIs: the boundary needs work before a public release.`);
}
