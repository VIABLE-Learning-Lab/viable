/**
 * HTML as readable Markdown, for a local run's Fetch URL steps and knowledge files: headings,
 * paragraphs, lists, links, images, table rows and preformatted text, without scripts, styles, forms
 * or site chrome (navigation, asides, and the page's header and footer). On VIABLE, Workers AI
 * converts pages.
 */
import { decodeHTML, decodeHTMLAttribute } from 'entities';

// Removed with what they hold.
const DROPPED = /<(script|style|template|noscript|svg|head|nav|aside|form|button|dialog|select|textarea|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// A page's header and footer: its first header and last footer (an article's own header holds its title).
const CHROME = [/<header\b[^>]*>[\s\S]*?<\/header\s*>/i, /<footer\b(?![\s\S]*<footer\b)[^>]*>[\s\S]*?<\/footer\s*>/i];
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'blockquote', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'dl', 'dt', 'dd', 'address', 'details', 'summary', 'body', 'html']);
const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const MARKER = /^(\s*)(#{1,6}|-|1\.)\s+(.*)$/;

const attribute = (attrs, name) => {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return match ? decodeHTMLAttribute(match[1] ?? match[2] ?? match[3]) : '';
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
  const open = selector === 'main' ? /<(main)\b[^>]*>/i.exec(html) : /<([a-zA-Z][\w-]*)\b[^>]*\brole\s*=\s*["']?main\b[^>]*>/i.exec(html);
  if (!open) return null;
  const tags = new RegExp(`<(/?)${open[1]}\\b[^>]*>`, 'gi');
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
  let page = String(html ?? '').replace(/<!--[\s\S]*?-->|<![^>]*>/g, '').replace(DROPPED, '');
  const main = selector ? region(page, selector) : null;
  page = main ?? CHROME.reduce((rest, pattern) => rest.replace(pattern, ''), page);
  // Preformatted text keeps its spacing: set aside, then put back as a fenced block.
  const pre = [];
  page = page.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_, body) => `<p>\u0000${pre.push(decodeHTML(body.replace(/<[^>]+>/g, '')).replace(/^\n+|\s+$/g, '')) - 1}\u0000</p>`);
  const lists = [];
  const links = [];
  let out = '';
  let cell = 0;
  const write = (text) => { if (links.length) links.at(-1).text += text; else out += text; };
  const block = (prefix = '') => {
    // Inside a link (a card), or right after a list item's marker, a block is only a space.
    if (links.length) return write(' ');
    if (!/(?:^|\n)[ \t]*(?:-|1\.) +$/.test(out)) out += `\n\n${prefix}`;
  };
  let last = 0;
  for (const match of page.matchAll(TAG)) {
    write(decodeHTML(page.slice(last, match.index)).replace(/\s+/g, ' '));
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
    } else if (name === 'li' && !closing) out += `\n${'  '.repeat(Math.max(0, lists.length - 1))}${lists.at(-1) === 'ol' ? '1.' : '-'} `;
    else if (name === 'tr') { cell = 0; if (!closing) out += '\n'; }
    else if ((name === 'td' || name === 'th') && !closing) out += cell++ ? ' | ' : '';
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
  write(decodeHTML(page.slice(last)).replace(/\s+/g, ' '));
  while (links.length) out += links.shift().text;
  return out.split('\n').map(tidy).join('\n')
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
