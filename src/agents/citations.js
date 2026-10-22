// A reply's sources. Passages get one number per run as they are retrieved, so a reply's first
// citation can be [6]. The reply renumbers what it cites in order of first mention, one number per
// page or file, so readers see [1], [2]… and one source per page however many of its passages were
// used. How the sources are shown is up to the channel: structured citations always, and on request
// a list under the text, in Markdown or plain text, for clients that show only the text.

const MARKER = /\[(\d{1,3}(?:\s*[,，]\s*\d{1,3})*)\]/g;
export const SOURCE_STYLES = Object.freeze(['none', 'markdown', 'text']);
// gpt-oss models cite in their browsing format, 【1†L1-L30】; it means [1].
const HARMONY_MARKER = /【(\d{1,3})(?:†[^】]*)?】/g;

/** A reply's citations written as [n], whatever form the model used. */
export function normalizeCitationMarks(text) {
  return String(text ?? '').replace(HARMONY_MARKER, '[$1]');
}

export function citationOf(item, index = item.index) {
  return {
    index, title: item.title || null, ...(item.page_title ? { page_title: item.page_title } : {}), url: item.url || null, link: item.link ?? item.url ?? null,
    document_id: item.document_id, knowledge_base_id: item.knowledge_base_id || null, kind: item.kind || null,
    heading: item.heading || null, ...(item.page ? { page: item.page } : {}), snippet: String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 240)
  };
}

/** Rewrites [n] to source numbers in order of first mention and returns one citation per source. */
export function finalizeCitations(text, registry) {
  const byIndex = new Map([...(registry?.values?.() || [])].map((item) => [item.index, item]));
  const sources = [];
  const byKey = new Map();
  const rewritten = normalizeCitationMarks(text).replace(MARKER, (match, group) => {
    const numbers = [];
    for (const raw of group.split(/[,，]/)) {
      const item = byIndex.get(Number(raw));
      if (!item) continue;
      const key = item.document_id || item.url || `passage:${item.index}`;
      let source = byKey.get(key);
      if (!source) { source = { index: sources.length + 1, item }; byKey.set(key, source); sources.push(source); }
      if (!numbers.includes(source.index)) numbers.push(source.index);
    }
    // A number that matches no retrieved passage is left as written.
    return numbers.length ? `[${numbers.sort((a, b) => a - b).join(', ')}]` : match;
  });
  return { text: rewritten, citations: sources.map((source) => citationOf(source.item, source.index)) };
}

const LIST_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:sources?|references?|citations?|来源|参考(?:资料|文献)?)\s*:?\s*(?:\*\*|__)?\s*:?\s*$/i;

/**
 * Removes a "Sources" list a model wrote at the end of its reply, when every entry links to a
 * passage retrieved in this run: the platform shows those sources itself, numbered and titled
 * consistently. Anything else (other links, prose) is left alone.
 */
export function stripModelSourceList(text, registry) {
  const links = new Set([...(registry?.values?.() || [])].flatMap((item) => [item.url, item.link]).filter(Boolean));
  if (!links.size) return text;
  const lines = String(text ?? '').split('\n');
  let heading = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (LIST_HEADING.test(lines[i])) { heading = i; break; }
  if (heading < 0) return text;
  const entries = lines.slice(heading + 1).filter((line) => line.trim());
  const ours = (line) => /^\s*(?:[-*•]|\d+[.)]|\[\d+\])\s+/.test(line) && [...line.matchAll(/https?:\/\/[^\s)<>\]]+/g)].some((match) => links.has(match[0].replace(/[.,;]+$/, '')));
  if (!entries.length || !entries.every(ours)) return text;
  return lines.slice(0, heading).join('\n').trimEnd();
}

const markdownText = (text) => String(text).replace(/([\\[\]*_`])/g, '\\$1');
const markdownUrl = (url) => (/[\s()<>]/.test(url) ? `<${url}>` : url);

/**
 * What a channel returns: the Reply's output with its sources listed under the text in `style`
 * ("none" keeps the text as is; citations are returned either way).
 */
export function deliverOutput(output, style) {
  if (!output?.citations?.length || !style || style === 'none') return output;
  return { ...output, text: renderSources(output.text, output.citations, style), sources_in_text: true };
}

/** A request's `sources` value, or a 400 for one that isn't a known style. */
export function requestedSourceStyle(value) {
  if (value == null) return null;
  if (SOURCE_STYLES.includes(value)) return value;
  throw Object.assign(new Error(`sources must be one of ${SOURCE_STYLES.join(', ')}.`), { status: 400, code: 'invalid_sources' });
}

/** The text with its sources listed underneath in `style` (markdown also links the [n] markers). */
export function renderSources(text, citations, style) {
  if (!citations?.length || !style || style === 'none') return text;
  if (style === 'markdown') {
    const links = new Map(citations.filter((item) => item.link).map((item) => [item.index, markdownUrl(item.link)]));
    const linked = String(text).replace(MARKER, (match, group) => group.split(/[,，]/).map((raw) => {
      const number = Number(raw);
      return links.has(number) ? `[[${number}]](${links.get(number)})` : `[${number}]`;
    }).join(''));
    return `${linked}\n\n**Sources**\n${citations.map((item) => `${item.index}. ${item.link ? `[${markdownText(item.title || 'Untitled')}](${markdownUrl(item.link)})` : markdownText(item.title || 'Untitled')}`).join('\n')}`;
  }
  return `${text}\n\nSources:\n${citations.map((item) => `[${item.index}] ${item.title || 'Untitled'}${item.link ? ` — ${item.link}` : ''}`).join('\n')}`;
}

// Words a model's own source list starts with (see LIST_HEADING), while its heading is still arriving.
const HEADING_WORDS = ['sources', 'references', 'citations', '来源', '参考资料', '参考文献'];
const mayBeHeading = (line) => {
  const rest = line.replace(/^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*/, '').replace(/[\s*_:]+$/, '').toLowerCase();
  return line.length <= 40 && (!rest || HEADING_WORDS.some((word) => word.startsWith(rest)));
};

/**
 * A reply as a model writes it, passed on as the Reply step will show it: citations renumbered
 * (each number depends only on earlier ones, so the text so far is final) and a source list the
 * model wrote itself held back, as the Reply step may drop it. A citation or a line that could still
 * become one of those is held until it can't change. Returns push(text) for each new piece.
 */
export function answerStream(registry, emit) {
  let raw = '';
  let sent = '';
  return (piece) => {
    raw += piece;
    let ready = raw;
    const lines = ready.split('\n');
    const heading = lines.findIndex((line, i) => i < lines.length - 1 && LIST_HEADING.test(line));
    if (heading >= 0) ready = lines.slice(0, heading).join('\n');
    else if (mayBeHeading(lines.at(-1))) ready = lines.slice(0, -1).join('\n') + (lines.length > 1 ? '\n' : '');
    const open = Math.max(ready.lastIndexOf('['), ready.lastIndexOf('【'));
    if (open >= 0 && !/[\]】]/.test(ready.slice(open))) ready = ready.slice(0, open);
    const text = finalizeCitations(ready, registry).text;
    if (text.length > sent.length && text.startsWith(sent)) { emit(text.slice(sent.length)); sent = text; }
  };
}
