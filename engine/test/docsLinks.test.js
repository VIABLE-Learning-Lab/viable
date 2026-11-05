/** Every relative link in the repository's Markdown reaches a file: a stranger's first click shouldn't be a 404. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  if (['node_modules', 'dist', '.git'].includes(name)) return [];
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

test('relative links in the Markdown go somewhere', () => {
  const broken = [];
  for (const file of walk(ROOT).filter((path) => path.endsWith('.md'))) {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img[^>]*\ssrc="([^"]+)"/g)) {
      if (!target || /^(?:[a-z]+:|#)/i.test(target)) continue;
      if (!existsSync(resolve(dirname(file), target.split('#')[0].split('?')[0]))) broken.push(`${file.slice(ROOT.length + 1)}: ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});
