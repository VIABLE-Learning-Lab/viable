// The public goods catalog (docs/catalog.md): datasets, benchmarks, knowledge graphs, standards,
// evaluators, models, tools, open content and learning data repositories for K-12 AI, one entry each
// in catalog/, with the harness slot each would fill. Entries describe; they don't endorse. Read from
// the copy in utils/catalogData.js and no Node built-ins, so a browser or a Worker can search it too.
import { CATALOG } from './utils/catalogData.js';
import { SLOTS } from './components/index.js';
import { searchTerms } from './utils/terms.js';

export { CATALOG };
// schemas/catalog-entry.schema.json's kinds, in the order docs/catalog.md lists them.
export const CATALOG_KINDS = ['knowledge-graph', 'standards', 'content', 'dataset', 'benchmark', 'evaluator', 'model', 'tool', 'learning-data-repository'];
// Licenses that let anyone use, change and share a work, commercially too.
const OPEN = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODC-By-1.0', 'LicenseRef-Public-Domain']);

/** Whether anyone may download it without asking and use it, commercially too, under every license it lists (its note may still leave parts out). */
export const openForAnyUse = (entry) => entry.access === 'open download' && !entry.license.unclear && entry.license.spdx.length > 0 && entry.license.spdx.every((id) => OPEN.has(id));

/** What a license asks of a person beyond credit: empty when it asks nothing else (docs/resources.md). */
export function licenseLimits(license) {
  const has = (part) => license.spdx.some((id) => id.toUpperCase().includes(part));
  return [
    ...(has('-NC') ? ['non-commercial use only'] : []),
    ...(has('-SA') ? ['what you share from it carries the same license'] : []),
    ...(has('-ND') ? ['no changed copies'] : []),
    ...(license.unclear ? ['its sources disagree or leave it unclear'] : []),
    ...(license.spdx.length ? [] : ['no license is stated'])
  ];
}

const terms = new Map(CATALOG.map((entry) => [entry.id, new Set(searchTerms([
  entry.id, entry.name, entry.kind, entry.summary, entry.subjects, entry.grades, entry.made_by, entry.formats, entry.fits.slots, entry.fits.how, entry.in_harness, entry.connect.as
].flat().join(' ')))]));

/**
 * The entries that fit the filters and share words with query: those with every word first, else
 * those with the most. kind and slot narrow it, open keeps what openForAnyUse allows, and connected
 * what has an effect on an agent (connect.level 2 or 3). Without a query, every entry that fits the
 * filters. Each entry says in connect how far it is connected, as what, and the command. Throws for an
 * unknown kind or slot, or a query with no word of three letters or more.
 */
export function searchCatalog(query = '', { kind = null, slot = null, open = false, connected = false } = {}) {
  if (kind && !CATALOG_KINDS.includes(kind)) throw new Error(`Unknown kind "${kind}"; the kinds are ${CATALOG_KINDS.join(', ')}.`);
  if (slot && !SLOTS.includes(slot)) throw new Error(`Unknown slot "${slot}"; the slots are ${SLOTS.join(', ')}.`);
  const fitting = CATALOG.filter((entry) => (!kind || entry.kind === kind) && (!slot || entry.fits.slots.includes(slot)) && (!open || openForAnyUse(entry)) && (!connected || entry.connect.level >= 2));
  if (!String(query || '').trim()) return { match: 'all', entries: fitting };
  const asked = searchTerms(query);
  if (!asked.length) throw new Error('Say what to look for in words of three letters or more, such as "misconceptions" or "writing feedback".');
  const scored = fitting.map((entry) => ({ entry, matched: asked.filter((word) => terms.get(entry.id).has(word)).length })).filter((item) => item.matched);
  const every = scored.filter((item) => item.matched === asked.length);
  // Ties go to what's connected, then keep the catalog's order: by kind, then by name.
  return { match: every.length ? 'every_word' : 'most_words', entries: (every.length ? every : scored).sort((a, b) => b.matched - a.matched || Math.min(b.entry.connect.level, 2) - Math.min(a.entry.connect.level, 2)).map((item) => item.entry) };
}
