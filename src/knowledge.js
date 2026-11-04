/**
 * Knowledge search over a course package's own files, for a local run: the files its knowledge bases
 * name (found by path in the package's folder, or downloaded from their url and checked against
 * bytes and sha256), split into passages under their headings and ranked by keywords (BM25), as
 * VIABLE searches a keyword-only knowledge base (documentText.js chunkText, searchTerms and
 * rankByKeywords, copied here). Text without spaces (Chinese, Japanese) is matched by character
 * pairs. Websites aren't crawled, and only text formats are read: no PDF or Office files.
 */
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve, isAbsolute } from 'node:path';
import { fetchAgentFile } from './agents/http.js';
import { htmlToMarkdown } from './markdown.js';

/**
 * Markdown split into overlapping passages, each with its nearest headings as a breadcrumb so it
 * reads on its own in search results and citations.
 */
export function chunkText(text, { size = 1200, overlap = 160, maxChunks = 2000 } = {}) {
  const chunks = [];
  const headings = [];
  let parts = [];
  let length = 0;
  let carry = '';
  let heading = '';
  const flush = () => {
    if (!parts.length) return;
    const body = parts.join('\n\n');
    chunks.push({ heading: heading || null, text: `${carry ? `${carry}\n\n` : ''}${body}`.trim() });
    const tail = body.length > overlap ? body.slice(-overlap) : '';
    carry = tail.includes(' ') ? tail.slice(tail.indexOf(' ') + 1) : tail;
    parts = [];
    length = 0;
  };
  for (const block of String(text).split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const title = /^(#{1,6})\s+(.+)$/.exec(trimmed.split('\n')[0]);
    if (title) {
      // A section starts a new passage, unless the current one is still too short to stand on its own.
      if (length >= size * 0.3) flush();
      if (!parts.length) carry = '';
      headings.splice(title[1].length - 1);
      headings[title[1].length - 1] = title[2].replace(/[#*_`]/g, '').trim();
    }
    const crumb = headings.filter(Boolean).join(' › ').slice(0, 300);
    for (const piece of splitLong(trimmed, size)) {
      if (parts.length && length > size * 0.2 && length + piece.length + carry.length > size) flush();
      if (!parts.length) heading = crumb;
      parts.push(piece);
      length += piece.length + 2;
    }
    if (chunks.length >= maxChunks) break;
  }
  flush();
  return chunks.slice(0, maxChunks);
}

function splitLong(block, size) {
  if (block.length <= size) return [block];
  const parts = [];
  let rest = block;
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf('。'), window.lastIndexOf(' '));
    const at = cut > size * 0.5 ? cut + 1 : size;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;
const STOPWORDS = new Set('a an and are as at be but by can could do does for from had has have how i if in into is it its me my of on or our so that the their them then there these they this to was we were what when where which who why will with would you your'.split(' '));

/** Search terms: words for alphabetic scripts, character bigrams for CJK. */
export function searchTerms(query, limit = 10) {
  const terms = [];
  for (const token of String(query || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
    if (CJK.test(token)) {
      const chars = [...token];
      if (chars.length === 1) terms.push(token);
      for (let i = 0; i < chars.length - 1; i += 1) terms.push(chars[i] + chars[i + 1]);
    } else if (token.length > 1 && !STOPWORDS.has(token)) terms.push(token);
  }
  return [...new Set(terms)].sort((a, b) => b.length - a.length).slice(0, limit);
}

// Light stemming so "policy" finds "policies" and "exam" finds "exams" but not "examples".
const termStem = (term) => (CJK.test(term) || term.length <= 4 ? term : term.replace(/(ies|ing|es|ed|s|y|e)$/, ''));

function termPattern(term) {
  if (CJK.test(term)) return null;
  const stem = termStem(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${stem}[\\p{L}\\p{N}]{0,3}(?![\\p{L}\\p{N}])`, 'gu');
}

function countTerm(value, term, pattern) {
  if (!pattern) {
    let count = 0;
    for (let at = value.indexOf(term); at >= 0; at = value.indexOf(term, at + term.length)) count += 1;
    return count;
  }
  pattern.lastIndex = 0;
  return (value.match(pattern) || []).length;
}

/**
 * BM25 over the passages; returns ranked [{item, score}]. Title and heading matches and the whole
 * query appearing verbatim add weight, as curated corpora name their topics in headings.
 */
export function rankByKeywords(items, terms, { text = (item) => item.text, title = null, phrase = '', totalDocs = items.length } = {}) {
  if (!terms.length || !items.length) return [];
  const lowered = items.map((item) => String(text(item)).toLowerCase());
  const titles = items.map((item) => (title ? String(title(item) || '').toLowerCase() : ''));
  const patterns = terms.map(termPattern);
  const wholeQuery = String(phrase || '').toLowerCase().replace(/[?？!！。.,，]+$/, '').trim();
  const avg = lowered.reduce((sum, value) => sum + value.length, 0) / lowered.length || 1;
  const counts = lowered.map((value, index) => terms.map((term, t) => countTerm(value, term, patterns[t]) + countTerm(titles[index], term, patterns[t])));
  const df = terms.map((_, t) => counts.filter((row) => row[t] > 0).length);
  const n = Math.max(totalDocs, items.length);
  return lowered.map((value, index) => {
    let score = 0;
    terms.forEach((term, t) => {
      const idf = Math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5));
      const tf = countTerm(value, term, patterns[t]);
      if (tf) score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * value.length / avg));
      if (titles[index] && countTerm(titles[index], term, patterns[t])) score += idf * 1.5;
    });
    if (score > 0 && wholeQuery.length >= 4) {
      if (titles[index].includes(wholeQuery)) score += 6;
      if (value.includes(wholeQuery)) score += 3;
    }
    return { item: items[index], score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
}

// Passages with almost no text of their own (a title and a logo) match broad queries and say nothing.
function hasSubstance(text) {
  const plain = String(text || '').replace(/^#{1,6}\s+.*$/gm, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[\s*_|>#-]+/g, ' ').trim();
  return plain.length + (plain.match(/[⺀-鿿가-힯]/g)?.length || 0) >= 30;
}

const PLAIN_TEXT = new Set(['txt', 'md', 'markdown', 'mdx', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'log', 'rst', 'tex', 'srt', 'vtt']);
const HTML = new Set(['html', 'htm']);
const MAX_FILE_BYTES = 15 * 1024 * 1024;

// knowledge_unavailable: what only VIABLE reads; anything else wrong with a file is the package's.
const failure = (message, code = 'knowledge_file_unreadable') => Object.assign(new Error(message), { status: 422, code });

async function fileBytes(file, { dir, fetch }) {
  if (file.path != null) {
    if (!dir) throw failure('it is named by path, and the run has no package folder (dir) to find it in.');
    // A package's paths stay inside its own folder, symbolic links followed: a package can't read
    // the rest of the machine into a prompt.
    const outside = (from, to) => { const inside = relative(from, to); return !inside || inside.startsWith('..') || isAbsolute(inside); };
    const path = resolve(dir, file.path);
    if (outside(resolve(dir), path)) throw failure('its path is outside the package\'s folder.');
    let real;
    try { real = await realpath(path); } catch { throw failure('there is no such file in the package\'s folder.'); }
    if (outside(await realpath(dir), real)) throw failure('its path is outside the package\'s folder.');
    return new Uint8Array(await readFile(real));
  }
  const { bytes } = await fetchAgentFile(file.url, { httpFetch: fetch, maxBytes: MAX_FILE_BYTES });
  return bytes;
}

// A file's passages; knowledgeBase only names where it was found, in errors.
async function readPassages(file, knowledgeBase, options) {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(String(file.name))?.[1].toLowerCase() || '';
  if (!PLAIN_TEXT.has(ext) && !HTML.has(ext)) throw failure(`Knowledge base "${knowledgeBase.ref}": a local run reads text, Markdown, CSV, JSON and HTML files, not "${file.name}". Run the agent on VIABLE, or pass your own searchKnowledge.`, 'knowledge_unavailable');
  let bytes;
  try { bytes = await fileBytes(file, options); } catch (error) {
    throw Object.assign(new Error(`Knowledge base "${knowledgeBase.ref}": couldn't read "${file.name}" (${file.url || file.path}): ${error.message}`), { status: 422, code: error.status ? error.code : 'knowledge_file_unreadable' });
  }
  if (file.bytes != null && bytes.byteLength !== file.bytes) throw failure(`Knowledge base "${knowledgeBase.ref}": "${file.name}" has ${bytes.byteLength} bytes, not the ${file.bytes} the package says.`);
  if (file.sha256 && createHash('sha256').update(bytes).digest('hex') !== file.sha256.toLowerCase()) throw failure(`Knowledge base "${knowledgeBase.ref}": "${file.name}" isn't the file the package names (its sha256 differs).`);
  const text = new TextDecoder().decode(bytes);
  return chunkText(HTML.has(ext) ? htmlToMarkdown(text, { base: file.url }) : text).map((chunk, i) => ({
    ...chunk, document_id: file.ref, chunk_id: `${file.ref}:${i}`,
    title: file.title || file.name, url: file.url || null, filename: file.name, kind: 'file', link: file.url || null
  }));
}

/**
 * searchKnowledge for a course package: its knowledge bases by ref (the IDs a local run gives the
 * graph), each file read once, when a search first needs it. dir: the folder files named by path are in.
 * fetch: what downloads files named by url.
 */
export function packageKnowledge(pkg, { dir = null, fetch = globalThis.fetch } = {}) {
  const knowledgeBases = new Map((pkg.knowledge_bases || []).map((kb) => [kb.ref, kb]));
  const files = new Map((pkg.files || []).map((file) => [file.ref, file]));
  const loaded = new Map();
  const passagesOf = (ref, kb) => {
    if (!loaded.has(ref)) loaded.set(ref, readPassages(files.get(ref), kb, { dir, fetch }));
    return loaded.get(ref);
  };
  return async ({ knowledgeBaseIds = [], query = '', topK = 5, minScore = 0 }) => {
    const missing = knowledgeBaseIds.find((id) => !knowledgeBases.has(id));
    if (missing) throw failure(`The package has no knowledge base "${missing}" (it has: ${[...knowledgeBases.keys()].join(', ') || 'none'}).`);
    // Each file once, under the first of the knowledge bases that holds it.
    const holder = new Map();
    for (const kb of knowledgeBaseIds.map((id) => knowledgeBases.get(id))) {
      if (kb.websites?.length) throw failure(`Knowledge base "${kb.ref}" reads websites, which a local run doesn't crawl. Run the agent on VIABLE, or pass your own searchKnowledge.`, 'knowledge_unavailable');
      for (const ref of kb.file_refs || []) {
        if (!files.has(ref)) throw failure(`Knowledge base "${kb.ref}" names a file "${ref}" the package doesn't have.`);
        if (!holder.has(ref)) holder.set(ref, kb);
      }
    }
    const passages = (await Promise.all([...holder].map(async ([ref, kb]) => (await passagesOf(ref, kb)).map((item) => ({ ...item, knowledge_base_id: kb.ref }))))).flat();
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const ranked = rankByKeywords(passages, terms.slice(0, 8), { text: (item) => item.text, title: (item) => `${item.title}\n${item.heading || ''}`, phrase: query })
      .filter((entry) => hasSubstance(entry.item.text)).slice(0, 30)
      // Scored by rank, as VIABLE scores a keyword-only knowledge base (so min_score means the same).
      .map((entry, rank) => ({ ...entry, score: 60 / (60 + rank) })).filter((entry) => entry.score >= minScore);
    // At most two passages from one file before any third.
    const perFile = new Map();
    const first = [];
    const rest = [];
    for (const entry of ranked) {
      const count = perFile.get(entry.item.document_id) || 0;
      (count < 2 ? first : rest).push(entry);
      perFile.set(entry.item.document_id, count + 1);
    }
    return [...first, ...rest].slice(0, topK).map(({ item, score }) => ({ ...item, score: Math.round(score * 10000) / 10000, match: 'keyword' }));
  };
}
