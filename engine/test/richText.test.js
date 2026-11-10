// The page editor's Markdown, held to what the learner pages show: marked set up as render.browser.js sets it up, whose
// HTML read back by readDom must be the blocks the editor shows, for Markdown the editor opens and for what it writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lexer, Marked } from 'marked';
import { decodeHTML, decodeHTMLAttribute } from 'entities';
import { PATTERNS, linked, readDom, readMarkdown, tidyRuns, toHtml, toMarkdown } from '../src/console/richText.js';
import { RICH_EDITOR_CSS, RICH_EDITOR_SCRIPT, plainBlocks, webAddress } from '../src/console/richEditor.js';
import { CONSOLE_SCRIPT } from '../src/console/client.js';

const RENDERER = readFileSync(new URL('../src/learner/browser/render.browser.js', import.meta.url), 'utf8');
const MATH_BLOCK = new RegExp(`^${PATTERNS.mathBlock}`);
const MATH_INLINE = new RegExp(`^${PATTERNS.mathInline}`);
const learner = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    { name: 'mathBlock', level: 'block', start: (src) => { const at = src.search(/\$\$|\\\[/); return at < 0 ? undefined : at; }, tokenizer(src) { const m = MATH_BLOCK.exec(src); if (m) return { type: 'mathBlock', raw: m[0], text: m[1] ?? m[2] }; }, renderer: (token) => `<div class="math">${token.text}</div>` },
    { name: 'mathInline', level: 'inline', start: (src) => { const at = src.search(/\$|\\\(/); return at < 0 ? undefined : at; }, tokenizer(src) { const m = MATH_INLINE.exec(src); if (m) return { type: 'mathInline', raw: m[0], text: m[1] ?? m[2] ?? m[3] }; }, renderer: (token) => `<span class="math">${token.text}</span>` }
  ]
});
const render = (md) => learner.parse(md, { async: false });

