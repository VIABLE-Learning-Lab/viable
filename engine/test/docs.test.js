import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pages = [...['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'GOVERNANCE.md', 'SUPPORT.md', 'CHANGELOG.md', 'ADOPTERS.md', 'TRADEMARKS.md'], ...readdirSync(join(ROOT, 'docs')).filter((name) => name.endsWith('.md')).map((name) => `docs/${name}`)];

test('every relative link in the README and the docs leads to a file that exists', () => {
  for (const page of pages) {
    const text = readFileSync(join(ROOT, page), 'utf8');
    const links = [...text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)|(?:src|href)="([^"#]+)"/g)].map((match) => match[1] || match[2]);
    for (const link of links) {
      // Absolute addresses, and GitHub's own pages reached from the repository root (../../issues), are not files here.
      if (/^[a-z]+:/i.test(link) || link.startsWith('../../')) continue;
      assert.ok(existsSync(resolve(ROOT, dirname(page), link)), `${page} links to ${link}, which doesn't exist`);
    }
  }
});

test('the README’s figures are self-contained SVGs with a description', () => {
  for (const name of readdirSync(join(ROOT, 'docs', 'images')).filter((file) => file.endsWith('.svg'))) {
    const svg = readFileSync(join(ROOT, 'docs', 'images', name), 'utf8');
    assert.match(svg, /role="img" aria-label="[^"]{20,}"/, name);
    assert.ok(!/<script|<foreignObject|href="http/i.test(svg), `${name} loads or runs nothing`);
  }
});
