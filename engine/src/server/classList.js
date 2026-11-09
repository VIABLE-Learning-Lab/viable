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

/**
 * More time for one learner on one activity: it stays open to them until closesAt, after it closes for everyone else
 * (releaseState takes the later). null: none. Kept on their record as { activity's key: instant }.
 */
export async function extendFor(store, code, id, key, closesAt) {
  const held = await store.get(classKeys.learner(code, id));
  if (!held) throw refused('That learner isn’t in this course anymore.', 404, 'learner_not_found');
  const extensions = { ...(held.extensions || {}) };
  if (closesAt) extensions[key] = closesAt;
  else delete extensions[key];
  return changeLearner(store, code, id, { extensions });
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

/**
 * A pasted class list onto the course's: each new name gets a code, someone already on it moves to the section the
 * line gives, and a section the list names that the course hasn't got is made. Returns what happened, for the page to say.
 * options: what readClassLines takes.
 */
export const addLines = (store, code, text, options) => inLine(store, code, () => addLinesNow(store, code, text, options));

// --- Reading a class list ----------------------------------------------------------------------------

/** What a column of a pasted list holds. Two columns can't hold one thing but leave out. */
export const COLUMN_ROLES = ['name', 'first', 'last', 'section', 'skip'];
// A row of headings names its columns. The first that fits wins, so "First name" is first, not name.
const HEADINGS = [
  ['first', /^(?:first|given|fore|preferred(?: first)?)[\s_-]*names?$|^first$/i],
  ['last', /^(?:last|family|sur)[\s_-]*names?$|^(?:last|surname)$/i],
  ['name', /^(?:(?:student|learner|pupil|full|display|preferred)[\s_-]*)?names?$|^(?:students?|learners?|pupils?)$/i],
  ['section', /^(?:sections?|periods?|class(?:[\s_-]*(?:period|section|name))?|classes|groups?|blocks?|hours?|homerooms?|teams?|cohorts?|sets?)$/i],
  ['id', /^(?:(?:student|learner|pupil|sis|local|state|school)[\s_-]*)?(?:ids?|numbers?|no\.?|#)$/i],
  ['skip', /^(?:e-?mails?(?:[\s_-]*address(?:es)?)?|grades?|years?|gender|sex|dob|birth[\s_-]*date|date of birth|phone|parents?|guardians?|teachers?|courses?|schools?|notes?|status|user ?name|login)$/i]
];
const SECTION_WORDS = /^(?:period|pd|per|section|sec|class|block|hour|group|grp|team|homeroom|room|cohort|set)\b\.?\s*\S/i;
const SHORT_CODE = /^(?:[A-Z]?\d{1,2}[A-Z]?|[A-Z])$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMBER = /^[A-Z]{0,3}[-#]?\d{3,}[\w-]*$/i;
// "1. Ada", "2) Alan", "- Grace", "• Katherine": a list's own marks, not part of a name.
const LIST_MARK = /^(?:\d{1,4}[.)]|[-*•·▪◦])\s+/;
const LAST_FIRST = /^([^,]+),\s*([^,]+)$/;

/** One line's cells: split by a tab if it has one (a spreadsheet's copy), else by commas or semicolons as a CSV file has them, quotes and all. */
function cellsOf(line) {
  const mark = line.includes('\t') ? '\t' : line.includes(',') ? ',' : line.includes(';') ? ';' : null;
  if (!mark) return [line];
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && !cell.trim()) { quoted = true; cell = ''; } else if (c === mark) { cells.push(cell); cell = ''; } else cell += c;
  }
  cells.push(cell);
  return cells;
}

/** The roles a row of headings gives its columns, or null when the row isn't headings. ids: the course knows learners by a student ID. */
function headingRoles(cells, ids) {
  const said = cells.map((cell) => cleanEntry(cell));
  const found = said.map((cell) => (cell && cell.length <= 40 ? HEADINGS.find(([, pattern]) => pattern.test(cell))?.[0] ?? null : null));
  const filled = said.filter(Boolean).length;
  if (!found.some((role) => ['name', 'first', 'last', 'id'].includes(role)) || found.filter(Boolean).length * 2 < filled) return null;
  const roles = found.map((role) => (role === 'id' ? (ids ? 'name' : 'skip') : ids && ['name', 'first', 'last'].includes(role) ? 'skip' : role || 'skip'));
  return roles.some((role) => ['name', 'first', 'last'].includes(role)) ? oneEach(roles) : null;
}

/** A column a role, guessed from what is in them. */
function guessRoles(rows, width, ids, commas) {
  if (width === 1) return ['name'];
  const kinds = Array.from({ length: width }, (_, i) => {
    const seen = rows.map((cells) => cleanEntry(cells[i])).filter(Boolean);
    const distinct = new Set(seen.map((value) => value.toLowerCase())).size;
    if (!seen.length || seen.every((value) => EMAIL.test(value)) || seen.every((value, at) => value.replace(/[.)]$/, '') === String(at + 1))) return 'skip';
    if (seen.every((value) => NUMBER.test(value))) return ids ? 'id' : 'skip';
    if (seen.every((value) => SECTION_WORDS.test(value)) || (seen.length >= 2 && seen.every((value) => SHORT_CODE.test(value)) && distinct * 2 <= seen.length) || (seen.length >= 4 && distinct * 3 <= seen.length && seen.every((value) => value.length <= 40))) return 'section';
    return 'words';
  });
  const roles = kinds.map((kind) => (kind === 'section' ? 'section' : 'skip'));
  const words = kinds.flatMap((kind, i) => (kind === 'words' ? [i] : []));
  const id = kinds.indexOf('id');
  if (ids && id >= 0) roles[id] = 'name';
  else if (!words.length) roles[kinds.findIndex((kind) => kind !== 'skip') >= 0 ? kinds.findIndex((kind) => kind !== 'skip') : 0] = 'name';
  else if (words.length >= 2 && [words[0], words[1]].every((i) => rows.every((cells) => !/\s/.test(cleanEntry(cells[i]))))) {
    // Two columns of one word each: a name in two parts. Written with a comma it is "Lovelace, Ada"; in a spreadsheet, first then last.
    roles[words[0]] = commas ? 'last' : 'first';
    roles[words[1]] = commas ? 'first' : 'last';
  } else roles[words[0]] = 'name';
  return oneEach(roles);
}

