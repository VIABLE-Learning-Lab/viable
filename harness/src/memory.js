/**
 * A person's memory for an assistant such as Ask: what they told it that isn't written anywhere else, kept as short sentences they can
 * read and change. It informs; what they say now comes first. Nothing about a learner belongs in it: this refuses a name on their class
 * lists, and the assistant's instructions forbid the rest. The host keeps the items (a store on the Engine, a database on a platform);
 * this decides which of them reach a message, words them for the model, and refuses what can't be kept.
 * No Node built-ins.
 */
import { searchTerms } from './utils/terms.js';

export const MEMORY_LIMITS = { items: 200, text: 300, always: 8, fits: 4, found: 8 };

// Scripts written without spaces between words: pairs of characters stand in for words.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]+/gu;
// Words searchTerms or the pairs already read: those with Latin letters, or in the scripts above.
const READ = /[\p{Script=Latin}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

/** Lowercase, with accents and other marks set aside, in any script: what words are matched on, so fracción meets fracciones. */
export const foldText = (text) => String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase();

/**
 * The words a sentence is matched on, in any language: searchTerms' stems once accents are set aside, every number (grade 5, 2026),
 * each pair of characters in Chinese, Japanese, Korean or Thai, and words in other alphabets (Cyrillic, Greek, Arabic, Hebrew,
 * Devanagari…) whole and, from five letters, by their first four, a rough stem that meets most of their endings.
 */
export function memoryTerms(text) {
  const value = foldText(text);
  const pairs = (value.match(UNSPACED) || []).flatMap((run) => (run.length < 2 ? [run] : Array.from({ length: run.length - 1 }, (_, i) => run.slice(i, i + 2))));
  const words = (value.match(/\p{L}+/gu) || []).filter((word) => !READ.test(word) && [...word].length >= 3)
    .flatMap((word) => ([...word].length >= 5 ? [word, [...word].slice(0, 4).join('')] : [word]));
  return [...new Set([...searchTerms(value), ...(value.match(/\d+/g) || []), ...pairs, ...words])];
}

const score = (terms, text) => { const own = new Set(memoryTerms(text)); return terms.reduce((sum, term) => sum + (own.has(term) ? 1 : 0), 0); };

/**
 * Which memories reach this message: those the person keeps always in mind (the latest first, up to `always`), then up to `fits` others
 * whose words meet the request's, the best first. The rest wait to be looked up: `rest` says how many.
 */
export function pickMemories(items, request, { always = MEMORY_LIMITS.always, fits = MEMORY_LIMITS.fits } = {}) {
  const latest = (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  const kept = [...items].sort(latest);
  const first = kept.filter((item) => item.always).slice(0, always);
  const terms = memoryTerms(request);
  const fitting = terms.length ? kept.filter((item) => !item.always).map((item) => ({ item, at: score(terms, item.text) })).filter(({ at }) => at > 0).sort((a, b) => b.at - a.at).slice(0, fits).map(({ item }) => item) : [];
  return { always: first, fits: fitting, rest: kept.length - first.length - fitting.length };
}

const day = (iso) => String(iso || '').slice(0, 10);

/**
 * The words for the model's instructions: what it knows of the person, each with its id and when it was kept, as context, and how many
 * more it can look up. Those may be in another language than the message, whose words then meet none of them.
 */
export function memoryNote({ always = [], fits = [], rest = 0 }) {
  if (!always.length && !fits.length && !rest) return '';
  const line = (item) => `- [${item.id}] ${item.text} (kept ${day(item.updated_at || item.created_at)})`;
  return [
    'What you know about this person from before. They can see and change all of it. It may be out of date, and what they say now comes first: use it where it fits, set it aside where they ask for something else, and never narrow what they can ask for because of it.',
    ...(always.length ? ['Always in mind:', ...always.map(line)] : []),
    ...(fits.length ? ['Fits this message:', ...fits.map(line)] : []),
    ...(rest ? [`${always.length || fits.length ? 'Beyond these, you' : 'You'} keep ${rest} other ${rest === 1 ? 'thing' : 'things'} about them that this message's words didn't meet. Look with recall when what they ask might touch them, using the words of the language they were kept in as well as this message's.`] : [])
  ].join('\n');
}

const ADDRESS = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{7,}\d/;

/** Why a sentence can't be kept, or null: nothing in it, too long, an address or number, or a learner's name the host knows. */
export function memoryRefusal(text, { names = [] } = {}) {
  const value = String(text ?? '').trim();
  if (!value) return 'Say what to remember.';
  if (value.length > MEMORY_LIMITS.text) return `Keep it to one sentence, under ${MEMORY_LIMITS.text} characters.`;
  if (ADDRESS.test(value)) return 'Ask doesn’t keep email addresses or phone numbers.';
  const lower = foldText(value);
  const named = names.map((name) => String(name || '').trim()).filter((name) => name.length >= 2).find((name) => new RegExp(`(^|[^\\p{L}])${foldText(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(lower));
  if (named) return 'That names a learner on your class lists, so Ask won’t keep it.';
  return null;
}

/**
 * Earlier conversations whose words meet the query, the best first: [{ id, title, at, snippet }]. threads: [{ id, title, updated_at, text }],
 * text being what the person and the assistant said. Every word of a short query must be there, and half of a long one's; when nothing
 * has that many, those with any come back, the best first, since a person rarely remembers the words they used.
 */
export function searchConversations(threads, query, { limit = MEMORY_LIMITS.found } = {}) {
  const terms = memoryTerms(query);
  if (!terms.length) return [];
  const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length / 2);
  const scored = threads.map((thread) => {
    const own = new Set(memoryTerms(`${thread.title || ''} ${thread.text || ''}`));
    return { thread, hits: terms.filter((term) => own.has(term)) };
  });
  const enough = scored.filter(({ hits }) => hits.length >= need);
  return (enough.length ? enough : scored.filter(({ hits }) => hits.length))
    .sort((a, b) => b.hits.length - a.hits.length || String(b.thread.updated_at).localeCompare(String(a.thread.updated_at)))
    .slice(0, limit)
    .map(({ thread, hits }) => ({ id: thread.id, title: thread.title || 'A conversation', at: thread.updated_at, snippet: snippetOf(thread.text || '', hits) }));
}

// Around the first place a found word is, about 240 characters, on word edges.
function snippetOf(text, hits) {
  const lower = foldText(text);
  const at = Math.max(0, Math.min(...hits.map((hit) => { const i = lower.indexOf(hit); return i < 0 ? Infinity : i; }).filter(Number.isFinite), 0));
  const start = Math.max(0, at - 80);
  const piece = text.slice(start, start + 240).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${piece}${start + 240 < text.length ? '…' : ''}`;
}
