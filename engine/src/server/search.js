/**
 * Knowledge search over a course package's own files, wherever it runs: the files its knowledge bases
 * name (found in its .viable.zip, or by readPath in its folder, or downloaded from their url, and
 * checked against bytes and sha256), split into passages under their headings and ranked by keywords
 * (BM25), as VIABLE's hosted platform searches a keyword-only knowledge base. Text without spaces (Chinese, Japanese) is matched by character
 * pairs. Websites aren't crawled, and only text formats are read: a PDF or Office file through the text
 * copy VIABLE packages with it (text_path), from the passages it made of the file. With a model for it,
 * passages are also found by meaning, and the two lists are combined. No Node built-ins: knowledge.js
 * adds the folders a local run reads.
 */
import { fetchAgentFile } from '../agents/http.js';
import { htmlToMarkdown } from '../markdown.js';
import { HTML_FORMATS, extensionOf, readsAsText } from '../utils/textFormats.js';
import { memoryStore } from '../../../harness/src/store/store.js';
import { readZip } from '../../../harness/src/utils/zip.js';

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

const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Whether a local run can search a package's file: a text format, or a PDF or Office file with the text copy VIABLE wrote (text_path). */
export const readsLocally = (file) => readsAsText(file?.name) || file?.text_path != null;

// knowledge_unavailable: what only VIABLE reads; anything else wrong with a file is the package's.
export const failure = (message, code = 'knowledge_file_unreadable') => Object.assign(new Error(message), { status: 422, code });

/** Where a server serves a package's files that may be linked: one folder per package, by its title. */
export const packageFilesPath = (pkg) => `/package-files/${String(pkg?.course?.title || pkg?.title || 'package').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'package'}`;

/** A package's file: from its .viable.zip (zip), its folder (dir, read with readPath), or its address. */
export async function packageFileBytes(file, { dir, fetch, zip, readPath }) {
  if (file.path != null && zip) {
    // Looked up by name, never extracted: still, a path that climbs out or starts at a root is refused.
    if (/^[A-Za-z]:|^[\\/]|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(file.path)) throw failure('its path is outside the package\'s archive.');
    const bytes = (await readZip(zip, (name) => name === file.path, { binary: true, maxBytes: MAX_FILE_BYTES })).get(file.path);
    if (!bytes) throw failure(`the archive has no ${file.path}.`);
    return bytes;
  }
  if (file.path != null) {
    if (!dir || !readPath) throw failure('it is named by path, and the run has no package folder (dir) to find it in.');
    return readPath(file.path, dir);
  }
  const { bytes } = await fetchAgentFile(file.url, { httpFetch: fetch, maxBytes: MAX_FILE_BYTES });
  return bytes;
}

async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Search by meaning. A file's passages become vectors a few at a time, each batch kept in the store as
// soon as it is paid for, under the hash of what the file says. A search spends a limited time on them
// and finds by keywords until they are all there; the next one goes on from where it stopped. Nothing
// here outlives its search, since a Worker may end whatever does.
const VECTORS_AT_ONCE = 16;
const INDEXING_MS = 15000;
const QUERY_MS = 10000;
const REST_AFTER_FAILING_MS = 60000;
const CLAIM_MS = 30000;

const encodeVectors = (vectors) => {
  const flat = Float32Array.from(vectors.flat());
  let binary = '';
  const bytes = new Uint8Array(flat.buffer);
  for (let at = 0; at < bytes.length; at += 32768) binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
  return { size: vectors[0].length, data: btoa(binary) };
};
const decodeVectors = ({ size, data }) => {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  const flat = new Float32Array(bytes.buffer);
  const vectors = [];
  for (let at = 0; at < flat.length; at += size) vectors.push(flat.subarray(at, at + size));
  return vectors;
};
function cosine(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let ofA = 0;
  let ofB = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; ofA += a[i] * a[i]; ofB += b[i] * b[i]; }
  return dot / (Math.sqrt(ofA * ofB) || 1);
}

