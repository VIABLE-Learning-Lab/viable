/**
 * Who is in a course on this server: its class list, its sections and a section's own opening. All of it
 * stays in the store and never goes in the package. Plain functions on a store, for the console's pages
 * and the learner routes. A name is shown only behind the token and to the learner it is, and never goes
 * to a model. No Node built-ins.
 */
import { slugOf } from './library.js';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const SECTION_KEY = /^[a-z0-9][a-z0-9-]{0,23}$/;
const refused = (message, status = 400, code = 'invalid_people') => Object.assign(new Error(message), { status, code });
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const randomId = () => hex(crypto.getRandomValues(new Uint8Array(12)));
const nowIso = () => new Date().toISOString();

// A course's list and sections change one at a time here, so two at once don't lose one or add someone twice. Per process: two instances of one server can still race.
const lines = new WeakMap();
function inLine(store, code, work) {
  if (!lines.has(store)) lines.set(store, new Map());
  const held = lines.get(store);
  const turn = (held.get(code) || Promise.resolve()).then(work, work);
  held.set(code, turn.catch(() => {}));
  return turn;
}

export const PEOPLE_LIMITS = { pasted: 1000, name: 120, sections: 60, sectionName: 80 };

export const classKeys = {
  visitor: (code, visitor) => `courses/${code}/visitors/${visitor}`,
  byCode: (code, learnerCode) => `courses/${code}/codes/${learnerCode}`,
  learner: (code, id) => `courses/${code}/learners/${id}`,
  named: (code, hash) => `courses/${code}/names/${hash}/`,
  sections: (code) => `courses/${code}/sections`,
  release: (code, key, section) => `courses/${code}/release/${key}/${section}`
};

// --- Codes and names ---------------------------------------------------------------------------------

export const newCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
/** A personal code as people read it: K7Q2-M9XC. */
export const showCode = (code) => (/^[0-9A-Z]{8}$/.test(code ?? '') ? `${code.slice(0, 4)}-${code.slice(4)}` : code ?? '');
/** A code as it is kept, however it was typed. */
export const readCode = (said) => String(said ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 64);
/** The same letters however they were typed: another form of a name is that name, not a second person who looks like them. */
export const cleanEntry = (value) => String(value ?? '').normalize('NFKC').replace(/\p{Cf}/gu, '').trim().replace(/\s+/g, ' ');
// A key per person under the name's hash: two people can share a name, and no key ever holds one.
const nameKey = async (code, name, id) => `${classKeys.named(code, await sha256(cleanEntry(name).toLowerCase()))}${id}`;

/** Everyone a course's list or a typed entry knows by this name. */
export async function learnersNamed(store, code, name) {
  const found = await store.list(classKeys.named(code, await sha256(cleanEntry(name).toLowerCase())));
  return (await Promise.all(found.map((key) => store.get(classKeys.learner(code, key.split('/').at(-1)))))).filter(Boolean);
}

// --- People ------------------------------------------------------------------------------------------

/** A new learner of the course with a code of their own. */
export async function makeLearner(store, code, fields = {}) {
  let learnerCode = newCode();
  while (await store.get(classKeys.byCode(code, learnerCode))) learnerCode = newCode();
  const learner = { id: `lrn_${randomId()}`, code: learnerCode, created_at: nowIso(), ...fields };
  await store.put(classKeys.learner(code, learner.id), learner);
  await store.put(classKeys.byCode(code, learnerCode), { learner: learner.id });
  if (learner.name) await store.put(await nameKey(code, learner.name, learner.id), { at: learner.created_at });
  return learner;
}

/** Changes a learner's record, and what finds them by name with it. */
export async function changeLearner(store, code, id, change) {
  const held = await store.get(classKeys.learner(code, id));
  if (!held) throw refused('That learner isn’t in this course anymore.', 404, 'learner_not_found');
  const next = { ...held, ...change };
  if ('name' in change && (change.name || null) !== (held.name || null)) {
    if (held.name) await store.delete(await nameKey(code, held.name, id));
    if (next.name) await store.put(await nameKey(code, next.name, id), { at: nowIso() });
  }
  await store.put(classKeys.learner(code, id), next);
  return next;
}

/** Everyone in a course but those only trying it out: on its list, or come by its link. Those with names first, in order. */
export async function peopleOf(store, code) {
  if (!store) return [];
  const held = await Promise.all((await store.list(`courses/${code}/learners/`)).map((key) => store.get(key)));
  return held.filter((learner) => learner && !learner.trying).sort((a, b) => Boolean(b.name) - Boolean(a.name) || (a.name || a.code).localeCompare(b.name || b.code, undefined, { sensitivity: 'base' }));
}

const signOut = async (store, code, id) => {
  for (const key of await store.list(`courses/${code}/visitors/`)) if ((await store.get(key))?.learner === id) await store.delete(key);
};

