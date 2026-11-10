/**
 * What learners read on a page step, held two ways: as Markdown, which is saved and which the learner pages draw, and as
 * blocks, which the console's editor shows (richEditor.js). Only what a teacher writes most: paragraphs, bold, italic,
 * headings, bulleted and numbered lists, quotes, links and line breaks, read the way the learner pages read Markdown
 * (marked, with GitHub's additions and math: render.browser.js). readMarkdown says why when a text holds anything more,
 * such as a table, math, code, a picture or HTML, so that text can stay as it is: nothing is ever lost on the way.
 *
 *   blocks   { type: 'p', inline } | { type: 'h', level, inline } | { type: 'quote', blocks: [p...] }
 *            | { type: 'list', ordered, start, loose, items: [{ blocks: [p, then p or list...] }] }
 *   inline   runs { text, b?, i?, href?, title? }; a run whose text is '\n' is a line break
 *
 * Plain functions on strings and on DOM nodes (anything with nodeType, nodeName, childNodes and getAttribute), with no
 * dependency. RICH_TEXT_SCRIPT is them as source for the console's script (richEditor.js, asSource in harness/src/ui/parts.js).
 */
import { asSource } from '../../../harness/src/ui/parts.js';

// What the learner pages' renderer and marked match, without their ^: a test holds them to the originals.
const T = '`';
export const PATTERNS = {
  link: String.raw`\[((?:\[(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|${T}+(?!${T})[^${T}]*?${T}+(?!${T})|${T}${T}+(?=\])|[^\[\]\\${T}])*?)\]\([ \t\n]*(<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\)))(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)("(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)))?[ \t\n]*\)`,
  mathInline: String.raw`(?:\$\$((?:\\.|[^\\$])+?)\$\$|\$(?=[^\s$])((?:\\.|[^\\$\n])*?[^\s\\$])\$(?!\d)|\\\(((?:\\.|[^\\\n])+?)\\\))`,
  mathBlock: String.raw` {0,3}(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)`,
  url: String.raw`((?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*`,
  email: String.raw`[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])`,
  backpedal: String.raw`(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+`,
  autolink: String.raw`<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s\x00-\x1f<>]*|[a-zA-Z0-9.!#$%&'*+/=?_${T}{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_]))>`,
  definition: String.raw` {0,3}\[((?!\s*\])(?:\\[\s\S]|[^\[\]\\])+)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)`,
  htmlBlock: String.raw` {0,3}(?:<(script|pre|style|textarea)[\s>][\s\S]*?(?:<\/\1>[^\n]*\n*|$)|<!--(?:-?>|[\s\S]*?(?:-->|$))[^\n]*(\n+|$)|<\?[\s\S]*?(?:\?>[^\n]*\n*|$)|<![A-Z][\s\S]*?(?:>[^\n]*\n*|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>[^\n]*\n*|$)|<\/?(address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t]+|\n|\/?>|$)[\s\S]*?(?:(?:\n[ \t]*)+\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?: +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>${T}]+)?)*? *\/?>(?=[ \t]*(?:\n|$))[\s\S]*?(?:(?:\n[ \t]*)+\n|$)|<\/[a-z][a-z0-9-]*\s*>(?=[ \t]*(?:\n|$))[\s\S]*?(?:(?:\n[ \t]*)+\n|$))`,
  tag: String.raw`<!--(?:-?>|[\s\S]*?-->)|<\/[a-zA-Z][a-zA-Z0-9-]*\s*>|<[a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>${T}]+)?)*?\s*\/?>|<\?[\s\S]*?\?>|<![a-zA-Z]+\s[\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>`
};
// The entities a page's text usually holds; any other named one sends the text to plain Markdown.
export const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', hellip: '…', middot: '·', bull: '•', deg: '°', times: '×', divide: '÷', minus: '−', plusmn: '±', le: '≤', ge: '≥', ne: '≠', frac12: '½', frac14: '¼', frac34: '¾', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', cent: '¢', yen: '¥', sect: '§', para: '¶' };

// --- Characters, as CommonMark and marked read them around * and _ ------------------------------------

