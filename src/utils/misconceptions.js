// Eedi's math misconceptions and the constructs (skills) each one hinders, from the copy of the
// Learning Commons release in misconceptionsData.js. The release doesn't link constructs to standards
// (that part is gated), so they are matched by words: constructs with every word asked, or else those
// sharing the most words with it (a standard's text and its learning components).
import { CONSTRUCTS, MISCONCEPTIONS } from './misconceptionsData.js';
import { MISCONCEPTIONS_SOURCE } from './misconceptionsSource.js';

const STOP = new Set('about above after again also and any are as at be been being below between both but by can could did does doing down during each few for from further had has have having here how into its itself just more most must not now off once only other our out over own same should some such than that the their them then there these they this those through too under until use used uses using given include includes including very was were what when where which while who whom why will with within without would you your'.split(' '));
const SUFFIXES = ['ing', 'ed', 'es', 's', 'e'];
// Lowercase words of three letters or more, without common ones, each cut to a rough stem (adding,
// adds → add; fractions → fraction) so a teacher's words meet Eedi's.
export function misconceptionTerms(value) {
  const stem = (word) => { const end = SUFFIXES.find((suffix) => word.endsWith(suffix) && word.length - suffix.length >= 3); return end ? word.slice(0, -end.length) : word; };
  return [...new Set((String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => word.length >= 3 && !STOP.has(word)).map(stem))];
}
// The compact strings (records split by `, fields by ~; ids without dashes; indexes in base 36), read once.
const uuid = (hex) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
let eedi = null;
const eediData = () => {
  if (eedi) return eedi;
  const misconceptions = MISCONCEPTIONS.split('`').map((row) => { const [hex, description] = row.split('~'); return { id: uuid(hex), description }; });
  eedi = CONSTRUCTS.split('`').map((row) => {
    const [hex, description, hindered] = row.split('~');
    return { id: uuid(hex), description, terms: new Set(misconceptionTerms(description)), misconceptions: hindered.split(',').map((i) => misconceptions[Number.parseInt(i, 36)]) };
  });
  return eedi;
};
export const MISCONCEPTION_RESULTS = 8;

/**
 * Up to 8 constructs for words or a standard's text, each with the misconceptions that hinder it:
 * those with every word first; if none has them all, those sharing the most (at least two when two
 * or more were asked). matched says which words each shares. Throws (400, invalid_misconception_search)
 * when the text has no word to look for.
 */
export function findMisconceptions(q, { via = null } = {}) {
  const asked = misconceptionTerms(q);
  if (!asked.length) throw Object.assign(new Error('Say what to look for: a few words, or a standard’s text.'), { status: 400, code: 'invalid_misconception_search' });
  const scored = eediData().map((construct) => ({ construct, matched: asked.filter((word) => construct.terms.has(word)) })).filter((entry) => entry.matched.length);
  const every = scored.filter((entry) => entry.matched.length === asked.length);
  const found = (every.length ? every : scored.filter((entry) => entry.matched.length >= Math.min(2, asked.length)))
    // More words shared first, then the larger share of the construct's own words (the closer fit).
    .sort((a, b) => b.matched.length - a.matched.length || b.matched.length / b.construct.terms.size - a.matched.length / a.construct.terms.size)
    .slice(0, MISCONCEPTION_RESULTS);
  return {
    object: 'list',
    match: every.length ? 'every_word' : 'most_words',
    source: { ...MISCONCEPTIONS_SOURCE, ...(via ? { via } : {}) },
    data: found.map(({ construct, matched }) => ({ id: construct.id, description: construct.description, matched, misconceptions: construct.misconceptions }))
  };
}

/** A misconception by its id, with a construct it hinders, as teaching settings keep it; null if unknown. */
export function misconceptionById(id) {
  const key = String(id || '').toLowerCase();
  for (const construct of eediData()) {
    const found = construct.misconceptions.find((item) => item.id === key);
    if (found) return { id: found.id, description: found.description, construct: { id: construct.id, description: construct.description }, source: { name: MISCONCEPTIONS_SOURCE.name, license: MISCONCEPTIONS_SOURCE.license, attribution: [MISCONCEPTIONS_SOURCE.attribution], modified: MISCONCEPTIONS_SOURCE.modified } };
  }
  return null;
}
