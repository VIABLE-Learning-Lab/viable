/**
 * HTML as readable Markdown, for a local run's Fetch URL steps and knowledge files: headings,
 * paragraphs, lists, links, images, table rows and preformatted text, without scripts, styles, forms
 * or site chrome (navigation, asides, and the page's header and footer). On VIABLE, Workers AI
 * converts pages.
 */
// What a page's text usually holds. A host with a full decoder passes it: the Engine does.
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', times: '×', divide: '÷', minus: '−', frac12: '½', frac14: '¼', frac34: '¾', le: '≤', ge: '≥', ne: '≠', deg: '°', middot: '·', bull: '•', copy: '©' };
let decoders;
const decodeBasic = (text) => String(text).replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z0-9]+));/gi, (whole, dec, hex, name) => {
  if (name) return Object.hasOwn(NAMED, name) ? NAMED[name] : whole;
  const code = dec ? Number(dec) : Number.parseInt(hex, 16);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
});

decoders = { text: decodeBasic, attribute: decodeBasic };

/** Text with its HTML entities decoded. */
export const decodeEntities = (text) => decoders.text(text);

/** Replaces how entities are decoded, for a host that has a full decoder. */
export const useDecoders = (full) => { decoders = full; };

// Removed with what they hold.
const DROPPED = ['script', 'style', 'template', 'noscript', 'svg', 'head', 'nav', 'aside', 'form', 'button', 'dialog', 'select', 'textarea', 'iframe', 'object'];
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'blockquote', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'dl', 'dt', 'dd', 'address', 'details', 'summary', 'body', 'html']);
const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;
const MARKER = /^(\s*)(#{1,6}|-|1\.)\s+(.*)$/;
// Lists nested deeper than anyone reads don't indent further: thousands of levels would write a page of spaces for each item.
const MOST_INDENT = 8;

// A page can be anything, and these read a whole one, so each is linear in its length: a pattern with [^>]* or [\s\S]*? would
// look to the end of the page again from every "<", and on a large page that stops the server.
const asciiLower = (text) => text.replace(/[A-Z]+/g, (run) => run.toLowerCase());

/** Each <name ...>inner</name> in turn: { name, start, end, attrs, inner }. One never closed is passed over, and so is what's inside one that is. */
export function* elementsIn(html, names) {
  const lower = asciiLower(html);
  const opens = new RegExp(`<(${names.join('|')})\\b[^<>]*>`, 'g');
  const unclosed = new Set();
  for (let open; (open = opens.exec(lower));) {
    const name = open[1];
    if (unclosed.has(name)) continue;
    const from = open.index + open[0].length;
    let at = lower.indexOf(`</${name}`, from);
    let end = -1;
    while (at >= 0) {
      let after = at + name.length + 2;
      while (/\s/.test(lower[after] ?? '')) after += 1;
      if (lower[after] === '>') { end = after + 1; break; }
      at = lower.indexOf(`</${name}`, after);
    }
    if (end < 0) { unclosed.add(name); continue; }
    yield { name, start: open.index, end, attrs: html.slice(open.index + 1 + name.length, from - 1), inner: html.slice(from, at) };
    opens.lastIndex = end;
  }
}

/** The page with each of those elements replaced by what make gives for it: nothing, unless told otherwise. */
export function replaceElements(html, names, make = () => '') {
  let out = '';
  let at = 0;
  for (const element of elementsIn(html, names)) {
    out += html.slice(at, element.start) + make(element);
    at = element.end;
  }
  return out + html.slice(at);
}

/** The page without its comments and declarations. A comment never closed ends at the next ">". */
export function withoutComments(html) {
  let out = '';
  let at = 0;
  let closes = true;
  for (let open = html.indexOf('<!', at); open >= 0; open = html.indexOf('<!', at)) {
    let end = -1;
    if (closes && html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4);
      if (close < 0) closes = false; else end = close + 3;
    }
    if (end < 0) {
      const close = html.indexOf('>', open + 2);
      if (close < 0) break;
      end = close + 1;
    }
    out += html.slice(at, open);
    at = end;
  }
  return out + html.slice(at);
}

// A page's header and footer: its first header and last footer (an article's own header holds its title).
function withoutChrome(html) {
  const [header] = elementsIn(html, ['header']);
  let page = header ? html.slice(0, header.start) + html.slice(header.end) : html;
  const last = asciiLower(page).lastIndexOf('<footer');
  if (last >= 0) {
    const [footer] = elementsIn(page.slice(last), ['footer']);
    if (footer?.start === 0) page = page.slice(0, last) + page.slice(last + footer.end);
  }
  return page;
}

const attribute = (attrs, name) => {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return match ? decoders.attribute(match[1] ?? match[2] ?? match[3]) : '';
};