/** A new personal code: the old one stops working, and browsers holding it are signed out. */
export async function newCodeFor(store, code, id) {
  const held = await store.get(classKeys.learner(code, id));
  if (!held) throw refused('That learner isn’t in this course anymore.', 404, 'learner_not_found');
  let next = newCode();
  while (await store.get(classKeys.byCode(code, next))) next = newCode();
  await store.put(classKeys.byCode(code, next), { learner: id });
  await store.delete(classKeys.byCode(code, held.code));
  await signOut(store, code, id);
  return changeLearner(store, code, id, { code: next });
}

/**
 * Off the list: browsers holding them are signed out, and their name goes. What they did stays under their code,
 * so a teacher can give them a name again. Someone who never signed in has nothing to keep, so they go altogether.
 */
export async function removeFromList(store, code, id) {
  const held = await store.get(classKeys.learner(code, id));
  if (!held) throw refused('That learner isn’t in this course anymore.', 404, 'learner_not_found');
  await signOut(store, code, id);
  if (held.last_seen_at) return changeLearner(store, code, id, { name: null, section: null, listed: false });
  if (held.name) await store.delete(await nameKey(code, held.name, id));
  await store.delete(classKeys.byCode(code, held.code));
  await store.delete(classKeys.learner(code, id));
  return null;
}

/** Lines of a pasted list: a name, then optionally a tab or a comma and a section's name. A tab wins, so "Lovelace, Ada<tab>Period 2" reads as it looks. */
export function listLines(text) {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const comma = !line.includes('\t') && line.includes(',');
    const [name, section = ''] = line.split(comma ? ',' : '\t');
    return { name: cleanEntry(name), section: cleanEntry(section).slice(0, PEOPLE_LIMITS.sectionName), comma };
  });
}

/**
 * A pasted class list onto the course's: each new name gets a code, someone already on it moves to the section the
 * line gives, and a section the list names that the course hasn't got is made. Returns what happened, for the page to say.
 */
export const addLines = (store, code, text) => inLine(store, code, () => addLinesNow(store, code, text));
/**
 * A pasted list, read and checked before anything changes: its lines, whether its first row was headings, and which sections it names
 * that the course hasn't got. sections: the course's.
 */
export function readClassLines(text, sections) {
  const lines = listLines(text);
  if (!lines.length) throw refused('Paste or type at least one name.');
  if (lines.length > PEOPLE_LIMITS.pasted) throw refused(`Add at most ${PEOPLE_LIMITS.pasted} people at a time.`);
  // A spreadsheet's first row often says what its columns are.
  const headed = /^(?:names?|full name|student(?: id)?|id|learners?)$/i.test(lines[0].name) && (!lines[0].section || /^(?:sections?|class|group|period)$/i.test(lines[0].section));
  if (headed) lines.shift();
  const named = [];
  for (const { section } of lines) if (section && !named.some((name) => name.toLowerCase() === section.toLowerCase())) named.push(section);
  const fresh = named.filter((name) => !sectionNamed(sections, name));
  // "Lovelace, Ada" or two columns for first and last names would make a section of everyone's other name, and a section's name goes where a name mustn't.
  const split = lines.filter((line) => line.section);
  if (split.length >= 3 && split.length === lines.length && new Set(split.map((line) => line.section.toLowerCase())).size === split.length && split.every((line) => fresh.some((name) => name.toLowerCase() === line.section.toLowerCase()))) {
    throw refused(lines[0].comma ? `These look like “Last, First” names, not sections: “${lines[0].name}, ${lines[0].section}”. Write names as First Last, or put a tab before a section.` : `These look like first and last names in two columns, not sections: “${lines[0].name}” and “${lines[0].section}”. Put each whole name in one column.`);
  }
  if (sections.length + fresh.length > PEOPLE_LIMITS.sections) throw refused(`A course has at most ${PEOPLE_LIMITS.sections} sections.`);
  return { lines, headed, fresh };
}

async function addLinesNow(store, code, text) {
  let sections = await sectionsOf(store, code);
  const { lines, headed, fresh } = readClassLines(text, sections);
  for (const name of fresh) sections = (await addSectionNow(store, code, { name })).sections;
  const report = { added: [], moved: [], already: [], too_long: 0, no_name: 0, sections: fresh, headed };
  for (const line of lines) {
    if (!line.name) { report.no_name += 1; continue; }
    if (line.name.length > PEOPLE_LIMITS.name) { report.too_long += 1; continue; }
    const section = line.section ? sectionNamed(sections, line.section)?.id ?? null : null;
    const same = (await learnersNamed(store, code, line.name)).filter((learner) => learner.listed);
    if (!same.length) {
      await makeLearner(store, code, { name: line.name, section, listed: true, last_seen_at: null });
      report.added.push(line.name);
    } else if (same.length === 1 && section && same[0].section !== section) {
      await changeLearner(store, code, same[0].id, { section });
      report.moved.push(line.name);
    } else report.already.push(line.name);
  }
  return report;
}

// --- Sections ----------------------------------------------------------------------------------------

/** A course's sections: [{ id, key, name }], in the order they were made. */
export const sectionsOf = async (store, code) => (store ? (await store.get(classKeys.sections(code)))?.list ?? [] : []);
const sectionNamed = (sections, name) => { const asked = String(name).toLowerCase(); return sections.find((section) => section.name.toLowerCase() === asked || section.key === asked); };
const freeKey = (base, sections, except = null) => {
  const taken = new Set(sections.filter((section) => section.id !== except).map((section) => section.key));
  const start = base.slice(0, 24).replace(/-+$/, '') || 'section';
  let key = start;
  for (let n = 2; taken.has(key); n += 1) key = `${start.slice(0, 20)}-${n}`;
  return key;
};

