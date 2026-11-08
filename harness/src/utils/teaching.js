// How the AI helps in an activity (product map, section 3): the teacher's goal, a standard from
// Learning Commons or a durable skill (kept as it was when chosen), how far the AI may go, and what
// the teacher wants to hear about, misconceptions to listen for (Eedi's, chosen by the teacher), guidance
// from others' research (a context component's items, chosen and kept), and for a section, its own help level and a note. Part of the activity's version. It reaches the agent
// as an instruction with what the learner has open; steps and an activity without the AI are what
// the server enforces. Not per learner: a note about a person would go to a model.
import { MISCONCEPTIONS_SOURCE } from './misconceptionsSource.js';

export const TEACHING_LIMITS = { tools_off: 12, tool: 64, goal: 1000, watch: 500, description: 1200, components: 40, prior: 12, attribution: 8, misconceptions: 8, guidance: 20, guidanceText: 600, sections: 60, note: 500, role: 600 };

// What the AI is told at each level, from the least it does for a learner to the most: each does what the one before does, and one thing more
// (ui/parts.js HELP_LADDER says the same to people). At every level it says so when a learner has it.
export const HELP_LEVELS = {
  check_only: 'Only check the learner’s own work: say what is right and which part to look at again. Don’t teach: no hints, no explanations, no answers.',
  ask_first: 'Help only by asking: say what is right, and ask questions that let them find the way themselves, one at a time, built on what they say. When they have it, say so. Don’t give hints, examples or the answer.',
  hint: 'Give hints and guiding questions, one step at a time. When they have it, say so. Don’t give the answer or do the work for them.',
  step_up: 'Start by asking what they think or have tried, and build on it. If they are stuck, give a hint, one step at a time. If they have really tried and are still stuck, show a worked example with different numbers or a similar case, then send them back to their own. When they have it, say so. Don’t give the answer to their own question.',
  explain: 'When they are stuck, explain the idea and show a worked example, then let them try a similar one themselves. When they have it, say so.'
};

// When the AI writes first, without being asked (speakUp.js). Each moment only where set: quiet (nothing done on a step for
// minutes), alone (working, without writing to the AI, for minutes), wrong (an answer wrong, after tries), right (every so many
// right answers), writing (about so many new words, at a pause; how far the note goes and what it is about), handed_in (the
// same two). say: what the AI does then, in the teacher's words, in place of the move's own. most: times in a step each day;
// gap: minutes between two. The server holds to both, so a page can't ask for more.
export const SPEAK_UP_LIMITS = { minutes: [1, 60], after: [1, 5], every: [1, 5], words: [50, 1000], most: [1, 10], gap: [1, 30], say: 300, defaultMost: 2, defaultGap: 3 };
const WRITING_HOW = ['ask', 'point', 'fix'];
const WRITING_FOCUS = ['language', 'ideas', 'rubric'];
const within = (value, [low, high]) => Number.isInteger(value) && value >= low && value <= high;
function speaksUpOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const say = (entry) => { const words = text(entry?.say, SPEAK_UP_LIMITS.say); return words ? { say: words } : {}; };
  const onWriting = (entry) => ({ ...(WRITING_HOW.includes(entry?.how) ? { how: entry.how } : {}), ...(WRITING_FOCUS.includes(entry?.focus) ? { focus: entry.focus } : {}) });
  const set = {};
  if (within(value.quiet?.minutes, SPEAK_UP_LIMITS.minutes)) set.quiet = { minutes: value.quiet.minutes, ...say(value.quiet) };
  if (within(value.alone?.minutes, SPEAK_UP_LIMITS.minutes)) set.alone = { minutes: value.alone.minutes, ...say(value.alone) };
  if (within(value.wrong?.after, SPEAK_UP_LIMITS.after)) set.wrong = { after: value.wrong.after, ...say(value.wrong) };
  if (within(value.right?.every, SPEAK_UP_LIMITS.every)) set.right = { every: value.right.every, ...say(value.right) };
  if (within(value.writing?.words, SPEAK_UP_LIMITS.words)) set.writing = { words: value.writing.words, ...onWriting(value.writing), ...say(value.writing) };
  // Handed in was a yes before it had settings of its own.
  if (value.handed_in === true || (value.handed_in && typeof value.handed_in === 'object')) set.handed_in = value.handed_in === true ? {} : { ...onWriting(value.handed_in), ...say(value.handed_in) };
  if (!Object.keys(set).length) return null;
  return { ...set, most: within(value.most, SPEAK_UP_LIMITS.most) ? value.most : SPEAK_UP_LIMITS.defaultMost, gap: within(value.gap, SPEAK_UP_LIMITS.gap) ? value.gap : SPEAK_UP_LIMITS.defaultGap };
}

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

