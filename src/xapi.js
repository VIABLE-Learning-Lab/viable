/**
 * One learner's record (schemas/learning-events.schema.json) as xAPI 1.0.3 statements, for a school's
 * learning record store. docs/xapi.md is the profile: verbs, activity types, extensions and what is
 * never sent; schemas/xapi-profile.jsonld is the same as an xAPI Profile, written from VOCABULARY
 * (scripts/build-xapi-profile.mjs). The harness builds the statements; a deployer sends them.
 */
import { createHash } from 'node:crypto';

// The profile's IRI, on the VIABLE Developer Platform, which answers it and every IRI under it with the profile.
export const PROFILE = 'https://developers.viablelab.org/xapi';
export const VERBS = `${PROFILE}/verbs/`;
export const ACTIVITY_TYPES = `${PROFILE}/activity-types/`;
export const EXTENSIONS = `${PROFILE}/extensions/`;
// uuid5(the URL namespace, PROFILE): every statement id is a UUID v5 under it.
export const NAMESPACE = '85904702-c63a-51b6-80a6-6d17f20e12a7';

/**
 * VIABLE's own verbs, activity types and extensions, each with what it means: the profile's concepts.
 * test/xapi.test.js checks they are exactly the ones statements use for what the learning-events
 * schema lists. An embedded page's own verb that ADL lacks, and an app's own fields, are named under
 * VERBS and EXTENSIONS too, and can't be listed.
 */
export const VOCABULARY = {
  verbs: {
    saved: 'Saved a snapshot of their plan or draft: the text as it stood when they paused writing.',
    checked: 'Ticked a criterion of the rubric as met by their writing.',
    unchecked: 'Cleared a rubric criterion they had ticked.',
    highlighted: 'Highlighted a passage on a page of a reading.',
    unhighlighted: 'Removed a highlight from a page of a reading.',
    annotated: 'Wrote a note on a page of a reading.',
    searched: 'Searched a reading.',
    'requested-hint': 'Asked for one of a question’s hints.'
  },
  activityTypes: {
    activity: 'A VIABLE activity: the page a learner works in, with its panels and the AI. Every statement names it as its parent.',
    panel: 'A panel of an activity: writing, questions, a reading, an embedded page or an app.',
    writing: 'A learner’s plan or draft in a writing panel.',
    rubric: 'The rubric of a writing panel.',
    'rubric-criterion': 'One criterion of a writing panel’s rubric, by its index from 0.',
    page: 'A page of a reading (a PDF), by its number.',
    'embedded-object': 'Something inside an embedded page, as the page names it, such as a level.',
    ai: 'The AI in an activity: the agent the learner sends messages to.'
  },
  contextExtensions: {
    session: 'The visit the record comes from, as the record names it.',
    seq: 'The event’s order in its session.',
    conversation_id: 'The conversation the message belongs to.',
    turn_index: 'The message’s place in its conversation, from 1.',
    agent_version: 'The version of the agent that answered.',
    activity_version: 'The version of the activity the learner worked in.',
    vetting: 'VETTING’s outcome for the reply: passed, unverified (it ran out of tries) or attention (a safety concern). VIABLE flags unverified and attention turns for the teacher.',
    vetting_attempts: 'How many times VETTING reviewed a draft of the reply.'
  },
  resultExtensions: {
    visible_ms: 'Milliseconds the panel, page, question or rubric was on screen.',
    active_ms: 'Milliseconds the learner was active there, with gaps between actions capped at 2 minutes.',
    keys: 'Characters typed since the last progress event (text from an input method counts when committed).',
    deleted: 'Characters deleted since the last progress event.',
    pasted: 'Characters pasted since the last progress event.',
    pastes: 'Times the learner pasted since the last progress event.',
    pasted_from_ai: 'Characters pasted from the AI’s replies since the last progress event.',
    pauses: 'Gaps of 2 seconds or more between changes to the text.',
    pause_ms: 'Total milliseconds in those pauses.',
    longest_pause_ms: 'The longest of those pauses, in milliseconds.',
    p_bursts: 'Runs of typing between pauses of 2 seconds or more (P-bursts).',
    r_bursts: 'Bursts in which the writer also deleted text (R-bursts).',
    burst_chars: 'Characters typed in bursts.',
    inside_edits: 'Changes made away from the end of the text, revising what was already written.',
    leading_edits: 'Changes made at the end of the text, as it was written.',
    words: 'Words in the plan or draft.',
    chars: 'Characters: of the plan or draft, a highlighted passage, a note or a search.',
    text: 'The plan or draft as it stood. Sent only when the deployer includes text.',
    criterion: 'The rubric criterion, by its index from 0.',
    checked: 'Whether the criterion is ticked now.',
    page: 'The page’s number in the reading.',
    color: 'The highlight’s color: yellow, green, blue or pink.',
    removed: 'Whether the highlight was removed.',
    results: 'How many matches the search found.',
    changes: 'How often the answer changed before it was sent.',
    index: 'Which of the question’s hints was shown, from 0.',
    hints_available: 'How many hints the question has.',
    set: 'The question set’s id.',
    skill: 'The skill the question practises, or the one the agent graded.',
    prompt: 'The question as it was asked, for a spoken answer. Sent only when the deployer includes text.',
    attempt: 'Which attempt at the question the answer was, from 1.',
    rt_ms: 'Milliseconds from first seeing the question to sending the answer.',
    hints: 'Hints the learner saw before the answer.',
    ai_before: 'Whether the learner asked the AI before the answer.',
    version: 'The version of the question set.',
    item_type: 'The kind of question: single, multiple, fill, cloze, order, short, open, code or spoken.',
    seconds: 'A spoken answer’s length in seconds.',
    asset_id: 'The id of a spoken answer’s recording.',
    content_type: 'The media type of a spoken answer’s recording.',
    kept: 'Whether a spoken answer’s recording is kept.',
    data: 'An embedded page’s own fields: its numbers and true/false values, and its strings only when the deployer includes text.',
    first_output_ms: 'Milliseconds from sending the message to the AI’s answer starting to appear.',
    signals: 'How the message was written (source, think_ms, keys, deleted, pasted and the like), as the research export’s turns.csv has them.',
    after: 'What the learner did with the AI’s answer.',
    message: 'The learner’s message. Sent only when the deployer includes text.',
    reply: 'The AI’s reply. Sent only when the deployer includes text.'
  }
};