/** (passages by file, query) => [{ item, similarity }] by meaning, best first, or null when it has nothing to say this time. */
function meaningSearch(meaning) {
  const held = new Map();
  const claims = new Map();
  const ownStore = memoryStore();
  let restUntil = 0;
  const vectorsOf = async (passages, { model, embed, store }, deadline) => {
    const file = `${model}\0${passages[0].document_id}`;
    if (held.has(file)) return held.get(file);
    const hash = await sha256(new TextEncoder().encode(`${model}\0${passages.map((item) => item.text).join('\0')}`));
    const vectors = [];
    for (let at = 0; at < passages.length; at += VECTORS_AT_ONCE) {
      const key = `embeddings/${hash}/${at}`;
      let kept = await (store ?? ownStore).get(key);
      if (!kept) {
        // Out of time, or someone in this class is paying for this batch now: keywords for this search.
        if (Date.now() > deadline || claims.get(key) > Date.now()) return null;
        claims.set(key, Date.now() + CLAIM_MS);
        try {
          const made = await embed(passages.slice(at, at + VECTORS_AT_ONCE).map((item) => [...new Set([item.title, item.heading, item.text].filter(Boolean))].join('\n')), { signal: AbortSignal.timeout(INDEXING_MS) });
          kept = encodeVectors(made);
          await (store ?? ownStore).put(key, kept);
        } finally { claims.delete(key); }
      }
      vectors.push(...decodeVectors(kept));
    }
    held.set(file, vectors);
    return vectors;
  };
  return async (byFile, query) => {
    if (Date.now() < restUntil) return null;
    try {
      const using = await meaning();
      if (!using) return null;
      const deadline = Date.now() + INDEXING_MS;
      const found = [];
      for (const passages of byFile) {
        if (!passages.length) continue;
        const vectors = await vectorsOf(passages, using, deadline);
        if (vectors) passages.forEach((item, i) => found.push({ item, vector: vectors[i] }));
      }
      if (!found.length) return null;
      const [asked] = await using.embed([String(query).slice(0, 2000)], { signal: AbortSignal.timeout(QUERY_MS) });
      return found.map(({ item, vector }) => ({ item, similarity: cosine(asked, vector) })).sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      // A search never fails a turn because embeddings did.
      restUntil = Date.now() + REST_AFTER_FAILING_MS;
      console.error(`Searching by keywords only for now: ${error?.message || error}`);
      return null;
    }
  };
}

