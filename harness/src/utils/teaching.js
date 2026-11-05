// How the AI helps in an activity (product map, section 3): the teacher's goal, a standard from
// Learning Commons or a durable skill (kept as it was when chosen), how far the AI may go, and what
// the teacher wants to hear about, misconceptions to listen for (Eedi's, chosen by the teacher), guidance
// from others' research (a context component's items, chosen and kept), and for a section, its own help level and a note. Part of the activity's version. It reaches the agent
// as an instruction with what the learner has open; steps and an activity without the AI are what
// the server enforces. Not per learner: a note about a person would go to a model.
import { MISCONCEPTIONS_SOURCE } from './misconceptionsSource.js';

export const TEACHING_LIMITS = { tools_off: 12, tool: 64, goal: 1000, watch: 500, description: 1200, components: 40, prior: 12, attribution: 8, misconceptions: 8, guidance: 20, guidanceText: 600, sections: 60, note: 500 };

export const HELP_LEVELS = {
  ask_first: 'Before helping, ask what the learner thinks or has tried, and build on their answer. Don’t give the answer.',
  hint: 'Give hints and guiding questions, one step at a time. Don’t give the answer or do the work for them.',
  explain: 'When they are stuck, explain the idea and show a worked example, then let them try a similar one themselves.',
  check_only: 'Only check the learner’s own work: say what is right and what to look at again. Don’t explain new ideas or give answers.'
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECTION = /^sec_[A-Za-z0-9_-]{1,64}$/;
const GRADES = ['PK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const text = (value, max) => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const line = (value, max) => text(value, max).replace(/\s+/g, ' ');
const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

function standardOf(value) {
  if (!value || typeof value !== 'object' || !UUID.test(String(value.uuid || ''))) return null;
  const description = text(value.description, TEACHING_LIMITS.description);
  if (!description) return null;
  const source = value.source && typeof value.source === 'object' ? value.source : {};
  const skill = value.kind === 'skill';
  const level = skill && Number.isInteger(value.level?.number) && value.level.number >= 1 && value.level.number <= 4 ? { number: value.level.number, name: line(value.level.name, 20) } : null;
  return {
    // A K-12 standard, or a durable skill at the level learners work toward (standards.js).
    kind: skill ? 'skill' : 'standard',
    ...(skill ? { level } : {}),
    uuid: String(value.uuid).toLowerCase(),
    code: line(value.code, 60),
    description,
    jurisdiction: line(value.jurisdiction, 60),
    subject: line(value.subject, 60),
    grades: list(value.grades, GRADES.length).map(String).filter((grade) => GRADES.includes(grade)),
    learning_components: list(value.learning_components, TEACHING_LIMITS.components)
      .map((item) => ({ id: line(item?.id, 64), description: text(item?.description, 600) }))
      .filter((item) => item.id && item.description),
    prior: list(value.prior, TEACHING_LIMITS.prior)
      .map((item) => ({ uuid: UUID.test(String(item?.uuid || '')) ? String(item.uuid).toLowerCase() : '', code: line(item?.code, 60), description: text(item?.description, 600) }))
      .filter((item) => item.uuid && item.description),
    source: {
      name: line(source.name, 80) || 'Learning Commons Knowledge Graph',
      license: line(source.license, 120),
      attribution: list(source.attribution, TEACHING_LIMITS.attribution).map((item) => text(item, 600)).filter(Boolean),
      modified: line(source.modified, 20) || null,
      retrieved_at: line(source.retrieved_at, 40) || null
    }
  };
}

// Misconceptions the teacher chose (standards.js searchMisconceptions), each kept as it was then with
// the construct it hinders and its attribution (CC BY 4.0).
function misconceptionsOf(value) {
  const seen = new Set();
  return list(value, TEACHING_LIMITS.misconceptions).map((item) => {
    const id = String(item?.id || '').toLowerCase();
    const construct = item?.construct && typeof item.construct === 'object' ? item.construct : {};
    const description = text(item?.description, 600);
    const hinders = text(construct.description, 600);
    if (!UUID.test(id) || !UUID.test(String(construct.id || '')) || !description || !hinders || seen.has(id)) return null;
    seen.add(id);
    const source = item.source && typeof item.source === 'object' ? item.source : {};
    const attribution = list(source.attribution, TEACHING_LIMITS.attribution).map((entry) => text(entry, 600)).filter(Boolean);
    const named = line(source.name, 80);
    return {
      id, description, construct: { id: String(construct.id).toLowerCase(), description: hinders },
      source: {
        name: named || MISCONCEPTIONS_SOURCE.name,
        license: line(source.license, 120) || MISCONCEPTIONS_SOURCE.license,
        attribution: attribution.length ? attribution : [MISCONCEPTIONS_SOURCE.attribution],
        // The release's date goes with its name when the item names no source of its own.
        modified: line(source.modified, 20) || (named ? null : MISCONCEPTIONS_SOURCE.modified)
      }
    };
  }).filter(Boolean);
}

// The moments a turn's brief reads (brief.js), which a piece of guidance can be for.
const MOMENTS = ['attempt', 'asks_answer', 'stuck', 'repeated'];

// Guidance chosen from others' research (a context component's items, guidanceFrom), each kept as it was then
// with what it is for and where it came from, as a standard is, so a version says what the AI was given.
function guidanceOf(value) {
  const seen = new Set();
  return list(value, TEACHING_LIMITS.guidance).map((item) => {
    const said = text(item?.text, TEACHING_LIMITS.guidanceText);
    if (!said || seen.has(said)) return null;
    seen.add(said);
    const when = list(item.when, MOMENTS.length).filter((moment) => MOMENTS.includes(moment));
    const about = line(item.about, 200);
    const component = line(item.component, 120);
    const source = line(item.source, 160);
    const attribution = text(item.attribution, 600);
    return { text: said, ...(when.length ? { when } : {}), ...(about ? { about } : {}), ...(component ? { component } : {}), ...(source ? { source } : {}), ...(attribution ? { attribution } : {}) };
  }).filter(Boolean);
}

// A section's own help level and note ({ [section_id]: { help, note } }), merged over the activity's
// on a course run (teachingContext).
function sectionsOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [id, entry] of Object.entries(value).slice(0, TEACHING_LIMITS.sections)) {
    const help = Object.hasOwn(HELP_LEVELS, entry?.help) ? entry.help : null;
    const note = text(entry?.note, TEACHING_LIMITS.note);
    if (SECTION.test(id) && (help || note)) out[id] = { help, note: note || null };
  }
  return Object.keys(out).length ? out : null;
}