// One column a role: a second name or section column is left out.
function oneEach(roles) {
  const taken = new Set();
  return roles.map((role) => {
    if (role === 'skip') return role;
    if (taken.has(role) || (role === 'name' && (taken.has('first') || taken.has('last'))) || (['first', 'last'].includes(role) && taken.has('name'))) return 'skip';
    taken.add(role);
    return role;
  });
}

/** Roles a person chose, one a column, as the page sends them ({ 0: 'name', 1: 'section' } or a list); null when they don't fit these columns. */
function chosenRoles(columns, width) {
  if (!columns || typeof columns !== 'object') return null;
  const list = Array.isArray(columns) ? columns : Array.from({ length: width }, (_, i) => columns[i]);
  if (list.length !== width || !list.every((role) => COLUMN_ROLES.includes(role))) return null;
  return oneEach(list);
}

/**
 * A pasted class list, read and checked before anything changes. What each column holds comes from a row of headings
 * when there is one, else from what is in it: a name, a first or a last name, a section, or something to leave out
 * (email addresses, row numbers, student numbers on a course of names). One line with three or more commas between
 * names is a list of names. sections: the course's.
 * options: columns, the roles a person chose instead of these (see chosenRoles), kept while the list's shape is the
 * one they were chosen for (shape, as returned); section, where lines that name none go; ids, the course knows
 * learners by a student ID, which is then what each line's name is.
 * Returns its lines ({ name, section, row }), whether its first row was headings, whether names written "Last, First"
 * were turned, its shape, which sections it names that the course hasn't got, and its columns ({ role, heading, samples }).
 */
