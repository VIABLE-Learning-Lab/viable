import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown } from '../src/markdown.js';

test('a hostile page of 5 MiB takes moments, whatever it repeats', () => {
  const MIB = 5 * 1024 * 1024;
  const pages = ['<b ', '<!--', '<!', '<', '<script>', '<script ', '</script ', '<style>x', '<header ', '<header>', '<footer ', '<footer>', '<pre>', '<pre ', '<a ', '<a>', '<a href="', '<a href=\'', '<a "\'<a\'" ', '<p>x</p>', '<li>', '<ul>', '<ul><li>', '<main ', '<div role=main ', '<td>', '<img src="x" ', '&amp;', ' ', '\n'];
  for (const piece of pages) {
    const page = piece.repeat(Math.ceil(MIB / piece.length));
    const started = Date.now();
    htmlToMarkdown(page);
    htmlToMarkdown(page, { selector: 'main' });
    htmlToMarkdown(page, { selector: '[role="main"]' });
    assert.ok(Date.now() - started < 8000, `${JSON.stringify(piece)} took ${Date.now() - started} ms`);
  }
});

test('the linear readers still read a page as they did', () => {
  assert.equal(htmlToMarkdown('<!-- a --><!doctype html><p>one</p><!-- never closed > <p>two</p>'), 'one\n\ntwo');
  assert.equal(htmlToMarkdown('<SCRIPT type="x">bad()</SCRIPT ><style>x{}</style><p>kept</p><script>never closed'), 'kept\n\nnever closed');
  assert.equal(htmlToMarkdown('<header>first</header><article><header>own</header><p>body</p></article><footer>a</footer><footer>last</footer>'), 'own\n\nbody\n\na');
  assert.equal(htmlToMarkdown('<pre>\n  a <b>b</b>\n</pre>'), '```\n  a b\n```');
  assert.equal(htmlToMarkdown('<a title="a>b" href="https://x.example/">go</a>', {}), '[go](https://x.example/)');
  assert.equal(htmlToMarkdown('<p>keep</p><main class="x"><p>in</p><main>nested</main></main>after', { selector: 'main' }), 'in\n\nnested');
  assert.equal(htmlToMarkdown('<div role="main"><p>in</p></div>after', { selector: '[role="main"]' }), 'in');
  assert.equal(htmlToMarkdown('<ul><li><p>one</p></li><li>two</li></ul>'), '- one\n\n- two');
  assert.equal(htmlToMarkdown('<ul><li>a<ul><li>b</li></ul></li></ul>'), '- a\n  - b');
});