function isSpace(ch) { return !ch || /\s/.test(ch); }
// marked counts ~ as a letter beside * and _.
function isPunct(ch) { return Boolean(ch) && ch !== '~' && /[\p{P}\p{S}]/u.test(ch); }
function isWord(ch) { return Boolean(ch) && /[\p{L}\p{N}]/u.test(ch); }
function isEscapable(ch) { return Boolean(ch) && '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.includes(ch); }
function cannot(why) { const error = new Error(why); error.why = why; throw error; }
// Each pattern made once, matched at a place (lastIndex) each time.
const STICKY = {};
function sticky(name) { STICKY[name] ||= new RegExp(PATTERNS[name], 'y'); return STICKY[name]; }
function matchAt(name, source, at) { const pattern = sticky(name); pattern.lastIndex = at; return pattern.exec(source); }
// A link's address as marked writes it, kept only where a learner's page keeps it: the web, or an email address. No $$
// stands in it, which the learner pages would take for math (the first $ of two is %24), and no parenthesis, which marked
// can take for its end when it hides links from * and _ (%28, %29: the same address).
export function cleanHref(raw) {
  let href;
  try { href = encodeURI(String(raw ?? '').trim()).replace(/%25/g, '%'); } catch { return null; }
  return /^(?:https?:|mailto:)/i.test(href) ? href.replace(/\$(?=\$)/g, '%24').replace(/[()]/g, (paren) => (paren === '(' ? '%28' : '%29')) : null;
}

// --- Markdown to blocks ------------------------------------------------------------------------------

/** A text's blocks, or why the editor can't show it: { blocks } or { why } (table, math, code, picture, html or other). */
export function readMarkdown(markdown) {
  try {
    return { blocks: mdBlocks(String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n'), 'page').blocks };
  } catch (error) {
    if (error && error.why) return { why: error.why };
    throw error;
  }
}

function isBlank(line) { return /^[ \t]*$/.test(line); }
function indentOf(line) {
  const lead = /^[ \t]*/.exec(line)[0];
  if (lead.includes('\t')) cannot('other');
  return lead.length;
}
// A line that is a rule, an underline making a heading of the line above, or an empty item: none of them is kept here.
function isRuleLike(line) { return /^ {0,3}(?:=+|-+)[ \t]*$/.test(line) || /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line); }
// What ends a paragraph without a blank line before it. In a list item, marked starts a list at any number.
function interrupts(line, where) { return isRuleLike(line) || /^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|`{3}|~{3}|[-+*][ \t]+\S)/.test(line) || new RegExp(`^ {0,3}${where === 'item' ? '\\d{1,9}' : '1'}[.)][ \\t]+\\S`).test(line); }
function listMarker(line) {
  if (/^ {0,3}(?:[-+*]|\d{1,9}[.)])\t/.test(line)) cannot('other');
  const found = /^( {0,3})(?:([-+*])|(\d{1,9})([.)]))( +|$)/.exec(line);
  if (!found) return null;
  if (found[5].length > 4) cannot('code');
  // Four spaces after the marker: marked ends the item at the next line, where CommonMark would go on.
  if (found[5].length === 4) cannot('other');
  return { kind: found[2] || found[4], ordered: Boolean(found[3]), start: found[3] ? Number(found[3]) : 1, width: found[1].length + (found[2] || found[3] + found[4]).length + (found[5].length || 1), rest: line.slice(found[0].length) };
}
function checkLine(line) {
  if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) cannot('code');
  if (new RegExp(`^${PATTERNS.htmlBlock}`, 'i').test(line)) cannot('html');
  // A rule, a heading's underline, or a list marker with nothing after it (marked makes an empty item of it even where
  // CommonMark goes on with the paragraph).
  if (isRuleLike(line) || /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]*$/.test(line)) cannot('other');
  if (/^ {0,3}\[(?!\s*\])(?:\\[\s\S]|[^[\]\\])+\]:/.test(line)) cannot('other');
  if (/^ {0,3}(?:\| *)?:?-+:? *(?:\| *:?-+:? *)*(?:\| *)?$/.test(line)) cannot('table');
}

// The blocks of a page, a quote's inside or a list item's inside. spaced: a blank line stands between two of its blocks.
function mdBlocks(lines, where) {
  const blocks = [];
  let gap = false;
  let spaced = false;
  for (let at = 0; at < lines.length;) {
    const line = lines[at];
    if (isBlank(line)) { if (blocks.length) gap = true; at += 1; continue; }
    if (gap) spaced = true;
    gap = false;
    if (indentOf(line) >= 4) cannot('code');
    checkLine(line);
    // A [ starting a block can start a link's definition that ends lines later (marked's def rule).
    if (/^ {0,3}\[/.test(line) && new RegExp(`^${PATTERNS.definition}`).test(lines.slice(at).join('\n'))) cannot('other');
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
    if (heading) {
      const words = heading[2].replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
      if (where !== 'page' || !words) cannot('other');
      blocks.push({ type: 'h', level: heading[1].length, inline: mdInline(words) });
      at += 1;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      if (where !== 'page') cannot('other');
      const inside = [];
      for (; at < lines.length; at += 1) {
        const quoted = /^ {0,3}> ?(.*)$/.exec(lines[at]);
        if (quoted) inside.push(quoted[1]);
        else if (inside.length && !isBlank(inside.at(-1)) && !isBlank(lines[at]) && !interrupts(lines[at]) && !listMarker(lines[at])) inside.push(lines[at]);
        else break;
      }
      const quote = mdBlocks(inside, 'quote').blocks;
      if (quote.some((block) => block.type !== 'p')) cannot('other');
      if (quote.length) blocks.push({ type: 'quote', blocks: quote });
      continue;
    }
    const first = listMarker(line);
    if (first) {
      if (where === 'quote') cannot('other');
      const list = { type: 'list', ordered: first.ordered, start: first.start, loose: false, items: [] };
      let trailing = 0;
      for (let mark = first; mark && mark.kind === first.kind; mark = at < lines.length ? listMarker(lines[at]) : null) {
        checkLine(lines[at]);
        // An empty item, or a box to tick (GitHub's task lists), isn't kept here.
        if (isBlank(mark.rest) || /^\[[ xX]\](?:[ \t]|$)/.test(mark.rest) || /^\\[ \t]*$/.test(mark.rest)) cannot('other');
        const body = [mark.rest];
        // marked takes a line on lazily only after one that, less the item's indent, isn't code, a fence, a heading or a rule.
        let previous = mark.rest;
        const lead = ` {0,${Math.min(3, mark.width - 1)}}`;
        for (at += 1; at < lines.length; at += 1) {
          const next = lines[at];
          const lazy = previous.search(/\S/) < 4 && !new RegExp(`^${lead}(?:\`{3}|~{3}|#{1,6}(?:\\s|$)|(?:-[ \\t]*){3,}$|(?:_[ \\t]*){3,}$|(?:\\*[ \\t]*){3,}$)`).test(previous);
          if (isBlank(next)) body.push('');
          else if (indentOf(next) >= mark.width) body.push(next.slice(mark.width));
          else if (lazy && !isBlank(body.at(-1)) && !interrupts(next) && !listMarker(next)) body.push(next.trimStart());
          else break;
          previous = next.slice(mark.width);
        }
        trailing = 0;
        while (isBlank(body.at(-1))) { body.pop(); trailing += 1; }
        const inside = mdBlocks(body, 'item');
        if (inside.blocks[0]?.type !== 'p') cannot('other');
        if (inside.spaced || inside.blocks.filter((block) => block.type === 'p').length > 1) list.loose = true;
        const after = trailing && at < lines.length ? listMarker(lines[at]) : null;
        if (after && after.kind === first.kind) list.loose = true;
        list.items.push({ blocks: inside.blocks });
      }
      blocks.push(list);
      // The blank lines its last item ended with stand between it and what comes next.
      if (trailing) gap = true;
      continue;
    }
    const begin = at;
    for (at += 1; at < lines.length && !isBlank(lines[at]) && !interrupts(lines[at], where); at += 1) checkLine(lines[at]);
    const inline = mdInline(lines.slice(begin, at).map((each) => each.replace(/^[ \t]+/, '')).join('\n'));
    if (!inline.length) cannot('other');
    blocks.push({ type: 'p', inline });
  }
  return { blocks, spaced };
}

// A text's inline Markdown as runs: what each character is, as marked reads it, then which * and _ close which.
function mdInline(source) {
  // The learner pages start display math wherever $$ or \[ stands, even in the middle of a line, and break the text
  // there when it isn't math (into a line break, a list, a space), so a text with either is left as it is.
  if (source.includes('$$')) cannot('math');
  for (let at = source.indexOf('\\['); at >= 0; at = source.indexOf('\\[', at + 1)) cannot(matchAt('mathBlock', source, at) ? 'math' : 'other');
  const tildes = { words: 0, addresses: 0 };
  const runs = tidyRuns(flatten(inlineNodes(source, false, tildes), {}, []));
  // Two ~ can strike text through (GitHub's addition), across a link's words too, and from one in the words to one in
  // a web address. Those in addresses alone stay in them.
  if (tildes.words > 1 || (tildes.words && tildes.addresses)) cannot('other');
  // A learner's page shows ![words] as the picture it stands for, or as nothing.
  if (runs.map((run) => run.text).join('').includes('![')) cannot('picture');
  // An address kept out of a link (by an escape) would be one once written again.
  if (!same(linked(runs), runs)) cannot('other');
  return runs;
}

// A link a learner's page keeps goes to the web or to an email address; any other shows as its words.
function linkNode(href, words) { return cleanHref(href) ? { kind: 'link', href: cleanHref(href), title: '', children: [{ kind: 'text', text: words }] } : { kind: 'text', text: words }; }

/** A web or email address that marked finds at this place in plain words: { words, href }, or null. before: the character before it. */
export function addressAt(text, at, before) {
  const ch = text[at];
  if (!/[A-Za-z0-9._+-]/.test(ch || '')) return null;
  const web = /[hHfFwW]/.test(ch) ? matchAt('url', text, at) : null;
  const mail = web || /[A-Za-z0-9._+-]/.test(before || '') ? null : matchAt('email', text, at);
  if (!web && !mail) return null;
  let words = (web || mail)[0];
  if (web) for (let was = ''; was !== words;) { was = words; words = new RegExp(PATTERNS.backpedal).exec(words)?.[0] ?? ''; }
  return words ? { words, href: mail ? `mailto:${words}` : web[1] === 'www.' ? `http://${words}` : words } : null;
}