// marked's HTML, or the editor's, as the few DOM properties readDom reads.
function htmlDom(html) {
  const element = (name, attrs = {}) => ({ nodeType: 1, nodeName: name.toUpperCase(), childNodes: [], attrs, getAttribute(key) { return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null; } });
  const root = element('div');
  const open = [root];
  for (const [whole, closing, name, attrs] of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>|[^<]+|</g)) {
    if (whole.startsWith('<!')) continue;
    if (!name) { open.at(-1).childNodes.push({ nodeType: 3, nodeValue: decodeHTML(whole) }); continue; }
    if (closing) { const at = open.findLastIndex((node) => node.nodeName === name.toUpperCase()); if (at > 0) open.length = at; continue; }
    const found = {};
    for (const [, key, , a, b, c] of (attrs || '').matchAll(/([^\s"'>/=]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) found[key.toLowerCase()] = decodeHTMLAttribute(a ?? b ?? c ?? '');
    const node = element(name, found);
    open.at(-1).childNodes.push(node);
    if (!['br', 'hr', 'img', 'input', 'meta', 'link'].includes(name.toLowerCase())) open.push(node);
  }
  return root;
}
const shown = (md) => readDom(htmlDom(render(md))).blocks;
const OWN = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'a', 'br']);
const withLinks = (blocks) => blocks.map((block) => (block.inline ? { ...block, inline: linked(block.inline) } : block.blocks ? { ...block, blocks: withLinks(block.blocks) } : { ...block, items: block.items.map((item) => ({ blocks: withLinks(item.blocks) })) }));
// Markdown the editor opens shows learners what the editor shows, and so does what it writes back.
function holds(md) {
  const read = readMarkdown(md);
  assert.ok(read.blocks, `opens ${JSON.stringify(md)} (${read.why})`);
  assert.deepEqual([...render(md).matchAll(/<([a-z][\w-]*)/g)].map((found) => found[1]).filter((tag) => !OWN.has(tag)), [], md);
  assert.deepEqual(shown(md), read.blocks, md);
  const again = toMarkdown(read.blocks);
  assert.deepEqual(readMarkdown(again).blocks, read.blocks, again);
  assert.deepEqual(shown(again), read.blocks, again);
  assert.deepEqual(readDom(htmlDom(toHtml(read.blocks))).blocks, read.blocks, 'the editor shows its blocks');
  return again;
}
// Blocks the editor holds: what it writes, it reads again, and learners see.
function writes(blocks) {
  const md = toMarkdown(blocks);
  const back = readMarkdown(md);
  assert.ok(back.blocks, `reads its own ${JSON.stringify(md)} (${back.why})`);
  assert.deepEqual(back.blocks, withLinks(blocks), md);
  assert.deepEqual(shown(md), withLinks(blocks), md);
  return md;
}

test('the patterns are the learner pages’ and marked’s own', () => {
  assert.ok(RENDERER.includes(`const MATH_BLOCK = /^${PATTERNS.mathBlock}/;`));
  assert.ok(RENDERER.includes(`const MATH_INLINE = /^${PATTERNS.mathInline}/;`));
  assert.ok(RENDERER.includes('breaks: false') && RENDERER.includes('gfm: true'));
  const { inline, block } = Lexer.rules;
  assert.equal(`^!?${PATTERNS.link}`, inline.gfm.link.source);
  assert.equal(`^${PATTERNS.autolink}`, inline.gfm.autolink.source);
  assert.equal(PATTERNS.backpedal, inline.gfm._backpedal.source);
  assert.ok(inline.gfm.url.source.includes(PATTERNS.url) && inline.gfm.url.source.includes(PATTERNS.email));
  assert.equal(`^${PATTERNS.tag.replaceAll('|<', '|^<')}`, inline.gfm.tag.source);
  assert.equal(`^${PATTERNS.htmlBlock}`, block.gfm.html.source.replaceAll('\t', '\\t'));
  assert.ok(block.gfm.def.source.startsWith(`^${PATTERNS.definition}`));
});

test('the common part of Markdown goes there and back as it was written', () => {
  for (const md of [
    '# Bees\n\nWho is right?',
    'Some **bold**, some *italic*, ***both***, and a [link](https://example.org/a_b).',
    '## The case\n\n> “Bees are dying.” — *Beekeepers*\n\n### What we know\n\n- Losses rose **30%**.\n- Two studies:\n  1. *Smith*, 2021.\n  2. A review, 2022.\n\n**Your task:** decide.',
    '3. Third\n4. Fourth',
    '- a\n\n- b',
    '- one\n  - two\n    - three',
    '> First paragraph.\n>\n> Second.',
    'Line one\\\nLine two',
    'See https://en.wikipedia.org/wiki/Colony_collapse_disorder.',
    'Write to teacher@school.edu, or visit www.example.org.',
    'It costs $5 to test one hive, and $1,200 for all.',
    'Use snake_case names; 5 < 6 and 2 > 1; it’s “quoted”.',
    '中文 **重点** 内容, emoji 😀 *ok*.',
    '**Note:** this is *very* important.'
  ]) assert.equal(holds(md), md);
});

test('other ways of writing the same are read, and written one way', () => {
  for (const [md, written] of [
    ['__Bold__ and _italic_', '**Bold** and *italic*'],
    ['* star\n* bullets\n\n+ plus', '- star\n- bullets\n\n* plus'],
    ['1) one\n2) two', '1. one\n2. two'],
    ['Two spaces  \nbreak a line', 'Two spaces\\\nbreak a line'],
    ['# Title #', '# Title'],
    ['> a quote\nthat goes on', '> a quote that goes on'],
    ['A line\nthat wraps', 'A line that wraps'],
    ['&copy; 2026 &amp; after', '© 2026 & after'],
    ['5 \\* 3', '5 * 3'],
    ['\\# not a heading', '\\# not a heading']
  ]) assert.equal(holds(md), written, md);
});

test('a text with what the editor can’t show stays Markdown, and says what that is', () => {
  for (const [md, why] of [
    ['| a | b |\n| - | - |\n| 1 | 2 |', 'table'], ['a\n:-', 'table'],
    ['The area is $\\pi r^2$.', 'math'], ['$$\nx^2\n$$', 'math'], ['\\[ x \\]', 'math'], ['so \\(x\\) holds', 'math'],
    ['```\ncode\n```', 'code'], ['use `npm test`', 'code'], ['    indented code', 'code'],
    ['![a bee](https://example.org/bee.png)', 'picture'], ['see ![this]', 'picture'],
    ['<div>hi</div>', 'html'], ['a <span>b</span>', 'html'], ['&alpha; and &beta;', 'html'],
    ['~~struck~~', 'other'], ['- [ ] a task', 'other'], ['a\n\n---\n\nb', 'other'], ['Title\n=====', 'other'],
    ['[a]: https://example.org', 'other'], ['[a link](relative/path)', 'other'], ['- \n- b', 'other'],
    ['**unclosed bold', 'other'], ['a\\[b]', 'other'], ['<irc://chat>', 'other']
  ]) assert.deepEqual(readMarkdown(md), { why }, md);
});

test('odd input: nothing, spaces, other line ends, long texts, and words that look like Markdown', () => {
  assert.deepEqual(readMarkdown(''), { blocks: [] });
  assert.deepEqual(readMarkdown(' \n\t\n'), { blocks: [] });
  assert.deepEqual(readMarkdown(null), { blocks: [] });
  assert.equal(toMarkdown([]), '');
  assert.deepEqual(readMarkdown('a\r\n\r\nb').blocks, readMarkdown('a\n\nb').blocks);
  const long = Array.from({ length: 80 }, (_, n) => `## Part ${n}\n\nSome **bold**, a [link](https://example.org/${n}) and *italic* with 3 * 4.\n\n- one\n- two`).join('\n\n');
  const started = performance.now();
  assert.equal(holds(long), long);
  assert.ok(performance.now() - started < 3000, 'a long page is quick');
  // Typed in the editor, Markdown's characters are characters.
  for (const words of ['1. not a list', '# not a heading', '- not a bullet', '> not a quote', '**not bold**', '[not](a link)', '<b>not HTML</b>', '$x$ is not math', '| not | a table |', '~not~ struck', 'a_b_c and _d_', '\\[x\\]', '![not a picture](x)'.replace('!', '! ')]) {
    writes([{ type: 'p', inline: [{ text: words }] }]);
  }
});

test('what the editor writes reads back the same where ** and * alone can’t say it', () => {
  // Bold beginning with punctuation inside a word: the letter before it is written as its number.
  assert.equal(writes([{ type: 'p', inline: [{ text: 'word' }, { text: '"quoted"', b: true }, { text: 'word' }] }]), 'wor&#100;**"quoted"**&#119;ord');
  // A mark ending and another starting between punctuation: <strong> and <em>.
  assert.match(writes([{ type: 'p', inline: [{ text: '.#', b: true, i: true }, { text: '=', b: true }, { text: '+', b: true, i: true }] }]), /<strong>/);
  writes([{ type: 'p', inline: [{ text: 'un', b: true }, { text: 'happy' }] }]);
  writes([{ type: 'h', level: 2, inline: [{ text: 'C#' }] }]);
  writes([{ type: 'list', ordered: false, start: 1, loose: false, items: [{ blocks: [{ type: 'p', inline: [{ text: 'a' }] }] }] }, { type: 'list', ordered: false, start: 1, loose: false, items: [{ blocks: [{ type: 'p', inline: [{ text: 'b' }] }] }] }]);
  writes([{ type: 'p', inline: [{ text: 'see ' }, { text: 'this page', href: 'https://example.org/a%20b?q=1&x=2' }] }]);
});

test('a page’s white space is a page’s: one space, none at a line’s ends, and none at bold’s', () => {
  assert.deepEqual(tidyRuns([{ text: '  a  ' }, { text: ' b ', b: true }, { text: '\n' }, { text: ' c  d' }]), [{ text: 'a ' }, { text: 'b', b: true }, { text: '\n' }, { text: 'c d' }]);
  assert.deepEqual(tidyRuns([{ text: '\n' }, { text: 'x' }, { text: '\n' }]), [{ text: 'x' }]);
  assert.deepEqual(tidyRuns([{ text: ' ', href: 'https://a.org' }, { text: 'x' }]), [{ text: 'x' }], 'a link on a space alone is the space');
});

test('pasted from Google Docs: its paragraphs, headings, lists, links, bold and italic, without its styles', () => {
  const doc = htmlDom('<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h1 dir="ltr"><span style="font-size:20pt;font-weight:400">The case</span></h1><p dir="ltr" style="line-height:1.38"><span style="font-weight:700;font-style:normal">Bees</span><span style="font-weight:400"> are </span><span style="font-style:italic">dying</span><span style="color:#ff0000;text-decoration:underline"> fast.</span></p><ul><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span>One</span></p></li><li aria-level="1"><p role="presentation"><a href="https://example.org/x" style="text-decoration:none"><span style="color:#1155cc">Two</span></a></p></li></ul><br></b>');
  const pasted = readDom(doc, { pasted: true });
  assert.deepEqual(pasted.blocks, [
    { type: 'h', level: 1, inline: [{ text: 'The case' }] },
    { type: 'p', inline: [{ text: 'Bees', b: true }, { text: ' are ' }, { text: 'dying', i: true }, { text: ' fast.' }] },
    { type: 'list', ordered: false, start: 1, loose: false, items: [{ blocks: [{ type: 'p', inline: [{ text: 'One' }] }] }, { blocks: [{ type: 'p', inline: [{ text: 'Two', href: 'https://example.org/x' }] }] }] }
  ]);
  assert.equal(toMarkdown(pasted.blocks), '# The case\n\n**Bees** are *dying* fast.\n\n- One\n- [Two](https://example.org/x)');
});

test('pasted from Word: its lists, written as paragraphs, are lists again', () => {
  const doc = htmlDom(`<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body>
<p class=MsoNormal><b>Read</b> the <i>whole</i> case.<o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-list:Ignore'>·<span>&nbsp;&nbsp; </span></span><![endif]>First<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='mso-list:l0 level2 lfo1'><span style='mso-list:Ignore'>o<span>&nbsp; </span></span>Under it<o:p></o:p></p>
<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><span style='mso-list:Ignore'>1.<span>&nbsp; </span></span>Numbered<o:p></o:p></p>
<p class=MsoNormal><span style='mso-bidi-font-weight:bold'>Not bold</span></p></body></html>`);
  assert.deepEqual(readDom(doc, { pasted: true }).blocks, [
    { type: 'p', inline: [{ text: 'Read', b: true }, { text: ' the ' }, { text: 'whole', i: true }, { text: ' case.' }] },
    { type: 'list', ordered: false, start: 1, loose: false, items: [{ blocks: [{ type: 'p', inline: [{ text: 'First' }] }, { type: 'list', ordered: false, start: 1, loose: false, items: [{ blocks: [{ type: 'p', inline: [{ text: 'Under it' }] }] }] }] }] },
    { type: 'list', ordered: true, start: 1, loose: false, items: [{ blocks: [{ type: 'p', inline: [{ text: 'Numbered' }] }] }] },
    { type: 'p', inline: [{ text: 'Not bold' }] }
  ]);
});

test('pasted from a web page: its words, without scripts, pictures or a link anywhere else, and a table row as a line', () => {
  const page = htmlDom('<script>alert(1)</script><style>p{}</style><p>See <a href="javascript:alert(1)">this</a> and <a href="/local">that</a><img src="x.png" alt="x">.</p><table><tr><th>Bee</th><th>Count</th></tr><tr><td>Honey</td><td>3</td></tr></table><pre>line one\nline two</pre>');
  const pasted = readDom(page, { pasted: true });
  assert.deepEqual(pasted.blocks, [
    { type: 'p', inline: [{ text: 'See this and that.' }] },
    { type: 'p', inline: [{ text: 'Bee | Count' }] },
    { type: 'p', inline: [{ text: 'Honey | 3' }] },
    { type: 'p', inline: [{ text: 'line one' }, { text: '\n' }, { text: 'line two' }] }
  ]);
  assert.deepEqual(pasted.dropped.sort(), ['picture', 'table']);
  // The editor's own HTML, as a browser leaves it while editing: <b> and <div>, a styled span, a list in a list.
  assert.deepEqual(readDom(htmlDom('Typed first<div><b>bold</b> <span style="font-weight: 700">and this</span></div><ul><li>a</li><ul><li>b</li></ul></ul>')).blocks, [
    { type: 'p', inline: [{ text: 'Typed first' }] },
    { type: 'p', inline: [{ text: 'bold and this', b: true }] },
    { type: 'list', ordered: false, start: 1, loose: false, items: [{ blocks: [{ type: 'p', inline: [{ text: 'a' }] }, { type: 'list', ordered: false, start: 1, loose: false, items: [{ blocks: [{ type: 'p', inline: [{ text: 'b' }] }] }] }] }] }
  ]);
});

test('a link typed in its field, and plain words pasted', () => {
  assert.equal(webAddress('example.org/a'), 'https://example.org/a');
  assert.equal(webAddress('https://example.org'), 'https://example.org');
  assert.equal(webAddress('teacher@school.edu'), 'mailto:teacher@school.edu');
  assert.equal(webAddress('  '), '');
  assert.equal(webAddress('javascript:alert(1)'), null);
  assert.equal(webAddress('just words'), null);
  assert.deepEqual(plainBlocks('one\ntwo\n\nthree'), [{ type: 'p', inline: [{ text: 'one' }, { text: '\n' }, { text: 'two' }] }, { type: 'p', inline: [{ text: 'three' }] }]);
});

// Random Markdown, and random blocks, many times over: what the editor opens and writes always shows learners the same.
test('random Markdown and random blocks show learners what the editor shows', () => {
  let seed = 7;
  const rand = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const MD = ['word', 'bee', 'Ün', '蜜蜂', '😀', ' ', ' ', '\n', '\n\n', '*', '**', '***', '_', '__', '[', ']', '(', ')', '](https://a.org/x)', '!', '<', '>', '&', '&amp;', '#', '# ', '- ', '* ', '1. ', '> ', '\\', '\\*', '~', '$', '$5', '|', ':', '"', '.', 'https://a.org/p_q', 'www.b.com', 'c@d.co', '<https://e.org>', '  \n', '\\\n', 'a_b'];
  const TEXT = ['a', 'bee', 'Ün', '蜜', '😀', ' ', '*', '_', '[', ']', '(', ')', '!?', '<', '>', '&', '#', '-', '+', '=', '1.', '\\', '~', '$', '|', ':', '"', '.', 'a_b', 'https://a.org/p_q', 'www.b.com', 'c@d.co', '[1]', '](', '$$'];
  const HREFS = ['https://a.org/x', 'https://a.org/y?q=1&b=2', 'mailto:c@d.co', 'http://www.b.com'];
  const runs = (n, breaks = true) => tidyRuns(Array.from({ length: n }, () => {
    if (breaks && rand() < 0.08) return { text: '\n' };
    const run = { text: Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(TEXT)).join('') };
    if (rand() < 0.3) run.b = true;
    if (rand() < 0.3) run.i = true;
    if (rand() < 0.15) run.href = pick(HREFS);
    return run;
  }));
  const blocks = (depth = 0, where = 'page') => {
    const out = [];
    for (let k = 0; k < 1 + Math.floor(rand() * 3); k += 1) {
      const kind = where === 'quote' ? 'p' : pick(where === 'item' ? ['p', 'list'] : ['p', 'p', 'h', 'quote', 'list']);
      if (kind === 'p') { const inline = runs(1 + Math.floor(rand() * 5)); if (inline.length) out.push({ type: 'p', inline }); }
      if (kind === 'h') { const inline = runs(1 + Math.floor(rand() * 3), false); if (inline.length) out.push({ type: 'h', level: 1 + Math.floor(rand() * 6), inline }); }
      if (kind === 'quote') { const inner = blocks(depth + 1, 'quote'); if (inner.length) out.push({ type: 'quote', blocks: inner }); }
      if (kind === 'list' && depth < 3) {
        const ordered = rand() < 0.5;
        const items = [];
        for (let n = 0; n < 1 + Math.floor(rand() * 3); n += 1) {
          const inline = runs(1 + Math.floor(rand() * 3));
          if (inline.length) items.push({ blocks: [{ type: 'p', inline }, ...(rand() < 0.3 ? blocks(depth + 1, 'item').filter((block) => block.type === 'list') : [])] });
        }
        const loose = rand() < 0.3 && (items.length > 1 || items.some((item) => item.blocks.length > 1));
        if (items.length) out.push({ type: 'list', ordered, start: ordered ? pick([1, 1, 3, 0, 10]) : 1, loose, items });
      }
    }
    return out;
  };
  let opened = 0;
  for (let n = 0; n < 600; n += 1) {
    const md = Array.from({ length: 1 + Math.floor(rand() * 12) }, () => pick(MD)).join('');
    if (readMarkdown(md).blocks) { holds(md); opened += 1; }
    const made = blocks();
    if (made.length) {
      writes(made);
      assert.deepEqual(readDom(htmlDom(toHtml(made))).blocks, made);
    }
  }
  assert.ok(opened > 150, `the editor opens most such Markdown (${opened} of 600)`);
});

test('the editor ships as one script in a scope of its own, and the console dresses page text with it', () => {
  assert.equal(new Function(`${RICH_EDITOR_SCRIPT}; return typeof dressRich;`)(), 'function');
  assert.equal(new Function(`${RICH_EDITOR_SCRIPT}; return typeof readMarkdown;`)(), 'undefined', 'its helpers stay inside');
  assert.ok(!/<\/script/i.test(RICH_EDITOR_SCRIPT));
  assert.match(CONSOLE_SCRIPT, /textarea\[data-rich\]'\)\) dressRich\(area\)/);
  assert.match(RICH_EDITOR_CSS, /\.rt-area/);
  assert.ok(!/\btitle=/.test(RICH_EDITOR_SCRIPT.replace(/title=\$\{|title="\$\{escapeHtml/g, '')), 'tips are the console’s own, not the browser’s');
});