export function readClassLines(text, sections, { columns = null, shape = null, section = '', ids = false } = {}) {
  // Lines aren't trimmed: a tab at the start is an empty first cell, and each cell is trimmed on its own.
  const typed = String(text ?? '').replace(/^\uFEFF/, '').split(/\r\n?|\n/).filter((line) => line.trim());
  let rows = typed.map(cellsOf);
  // One typed line of names between commas: "Ada Lovelace, Alan Turing" is two people; "Ada Lovelace, Period 2" is one in a section.
  const between = rows.length === 1 && !typed[0].includes('\t') ? rows[0].map((cell) => cleanEntry(cell)).filter(Boolean) : [];
  if (between.length >= 3 || (between.length === 2 && between.every((cell) => /\s/.test(cell) && !SECTION_WORDS.test(cell)))) rows = between.map((cell) => [cell]);
  if (!rows.length) throw refused('Paste or type at least one name.');
  const width = Math.max(...rows.map((cells) => cells.length));
  const headings = rows.length > 1 || width > 1 ? headingRoles(rows[0], ids) : null;
  const body = headings ? rows.slice(1) : rows;
  if (!body.length) throw refused('That is only a row of headings. Paste the names under it too.');
  if (body.length > PEOPLE_LIMITS.pasted) throw refused(`Add at most ${PEOPLE_LIMITS.pasted} people at a time.`);
  const guessed = headings || guessRoles(body, width, ids, !typed.some((line) => line.includes('\t')));
  // A choice made for one list holds while it is edited, not for another of a different shape pasted over it.
  const roles = ((shape == null || shape === guessed.join(' ')) && chosenRoles(columns, width)) || guessed;
  const at = (cells, role) => { const i = roles.indexOf(role); return i < 0 ? '' : cleanEntry(cells[i]); };
  const everyone = cleanEntry(section).slice(0, PEOPLE_LIMITS.sectionName);
  // A school's export often writes each name "Lovelace, Ada" in one column: when every one is, they read as Ada Lovelace.
  const names = body.map((cells) => (roles.includes('name') ? at(cells, 'name') : [at(cells, 'first'), at(cells, 'last')].filter(Boolean).join(' ')).replace(LIST_MARK, ''));
  const turned = roles.includes('name') && names.some(Boolean) && names.every((name) => !name || LAST_FIRST.test(name));
  // Under a heading such as Period, a bare 2 is Period 2.
  const sectionHeading = headings ? cleanEntry(rows[0][roles.indexOf('section')]).replace(/s$/i, '') : '';
  const sectionOf = (given) => (given && sectionHeading && SHORT_CODE.test(given) ? `${sectionHeading} ${given}` : given);
  const lines = body.map((cells, index) => ({
    name: cleanEntry(turned ? names[index].replace(LAST_FIRST, '$2 $1') : names[index]),
    section: (sectionOf(at(cells, 'section')) || everyone).slice(0, PEOPLE_LIMITS.sectionName),
    row: index + 1 + (headings ? 1 : 0)
  }));
  const named = [];
  for (const { section: given } of lines) if (given && !named.some((name) => name.toLowerCase() === given.toLowerCase())) named.push(given);
  const fresh = named.filter((name) => !sectionNamed(sections, name));
  if (sections.length + fresh.length > PEOPLE_LIMITS.sections) throw refused(`A course has at most ${PEOPLE_LIMITS.sections} sections.`);
  return {
    lines,
    headed: Boolean(headings),
    turned,
    shape: guessed.join(' '),
    fresh,
    columns: roles.map((role, i) => ({ role, heading: headings ? cleanEntry(rows[0][i]) : '', samples: body.map((cells) => cleanEntry(cells[i])).filter(Boolean).slice(0, 3) }))
  };
}

async function addLinesNow(store, code, text, options) {
  let sections = await sectionsOf(store, code);
  const { lines, headed, turned, fresh, columns } = readClassLines(text, sections, options);
  for (const name of fresh) sections = (await addSectionNow(store, code, { name })).sections;
  const report = { added: [], moved: [], already: [], too_long: 0, no_name: 0, sections: fresh, headed, turned, columns };
  const seen = new Set();
  for (const line of lines) {
    if (!line.name) { report.no_name += 1; continue; }
    if (line.name.length > PEOPLE_LIMITS.name) { report.too_long += 1; continue; }
    // A name twice in one list is one person, where the first line puts them, as the preview said.
    if (seen.has(line.name.toLowerCase())) { report.already.push(line.name); continue; }
    seen.add(line.name.toLowerCase());
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