function inlineNodes(source, inLink, tildes) {
  // What marked looks at to find where * and _ close: an escaped character as ++, and what looks like a link, or <…>
  // with no space after the <, hidden.
  const masked = source.replace(/\\[\p{P}\p{S}]/gu, (escape) => '+'.repeat(escape.length));
  const hidden = [...masked.matchAll(/\[(?:[^[\]`])*?\]\((?:\\[\s\S]|[^\\()]|\((?:\\[\s\S]|[^\\()])*\))*\)|<(?! )[^<>]*?>/g)].map((found) => [found.index, found.index + found[0].length]);
  const nodes = [];
  let text = '';
  // What came last, as marked's tokens: the character before an opening run is the last of a text, or none.
  let last = '';
  const flush = () => { if (text) nodes.push({ kind: 'text', text }); text = ''; };
  for (let at = 0; at < source.length;) {
    const ch = source[at];
    if (ch === '\\') {
      const next = source[at + 1];
      if (next === '\n') { flush(); nodes.push({ kind: 'br' }); at += 2; last = ''; continue; }
      if (next === '(' && matchAt('mathInline', source, at)) cannot('math');
      if (isEscapable(next)) { text += next; at += 2; last = ''; continue; }
      text += '\\';
      at += 1;
      last = 'text';
      continue;
    }
    if (ch === '`') cannot('code');
    if (ch === '$' && matchAt('mathInline', source, at)) cannot('math');
    if (ch === '!' && source[at + 1] === '[') cannot('picture');
    if (ch === '<') {
      // The editor writes <strong> and <em> where ** and * can't say it (see inlineMd).
      const tag = /<(\/?)(em|strong)>/y;
      tag.lastIndex = at;
      const found = tag.exec(source);
      if (found) { flush(); nodes.push({ kind: 'tag', close: Boolean(found[1]), mark: found[2] === 'em' ? 'i' : 'b' }); at += found[0].length; last = ''; continue; }
      const auto = matchAt('autolink', source, at);
      if (auto && inLink) cannot('other');
      if (auto && !cleanHref(auto[2] ? `mailto:${auto[1]}` : auto[1])) cannot('other');
      if (auto) { flush(); nodes.push(linkNode(auto[2] ? `mailto:${auto[1]}` : auto[1], auto[1])); tildes.addresses += (auto[1].match(/~/g) || []).length; at += auto[0].length; last = ''; continue; }
      if (matchAt('tag', source, at)) cannot('html');
    }
    if (ch === '&') {
      const ref = /&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{0,31}));/y;
      ref.lastIndex = at;
      const found = ref.exec(source);
      if (found) {
        const code = found[1] ? Number(found[1]) : found[2] ? Number.parseInt(found[2], 16) : null;
        if (code == null && !Object.hasOwn(ENTITIES, found[3])) cannot('html');
        text += code == null ? ENTITIES[found[3]] : !code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code);
        at += found[0].length;
        last = 'text';
        continue;
      }
    }
    if (ch === '[') {
      // marked takes a whole link at its [ (its link rule), reads the words inside by themselves, and keeps no link in a link.
      const link = matchAt('link', source, at);
      const tail = link && linkTail(link);
      if (tail) {
        if (inLink) cannot('other');
        const inside = inlineNodes(link[1].replace(/\\([[\]])/g, '$1'), true, tildes);
        if (!tidyRuns(flatten(inside, {}, [])).length) cannot('other');
        flush();
        nodes.push({ kind: 'link', href: tail.href, title: tail.title, children: inside, brackets: /[[\]]/.test(link[1]) });
        at += tail.length;
        last = '';
        continue;
      }
    }
    // A * or _ that marked masks as an escape (a web address took its backslash) opens there and never closes, read
    // in marked's own order: left as Markdown.
    if ((ch === '*' || ch === '_') && masked[at] !== ch) cannot('other');
    if (ch === '*' || ch === '_') {
      let end = at;
      while (source[end] === ch) end += 1;
      // marked counts ~ as a letter beside * and an opening _, and as punctuation beside a closing _.
      if (ch === '_' && (source[at - 1] === '~' || source[end] === '~')) cannot('other');
      // marked makes an email address of _a@b.co only when the _ closes nothing.
      if (ch === '_' && !inLink && addressAt(source, at, last ? source[at - 1] : '')) cannot('other');
      const before = last ? source[at - 1] : '';
      const beforeWhole = at > 1 && /[\udc00-\udfff]/.test(masked[at - 1]) ? masked.slice(at - 2, at) : masked[at - 1];
      const after = end < source.length ? String.fromCodePoint(masked.codePointAt(end)) : '';
      const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
      const right = !isSpace(beforeWhole) && (!isPunct(beforeWhole) || isSpace(after) || isPunct(after));
      const leftWhole = !isSpace(after) && (!isPunct(after) || isSpace(beforeWhole) || isPunct(beforeWhole));
      const both = right && leftWhole;
      // One in <…> could pair across its end.
      const open = ch === '*' ? left : left && (!right || isPunct(before));
      const close = ch === '*' ? right : right && (!left || isPunct(after));
      if ((open || close) && hidden.some(([from, to]) => at >= from && at < to)) cannot('other');
      flush();
      // What is left of a run once part of it closes opens only by the character before the whole run, as marked looks back to it.
      const rest = ch === '*' ? leftWhole : leftWhole && (!right || isPunct(beforeWhole));
      nodes.push({ kind: 'delim', char: ch, count: end - at, length: end - at, both: both || (open && close), open, close, rest });
      at = end;
      last = '';
      continue;
    }
    if (ch === '\n') {
      if (/ {2,}$/.test(text)) { text = text.replace(/ +$/, ''); flush(); nodes.push({ kind: 'br' }); last = ''; } else { text += ch; last = 'text'; }
      at += 1;
      continue;
    }
    // A web or email address in plain words is a link on a learner's page, ending where marked ends it; not in a link's words.
    const address = inLink ? null : addressAt(source, at, last ? source[at - 1] : '');
    // An email address against an _ is one only where marked reads the _ as closing what the address is in.
    const mail = !inLink && !/[A-Za-z0-9._+-]/.test((last && source[at - 1]) || '') && /^[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+/.exec(source.slice(at, at + 320));
    if (mail && source[at + mail[0].length] === '_' && !(address && !address.href.startsWith('mailto:'))) cannot('other');
    if (address) { flush(); nodes.push({ ...linkNode(address.href, address.words), address: address.words }); tildes.addresses += (address.words.match(/~/g) || []).length; at += address.words.length; last = ''; continue; }
    if (!inLink && /^(?:mailto|xmpp):/i.test(source.slice(at, at + 7))) cannot('other');
    if (ch === '~') tildes.words += 1;
    text += ch;
    at += 1;
    last = 'text';
  }
  flush();
  // marked looks for where * and _ close inside a web address too.
  const pairs = (char) => nodes.some((node) => node.kind === 'delim' && node.char === char && (node.open || node.close));
  for (const char of ['*', '_']) if (nodes.some((node) => node.address?.includes(char)) && pairs(char)) cannot('other');
  // marked hides a link from * and _ only when its words hold no bracket, and doesn't close at a * between two __ (an _
  // between two **).
  if (nodes.some((node) => node.brackets) && (pairs('*') || pairs('_'))) cannot('other');
  const seen = [...masked].map((ch, at) => (hidden.some(([from, to]) => at >= from && at < to) ? 'a' : ch)).join('');
  if (/__[^_*]*\*[^_*]*__|\*\*[^_*]*_[^_*]*\*\*/.test(seen)) cannot('other');
  if (nodes.some((node) => node.kind === 'tag')) tagged(nodes);
  emphasis(nodes);
  return nodes;
}

// <strong> and <em>, each closed in the order opened, and never beside * or _ that could pair: the two together are
// read differently by a browser and by marked.
function tagged(nodes) {
  if (nodes.some((node) => node.kind === 'delim' && (node.open || node.close))) cannot('other');
  nodes.forEach((node, at) => { if (node.kind === 'delim') nodes[at] = { kind: 'text', text: node.char.repeat(node.count) }; });
  const opened = [];
  for (let at = 0; at < nodes.length; at += 1) {
    const node = nodes[at];
    if (node.kind !== 'tag') continue;
    if (!node.close) { opened.push(at); continue; }
    const from = opened.pop();
    if (from === undefined || nodes[from].mark !== node.mark) cannot('other');
    const inside = nodes.splice(from, at - from + 1).slice(1, -1);
    nodes.splice(from, 0, { kind: 'mark', mark: node.mark, children: inside });
    at = from;
  }
  if (opened.length) cannot('other');
}

// The rest of a link marked's link rule found, as marked takes it: its address ends at the first ) that closes nothing
// (so two links side by side are two), or it isn't a link. { href, title, length }, or null. A link to anywhere a
// learner's page doesn't keep a link isn't kept here.
function linkTail(link) {
  let [whole, words, raw, title] = link;
  if (raw.trim().startsWith('<')) {
    const angle = raw.trim();
    if (!angle.endsWith('>') || (angle.length - angle.slice(0, -1).replace(/\\+$/, '').length) % 2 === 0) return null;
  } else {
    const close = closingParen(raw);
    if (close === -2) return null;
    if (close > -1) {
      whole = whole.slice(0, 4 + words.length + close).trim();
      raw = raw.slice(0, close);
      title = '';
    }
  }
  if (/\n/.test(whole)) cannot('other');
  raw = raw.trim();
  // marked hides a link from * and _ up to a ) that closes nothing, inside <> too, and one ( deep.
  if (raw.startsWith('<') ? /[()]/.test(raw) : /\([^)]*\(/.test(raw)) cannot('other');
  const href = cleanHref(unescaped(raw.startsWith('<') ? raw.slice(1, -1) : raw));
  if (!href) cannot('other');
  return { href, title: title ? unescaped(title.slice(1, -1)) : '', length: whole.length };
}
// Where the first ) that closes nothing is, as marked finds it: -1 for none, -2 for more ( than ).
function closingParen(text) {
  if (!/[()]/.test(text)) return -1;
  let depth = 0;
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '\\') at += 1;
    else if (text[at] === '(') depth += 1;
    else if (text[at] === ')' && (depth -= 1) < 0) return at;
  }
  return depth > 0 ? -2 : -1;
}
function unescaped(text) {
  return text.replace(/\\([\p{P}\p{S}])|&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{0,31}));/gu, (whole, escaped, dec, hex, name) => {
    if (escaped) return escaped;
    if (name) return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : whole;
    return String.fromCodePoint(Math.min(Number.parseInt(dec ?? hex, dec ? 10 : 16) || 0xfffd, 0x10ffff));
  });
}

