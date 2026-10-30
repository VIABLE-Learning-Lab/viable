// Stays with the repository: an export doesn't carry scripts/ or this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportKit, reach } from '../scripts/export.mjs';

test('the export is a folder that runs on its own, and its tests pass there', () => {
  // Outside the repository, so nothing resolves from its node_modules or src/.
  const out = join(mkdtempSync(join(tmpdir(), 'viable-harness-')), 'kit-dist');
  try {
    const { modules, packages } = exportKit(out);
    const paths = modules.map((item) => item.path);
    for (const path of ['src/agents/engine.js', 'src/utils/teaching.js', 'src/utils/skillsData.js', 'src/utils/researchMetrics.js']) assert.ok(paths.includes(path), path);
    assert.ok(!paths.includes('src/utils/workspace.js') && !paths.includes('src/utils/agentStore.js'), 'only what the kit’s imports reach');
    assert.equal(paths.length, reach().modules.length);
    assert.ok(modules.find((item) => item.path === 'src/utils/providerKeys.js').flags.includes('D1'), 'the boundary’s problems are flagged');
    assert.deepEqual(modules.find((item) => item.path === 'src/utils/teaching.js').flags, []);
    assert.deepEqual(packages, ['entities', 'hono']);
    assert.ok(existsSync(join(out, 'lib/agents/engine.js')) && existsSync(join(out, 'node_modules/hono/package.json')));
    assert.ok(!existsSync(join(out, 'scripts')) && !existsSync(join(out, 'test/export.test.js')));
    assert.match(readFileSync(join(out, 'src/run.js'), 'utf8'), /from '\.\.\/lib\/agents\/engine\.js'/);
    const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    assert.equal(pkg.license, 'MIT');
    assert.ok(pkg.files.includes('lib') && pkg.dependencies.hono && !pkg.scripts.export);
    assert.throws(() => exportKit(join(out, 'test')), /isn't empty and isn't an earlier export/, 'never replaces a folder it didn’t make');
    writeFileSync(join(out, 'stale.txt'), 'from before');
    exportKit(out);
    assert.ok(!existsSync(join(out, 'stale.txt')), 'an earlier export is replaced whole');

    const tests = readdirSync(join(out, 'test')).filter((name) => name.endsWith('.test.js')).map((name) => join(out, 'test', name));
    // Its own test run, not a child of this one (NODE_TEST_CONTEXT would make it report to this runner).
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: out, encoding: 'utf8', env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /# fail 0/);
    assert.ok(Number(run.stdout.match(/# pass (\d+)/)?.[1]) >= 10, run.stdout);
    assert.match(run.stdout, /# skipped 2/, 'the repository-only checks skip there');
    const cli = spawnSync(process.execPath, [join(out, 'bin/viable-harness.mjs'), 'validate', join(out, 'examples/fractions-practice.json')], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
  } finally {
    rmSync(join(out, '..'), { recursive: true, force: true });
  }
});