export const addSection = (store, code, input) => inLine(store, code, () => addSectionNow(store, code, input));
async function addSectionNow(store, code, { name, key = null }) {
  const sections = await sectionsOf(store, code);
  const title = cleanEntry(name).slice(0, PEOPLE_LIMITS.sectionName);
  if (!title) throw refused('Give the section a name.', 400, 'invalid_section');
  if (sections.length >= PEOPLE_LIMITS.sections) throw refused(`A course has at most ${PEOPLE_LIMITS.sections} sections.`, 400, 'invalid_section');
  if (sections.some((section) => section.name.toLowerCase() === title.toLowerCase())) throw refused(`There is already a section called “${title}”.`, 409, 'section_exists');
  const section = { id: `sec_${randomId()}`, key: freeKey(slugOf(key || title, 'section'), sections), name: title };
  const list = [...sections, section];
  await store.put(classKeys.sections(code), { list });
  return { section, sections: list };
}

export const changeSection = (store, code, id, input) => inLine(store, code, () => changeSectionNow(store, code, id, input));
async function changeSectionNow(store, code, id, { name, key }) {
  const sections = await sectionsOf(store, code);
  const held = sections.find((section) => section.id === id);
  if (!held) throw refused('That section isn’t in this course anymore.', 404, 'section_not_found');
  const title = cleanEntry(name ?? held.name).slice(0, PEOPLE_LIMITS.sectionName);
  if (!title) throw refused('Give the section a name.', 400, 'invalid_section');
  if (sections.some((section) => section.id !== id && section.name.toLowerCase() === title.toLowerCase())) throw refused(`There is already a section called “${title}”.`, 409, 'section_exists');
  const asked = String(key ?? held.key).trim().toLowerCase();
  if (!SECTION_KEY.test(asked)) throw refused('A link key is up to 24 lowercase letters, digits and dashes.', 400, 'invalid_section');
  if (sections.some((section) => section.id !== id && section.key === asked)) throw refused(`Another section’s link already uses “${asked}”.`, 409, 'section_exists');
  const list = sections.map((section) => (section.id === id ? { ...section, name: title, key: asked } : section));
  await store.put(classKeys.sections(code), { list });
  return list;
}

/** Off the course, with its own openings, once nobody is in it. */
export const removeSection = (store, code, id) => inLine(store, code, () => removeSectionNow(store, code, id));
async function removeSectionNow(store, code, id) {
  const sections = await sectionsOf(store, code);
  const held = sections.find((section) => section.id === id);
  if (!held) throw refused('That section isn’t in this course anymore.', 404, 'section_not_found');
  if ((await peopleOf(store, code)).some((learner) => learner.section === id)) throw refused(`“${held.name}” has learners. Move them first, then remove it.`, 409, 'section_in_use');
  for (const key of await store.list(`courses/${code}/release/`)) if (key.endsWith(`/${id}`)) await store.delete(key);
  const list = sections.filter((section) => section.id !== id);
  await store.put(classKeys.sections(code), { list });
  return list;
}

// --- A section's own opening -------------------------------------------------------------------------

/** { activityKey: { sectionId: { release, opens_at, closes_at } } }, what releaseState takes as an override. */
export async function releasesOf(store, code) {
  const found = {};
  if (!store) return found;
  for (const key of await store.list(`courses/${code}/release/`)) {
    const [activity, section] = key.split('/').slice(-2);
    (found[activity] ||= {})[section] = await store.get(key);
  }
  return found;
}

/** Open or hidden for one section at once, kept here and not as a course version, since a teacher does this mid-class. null: as the course. */
export async function setRelease(store, code, key, section, release, closesAt = null) {
  const at = classKeys.release(code, key, section);
  if (release == null) return store.delete(at);
  return store.put(at, { release, opens_at: null, closes_at: release === 'open' ? closesAt : null, updated_at: nowIso() });
}

/** What an activity leaves when it goes: a new one with its title could otherwise take its address, and with it these. */
export async function forgetActivity(store, code, key) {
  for (const item of [...await store.list(`courses/${code}/release/${key}/`), ...await store.list(acceptedPrefix(code, key))]) await store.delete(item);
}

// --- Suggested changes a teacher accepted --------------------------------------------------------------

const acceptedPrefix = (code, key) => `courses/${code}/accepted/${key}/`;
/** What was accepted for an activity, oldest first: [{ id, change, at }]. Evidence for new suggestions starts after the last one. */
export const acceptedOf = async (store, code, key) => (await Promise.all((await store.list(acceptedPrefix(code, key))).map((item) => store.get(item)))).filter(Boolean);
export async function keepAccepted(store, code, key, { id, change }) {
  const at = nowIso();
  await store.put(`${acceptedPrefix(code, key)}${at}-${randomId()}`, { id, change, at });
}
