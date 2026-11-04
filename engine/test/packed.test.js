// What npm installs has to run by itself. Inside this repository a path one folder too far still finds a
// file, and a file left out of a package's list is still there, so only an unpacked copy shows either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const run = (cwd, ...args) => execFileSync(process.execPath, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

function unpack(cwd, into, ...flags) {
  execFileSync('npm', ['pack', '--silent', '--pack-destination', into, ...flags], { cwd, stdio: 'ignore' });
  execFileSync('tar', ['-xzf', join(into, readdirSync(into).find((name) => name.endsWith('.tgz'))), '-C', into]);
  return join(into, 'package');
}
const scratch = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-packed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('the Harness runs from its package alone, with nothing else installed', (t) => {
  const dir = scratch(t);
  // A copy, since packing it writes the license, notice and examples beside it.
  for (const [from, to] of [['harness', 'harness'], ['examples', 'examples'], ['LICENSE', 'LICENSE'], ['NOTICE', 'NOTICE']]) cpSync(join(ROOT, from), join(dir, 'source', to), { recursive: true, filter: (path) => !path.includes('node_modules') });
  const into = join(dir, 'out');
  mkdirSync(into);
  const home = unpack(join(dir, 'source', 'harness'), into);
  assert.match(run(home, 'bin/viable-harness.mjs', '--help'), /viable-harness prepare/);
  assert.match(run(home, 'bin/viable-harness.mjs', 'conformance', 'formats'), /example-argument-writing/);
  const said = run(home, '--input-type=module', '-e', "const { prepare } = await import(new URL('./src/index.js', `file://${process.cwd()}/`)); const turn = await prepare({ teaching: { goal: 'Add fractions.', help: 'hint' }, message: 'i got 2/5', history: [] }); console.log(turn.moment ?? turn.brief?.moment);");
  assert.equal(said.trim(), 'attempt');
});

test('the Engine runs from the package npx installs, with the Harness inside it', async (t) => {
  const dir = scratch(t);
  const home = unpack(ROOT, dir, '--ignore-scripts');
  symlinkSync(join(ROOT, 'node_modules'), join(home, 'node_modules'));
  assert.match(run(home, 'engine/bin/viable-engine.mjs', '--help'), /viable-engine start/);
  assert.match(run(home, 'harness/bin/viable-harness.mjs', '--help'), /viable-harness prepare/);
  const child = spawn(process.execPath, ['engine/bin/viable-engine.mjs', 'start', '--no-open', '--port', '0', '--data-dir', join(dir, 'data')], { cwd: home, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => child.kill());
  const url = await new Promise((resolve, reject) => {
    let said = '';
    child.stderr.on('data', (chunk) => { said += chunk; const found = /at (http:\/\/127\.0\.0\.1:\d+)/.exec(said); if (found) resolve(found[1]); });
    child.on('exit', () => reject(new Error(said)));
  });
  assert.equal((await fetch(`${url}/console/models`)).status, 401);
});