// CommonMark's emphasis: each closing run takes the nearest opening run of its kind that can pair with it, and what is
// between them becomes bold (two of each) or italic (one). marked reads some runs left over otherwise than CommonMark,
// so a run that could open or close and is left over sends the text to plain Markdown; one that couldn't is itself.
function emphasis(nodes) {
  const floor = {};
  const literal = (node) => {
    if (node.kind !== 'delim') return node;
    if (node.count && (node.open || node.close)) cannot('other');
    return { kind: 'text', text: node.char.repeat(node.count) };
  };
  for (let at = 0; at < nodes.length; at += 1) {
    const closer = nodes[at];
    if (closer.kind !== 'delim' || !closer.close) continue;
    const key = `${closer.char}${closer.open}${closer.length % 3}`;
    let back = at - 1;
    for (; back >= 0 && nodes[back] !== floor[key]; back -= 1) {
      const opener = nodes[back];
      if (opener.kind !== 'delim' || opener.char !== closer.char || !opener.open) continue;
      if ((opener.close || closer.open) && (opener.length + closer.length) % 3 === 0 && (opener.length % 3 || closer.length % 3)) continue;
      break;
    }
    if (back < 0 || nodes[back] === floor[key]) {
      floor[key] = nodes[at - 1];
      if (!closer.open) nodes[at] = literal(closer);
      continue;
    }
    const opener = nodes[back];
    // marked looks ahead from each opening run for its closing one, and counts a run that could also open or close
    // (between two letters, or two punctuation marks) otherwise than CommonMark when another run of its kind is open
    // around it. It also never splits an opening run between two closing ones.
    const around = nodes.slice(0, back).filter((node) => node.kind === 'delim' && node.char === closer.char && node.open && node.count);
    if (around.length && (opener.both || closer.both || around.some((node) => node.both))) cannot('other');
    if (opener.closedBy && opener.closedBy !== closer) cannot('other');
    opener.closedBy = closer;
    const use = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
    nodes.splice(back + 1, at - back - 1, { kind: 'mark', mark: use === 2 ? 'b' : 'i', children: nodes.slice(back + 1, at).map(literal) });
    opener.count -= use;
    closer.count -= use;
    if (closer.count) closer.open = closer.open && closer.rest;
    let closerAt = back + 2;
    if (!opener.count) { nodes.splice(back, 1); closerAt -= 1; }
    if (!closer.count) nodes.splice(closerAt, 1);
    at = closerAt - 1;
  }
  for (let at = 0; at < nodes.length; at += 1) nodes[at] = literal(nodes[at]);
}

function flatten(nodes, marks, runs) {
  for (const node of nodes) {
    if (node.kind === 'text') runs.push({ ...marks, text: node.text.replace(/\n/g, ' ') });
    else if (node.kind === 'open') runs.push({ ...marks, text: '[' });
    else if (node.kind === 'br') { if (marks.href) cannot('other'); runs.push({ text: '\n' }); } else if (node.kind === 'mark') flatten(node.children, { ...marks, [node.mark]: true }, runs);
    else if (node.kind === 'link') flatten(node.children, { ...marks, href: node.href, ...(node.title ? { title: node.title } : {}) }, runs);
  }
  return runs;
}

/**
 * Runs as a page shows them, one way only: white space is one space and none starts or ends a line, bold and italic
 * neither start nor end with a space, neighbours alike are one run, and nothing is empty. A no-break space is a space.
 */