// A section's own help level, note and moments the AI writes first at ({ [section_id]: { help, note, speaks_up } },
// speaks_up 'off' for never), merged over the activity's on a course run (teachingContext, teachingWith).
function sectionsOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [id, entry] of Object.entries(value).slice(0, TEACHING_LIMITS.sections)) {
    const help = Object.hasOwn(HELP_LEVELS, entry?.help) ? entry.help : null;
    const note = text(entry?.note, TEACHING_LIMITS.note);
    const speaks = entry?.speaks_up === 'off' ? 'off' : speaksUpOf(entry?.speaks_up);
    if (SECTION.test(id) && (help || note || speaks)) out[id] = { help, note: note || null, ...(speaks ? { speaks_up: speaks } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * A way the AI helps, laid over an activity's own: how much it does (help) and when it writes first (speaks_up, or 'off'
 * for never), each only where set. A section's own settings are one; a study's ways are others (a condition's rule names
 * one). Null when it changes nothing.
 */
export function wayOf(value) {
  if (!value || typeof value !== 'object') return null;
  const help = Object.hasOwn(HELP_LEVELS, value.help) ? value.help : null;
  const speaks = value.speaks_up === 'off' ? 'off' : speaksUpOf(value.speaks_up);
  return help || speaks ? { help, speaks_up: speaks } : null;
}

/** An activity's settings with a way over them (wayOf): its help level and moments in place of the activity's. */
export function teachingWith(teaching, way) {
  const over = wayOf(way);
  if (!over) return teachingSettings(teaching);
  const { speaks_up: _speaks, ...own } = teachingSettings(teaching) || {};
  const speaks = over.speaks_up === 'off' ? null : over.speaks_up || teachingSettings(teaching)?.speaks_up || null;
  return teachingSettings({ ...own, ...(over.help ? { help: over.help } : {}), ...(speaks ? { speaks_up: speaks } : {}) });
}

/** The settings a learner in a section gets: the section's own moments (and help level) over the activity's. */
export const teachingForSection = (teaching, section) => (section && teachingSettings(teaching)?.sections?.[section] ? teachingWith(teaching, teachingSettings(teaching).sections[section]) : teachingSettings(teaching));

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
  // Who the AI is here, when it plays someone: a skeptic, a beginner to teach, someone in a scene.
  const role = text(value.role, TEACHING_LIMITS.role);
  // Which design from research this activity is built on (designs.js), for the teacher to read: it doesn't go to the AI.
  const design = value.design?.id ? { id: line(value.design.id, 60), label: line(value.design.label, 80) } : null;
  // When the AI writes first, for the page and the server: it doesn't go to the AI either, except as the move of the turn it speaks.
  const speaksUp = speaksUpOf(value.speaks_up);
  // What a reviewer reads (VETTING): only the reply unless the teacher lets it read the learner's message too, and an agent's own setting wins.
  const reviewer = value.reviewer_reads === 'message' ? 'message' : null;
  if (!goal && !help && !watch && !standard && !misconceptions.length && !guidance.length && !sections && !toolsOff.length && !role && !design && !speaksUp && !reviewer) return null;
  // Only when set, so settings saved before them read (and version) the same.
  return { goal: goal || null, help, watch_for: watch || null, standard, ...(role ? { role } : {}), ...(design ? { design } : {}), ...(brief === null ? {} : { turn_brief: brief }), ...(misconceptions.length ? { misconceptions } : {}), ...(guidance.length ? { guidance } : {}), ...(sections ? { sections } : {}), ...(toolsOff.length ? { tools_off: toolsOff } : {}), ...(speaksUp ? { speaks_up: speaksUp } : {}), ...(reviewer ? { reviewer_reads: reviewer } : {}) };
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
  const { watch_for: _watch, sections, turn_brief: _brief, design: _design, speaks_up: _speaksUp, ...own } = saved;
  const theirs = section ? sections?.[section] : null;
  const settings = theirs ? { ...own, help: theirs.help || own.help, ...(theirs.note ? { note: theirs.note } : {}) } : own;
  if (!settings.goal && !settings.help && !settings.standard && !settings.misconceptions && !settings.guidance && !settings.note && !settings.tools_off && !settings.role && !settings.reviewer_reads) return null;
  const lines = ['How the teacher wants you to help in this activity:'];
  if (settings.role) lines.push(`Who you are here: ${settings.role}`);
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
  // Settings that only say what a reviewer reads have no words for the AI.
  return { context: settings, text: lines.length > 1 ? lines.join('\n\n') : '' };
}