/** How the teacher's instructions are introduced to a model, wherever they reach one. */
export const teacherNote = (text) => `From the teacher of this activity:\n${text}`;

/** An activity's teaching settings as saved, or null when it says nothing. */
export function teachingSettings(value) {
  if (!value || typeof value !== 'object') return null;
  const goal = text(value.goal, TEACHING_LIMITS.goal);
  const help = Object.hasOwn(HELP_LEVELS, value.help) ? value.help : null;
  const watch = text(value.watch_for, TEACHING_LIMITS.watch);
  const standard = standardOf(value.standard);
  const misconceptions = misconceptionsOf(value.misconceptions);
  const guidance = guidanceOf(value.guidance);
  const sections = sectionsOf(value.sections);
  const toolsOff = [...new Set(list(value.tools_off, TEACHING_LIMITS.tools_off).map((name) => line(name, TEACHING_LIMITS.tool)).filter(Boolean))];
  const brief = typeof value.turn_brief === 'boolean' ? value.turn_brief : null;
  if (!goal && !help && !watch && !standard && !misconceptions.length && !guidance.length && !sections && !toolsOff.length) return null;
  // Only when set, so settings saved before them read (and version) the same.
  return { goal: goal || null, help, watch_for: watch || null, standard, ...(brief === null ? {} : { turn_brief: brief }), ...(misconceptions.length ? { misconceptions } : {}), ...(guidance.length ? { guidance } : {}), ...(sections ? { sections } : {}), ...(toolsOff.length ? { tools_off: toolsOff } : {}) };
}

/**
 * What the agent is given: the settings as context (`{{context.workspace.teaching}}`) and a short
 * paragraph for its prompt. What the teacher wants to hear about is for the teacher, not the AI.
 * section: the learner's section, whose own help level and note (teaching.sections) apply over the
 * activity's; other sections' are never given.
 */
export function teachingContext(teaching, section = null) {
  const saved = teachingSettings(teaching);
  if (!saved) return null;
  const { watch_for: _watch, sections, turn_brief: _brief, ...own } = saved;
  const theirs = section ? sections?.[section] : null;
  const settings = theirs ? { ...own, help: theirs.help || own.help, ...(theirs.note ? { note: theirs.note } : {}) } : own;
  if (!settings.goal && !settings.help && !settings.standard && !settings.misconceptions && !settings.guidance && !settings.note && !settings.tools_off) return null;
  const lines = ['How the teacher wants you to help in this activity:'];
  if (settings.goal) lines.push(`Goal: ${settings.goal}`);
  const standard = settings.standard;
  if (standard?.kind === 'skill') {
    lines.push(`Skill: ${standard.code ? `${standard.code} ` : ''}(${[standard.source.name, standard.level ? `level ${standard.level.name}` : ''].filter(Boolean).join(', ')}) ${standard.description}`);
    if (standard.learning_components.length) lines.push(`At this level, the learner:\n${standard.learning_components.map((item) => `- ${item.description}`).join('\n')}`);
    if (standard.prior.length) lines.push(`The level before, to go back to when the learner needs it:\n${standard.prior.map((item) => `- ${item.description}`).join('\n')}`);
  } else if (standard) {
    const where = [standard.jurisdiction, standard.grades.length ? `grade ${standard.grades.join(', ')}` : ''].filter(Boolean).join(', ');
    lines.push(`Standard: ${standard.code ? `${standard.code} ` : ''}${where ? `(${where}) ` : ''}${standard.description}`);
    if (standard.learning_components.length) lines.push(`It breaks into:\n${standard.learning_components.map((item) => `- ${item.description}`).join('\n')}`);
    if (standard.prior.length) lines.push(`Standards before it, to go back to when the learner needs them:\n${standard.prior.map((item) => `- ${item.code ? `${item.code}: ` : ''}${item.description}`).join('\n')}`);
  }
  if (settings.misconceptions) lines.push(`Common misconceptions to listen for:\n${settings.misconceptions.map((item) => `- ${item.description}`).join('\n')}`);
  if (settings.guidance) lines.push(`Guidance from research, to use where it fits:\n${settings.guidance.map((item) => `- ${item.text}${item.source ? ` (${item.source})` : ''}`).join('\n')}`);
  if (settings.help) lines.push(`How far to go: ${HELP_LEVELS[settings.help]}`);
  if (settings.note) lines.push(`The teacher’s extra note for this group: ${settings.note}`);
  if (settings.tools_off) lines.push(`Don’t use these here: ${settings.tools_off.join(', ')}.`);
  return { context: settings, text: lines.join('\n\n') };
}