export function tidyRuns(runs) {
  const same = (a, b) => a.b === b.b && a.i === b.i && a.href === b.href && a.title === b.title;
  const clean = (run) => Object.fromEntries(['text', 'b', 'i', 'href', 'title'].filter((key) => key === 'text' || run[key]).map((key) => [key, run[key]]));
  let list = spaced(runs.map((run) => (run.text === '\n' ? { text: '\n' } : clean({ ...run, text: String(run.text) }))));
  // A space between two bold runs (or italic) is bold too: one span, as it looks.
  for (const mark of ['b', 'i']) list.forEach((run, at) => { if (run.text !== '\n' && !run.text.trim() && list[at - 1]?.[mark] && list[at + 1]?.[mark]) run[mark] = true; });
  for (const mark of ['b', 'i']) {
    const next = [];
    list.forEach((run, at) => {
      if (!run[mark]) { next.push(run); return; }
      const lead = list[at - 1]?.[mark] ? '' : /^ */.exec(run.text)[0];
      const words = run.text.slice(lead.length);
      const tail = list[at + 1]?.[mark] ? '' : / *$/.exec(words)[0];
      const plain = (text) => clean({ ...run, [mark]: false, text });
      if (lead) next.push(plain(lead));
      if (words.length > tail.length) next.push({ ...run, text: words.slice(0, words.length - tail.length) });
      if (tail) next.push(plain(tail));
    });
    list = next;
  }
  list = spaced(list);
  // A link on nothing but a space can't be seen or clicked: it is the space.
  for (let at = 0; at < list.length;) {
    let end = at + 1;
    while (end < list.length && list[at].href && list[end].href === list[at].href && list[end].title === list[at].title) end += 1;
    if (list[at].href && list.slice(at, end).every((run) => !run.text.trim())) for (const run of list.slice(at, end)) { delete run.href; delete run.title; }
    at = end;
  }
  return list.reduce((all, run) => {
    const last = all.at(-1);
    if (last && run.text !== '\n' && last.text !== '\n' && same(last, run)) last.text += run.text;
    else all.push({ ...run });
    return all;
  }, []);
}
// White space as a page shows it: one space wherever there are more, even across elements (the first one stays), none
// at a line's start or end, and no break before everything or after it.
function spaced(runs) {
  let list = runs.map((run) => ({ ...run, text: run.text === '\n' ? '\n' : run.text.replace(/[ \t\n\r\f\u00a0]+/g, ' ') }));
  let space = true;
  for (const run of list) {
    if (run.text === '\n') { space = true; continue; }
    if (space) run.text = run.text.replace(/^ /, '');
    if (run.text) space = run.text.endsWith(' ');
  }
  let end = true;
  for (const run of [...list].reverse()) {
    if (run.text === '\n') { end = true; continue; }
    if (end) run.text = run.text.replace(/ $/, '');
    if (run.text) end = false;
  }
  list = list.filter((run) => run.text);
  while (list[0]?.text === '\n') list.shift();
  while (list.at(-1)?.text === '\n') list.pop();
  return list;
}

// --- Blocks to Markdown -----------------------------------------------------------------------------

/** The blocks as Markdown that the learner pages draw as the editor shows them. */
export function toMarkdown(blocks) {
  return blocksMd(blocks).trim();
}
// A list right after one of its kind takes the other marks (* or 1)), or Markdown would make the two one list.
function blocksMd(blocks, join = '\n\n') {
  let alt = false;
  return blocks.map((block, at) => {
    const before = blocks[at - 1];
    alt = block.type === 'list' && before?.type === 'list' && before.ordered === block.ordered ? !alt : false;
    return blockMd(block, alt);
  }).join(join);
}
function blockMd(block, alt) {
  if (block.type === 'p') return inlineMd(block.inline);
  if (block.type === 'h') return `${'#'.repeat(block.level)} ${inlineMd(block.inline, true)}`;
  if (block.type === 'quote') return block.blocks.map((each) => inlineMd(each.inline)).join('\n\n').split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n');
  return block.items.map((item, at) => {
    const mark = block.ordered ? `${block.start + at}${alt ? ')' : '.'} ` : `${alt ? '*' : '-'} `;
    const inside = blocksMd(item.blocks, block.loose ? '\n\n' : '\n');
    return mark + inside.split('\n').map((line, k) => (k && line ? ' '.repeat(mark.length) + line : line)).join('\n');
  }).join(block.loose ? '\n\n' : '\n');
}