const ADL = 'http://adlnet.gov/expapi/verbs/';
// The ADL vocabulary's verbs. Any other verb is VIABLE's own, under VERBS.
const ADL_VERBS = new Set(['answered', 'asked', 'attempted', 'attended', 'commented', 'completed', 'exited', 'experienced', 'failed', 'imported', 'initialized', 'interacted', 'launched', 'mastered', 'passed', 'preferred', 'progressed', 'registered', 'responded', 'resumed', 'scored', 'shared', 'suspended', 'terminated', 'voided']);
const QUESTION = 'http://adlnet.gov/expapi/activities/question';
const OBJECTIVE = 'http://adlnet.gov/expapi/activities/objective';
const own = (name) => `${ACTIVITY_TYPES}${name}`;

/** Event types that make no statement, with why. */
export const SKIPPED = {
  'page.layout': 'How the page is arranged (the AI panel’s width, collapsed or open), not something the learner did in the activity.',
  'embed.state': 'An embedded page’s saved state, for picking up where the learner left off: xAPI keeps that in its State resource, not in statements.'
};

// Strings in data that name something. Any other string may be what someone wrote, so it goes only with includeText.
const NAMES = new Set(['set', 'skill', 'item_type', 'color', 'content_type', 'asset_id', 'source']);
// Event data a statement carries in its verb, object or result instead of as an extension.
const PLACED = new Set(['verb', 'object', 'field', 'correct', 'success', 'completion', 'score', 'max_score', 'duration_ms', 'response']);
// A turn's or event's own fields that go in the context, named as in the research export's turns.csv.
const CONTEXT = ['agent_version', 'activity_version', 'vetting', 'vetting_attempts', 'conversation_id', 'turn_index', 'seq'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const enc = (value) => encodeURIComponent(String(value));
const isObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);
const verbOf = (word) => ({ id: `${ADL_VERBS.has(word) ? ADL : VERBS}${enc(word)}`, display: { 'en-US': word } });
const activity = ([id, type]) => ({ objectType: 'Activity', id, definition: { type } });
const withIris = (fields) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [`${EXTENSIONS}${key}`, value]));
// Drops null fields and empty objects, so a statement has only what the record says.
const clean = (fields) => Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null && !(isObject(value) && !Object.keys(value).length)));