// A file's passages, at its knowledge base's passage size; knowledgeBase also names where it was found, in errors. A file a local run can't
// read is read from its text copy (text_path), checked against text_sha256, and cited as itself.
async function readPassages(file, knowledgeBase, options) {
  const copy = !readsAsText(file.name) && file.text_path != null;
  if (!readsAsText(file.name) && !copy) throw failure(`Knowledge base "${knowledgeBase.ref}": a local run reads text, Markdown, CSV, JSON and HTML files, not "${file.name}". Run the agent on VIABLE, pass your own searchKnowledge, or map the knowledge base to a folder of text files with --knowledge ${knowledgeBase.ref}=<folder>.`, 'knowledge_unavailable');
  const source = copy ? { path: file.text_path, sha256: file.text_sha256 ?? null } : file;
  let bytes;
  try { bytes = await packageFileBytes(source, options); } catch (error) {
    throw Object.assign(new Error(`Knowledge base "${knowledgeBase.ref}": couldn't read "${file.name}"${copy ? '\'s text' : ''} (${source.url || source.path}): ${error.message}`), { status: 422, code: error.status ? error.code : 'knowledge_file_unreadable' });
  }
  if (!copy && file.bytes != null && bytes.byteLength !== file.bytes) throw failure(`Knowledge base "${knowledgeBase.ref}": "${file.name}" has ${bytes.byteLength} bytes, not the ${file.bytes} the package says.`);
  if (source.sha256 && await sha256(bytes) !== source.sha256.toLowerCase()) throw failure(`Knowledge base "${knowledgeBase.ref}": "${file.name}"${copy ? '\'s text' : ''} isn't the file the package names (its sha256 differs).`);
  const text = new TextDecoder().decode(bytes);
  // The passage size the knowledge base was split at on VIABLE (chunk_size), so its passages match there and here.
  const size = Number.isInteger(knowledgeBase.chunk_size) ? knowledgeBase.chunk_size : null;
  const sized = size ? { size, overlap: Math.round(size / 8), maxChunks: Math.max(2000, Math.ceil(2000 * 1200 / size)) } : {};
  return chunkText(!copy && HTML_FORMATS.has(extensionOf(file.name)) ? htmlToMarkdown(text, { base: file.url }) : text, sized).map((chunk, i) => ({
    ...chunk, document_id: file.ref, chunk_id: `${file.ref}:${i}`,
    title: file.title || file.name, url: file.url || null, filename: file.name, kind: 'file',
    // A file with no address of its own is linked where the knowledge base allows it: at the server's copy, and a PDF's page.
    link: file.url || (knowledgeBase.file_links && options.fileLink ? options.fileLink(file) : null),
    ...(/^### Page (\d+)/m.test(chunk.text) ? { page: Number(/^### Page (\d+)/m.exec(chunk.text)[1]) } : {})
  }));
}

/**
 * searchKnowledge for a course package: its knowledge bases by ref (the IDs a local run gives the
 * graph), each file read once, when a search first needs it. zip: the bytes of the .viable.zip files
 * named by path are in; else dir, the folder they are in, read with readPath(path, dir). fetch: what
 * downloads files named by url. folders (knowledgeFolders): knowledge bases kept in local folders,
 * which replace a package's of the same ref. meaning: () => { model, embed(texts, { signal }), store } or
 * null, asked on each search, to find passages by meaning too.
 */
export function searchPackage(pkg, { dir = null, fetch = globalThis.fetch, zip = null, folders = null, readPath = null, meaning = null } = {}) {
  const fileLink = (file) => `${packageFilesPath(pkg)}/${encodeURIComponent(file.ref)}`;
  const knowledgeBases = new Map([...(pkg?.knowledge_bases || []), ...(folders?.knowledge_bases || [])].map((kb) => [kb.ref, kb]));
  const files = new Map([...(pkg?.files || []), ...(folders?.files || [])].map((file) => [file.ref, file]));
  const loaded = new Map();
  const byMeaning = meaning ? meaningSearch(meaning) : null;
  // Kept once read, never while reading: a file that couldn't be read is tried again next time, and
  // no request waits on another's work, which a Worker may cancel with it.
  const passagesOf = async (ref, kb) => {
    if (loaded.has(ref)) return loaded.get(ref);
    const folder = folders?.dirs.get(kb.ref);
    const passages = await readPassages(files.get(ref), kb, folder ? { dir: folder, fetch, readPath } : { dir, fetch, zip, readPath, fileLink });
    loaded.set(ref, passages);
    return passages;
  };
  return async ({ knowledgeBaseIds = [], query = '', topK = 5, minScore = 0 }) => {
    const missing = knowledgeBaseIds.find((id) => !knowledgeBases.has(id));
    if (missing) throw failure(`There is no knowledge base "${missing}" (it has: ${[...knowledgeBases.keys()].join(', ') || 'none'}). Map it to a folder of its files with --knowledge ${missing}=<folder> (knowledge in runAgent).`);
    // Each file once, under the first of the knowledge bases that holds it.
    const holder = new Map();
    for (const kb of knowledgeBaseIds.map((id) => knowledgeBases.get(id))) {
      // A website's snapshot, read like a file of the package, cited at the page's own address.
      for (const [index, page] of (kb.websites || []).flatMap((site) => site.snapshot || []).entries()) {
        const ref = `${kb.ref}:page:${index}`;
        if (!files.has(ref)) files.set(ref, { ref, name: 'page.md', title: page.title || page.url, url: page.url, path: page.path, ...(page.sha256 ? { sha256: page.sha256 } : {}) });
        if (!holder.has(ref)) holder.set(ref, kb);
      }
      if (kb.websites?.length && !kb.file_refs?.length && !kb.websites.some((site) => site.snapshot?.length)) throw failure(`Knowledge base "${kb.ref}" reads websites, and the package has no snapshot of them. Run viable-engine knowledge refresh on the package, pass your own searchKnowledge, or map the knowledge base to a folder of its pages saved as text with --knowledge ${kb.ref}=<folder>.`, 'knowledge_unavailable');
      for (const ref of kb.file_refs || []) {
        if (!files.has(ref)) throw failure(`Knowledge base "${kb.ref}" names a file "${ref}" the package doesn't have.`);
        if (!holder.has(ref)) holder.set(ref, kb);
      }
    }
    const byFile = await Promise.all([...holder].map(async ([ref, kb]) => (await passagesOf(ref, kb)).map((item) => ({ ...item, knowledge_base_id: kb.ref }))));
    const passages = byFile.flat();
    const terms = searchTerms(query);
    const sense = byMeaning && String(query).trim() ? await byMeaning(byFile, query) : null;
    if (!terms.length && !sense) return [];
    const byWords = (terms.length ? rankByKeywords(passages, terms.slice(0, 8), { text: (item) => item.text, title: (item) => `${item.title}\n${item.heading || ''}`, phrase: query }) : [])
      .filter((entry) => hasSubstance(entry.item.text)).slice(0, 30);
    const close = sense ? sense.filter((entry) => hasSubstance(entry.item.text)).slice(0, 30) : [];
    // The two lists combined by rank, each counting the same. A passage's score is then its place, as VIABLE scores a keyword-only knowledge base (so min_score means the same).
    const combined = new Map();
    for (const [list, kind] of [[byWords, 'keyword'], [close, 'meaning']]) {
      list.forEach((entry, rank) => {
        const both = combined.get(entry.item.chunk_id);
        combined.set(entry.item.chunk_id, { item: entry.item, weight: (both?.weight ?? 0) + 1 / (60 + rank), match: both ? 'hybrid' : kind });
      });
    }
    const ranked = [...combined.values()].sort((a, b) => b.weight - a.weight).map((entry, rank) => ({ ...entry, score: 60 / (60 + rank) })).filter((entry) => entry.score >= minScore);
    // At most two passages from one file before any third.
    const perFile = new Map();
    const first = [];
    const rest = [];
    for (const entry of ranked) {
      const count = perFile.get(entry.item.document_id) || 0;
      (count < 2 ? first : rest).push(entry);
      perFile.set(entry.item.document_id, count + 1);
    }
    return [...first, ...rest].slice(0, topK).map(({ item, score, match }) => ({ ...item, score: Math.round(score * 10000) / 10000, match }));
  };
}