function linkTarget(href, base) {
  if (!href) return null;
  try {
    const url = new URL(href, base || undefined);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

// The inside of the first element the selector names ("main" or '[role="main"]'), or null.
function region(html, selector) {
  const open = selector === 'main' ? /<(main)\b[^<>]*>/i.exec(html) : /<([a-zA-Z][\w-]*)\b[^<>]*?\brole\s*=\s*["']?main\b[^<>]*>/i.exec(html);
  if (!open) return null;
  const tags = new RegExp(`<(/?)${open[1]}\\b[^<>]*>`, 'gi');
  tags.lastIndex = open.index + open[0].length;
  for (let depth = 1, match; (match = tags.exec(html));) {
    depth += match[1] ? -1 : 1;
    if (!depth) return html.slice(open.index + open[0].length, match.index);
  }
  return html.slice(open.index + open[0].length);
}

// A heading or list item keeps its marker (and a list item its indent); an empty one goes.
function tidy(line) {
  const marker = MARKER.exec(line);
  if (!marker) return line.trim();
  return marker[3].trim() ? `${marker[2].startsWith('#') ? '' : marker[1]}${marker[2]} ${marker[3].trim()}` : '';
}

/** Markdown for an HTML page. base: the page's address, for relative links; selector: its main region. */
export function htmlToMarkdown(html, { base = null, selector = null } = {}) {
  let page = replaceElements(withoutComments(String(html ?? '')), DROPPED);
  const main = selector ? region(page, selector) : null;
  page = main ?? withoutChrome(page);
  // Preformatted text keeps its spacing: set aside, then put back as a fenced block.
  const pre = [];
  page = replaceElements(page, ['pre'], ({ inner }) => `<p>\u0000${pre.push(decoders.text(inner.replace(/<[^<>]+>/g, '')).replace(/^\n+/, '').trimEnd()) - 1}\u0000</p>`);
  const lists = [];
  const links = [];
  // The finished lines, and the one being written: looking back through a growing string on every block would copy it each time.
  const lines = [];
  let line = '';
  const append = (text) => {
    const end = text.lastIndexOf('\n');
    if (end < 0) { line += text; return; }
    lines.push(line, text.slice(0, end + 1));
    line = text.slice(end + 1);
  };
  let cell = 0;
  const write = (text) => { if (links.length) links.at(-1).text += text; else append(text); };
  const block = (prefix = '') => {
    // Inside a link (a card), or right after a list item's marker, a block is only a space.
    if (links.length) return write(' ');
    if (!/^[ \t]*(?:-|1\.) +$/.test(line)) append(`\n\n${prefix}`);
  };
  let last = 0;
  for (const match of page.matchAll(TAG)) {
    write(decoders.text(page.slice(last, match.index)).replace(/\s+/g, ' '));
    last = match.index + match[0].length;
    const [, closing, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    const heading = /^h([1-6])$/.exec(name);
    if (heading) block(closing ? '' : `${'#'.repeat(Number(heading[1]))} `);
    else if (BLOCKS.has(name)) block();
    else if (name === 'hr') block('---\n\n');
    else if (name === 'br') write('\n');
    else if (name === 'ul' || name === 'ol') {
      if (closing) lists.pop(); else lists.push(name);
      // Only a list's outermost level stands apart; nested lists stay tight under their item.
      if (closing ? !lists.length : lists.length === 1) block();
    } else if (name === 'li' && !closing) append(`\n${'  '.repeat(Math.min(MOST_INDENT, Math.max(0, lists.length - 1)))}${lists.at(-1) === 'ol' ? '1.' : '-'} `);
    else if (name === 'tr') { cell = 0; if (!closing) append('\n'); }
    else if ((name === 'td' || name === 'th') && !closing) append(cell++ ? ' | ' : '');
    else if (name === 'a') {
      if (!closing) links.push({ href: linkTarget(attribute(attrs, 'href'), base), text: '' });
      else if (links.length) {
        const { href, text } = links.pop();
        const label = text.replace(/\s+/g, ' ').trim();
        write(href && label ? `[${label}](${href})` : label);
      }
    } else if (name === 'img') {
      const src = linkTarget(attribute(attrs, 'data-src') || attribute(attrs, 'src'), base);
      if (src) write(`![${attribute(attrs, 'alt').replace(/\s+/g, ' ').trim()}](${src})`);
    }
  }
  write(decoders.text(page.slice(last)).replace(/\s+/g, ' '));
  for (const link of links) append(link.text);
  return `${lines.join('')}${line}`.split('\n').map(tidy).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `\`\`\`\n${pre[Number(i)]}\n\`\`\``)
    .trim();
}

/**
 * toMarkdown in the shape of Workers AI's: { name, blob } with conversionOptions.html (hostname: the
 * page's address; cssSelector: its main region) → { name, format: 'markdown', data }.
 */
export async function toMarkdown(file, { conversionOptions } = {}) {
  const options = conversionOptions?.html || {};
  return { name: file.name, format: 'markdown', data: htmlToMarkdown(await file.blob.text(), { base: options.hostname, selector: options.cssSelector }) };
}