// Runs as inline Markdown: text escaped only where marked would read it as something else, ** and * around bold and
// italic, links in brackets, a break as a backslash at a line's end. Read back, it must be the same runs: where ** and *
// can't say it (a mark ending and another starting between two punctuation marks can be read two ways), <strong> and
// <em> say it instead, which the learner pages draw too.
function inlineMd(given, heading = false) {
  const runs = linked(given);
  // A $ is escaped only where two would make math on a learner's page.
  const words = runs.map((run) => run.text).join('');
  const math = [...words.matchAll(/\$/g)].some((found) => matchAt('mathInline', words, found.index));
  const ways = [[false, math], [true, math], [true, true]].map(([tags, dollars]) => inlineWith(runs, heading, tags, dollars));
  return ways.find((md) => { try { return same(mdInline(md), runs); } catch { return false; } }) ?? ways.at(-1);
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function inlineWith(runs, heading, tags, dollars) {
  const pieces = [];
  for (let at = 0; at < runs.length;) {
    const run = runs[at];
    if (run.text === '\n') { pieces.push({ kind: 'br' }); at += 1; continue; }
    let end = at + 1;
    while (end < runs.length && runs[end].text !== '\n' && runs[end].href === run.href && runs[end].title === run.title) end += 1;
    const group = runs.slice(at, end);
    at = end;
    if (!run.href) { markPieces(group, pieces, { tags }); continue; }
    const words = group.map((each) => each.text).join('');
    if (group.length === 1 && !run.b && !run.i && !run.title && [words, `http://${words}`, `mailto:${words}`].includes(run.href)) { pieces.push({ kind: 'address', text: words, href: run.href }); continue; }
    pieces.push({ kind: 'raw', md: '[' });
    markPieces(group, pieces, { link: true, tags });
    pieces.push({ kind: 'raw', md: `](${destination(run.href)}${run.title ? ` "${run.title.replace(/["\\]/g, '\\$&').replace(/&(?=#?\w+;)/g, '&amp;')}"` : ''})` });
  }
  // Each piece's text, escaped in its place; then the marks' edges, and what a line starts with.
  pieces.forEach((piece, k) => {
    const next = pieces[k + 1];
    if (piece.kind === 'br') piece.md = heading ? ' ' : '\\\n';
    else if (piece.kind === 'address') {
      // A web or email address that marked finds in plain words, and ends where it does, stays as it was written.
      const before = (pieces[k - 1]?.md ?? units(pieces[k - 1])).slice(-1);
      // The same kind of address too: www.a@b.co is a web address to marked, not an email address.
      const found = addressAt(piece.text, 0, '');
      const whole = new RegExp(`^(?:${PATTERNS.url}|${PATTERNS.email})$`).test(piece.text) && found?.words === piece.text && cleanHref(found.href) === piece.href && !/\$\$|\\\[/.test(piece.text);
      // It ends where marked ends it: before a space, or before punctuation marked leaves out of an address (a full stop).
      const tail = next?.kind === 'text' ? /^\S*/.exec(next.text)[0] : '';
      const ends = !next ? !(heading && piece.text.endsWith('#')) : next.kind === 'text' && /^[?!.,:;'")]*$/.test(tail) && (tail.length < next.text.length || k + 2 === pieces.length) && addressAt(piece.text + tail, 0, '')?.words === piece.text;
      const starts = !piece.href.startsWith('mailto:') || (!/[a-zA-Z0-9.!#$%&'*+/=?_`{|}~-]/.test(before) && !piece.text.startsWith('_'));
      piece.md = whole && ends && starts ? piece.text : addressMd(piece, dollars);
    } else if (piece.kind === 'text') {
      piece.units = escapeText(piece.text, { link: piece.link, dollars, last: !next || next.kind === 'br', start: k === 0 || pieces[k - 1].kind === 'br' });
      // A heading's last # would be read as closing it.
      if (heading && !next && piece.units.at(-1)?.[1] === '#') piece.units.at(-1)[1] = '\\#';
    }
  });
  if (!tags) fixFlanking(pieces);
  // Before a [: a backslash would start the learner pages' display math, so it is written as its number, and a ! a picture.
  pieces.forEach((piece, k) => {
    if (!units(pieces[k + 1]).startsWith('[') || !piece.units?.length) return;
    if (piece.units.at(-1)[1] === '\\\\') piece.units.at(-1)[1] = '&#92;';
    if (piece.units.at(-1)[1] === '!') piece.units.at(-1)[1] = '\\!';
  });
  return pieces.map(units).join('');
}
function units(piece) { return piece ? piece.md ?? piece.units.map((unit) => unit[1]).join('') : ''; }

// Runs of one link (or none) as text pieces and the marks around them, nested so that what lasts longer opens first.
function markPieces(group, pieces, { link = false, tags = false } = {}) {
  const open = [];
  const lasts = (from, mark) => { let at = from; while (at < group.length && group[at][mark]) at += 1; return at; };
  const written = (mark, close) => (tags ? `<${close ? '/' : ''}${mark === 'b' ? 'strong' : 'em'}>` : mark === 'b' ? '**' : '*');
  group.forEach((run, at) => {
    const wanted = ['b', 'i'].filter((mark) => run[mark]);
    let keep = 0;
    while (keep < open.length && wanted.includes(open[keep])) keep += 1;
    while (open.length > keep) pieces.push({ kind: 'mark', close: true, md: written(open.pop(), true) });
    for (const mark of wanted.filter((each) => !open.includes(each)).sort((a, b) => lasts(at, b) - lasts(at, a))) {
      open.push(mark);
      pieces.push({ kind: 'mark', close: false, md: written(mark, false) });
    }
    pieces.push({ kind: 'text', text: run.text, link });
  });
  while (open.length) pieces.push({ kind: 'mark', close: true, md: written(open.pop(), true) });
}

/** The runs as a learner's page shows them: a web or email address in plain words is a link there. */
export function linked(runs) {
  return tidyRuns(runs.flatMap((run) => {
    if (run.href || run.text === '\n') return [run];
    const parts = [];
    let from = 0;
    // Where marked starts a new token, an email address can start: a run's start, after an address, and after what
    // escapeText escapes.
    let fresh = true;
    for (let at = 0; at < run.text.length; at += 1) {
      const prev = run.text[at - 1];
      const escaped = prev && ('\\*`~|'.includes(prev) || (prev === '_' && !(isWord(run.text[at - 2]) && isWord(run.text[at]))));
      const address = addressAt(run.text, at, fresh || escaped ? '' : prev);
      const href = address && !address.words.startsWith('_') && cleanHref(address.href);
      fresh = false;
      if (!href) continue;
      parts.push({ ...run, text: run.text.slice(from, at) }, { ...run, text: address.words, href });
      from = at + address.words.length;
      at = from - 1;
      fresh = true;
    }
    return [...parts, { ...run, text: run.text.slice(from) }];
  }));
}

// Text as [character, what Markdown it is written as] that marked reads as the same text: what could start or close
// something is escaped, and what a line could start a heading, a quote, a list or a rule with. A [ after a backslash,
// in a link's words or where a line would make a link's address of it is written as its number (&#91;).
function escapeText(text, { link = false, dollars = false, last = false, start = false } = {}) {
  const chars = [...text];
  const out = chars.map((ch, at) => {
    const next = chars[at + 1];
    if (ch === '\\' && next === '[') return [ch, '&#92;'];
    // A * or _ between two spaces neither opens nor closes; one between two letters (_ alone) neither.
    if ((ch === '*' || ch === '_') && /\s/.test(chars[at - 1] || '') && /\s/.test(next || '')) return [ch, ch];
    if ('\\*`~|'.includes(ch)) return [ch, `\\${ch}`];
    if (ch === '_') return [ch, isWord(chars[at - 1]) && isWord(next) ? '_' : '\\_'];
    if (ch === '[') return [ch, link ? '&#91;' : '['];
    if (ch === ']') return [ch, link || next === '(' || (next === undefined && !last) ? '\\]' : ']'];
    if (ch === '<') return [ch, next === undefined || /[A-Za-z/!?]/.test(next) ? '\\<' : '<'];
    if (ch === '&') return [ch, /^&(?:#\d+|#[xX][\da-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.test(chars.slice(at).join('')) ? '\\&' : '&'];
    if (ch === '!') return [ch, next === '[' ? '\\!' : '!'];
    if (ch === '@') return [ch, !link && /[A-Za-z0-9._+-]/.test(chars[at - 1] || '') ? '\\@' : '@'];
    if (ch === '$') return [ch, dollars ? '\\$' : '$'];
    return [ch, ch];
  });
  if (start && out.length) {
    const md = out.map((unit) => unit[1]).join('');
    // A line of - and : alone would make the line before it a table's heading.
    if (/^[#>+=*-]/.test(md) || (last && /^:-+:? *$/.test(md))) out[0] = [out[0][0], out[0][1].startsWith('\\') ? out[0][1] : `\\${out[0][1]}`];
    else if (/^\d{1,9}[.)]/.test(md)) { const dot = out.findIndex((unit) => '.)'.includes(unit[0])); out[dot] = [out[dot][0], `\\${out[dot][0]}`]; } else if (md.startsWith('[')) out[0] = ['[', '&#91;'];
  }
  return out;
}

// An address marked wouldn't find as it stands: <https://…> when it shows its own address, else a link of its words.
function addressMd(piece, dollars) {
  if (piece.href === piece.text && new RegExp(`^${PATTERNS.autolink}$`).test(`<${piece.text}>`)) return `<${piece.text}>`;
  return `[${escapeText(piece.text, { link: true, dollars }).map((unit) => unit[1]).join('')}](${destination(piece.href)})`;
}
// A link's address in Markdown, in <> when it holds what would end it. marked writes an address and a title into the page
// as they are, so an & that could start an entity is written as &amp;.
function destination(href) {
  const address = href.replace(/&(?=#?\w+;)/g, '&amp;');
  return /^[^\s()<>\\]+$/.test(address) ? address : `<${address.replace(/[<>]/g, '\\$&')}>`;
}

// ** and * open only before something and close only after it, as CommonMark says: where a mark's first or last
// character is punctuation against a letter outside it, that letter is written as its number (&#97;), which reads as
// punctuation there and shows as the letter.
function fixFlanking(pieces) {
  for (let at = 0; at < pieces.length; at += 1) {
    if (pieces[at].kind !== 'mark') continue;
    let end = at;
    while (end + 1 < pieces.length && pieces[end + 1].kind === 'mark') end += 1;
    const head = pieces.slice(0, at).map(units).join('');
    const rest = pieces.slice(end + 1).map(units).join('');
    const before = head.slice(-1);
    const beforeWhole = Array.from(head.slice(-2)).at(-1) ?? '';
    const after = rest ? String.fromCodePoint(rest.codePointAt(0)) : '';
    const opens = pieces.slice(at, end + 1).some((piece) => !piece.close);
    const closes = pieces.slice(at, end + 1).some((piece) => piece.close);
    if (opens && isPunct(after) && !isSpace(before) && !isPunct(before)) numbered(pieces[at - 1], -1);
    if (closes && isPunct(beforeWhole) && !isSpace(after) && !isPunct(after)) numbered(pieces[end + 1], 0);
    at = end;
  }
}
// The character at a piece's end (-1) or start (0) as its number; an _ beside it is escaped, as it isn't inside a word anymore.
function numbered(piece, which) {
  if (piece?.kind === 'address') { piece.md = addressMd(piece, false); return; }
  if (piece?.kind !== 'text' || !piece.units.length) return;
  const at = which < 0 ? piece.units.length - 1 : 0;
  piece.units[at] = [piece.units[at][0], `&#${piece.units[at][0].codePointAt(0)};`];
  const beside = piece.units[at + (which < 0 ? -1 : 1)];
  if (beside && beside[1] === '_') beside[1] = '\\_';
}

// --- Blocks to HTML, for the editor -----------------------------------------------------------------------

export function escapeHtml(text) { return String(text).replace(/&/g, '&amp;').replace(/[<]/g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** The blocks as the editor's HTML, the elements the learner pages draw for them. */
export function toHtml(blocks) {
  return blocks.map((block) => blockHtml(block)).join('');
}
function blockHtml(block) {
  if (block.type === 'p') return `<p>${inlineHtml(block.inline)}</p>`;
  if (block.type === 'h') return `<h${block.level}>${inlineHtml(block.inline)}</h${block.level}>`;
  if (block.type === 'quote') return `<blockquote>${block.blocks.map((each) => blockHtml(each)).join('')}</blockquote>`;
  const tag = block.ordered ? 'ol' : 'ul';
  const items = block.items.map((item) => `<li>${item.blocks.map((each) => (each.type === 'p' && !block.loose ? inlineHtml(each.inline) : blockHtml(each))).join('')}</li>`).join('');
  return `<${tag}${block.ordered && block.start !== 1 ? ` start="${block.start}"` : ''}>${items}</${tag}>`;
}
function inlineHtml(runs) {
  let html = '';
  for (let at = 0; at < runs.length;) {
    const run = runs[at];
    if (run.text === '\n') { html += '<br>'; at += 1; continue; }
    let end = at + 1;
    while (end < runs.length && runs[end].text !== '\n' && runs[end].href === run.href && runs[end].title === run.title) end += 1;
    const pieces = [];
    markPieces(runs.slice(at, end), pieces, { tags: true });
    const inner = pieces.map((piece) => (piece.kind === 'text' ? escapeHtml(piece.text) : piece.md)).join('');
    html += run.href ? `<a href="${escapeHtml(run.href)}"${run.title ? ` title="${escapeHtml(run.title)}"` : ''}>${inner}</a>` : inner;
    at = end;
  }
  return html;
}

// --- HTML to blocks: the editor's own, or what is pasted into it ----------------------------------------------

const DROPPED = ['script', 'style', 'template', 'noscript', 'head', 'title', 'meta', 'link', 'svg', 'math', 'iframe', 'object', 'embed', 'video', 'audio', 'canvas', 'select', 'textarea', 'input', 'button', 'img', 'picture', 'map', 'datalist', 'colgroup'];
const BLOCKS = ['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'figure', 'figcaption', 'address', 'details', 'summary', 'center', 'dl', 'dt', 'dd', 'form', 'fieldset', 'legend', 'hgroup', 'table', 'thead', 'tbody', 'tfoot', 'caption', 'pre', 'hr', 'li', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/**
 * The blocks an element holds. pasted: what came from elsewhere (a Google or Word document, a web page), whose styles
 * say what is bold and italic, whose headings keep only their words, and whose lists Word writes as paragraphs.
 * dropped: what was left out of it, 'picture' and 'table' (a table's rows become lines).
 */
export function readDom(root, { pasted = false } = {}) {
  const dropped = new Set();
  const page = { blocks: [], runs: [], where: 'page' };
  walk([...root.childNodes], {}, page, { pasted, dropped, pre: false });
  endParagraph(page);
  return { blocks: page.blocks, dropped: [...dropped] };
}

function endParagraph(box) {
  const inline = tidyRuns(box.runs);
  box.runs = [];
  if (inline.length) box.blocks.push({ type: 'p', inline });
}
function nameOf(node) { return node.nodeType === 1 ? node.nodeName.toLowerCase() : ''; }
function styleOf(node) { return (node.getAttribute && (node.getAttribute('data-rich-style') ?? node.getAttribute('style'))) || ''; }
function textOf(node) { return node.nodeType === 3 ? node.nodeValue : [...(node.childNodes || [])].map(textOf).join(''); }
function marksOf(node, marks, how) {
  const tag = nameOf(node);
  const next = { ...marks };
  if (tag === 'b' || tag === 'strong') next.b = true;
  if (tag === 'i' || tag === 'em') next.i = true;
  const css = styleOf(node);
  const weight = /(?:^|;)\s*font-weight\s*:\s*([^;!]+)/i.exec(css);
  if (weight) next.b = /^(?:bold|bolder|[6-9]\d\d)$/i.test(weight[1].trim());
  const style = /(?:^|;)\s*font-style\s*:\s*([^;!]+)/i.exec(css);
  if (style) next.i = /italic|oblique/i.test(style[1]);
  const href = tag === 'a' && cleanHref(node.getAttribute('href'));
  if (href) {
    next.href = href;
    delete next.title;
    const title = !how.pasted && node.getAttribute('title');
    if (title) next.title = title;
  }
  if (!next.b) delete next.b;
  if (!next.i) delete next.i;
  return next;
}

// Word writes a list as paragraphs, each with its level in its style (mso-list: l0 level2) and its bullet or number in
// a span it hides from other programs.
function wordItem(node) {
  const found = nameOf(node) && /mso-list\s*:\s*l\d+\s+level(\d+)/i.exec(styleOf(node));
  if (!found) return null;
  const hidden = (each) => [...(each.childNodes || [])].map((child) => (nameOf(child) && /mso-list\s*:\s*ignore/i.test(styleOf(child)) ? child : hidden(child))).find(Boolean);
  const bullet = hidden(node);
  return { level: Number(found[1]), ordered: /^[\s\u00a0]*(?:\d+|[a-zA-Z]{1,3})[.)]/.test(bullet ? textOf(bullet) : '') };
}
function wordList(items, marks, how) {
  const top = { blocks: [] };
  const path = [top];
  for (const item of items) {
    const level = Math.max(1, Math.min(item.level, path.length));
    path.length = level;
    const holder = path[level - 1];
    let list = holder.blocks.at(-1);
    if (list?.type !== 'list' || list.ordered !== item.ordered) holder.blocks.push(list = { type: 'list', ordered: item.ordered, start: 1, loose: false, items: [] });
    const one = { blocks: [], runs: [], where: 'item' };
    walk([...item.node.childNodes], marks, one, how);
    endParagraph(one);
    if (one.blocks.length) { const made = { blocks: one.blocks }; list.items.push(made); path.push(made); }
  }
  return top.blocks;
}

function walk(nodes, marks, box, how) {
  for (let at = 0; at < nodes.length; at += 1) {
    const node = nodes[at];
    if (node.nodeType === 3) { box.runs.push({ ...marks, text: node.nodeValue.replace(/\n/g, how.pre ? '\u0000' : ' ') }); continue; }
    const tag = nameOf(node);
    if (!tag) continue;
    if (DROPPED.includes(tag) || /mso-list\s*:\s*ignore/i.test(styleOf(node))) { if (['img', 'picture', 'svg'].includes(tag)) how.dropped.add('picture'); continue; }
    if (tag === 'br') { box.runs.push({ text: '\n' }); continue; }
    const inner = marksOf(node, marks, how);
    const where = box.where;
    if (how.pasted && where !== 'quote' && where !== 'heading' && wordItem(node)) {
      endParagraph(box);
      const items = [];
      for (; at < nodes.length; at += 1) {
        if (nodes[at].nodeType === 3 && !nodes[at].nodeValue.trim()) continue;
        const item = wordItem(nodes[at]);
        if (!item) break;
        items.push({ ...item, node: nodes[at] });
      }
      at -= 1;
      box.blocks.push(...wordList(items, marks, how));
      continue;
    }
    const level = /^h([1-6])$/.exec(tag);
    if (level && where === 'page') {
      endParagraph(box);
      const one = { blocks: [], runs: [], where: 'heading' };
      walk([...node.childNodes], how.pasted ? {} : inner, one, how);
      endParagraph(one);
      const words = tidyRuns(one.blocks.flatMap((block, k) => [...(k ? [{ text: ' ' }] : []), ...block.inline]).map((run) => {
        const { b, i, ...plain } = run;
        return run.text === '\n' ? { text: ' ' } : how.pasted ? plain : { ...plain, ...(b ? { b } : {}), ...(i ? { i } : {}) };
      }));
      if (words.length) box.blocks.push({ type: 'h', level: Number(level[1]), inline: words });
      continue;
    }
    if ((tag === 'ul' || tag === 'ol') && (where === 'page' || where === 'item')) {
      endParagraph(box);
      const list = readList(node, marks, how);
      if (list.items.length) box.blocks.push(list);
      continue;
    }
    if (tag === 'blockquote' && where === 'page') {
      endParagraph(box);
      const quote = { blocks: [], runs: [], where: 'quote' };
      walk([...node.childNodes], inner, quote, how);
      endParagraph(quote);
      if (quote.blocks.length) box.blocks.push({ type: 'quote', blocks: quote.blocks });
      continue;
    }
    if (tag === 'tr') {
      how.dropped.add('table');
      endParagraph(box);
      [...node.childNodes].filter(nameOf).forEach((cell, k) => {
        if (k) box.runs.push({ text: ' | ' });
        walk([...cell.childNodes], marksOf(cell, marks, how), box, how);
      });
      endParagraph(box);
      continue;
    }
    if (BLOCKS.includes(tag)) {
      endParagraph(box);
      walk([...node.childNodes], inner, box, { ...how, pre: how.pre || tag === 'pre' });
      box.runs = box.runs.flatMap((run) => (run.text.includes('\u0000') ? run.text.split('\u0000').flatMap((part, k) => [...(k ? [{ text: '\n' }] : []), { ...run, text: part }]) : [run]));
      endParagraph(box);
      continue;
    }
    walk([...node.childNodes], inner, box, how);
  }
}

function readList(node, marks, how) {
  const ordered = nameOf(node) === 'ol';
  const start = Number.parseInt(node.getAttribute('start'), 10);
  const list = { type: 'list', ordered, start: ordered && start >= 0 ? start : 1, loose: false, items: [] };
  for (const child of node.childNodes) {
    const tag = nameOf(child);
    if (tag === 'ul' || tag === 'ol') {
      // A list right inside a list, as browsers indent one, belongs to the item before it.
      const inner = readList(child, marks, how);
      if (list.items.length) list.items.at(-1).blocks.push(...(inner.items.length ? [inner] : []));
      else list.items.push(...inner.items);
      continue;
    }
    if (!tag && (child.nodeType !== 3 || !child.nodeValue.trim())) continue;
    const item = { blocks: [], runs: [], where: 'item' };
    walk(tag ? [...child.childNodes] : [child], tag ? marksOf(child, marks, how) : marks, item, how);
    endParagraph(item);
    if (!how.pasted && [...(child.childNodes || [])].some((each) => nameOf(each) === 'p')) list.loose = true;
    if (!item.blocks.length) continue;
    if (item.blocks[0].type !== 'p') {
      // An item with no words of its own: its lists go to the item before it, or stand in its place.
      const lists = item.blocks.filter((block) => block.type === 'list');
      if (list.items.length) list.items.at(-1).blocks.push(...lists);
      else list.items.push(...lists.flatMap((each) => each.items));
      continue;
    }
    if (item.blocks.filter((block) => block.type === 'p').length > 1) list.loose = true;
    list.items.push({ blocks: item.blocks });
  }
  return list;
}

/** The functions above as source for a page's own script: readMarkdown, toMarkdown, toHtml, readDom and linked are then in scope. */
export const RICH_TEXT_SCRIPT = asSource({ PATTERNS, ENTITIES, STICKY, DROPPED, BLOCKS }, [
  isSpace, isPunct, isWord, isEscapable, cannot, sticky, matchAt, cleanHref, readMarkdown, isBlank, indentOf, isRuleLike, interrupts,
  listMarker, checkLine, mdBlocks, mdInline, linkNode, addressAt, inlineNodes, tagged, linkTail, closingParen, unescaped, emphasis,
  flatten, tidyRuns, spaced, toMarkdown, blocksMd, blockMd, inlineMd, same, inlineWith, units, markPieces, linked, escapeText,
  addressMd, destination, fixFlanking, numbered, escapeHtml, toHtml, blockHtml, inlineHtml, readDom, endParagraph, nameOf, styleOf,
  textOf, marksOf, wordItem, wordList, walk, readList
]).replace(/<\//g, '<\\/');