/** JSON with keys sorted and no spaces, as JSON.stringify writes values: the name a statement id is made from. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** A name-based UUID (RFC 4122 version 5: SHA-1 of the namespace's bytes and the name's UTF-8). */
export function uuid5(name, namespace = NAMESPACE) {
  const bytes = createHash('sha1').update(Buffer.from(namespace.replace(/-/g, ''), 'hex')).update(String(name), 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// What a statement keeps of a data object: numbers, true/false, strings that name something (others
// only with includeText) and nested objects the same way. Never a list.
function kept(data, includeText, skip = null) {
  const out = {};
  for (const [key, value] of Object.entries(isObject(data) ? data : {})) {
    if (skip?.has(key) || value == null) continue;
    if (typeof value === 'boolean' || Number.isFinite(value) || (typeof value === 'string' && (includeText || NAMES.has(key)))) out[key] = value;
    else if (isObject(value)) {
      const inner = kept(value, includeText);
      if (Object.keys(inner).length) out[key] = inner;
    }
  }
  return out;
}

// An event's verb and object: [verb word, [activity IRI, activity type]], or null for one that makes no statement.
function placeEvent(event, act) {
  const data = isObject(event.data) ? event.data : {};
  const panel = [`${act}/panels/${enc(event.panel ?? 'app')}`, own('panel')];
  const under = (path, type) => [`${panel[0]}/${path}`, type];
  const question = event.item != null ? under(`items/${enc(event.item)}`, QUESTION) : panel;
  const page = data.page != null ? under(`pages/${enc(data.page)}`, own('page')) : panel;
  const writing = typeof data.field === 'string' ? under(enc(data.field), own('writing')) : panel;
  const rubric = under('rubric', own('rubric'));
  switch (event.type) {
    case 'panel.view': return ['experienced', panel];
    case 'writing.start': return ['attempted', writing];
    case 'writing.progress': return ['progressed', writing];
    case 'writing.snapshot': return ['saved', writing];
    case 'writing.rubric': return ['experienced', rubric];
    case 'writing.rubric_check': return [data.checked === false ? 'unchecked' : 'checked', data.criterion != null ? under(`rubric/criteria/${enc(data.criterion)}`, own('rubric-criterion')) : rubric];
    case 'writing.submit': return ['completed', panel];
    case 'embed.event': return [typeof data.verb === 'string' && data.verb ? data.verb : 'interacted', typeof data.object === 'string' && data.object ? under(`objects/${enc(data.object)}`, own('embedded-object')) : panel];
    case 'reading.page': return ['experienced', page];
    case 'reading.highlight': return [data.removed === true ? 'unhighlighted' : 'highlighted', page];
    case 'reading.note': return ['annotated', page];
    case 'reading.search': return ['searched', panel];
    case 'questions.view': return ['experienced', question];
    case 'questions.hint': return ['requested-hint', question];
    case 'questions.answer': return ['answered', question];
    case 'app.event': return ['interacted', panel];
    default: return null;
  }
}

function eventResult(event, includeText) {
  const data = isObject(event.data) ? event.data : {};
  const score = Number.isFinite(data.score) ? data.score : null;
  const max = Number.isFinite(data.max_score) ? data.max_score : null;
  return clean({
    success: typeof data.success === 'boolean' ? data.success : typeof data.correct === 'boolean' ? data.correct : null,
    completion: typeof data.completion === 'boolean' ? data.completion : event.type === 'writing.submit' ? true : null,
    // xAPI wants raw between min and max: a score outside 0..max_score is sent raw alone.
    score: score == null ? null : max > 0 && score >= 0 && score <= max ? { raw: score, min: 0, max, scaled: score / max } : { raw: score },
    duration: Number.isFinite(data.duration_ms) && data.duration_ms >= 0 ? `PT${Math.round(data.duration_ms / 10) / 100}S` : null,
    response: includeText && typeof data.response === 'string' ? data.response : null,
    extensions: withIris(kept(data, includeText, PLACED))
  });
}

function absolute(value, name) {
  try {
    new URL(value);
    return String(value);
  } catch {
    throw new Error(`${name} must be an absolute URL, such as https://school.example.org.`);
  }
}

/**
 * The record's events and turns as xAPI statements. homePage: the system whose learner ids these are
 * (the actor is an account there, named by the record's pseudonymous user); activityBase: where the
 * activity IRIs start (default homePage); includeText: also send what learners wrote and the AI's
 * replies (default false). Ids are UUID v5 from the learner, the activity, the session and the event,
 * so exporting the same record again gives the same statements.
 */
export function toStatements(record, { homePage, activityBase = homePage, includeText = false } = {}) {
  if (!isObject(record) || !Array.isArray(record.events)) throw new Error('Expected a learning-events record: { user, events, turns }.');
  const user = typeof record.user === 'string' ? record.user.trim() : '';
  if (!user) throw new Error('The record needs the learner’s pseudonymous id (user): every statement names its actor by it.');
  if (EMAIL.test(user)) throw new Error('The record’s user looks like an email address: statements carry a pseudonymous id, never an email.');
  absolute(homePage, 'homePage');
  const base = absolute(activityBase, 'activityBase').replace(/\/+$/, '');
  const act = record.activity ? `${base}/${enc(record.activity)}` : base;
  const actor = { objectType: 'Agent', account: { homePage, name: user } };
  const parent = activity([act, own('activity')]);
  const scope = [homePage, user, record.activity ?? null, record.session ?? null];

  const statement = (source, key, word, object, result, at) => {
    const context = clean({ ...Object.fromEntries(CONTEXT.filter((name) => source[name] != null && typeof source[name] !== 'object').map((name) => [name, source[name]])), session: record.session ?? null });
    return clean({
      id: uuid5(canonical([...scope, key])),
      actor,
      verb: verbOf(word),
      object: activity(object),
      result,
      context: clean({ contextActivities: { parent: [parent] }, extensions: withIris(context) }),
      timestamp: timestamp(at)
    });
  };

  const statements = [];
  for (const event of record.events) {
    const placed = isObject(event) ? placeEvent(event, act) : null;
    if (placed) statements.push(statement(event, { event }, placed[0], placed[1], eventResult(event, includeText), event.at));
  }
  for (const turn of Array.isArray(record.turns) ? record.turns : []) {
    if (!isObject(turn)) continue;
    const said = kept({ first_output_ms: turn.first_output_ms, signals: turn.signals, after: turn.after, message: turn.message, reply: turn.reply }, includeText);
    statements.push(statement(turn, { turn }, 'asked', [`${act}/ai`, own('ai')], clean({ extensions: withIris(said) }), turn.started_at));
    // Answers the agent graded (its Reply step's data.assessment), one statement each.
    [].concat(turn.assessment ?? []).forEach((graded, index) => {
      if (!isObject(graded) || typeof graded.skill !== 'string' || !graded.skill || typeof graded.correct !== 'boolean') return;
      const object = graded.item ? [`${act}/items/${enc(graded.item)}`, QUESTION] : [`${act}/skills/${enc(graded.skill)}`, OBJECTIVE];
      statements.push(statement(turn, { turn, assessment: index }, 'answered', object, { success: graded.correct, extensions: withIris({ skill: graded.skill }) }, turn.started_at));
    });
  }
  // Two identical events are one statement: an LRS refuses a batch that repeats an id.
  const seen = new Set();
  return statements.filter((item) => !seen.has(item.id) && seen.add(item.id));
}
