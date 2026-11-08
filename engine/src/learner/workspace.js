/**
 * A learning page's workspace: panels beside the AI (or instead of it), and what learners do in them.
 * What a host keeps (events, drafts) it keeps its own way; here is what they are and what the AI sees.
 *
 *   settings.workspace = { ai, title, layout, panels }  ai: where the AI sits (right, left, corner) or
 *   off, for a condition without AI. title: the workspace's name in its bar. layout: the AI's share of
 *   the width and whether learners may resize or hide it. panels: up to six, shown as tabs, each one of:
 *   - writing: a prompt, an optional plan area, a rubric, word limits; the draft follows the learner
 *     across devices, and how it was written is recorded as process measures;
 *   - embed: a page of the author's (a simulation, a game, a tool) in a sandboxed frame, which can
 *     report what happens in it through the page's bridge (window.postMessage);
 *   - questions: a question set (questions.js), one question at a time, graded on the server with
 *     feedback as the panel says; each graded answer is also a learning attempt (mastery, pyBKT);
 *   - reading: a PDF from the project's knowledge bases, read page by page, with the learner's
 *     highlights and notes and the time on each page.
 *
 * Events are what happened, as the page saw it, sanitized per kind below: never
 * keystrokes, only counts and timings, and text only where the learner wrote it on purpose (a draft
 * snapshot, an answer). What the AI is shown of each panel (ai_sees: a preset, or custom with
 * context's own choices; context also says how much of a draft and how many earlier versions) is
 * rendered here into the run's context: context.workspace for any step's templates, and a description
 * the agent's steps read; where it enters the prompt and which steps it reaches are the agent's own
 * (settings.js profileSettings). Answer keys are never part of what the AI is shown.
 */
import { gradeResponse, keyText, publicItem, questionText } from './questions.js';
import { teachingContext } from '../../../harness/src/utils/teaching.js';

const agentError = (message, status = 400, code = 'agent_error') => Object.assign(new Error(message), { status, code });

export const WORKSPACE_LIMITS = Object.freeze({ steps: 6, panels: 8, page: 12000, says: 800, brief: 1500, title: 60, workspaceTitle: 80, prompt: 4000, rubric: 12, criterion: 120, description: 600, planLabel: 80, planTemplate: 4000, url: 2000, words: 20000, events: 100, snapshot: 20000, viewChars: 6000, starters: 4, starter: 160, versions: 5 });
export const AI_PLACES = ['right', 'left', 'corner', 'off'];
export const PANEL_TYPES = ['writing', 'embed', 'questions', 'reading', 'page'];

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const line = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Multi-line text keeps its paragraphs.
const block = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const whole = (value, min, max) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) && n >= min ? Math.min(n, max) : null; };
const within = (value, min, max, fallback) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const PANEL_ID = /^[a-z0-9][a-z0-9_-]{0,23}$/;

function embedUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return null;
    return url.href.slice(0, WORKSPACE_LIMITS.url);
  } catch { return null; }
}

// What the AI is shown of a panel. ai_sees names a preset of what it reads, or custom for context's
// own choices; the rest of context (how much of a draft, earlier versions) applies to any preset.
const CONTEXT = {
  writing: {
    presets: { all: { task: true, rubric: true, plan: true, draft: 'full' }, prompt: { task: true, rubric: true, plan: false, draft: 'none' }, nothing: { task: false, rubric: false, plan: false, draft: 'none' } },
    // draft: all of it (the start and end when it is longer than max_chars), its end (where they are
    // writing), or none. versions: the latest saved snapshots before this one, whole or as changes.
    custom: (input, base) => ({ task: flag(input.task, base.task), rubric: flag(input.rubric, base.rubric), plan: flag(input.plan, base.plan), draft: pick(input.draft, ['full', 'end', 'none'], base.draft) }),
    extra: (input) => ({ max_chars: within(input.max_chars, 500, 12000, 6000), versions: within(input.versions, 0, WORKSPACE_LIMITS.versions, 0), versions_as: pick(input.versions_as, ['changes', 'full'], 'changes') })
  },
  questions: {
    presets: { question: { question: true, answer: true, attempts: true, hints: true }, nothing: { question: false, answer: false, attempts: false, hints: false } },
    custom: (input, base) => ({ question: flag(input.question, base.question), answer: flag(input.answer, base.answer), attempts: flag(input.attempts, base.attempts), hints: flag(input.hints, base.hints) }),
    extra: () => ({})
  },
  embed: {
    presets: { events: { events: 10, state: true }, nothing: { events: 0, state: false } },
    custom: (input, base) => ({ events: within(input.events, 0, 20, base.events), state: flag(input.state, base.state) }),
    extra: () => ({})
  },
  // The page in view (its text), what the learner selects, their highlights there, or the whole
  // document (its start and end when longer than max_chars).
  reading: {
    presets: { page: { page: true, selection: true, highlights: true, document: false }, selection: { page: false, selection: true, highlights: false, document: false }, document: { page: true, selection: true, highlights: true, document: true }, nothing: { page: false, selection: false, highlights: false, document: false } },
    custom: (input, base) => ({ page: flag(input.page, base.page), selection: flag(input.selection, base.selection), highlights: flag(input.highlights, base.highlights), document: flag(input.document, base.document) }),
    extra: (input) => ({ max_chars: within(input.max_chars, 1000, 24000, 8000) })
  },
  // What the teacher wrote on a page, which learners have in front of them.
  page: {
    presets: { page: { text: true }, nothing: { text: false } },
    custom: (input, base) => ({ text: flag(input.text, base.text) }),
    extra: () => ({})
  }
};
function panelContext(type, input) {
  const spec = CONTEXT[type];
  const presets = Object.keys(spec.presets);
  const sees = pick(input.ai_sees, [...presets, 'custom'], presets[0]);
  const raw = input.context && typeof input.context === 'object' ? input.context : {};
  const content = sees === 'custom' ? spec.custom(raw, spec.presets[presets[0]]) : { ...spec.presets[sees] };
  return { ai_sees: sees, context: { ...content, ...spec.extra(raw) } };
}

const PANELS = {
  // A page the teacher wrote, in Markdown: the case, the task, what to read before talking to the AI.
  page: (input) => ({ text: block(input.text, WORKSPACE_LIMITS.page) }),
  writing: (input) => ({
    prompt: block(input.prompt, WORKSPACE_LIMITS.prompt),
    // On with true, or an object (as stored) unless it says on: false. template: what the plan area
    // starts with (an outline to fill in).
    plan: input.plan === true || (input.plan && typeof input.plan === 'object' && input.plan.on !== false) ? { label: line(input.plan?.label, WORKSPACE_LIMITS.planLabel) || 'Plan', template: block(input.plan?.template, WORKSPACE_LIMITS.planTemplate) } : null,
    rubric: (Array.isArray(input.rubric) ? input.rubric : []).slice(0, WORKSPACE_LIMITS.rubric)
      .map((row) => ({ criterion: line(row?.criterion, WORKSPACE_LIMITS.criterion), description: block(row?.description, WORKSPACE_LIMITS.description) }))
      .filter((row) => row.criterion),
    // Learners may tick off the rubric's criteria as they check their own work (recorded).
    self_check: input.self_check === true,
    min_words: whole(input.min_words, 1, WORKSPACE_LIMITS.words),
    max_words: whole(input.max_words, 1, WORKSPACE_LIMITS.words),
    submit: input.submit !== false,
    // Handed in once: read-only afterwards (a test of writing, a final draft).
    lock_on_submit: input.submit !== false && input.lock_on_submit === true
  }),
  embed: (input) => {
    const url = embedUrl(input.url);
    if (!url) throw agentError('An embedded page needs an https address.', 400, 'invalid_workspace');
    // The page says when the learner is done (a completed event through the bridge), which counts
    // toward the activity being done. Kept only when on, so settings saved before it read the same.
    return { url, ...(input.completes === true ? { completes: true } : {}) };
  },
  // The document: a PDF in one of the project's knowledge bases (checked when the activity is saved).
  reading: (input) => {
    const doc = input.document && typeof input.document === 'object' ? input.document : {};
    if (!/^kb_[A-Za-z0-9_-]{6,64}$/.test(String(doc.knowledge_base_id || '')) || !/^kd_[A-Za-z0-9_-]{6,64}$/.test(String(doc.document_id || ''))) throw agentError('Choose the PDF for a reading panel.', 400, 'invalid_workspace');
    return {
      document: { knowledge_base_id: String(doc.knowledge_base_id), document_id: String(doc.document_id), title: line(doc.title, WORKSPACE_LIMITS.title) || null },
      // Learners may highlight passages and write notes on them.
      highlights: input.highlights !== false,
      notes: input.notes !== false,
      start_page: whole(input.start_page, 1, 100000) || 1
    };
  },
  questions: (input) => {
    if (!/^qs_[a-f0-9]{24}$/.test(String(input.set_id || ''))) throw agentError('Choose the question set for a questions panel.', 400, 'invalid_workspace');
    // feedback: right or wrong (with the explanation) after each answer, only once all are answered,
    // or never (a test). tries: how many answers a question takes (0: as many as the learner likes).
    const feedback = pick(input.feedback, ['each', 'end', 'none'], 'each');
    const tries = Number.parseInt(input.tries, 10);
    return {
      set_id: String(input.set_id),
      feedback,
      tries: Number.isFinite(tries) ? Math.min(10, Math.max(0, tries)) : feedback === 'each' ? 3 : 1,
      hints: input.hints !== false
    };
  }
};

// Steps (course activities): the panels shown in turn, such as a reading, then its questions. Each
// step has its panels, whether the AI is there and whether its chat goes on or starts afresh; each
// after the first, how learners get to it: when they say they are ready (at the earliest after
// minutes), or on its own after minutes; back: whether the steps before stay open. Every panel is
// in a step. Kept only when there are two or more.
function stepsOf(input, panels) {
  const list = (Array.isArray(input) ? input : []).slice(0, WORKSPACE_LIMITS.steps);
  if (list.length < 2) return null;
  const known = new Set(panels.map((panel) => panel.id));
  const ids = new Set();
  const steps = list.map((raw, i) => {
    const shown = [...new Set((Array.isArray(raw?.panels) ? raw.panels : []).map(String).filter((id) => known.has(id)))];
    if (!shown.length) throw agentError(`Step ${i + 1}: choose the panels it shows.`, 400, 'invalid_workspace');
    let id = PANEL_ID.test(String(raw?.id || '')) ? String(raw.id) : `step-${i + 1}`;
    while (ids.has(id)) id = `step-${i + 1}-${ids.size}`;
    ids.add(id);
    // says: what the AI says first here, which learners see. brief: what it does here, for the AI only. Kept only when set, so steps saved before them read the same.
    const says = block(raw?.says, WORKSPACE_LIMITS.says);
    const brief = block(raw?.brief, WORKSPACE_LIMITS.brief);
    const ai = raw?.ai === 'off' ? 'off' : 'on';
    const step = { id, title: line(raw?.title, WORKSPACE_LIMITS.title) || `Step ${i + 1}`, panels: shown, ai, chat: raw?.chat === 'new' ? 'new' : 'continue', ...(says && ai === 'on' ? { says } : {}), ...(brief && ai === 'on' ? { brief } : {}) };
    if (!i) return step;
    const move = pick(raw?.move, ['ready', 'auto'], 'ready');
    const minutes = within(raw?.minutes, 0, 240, 0);
    if (move === 'auto' && !minutes) throw agentError(`Step ${i + 1}: say after how many minutes it opens.`, 400, 'invalid_workspace');
    return { ...step, move, minutes, back: raw?.back === true };
  });
  const missing = panels.filter((panel) => !steps.some((step) => step.panels.includes(panel.id)));
  if (missing.length) throw agentError(`${missing.map((panel) => panel.title).join(', ')}: put ${missing.length === 1 ? 'it' : 'them'} in a step.`, 400, 'invalid_workspace');
  return steps;
}
/** Whether a panel is open at a step: in it, or in one before it when that step lets learners go back. */
export function panelOpenAt(steps, index, panelId) {
  if (!steps) return true;
  const step = steps[Math.min(Math.max(0, index), steps.length - 1)];
  return step.panels.includes(panelId) || (Boolean(step.back) && steps.slice(0, index).some((earlier) => earlier.panels.includes(panelId)));
}

/** The workspace as stored: panels of known types, bounded, with stable ids. Null without panels. */
export function workspaceSettings(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.panels)) return null;
  if (input.panels.length > WORKSPACE_LIMITS.panels) throw agentError(`A page holds at most ${WORKSPACE_LIMITS.panels} panels.`, 400, 'invalid_workspace');
  const ids = new Set();
  const panels = [];
  for (const raw of input.panels) {
    if (!raw || typeof raw !== 'object' || !PANEL_TYPES.includes(raw.type)) throw agentError(`Each panel needs a type: ${PANEL_TYPES.join(', ')}.`, 400, 'invalid_workspace');
    let id = PANEL_ID.test(String(raw.id || '')) ? String(raw.id) : `${raw.type}-${panels.length + 1}`;
    while (ids.has(id)) id = `${id}-${panels.length + 1}`.slice(0, 24);
    ids.add(id);
    // starters: what the AI pane offers to ask while this panel is open (the page's own otherwise).
    const starters = (Array.isArray(raw.starters) ? raw.starters : []).map((entry) => line(entry, WORKSPACE_LIMITS.starter)).filter(Boolean).slice(0, WORKSPACE_LIMITS.starters);
    panels.push({ id, type: raw.type, title: line(raw.title, WORKSPACE_LIMITS.title) || { writing: 'Writing', embed: 'Activity', questions: 'Questions', reading: 'Reading', page: 'Read this' }[raw.type], ...PANELS[raw.type](raw), ...panelContext(raw.type, raw), starters });
  }
  if (!panels.length) return null;
  // Without panels there is nothing to show beside a hidden AI, so off needs at least one.
  const layout = input.layout && typeof input.layout === 'object' ? input.layout : {};
  return {
    ai: pick(input.ai, AI_PLACES, 'right'),
    title: line(input.title, WORKSPACE_LIMITS.workspaceTitle) || null,
    // ai_width: the AI's share of the window, in percent, beside the panels; corner: left puts the
    // AI's button and panel in the bottom-left corner when it is a corner panel (kept only then, so
    // settings saved before it read the same).
    layout: { ai_width: within(layout.ai_width, 24, 60, 36), resizable: layout.resizable !== false, collapsible: layout.collapsible !== false, ...(layout.corner === 'left' ? { corner: 'left' } : {}) },
    panels,
    ...((() => { const steps = stepsOf(input.steps, panels); return steps ? { steps } : {}; })())
  };
}

/** What the AI says first in an activity without steps, and what it offers to ask. Null when it says nothing, so activities saved before it read the same. */
export function openingSettings(input) {
  if (!input || typeof input !== 'object') return null;
  const says = block(input.says, WORKSPACE_LIMITS.says);
  const starters = (Array.isArray(input.starters) ? input.starters : []).map((entry) => line(entry, WORKSPACE_LIMITS.starter)).filter(Boolean).slice(0, WORKSPACE_LIMITS.starters);
  return says || starters.length ? { says: says || null, starters } : null;
}

/** The question sets a workspace's panels use. */
export const questionSetIds = (workspace) => (workspace?.panels || []).filter((panel) => panel.type === 'questions').map((panel) => panel.set_id);

/**
 * What the page itself gets: every panel as learners see it, a questions panel with its questions
 * but no keys (sets: the panels' question sets). With steps, only
 * the panels open by step `through` are whole; the others are their names (locked), so nothing of a
 * later step (its questions) is in the page before the learner gets there. waiting: all of them are, for a page
 * anyone can open that isn't for everyone: a course that asks who you are, or an activity open to some sections.
 */
export function publicWorkspace(workspace, sets = new Map(), { through = 0, waiting = false } = {}) {
  if (!workspace) return null;
  const steps = workspace.steps || null;
  // waiting: every panel is its name until the server knows who this is and what's open for them.
  const reached = waiting ? new Set() : steps ? new Set(steps.slice(0, through + 1).flatMap((step) => step.panels)) : null;
  return {
    ai: workspace.ai,
    title: workspace.title || null,
    layout: workspace.layout || { ai_width: 36, resizable: true, collapsible: true },
    panels: workspace.panels.map((panel) => (reached && !reached.has(panel.id) ? { id: panel.id, type: panel.type, title: panel.title, locked: true } : {
      ...panel,
      sees: seesParts(panel),
      ...(panel.type === 'questions' ? { items: (sets.get(panel.set_id)?.items || []).map(publicItem) } : {})
    })),
    // What the AI is told to do in a step is the teacher's, as what it is told in How the AI helps is.
    ...(steps ? { steps: steps.map(({ brief: _brief, ...step }) => step) } : {})
  };
}

/** What learners are told the AI sees of a panel, in parts ("the task", "your draft"); none: nothing. */
export function seesParts(panel) {
  const c = panelContextOf(panel);
  if (panel.type === 'writing') {
    return [c.task && panel.prompt && 'the task', c.rubric && panel.rubric?.length && 'the rubric', c.plan && panel.plan && 'your plan', c.draft === 'full' && 'your draft', c.draft === 'end' && 'the end of your draft',
      c.versions && c.draft !== 'none' && (c.versions === 1 ? 'your last saved version' : `your last ${c.versions} saved versions`)].filter(Boolean);
  }
  if (panel.type === 'questions') return [c.question && 'the question you’re on', c.answer && 'your answer so far', c.attempts && 'how your tries went', c.hints && 'the hints you opened'].filter(Boolean);
  if (panel.type === 'embed') return [c.events && 'what you last did in this activity', c.state && 'what it shows now'].filter(Boolean);
  if (panel.type === 'page') return [c.text && 'this page'].filter(Boolean);
  if (panel.type === 'reading') return [c.document ? 'the whole document' : c.page && 'the page you’re on', c.selection && 'what you select', c.highlights && panel.highlights && 'your highlights there'].filter(Boolean);
  return [];
}
// Panels saved before context existed read as their ai_sees preset.
const panelContextOf = (panel) => panel.context || panelContext(panel.type, panel).context;

/** The workspace with the AI shown nothing of any panel. */
export const seeingNothing = (workspace) => workspace && { ...workspace, panels: workspace.panels.map((panel) => ({ ...panel, ...panelContext(panel.type, { ai_sees: 'nothing', context: panel.context }) })) };

/** The sites a page frames: its embeds' origins, for its Content-Security-Policy. */
export const embedOrigins = (workspace) => [...new Set((workspace?.panels || []).filter((panel) => panel.type === 'embed').map((panel) => new URL(panel.url).origin))];

// --- Events ----------------------------------------------------------------------------------------

// Each event kind's fields: ms and count are whole numbers within bounds, number any finite number,
// bool true or false, a list one of its values, text:N a string of at most N characters, word:N a
// short identifier, data a flat object of numbers, booleans and short strings (an embed's own fields).
const FIELDS = {
  'panel.view': { visible_ms: 'ms', active_ms: 'ms' },
  'writing.progress': { field: ['plan', 'draft'], keys: 'count', deleted: 'count', pasted: 'count', pastes: 'count', pasted_from_ai: 'count', pauses: 'count', pause_ms: 'ms', longest_pause_ms: 'ms', p_bursts: 'count', r_bursts: 'count', burst_chars: 'count', inside_edits: 'count', leading_edits: 'count', active_ms: 'ms', visible_ms: 'ms', words: 'count', chars: 'count' },
  'writing.start': { field: ['plan', 'draft'] },
  'writing.snapshot': { field: ['plan', 'draft'], text: `text:${WORKSPACE_LIMITS.snapshot}`, words: 'count' },
  'writing.rubric': { visible_ms: 'ms' },
  // A rubric criterion ticked off (or unticked) as the learner checks their own work.
  'writing.rubric_check': { criterion: 'count', checked: 'bool' },
  // The learner moved the divider or hid or showed the AI (its share of the width, in percent).
  'page.layout': { ai_width: 'count', collapsed: 'bool', ai_open: 'bool' },
  'writing.submit': { words: 'count', chars: 'count' },
  'embed.event': { verb: 'word:40', object: 'text:200', score: 'number', max_score: 'number', success: 'bool', completion: 'bool', response: 'text:500', duration_ms: 'ms', data: 'data' },
  'embed.state': { data: 'data' },
  // Reading: time on each page of the PDF (visible, and active with gaps capped at 2 minutes), a
  // highlight made or removed, a note written, and a search in the document.
  'reading.page': { page: 'count', visible_ms: 'ms', active_ms: 'ms' },
  'reading.highlight': { page: 'count', color: ['yellow', 'green', 'blue', 'pink'], chars: 'count', removed: 'bool' },
  'reading.note': { page: 'count', chars: 'count' },
  'reading.search': { chars: 'count', results: 'count' },
  // A question on screen (item: its id), a hint shown, and a graded answer (recorded by the server).
  'questions.view': { visible_ms: 'ms', active_ms: 'ms', changes: 'count' },
  'questions.hint': { index: 'count', set: 'word:40', skill: 'text:80', hints_available: 'count' },
  'questions.answer': { prompt: 'text:4000', response: 'text:8000', correct: 'bool', score: 'number', attempt: 'count', rt_ms: 'ms', changes: 'count', hints: 'count', ai_before: 'bool', set: 'word:40', version: 'count', item_type: 'word:20', skill: 'text:80', hints_available: 'count', seconds: 'number', asset_id: 'word:64', content_type: 'word:40', kept: 'bool' }
};
// Recorded by the server as it grades and gives hints (never taken from a page's own batch).
const SERVER_ONLY = new Set(['questions.answer', 'questions.hint']);
export const WORKSPACE_EVENTS = Object.freeze(Object.keys(FIELDS));
// What a page records at each data level (a course's data_level): minimal keeps time on each panel
// and question, hand-ins, hints and what activities report; process adds how learners write (counts,
// pauses, snapshots), rubric use and the layout; detailed adds attention measures.
const MINIMAL = new Set(['panel.view', 'writing.submit', 'embed.event', 'embed.state', 'questions.view', 'questions.hint', 'questions.answer', 'reading.page', 'reading.highlight', 'reading.note']);
export const DATA_LEVELS = ['minimal', 'process', 'detailed'];
export const recordedAt = (level, kind) => (level === 'minimal' ? MINIMAL.has(kind) : level === 'process' ? !kind.startsWith('attention.') : true);

function clean(kind, value) {
  if (Array.isArray(kind)) return kind.includes(value) ? value : undefined;
  if (kind === 'ms') return Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(Math.round(Number(value)), 1e8) : undefined;
  if (kind === 'count') return Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(Math.round(Number(value)), 1e7) : undefined;
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (kind === 'bool') return typeof value === 'boolean' ? value : undefined;
  if (kind.startsWith('text:')) return typeof value === 'string' ? value.slice(0, Number(kind.slice(5))) : undefined;
  if (kind.startsWith('word:')) return typeof value === 'string' && new RegExp(`^[A-Za-z0-9_.:/-]{1,${kind.slice(5)}}$`).test(value) ? value : undefined;
  if (kind === 'data') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 20)) {
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(key)) continue;
      if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
      else if (typeof item === 'boolean') out[key] = item;
      else if (typeof item === 'string') out[key] = item.slice(0, 200);
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

// An event's fields as its kind allows them, what it concerns, and when and in what order it happened.
function recorded(fields, event) {
  const data = {};
  for (const [name, kind] of Object.entries(fields)) {
    const value = clean(kind, event?.data?.[name]);
    if (value !== undefined) data[name] = value;
  }
  const at = typeof event?.at === 'string' && !Number.isNaN(Date.parse(event.at)) ? new Date(event.at).toISOString() : null;
  return { item: event?.item == null ? null : String(event.item).slice(0, 80), data, at, seq: Number.isInteger(event?.seq) ? event.seq : null };
}

/** One event as recorded, or null when its panel or kind isn't this page's. */
export function sanitizeEvent(workspace, event) {
  const panel = workspace?.panels.find((item) => item.id === event?.panel);
  if (!panel) return null;
  const type = String(event?.type || '');
  const key = type === 'view' ? 'panel.view' : type === 'layout' ? 'page.layout' : `${panel.type}.${type}`;
  const fields = FIELDS[key];
  if (!fields) return null;
  return { panel: panel.id, panel_type: panel.type, type: key, ...recorded(fields, event) };
}

/**
 * An outside app's event (POST /v1/learning/events), or null for a kind not accepted: the kinds above
 * by their full names (writing.progress), trusted like the server's own since the app sends them from
 * its server, or app.event, the app's own, with a flat data object (as an embed's, data above). An app
 * has no panels: each event is in the app's one panel, of its kind's type (app for the rest).
 */
export const APP_EVENTS = Object.freeze([...WORKSPACE_EVENTS, 'app.event']);
export function sanitizeAppEvent(event) {
  const type = String(event?.type || '');
  if (type === 'app.event') return { panel: 'app', panel_type: 'app', type, ...recorded({}, event), data: clean('data', event?.data) || {} };
  if (!FIELDS[type]) return null;
  const family = type.split('.')[0];
  return { panel: 'app', panel_type: PANEL_TYPES.includes(family) ? family : 'app', type, ...recorded(FIELDS[type], event) };
}

// A page load's (or an app's session's) random id.
export const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
// --- Drafts ----------------------------------------------------------------------------------------

export const wordCount = (value) => (String(value || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

/** A panel's plan and draft as they are kept, and the draft's words. */
export function draftTexts(panel, { plan, draft }) {
  const draftText = String(draft ?? '').replace(/\r\n?/g, '\n').slice(0, WORKSPACE_LIMITS.snapshot);
  return { plan: panel.plan ? block(plan, WORKSPACE_LIMITS.snapshot) : null, draft: draftText, words: wordCount(draftText) };
}

/** A page's batch of events as a host records them: sanitized, as far as the data level allows, and none only a server may write unless trusted. */
export const keptEvents = (workspace, events, { level = 'process', trusted = false } = {}) => (Array.isArray(events) ? events : []).slice(0, WORKSPACE_LIMITS.events)
  .map((event) => sanitizeEvent(workspace, event)).filter((event) => event && recordedAt(level, event.type) && (trusted || !SERVER_ONLY.has(event.type)));

// --- What the AI is shown --------------------------------------------------------------------------

const clip = (value, max) => { const text = String(value || ''); return text.length > max ? `${text.slice(0, max)}…` : text; };
const responseText = (item, response) => {
  if (response == null || response === '') return '';
  const choice = (id) => item.choices?.find((entry) => entry.id === id)?.text || id;
  if (item.type === 'single') return choice(response);
  if (item.type === 'multiple' || item.type === 'order') return (Array.isArray(response) ? response : []).map(choice).join(item.type === 'order' ? ' → ' : '; ');
  if (item.type === 'cloze') return (Array.isArray(response) ? response : []).map((value, i) => `[${i + 1}] ${value}`).join('  ');
  return String(response);
};

// A long draft keeps its start and its end; "end" keeps only where the learner is writing.
const fit = (text, max) => (text.length <= max ? text : `${text.slice(0, Math.floor(max * 0.4))}\n[… ${(text.length - max).toLocaleString('en-US')} characters left out …]\n${text.slice(-Math.ceil(max * 0.6))}`);
const tail = (text, max) => (text.length <= max ? text : `[… the start, ${(text.length - max).toLocaleString('en-US')} characters, left out …]\n${text.slice(-max)}`);
const since = (at, now) => { const min = Math.round((now - Date.parse(at)) / 60000); return Number.isFinite(min) ? (min < 1 ? 'just before' : min < 90 ? `${min} min before` : `${Math.round(min / 60)} h before`) : ''; };

// Sentences (and lines) of a text, for what changed between two versions of a draft.
// Chinese and Japanese end a sentence without a following space.
const sentences = (text) => String(text || '').split(/(?<=[.!?])\s+|(?<=[。！？])|\n+/u).map((part) => part.trim()).filter(Boolean);
/** What was removed from a draft and added to it between two versions, sentence by sentence (longest common subsequence). */
export function sentenceChanges(before, after) {
  const a = sentences(before).slice(0, 400);
  const b = sentences(after).slice(0, 400);
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; } else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]); else added.push(b[j++]);
  }
  return { removed: [...removed, ...a.slice(i)], added: [...added, ...b.slice(j)] };
}

/**
 * A learner's latest saved versions of a draft (or its plan: field) before the one they have open, from
 * their snapshot events, newest first ({ data, at }), without repeats of the current text or of each other.
 */
export function versionsFrom(rows, { limit, current, field = 'draft' }) {
  const seen = new Set([String(current || '').trim()]);
  const out = [];
  for (const { data, at } of rows) {
    const text = typeof data?.text === 'string' ? data.text : '';
    if (data?.field !== field || seen.has(text.trim())) continue;
    seen.add(text.trim());
    out.push({ text, at });
    if (out.length >= limit) break;
  }
  return out;
}

// How a draft (or plan) got to where it is: its earlier saved versions whole, newest first, or each
// step's changes from one version to the next (the newest to what is open now).
function history(field, earlier, text, c, now) {
  if (c.versions_as === 'full') {
    return `Their earlier saved versions of the ${field}, newest first:\n${earlier.map((version) => `--- ${since(version.at, now)} (${wordCount(version.text)} words) ---\n${fit(version.text, Math.floor(c.max_chars / earlier.length))}`).join('\n')}`;
  }
  const chain = [...earlier].reverse().concat([{ text, at: null }]);
  const steps = [];
  for (let k = chain.length - 1; k > 0; k -= 1) {
    const change = sentenceChanges(chain[k - 1].text, chain[k].text);
    const quote = (list) => list.slice(0, 4).map((entry) => `“${clip(entry, 240)}”`).join(' ') + (list.length > 4 ? ` and ${list.length - 4} more` : '');
    const parts = [change.added.length && `added ${quote(change.added)}`, change.removed.length && `removed ${quote(change.removed)}`].filter(Boolean);
    steps.push(`- From the version saved ${since(chain[k - 1].at, now)} to ${chain[k].at ? `the one saved ${since(chain[k].at, now)}` : 'now'}: ${parts.join('; ') || 'small edits within sentences'}.`);
  }
  return `How their ${field} changed recently, newest first:\n${steps.join('\n')}`;
}

/**
 * What the learner has open, for the run that answers their message: context.workspace (the panel and
 * what it holds, for any step's templates) and view, a description of it that the agent's steps read
 * (data, not instructions). Only what the panel's context
 * allows; never answer keys. state: what the page sent with the message (the open panel, a draft's
 * text, an embed's last events); versions and planVersions: the draft's and the plan's earlier saved
 * versions, read by the server (recentVersions), never taken from the page; lastCorrect: whether their last answer to the
 * open question was marked right, from the same kind of record; hintsOpened: how many
 * hints the server has given this learner on the question, the same.
 */
export function workspaceRunContext(workspace, state, sets = new Map(), { versions = [], planVersions = [], hintsOpened = 0, lastCorrect: marked = null, now = Date.now() } = {}) {
  const panel = workspace?.panels.find((item) => item.id === state?.panel) || null;
  if (!panel) return null;
  const c = panelContextOf(panel);
  const base = { panel: { id: panel.id, type: panel.type, title: panel.title }, ai: workspace.ai };
  const done = (context, lines) => ({ context, view: lines.length > 1 ? lines.join('\n\n') : null });
  if (panel.type === 'page') {
    const lines = [`The learner has “${panel.title}” open.`];
    if (c.text && panel.text) lines.push(`It says:\n${clip(panel.text, WORKSPACE_LIMITS.viewChars)}`);
    return done({ ...base, page: c.text ? { text: clip(panel.text, WORKSPACE_LIMITS.viewChars) } : {} }, lines);
  }
  if (panel.type === 'writing') {
    const writing = {};
    const lines = [`The learner is working on the writing task “${panel.title}”.`];
    if (c.task && panel.prompt) { writing.prompt = panel.prompt; lines.push(`Task: ${clip(panel.prompt, 2000)}`); }
    if (c.task && (panel.min_words || panel.max_words)) { Object.assign(writing, { min_words: panel.min_words, max_words: panel.max_words }); lines.push(`Length: ${[panel.min_words && `at least ${panel.min_words}`, panel.max_words && `at most ${panel.max_words}`].filter(Boolean).join(', ')} words.`); }
    if (c.rubric && panel.rubric.length) { writing.rubric = panel.rubric; lines.push(`Rubric:\n${panel.rubric.map((row) => `- ${row.criterion}${row.description ? `: ${clip(row.description, 300)}` : ''}`).join('\n')}`); }
    if (c.plan && panel.plan) {
      writing.plan = clip(state?.plan, 3000);
      lines.push(`Their plan:\n${writing.plan || '(empty)'}`);
      const earlier = (planVersions || []).slice(0, c.versions);
      if (earlier.length) {
        writing.plan_versions = earlier.map((version) => ({ at: version.at, text: fit(version.text, Math.floor(c.max_chars / 4)) }));
        lines.push(history('plan', earlier, String(state?.plan || ''), c, now));
      }
    }
    if (c.draft !== 'none') {
      const text = String(state?.draft || '').slice(0, WORKSPACE_LIMITS.snapshot);
      writing.draft = c.draft === 'end' ? tail(text, c.max_chars) : fit(text, c.max_chars);
      writing.words = wordCount(text);
      lines.push(`Their draft so far (${writing.words} words${c.draft === 'end' ? ', the part they are writing' : ''}):\n${writing.draft || '(empty)'}`);
      const earlier = (versions || []).slice(0, c.versions);
      if (earlier.length) {
        writing.versions = earlier.map((version) => ({ at: version.at, words: wordCount(version.text), text: fit(version.text, Math.floor(c.max_chars / 2)) }));
        lines.push(history('draft', earlier, text, c, now));
      }
    }
    return done({ ...base, writing }, lines);
  }
  if (panel.type === 'embed') {
    const recent = (Array.isArray(state?.recent) ? state.recent : []).map((event) => sanitizeEvent(workspace, { ...event, panel: panel.id })).filter(Boolean).map((event) => ({ type: event.type, ...event.data }));
    const events = c.events ? recent.filter((event) => event.type === 'embed.event').slice(-c.events) : [];
    const shown = c.state ? recent.filter((event) => event.type === 'embed.state').at(-1) || null : null;
    const lines = [`The learner has the activity “${panel.title}” open (an embedded page).`];
    if (events.length) lines.push(`What happened in it most recently:\n${events.map((event) => `- ${JSON.stringify(event)}`).join('\n')}`);
    if (shown) lines.push(`What it shows now: ${JSON.stringify(shown.data || {})}`);
    return done({ ...base, embed: { url: panel.url, recent: events, state: shown?.data || null } }, lines);
  }
  if (panel.type === 'reading') {
    // What the page in view says comes from the learner's own copy of the document (their page sends it).
    const page = Number.isInteger(state?.page) && state.page > 0 ? state.page : null;
    const reading = { document: panel.document?.title || panel.title, page, pages: Number.isInteger(state?.pages) ? state.pages : null };
    const lines = [`The learner is reading “${panel.document?.title || panel.title}”${page ? `, on page ${page}${reading.pages ? ` of ${reading.pages}` : ''}` : ''}.`];
    if (c.document && state?.document_text) { reading.document_text = fit(String(state.document_text), c.max_chars); lines.push(`The document${String(state.document_text).length > c.max_chars ? ' (its start and end)' : ''}:\n${reading.document_text}`); }
    else if (c.page && state?.page_text) { reading.page_text = fit(String(state.page_text), Math.min(c.max_chars, 8000)); lines.push(`The page they’re on says:\n${reading.page_text}`); }
    if (c.selection && state?.selection) { reading.selection = clip(String(state.selection), 1500); lines.push(`They have selected:\n“${reading.selection}”`); }
    if (c.highlights && panel.highlights && Array.isArray(state?.highlights) && state.highlights.length) {
      reading.highlights = state.highlights.slice(0, 12).map((entry) => ({ quote: clip(String(entry?.quote || ''), 300), note: entry?.note ? clip(String(entry.note), 300) : null })).filter((entry) => entry.quote);
      if (reading.highlights.length) lines.push(`Their highlights on this page:\n${reading.highlights.map((entry) => `- “${entry.quote}”${entry.note ? ` (their note: ${entry.note})` : ''}`).join('\n')}`);
    }
    return done({ ...base, reading }, lines);
  }
  if (panel.type === 'questions') {
    const items = sets.get(panel.set_id)?.items || [];
    const index = items.findIndex((item) => item.id === state?.item);
    const item = items[index];
    if (!item) return { context: base, view: null };
    // Whether their last answer was right comes from the host's own record of marking it, never from the page: said by the page, it would let a
    // learner lift the check. Where the panel keeps that from them until the end, the AI doesn't have it either.
    const lastCorrect = (panel.feedback ?? 'each') === 'each' && typeof marked === 'boolean' ? marked : null;
    // What they have chosen or written and not yet sent is theirs too: a learner who has it, and says why in words that don't name it, is told so. Only where
    // pressing Check would tell them anyway. It says yes or no and nothing else, and the server works it out from the key.
    const holdsIt = (panel.feedback ?? 'each') === 'each' && state?.response != null && state.response !== '' && gradeResponse(item, state.response)?.correct === true;
    // The key, for a step that checks replies against it (VETTING's answer_key): never in the view.
    const key = { answer_key: keyText(item), ...(lastCorrect === true || holdsIt ? { answer_reached: true } : {}), ...(holdsIt ? { answer_holds: true } : {}) };
    const given = responseText(item, state?.response);
    const tries = Number.isInteger(state?.tries) ? state.tries : 0;
    const opened = panel.hints ? Math.min(hintsOpened, item.hints?.length || 0) : 0;
    const question = { id: item.id, number: index + 1, of: items.length, type: item.type, skill: item.skill || null };
    const lines = [`The learner is on question ${index + 1} of ${items.length} in “${panel.title}” (${item.type}${item.skill ? `, practising ${item.skill}` : ''}).`];
    if (c.question) { Object.assign(question, { prompt: item.prompt, choices: item.choices?.map((choice) => choice.text) || null }); lines.push(questionText(item)); }
    if (c.answer) { question.learner_response = given || null; lines.push(given ? `Their answer so far: ${clip(given, 2000)}` : 'They haven’t answered yet.'); }
    if (c.attempts) {
      question.tries = tries;
      question.last_correct = lastCorrect;
      if (tries) lines.push(`They have answered ${tries} time${tries === 1 ? '' : 's'}${question.last_correct === false ? '; the last answer was wrong' : question.last_correct ? '; the last answer was right' : ''}.`);
    }
    if (c.hints && opened) { question.hints_seen = item.hints.slice(0, opened); lines.push(`Hints they have opened:\n${question.hints_seen.map((hint, i) => `${i + 1}. ${hint}`).join('\n')}`); }
    return { context: { ...base, question, ...key, ...(c.question ? { question_text: questionText(item) } : {}) }, view: lines.length > 1 ? lines.join('\n\n') : null };
  }
  return { context: base, view: null };
}

// What the learner had open when they sent a message, kept with the turn: the panel, the question or
// page they were on, and, where how they write is recorded, the draft and plan as they were then.
export function openedNow(workspace, state, level) {
  const panel = workspace?.panels.find((item) => item.id === state?.panel);
  if (!panel) return null;
  const out = { panel: panel.id, type: panel.type };
  if (panel.type === 'writing' && level !== 'minimal') {
    out.draft = String(state?.draft ?? '').slice(0, 20000);
    out.words = wordCount(out.draft);
    if (panel.plan) out.plan = String(state?.plan ?? '').slice(0, 6000);
  }
  if (panel.type === 'questions' && state?.item) out.item = String(state.item).slice(0, 80);
  if (panel.type === 'reading' && Number.isInteger(state?.page)) out.page = state.page;
  return out;
}

// Where the learner is and what the teacher wants from the AI there, as instructions.
function stepWords(workspace, at, opening) {
  const step = at?.step;
  const lines = [];
  if (step) {
    lines.push(`The learner is on step ${at.index + 1} of ${workspace.steps.length}, “${step.title}”.`);
    if (step.brief) lines.push(`In this step: ${step.brief}`);
    if (step.says) lines.push(`You began this step by saying: “${step.says}”`);
    const next = workspace.steps[at.index + 1];
    if (next) lines.push(`The next step is “${next.title}”. When they have done what this one asks, say they can go on.`);
  } else if (opening?.says) lines.push(`You began this conversation by saying: “${opening.says}”`);
  return lines.length ? lines.join('\n') : null;
}

// The run's context from what the learner has open. A question also sets context.question and
// context.answer_key, the fields a VETTING step's question and answer key read, and context.answer_reached
// once the page has marked the learner's answer right.
// The view enters as the agent's profile says (open.place: before the message, with the instructions,
// or only as variables) and reaches its reply steps or every model step (open.reaches).
// An activity's teaching settings (how the AI helps, teaching.js), with or without a panel open:
// context.workspace.teaching for templates and, unless the profile keeps both to variables,
// teaching_view, which the engine gives the same steps as instructions rather than as data. section:
// the learner's, when it has its own help level or note (teaching.sections).
// at: the step they have reached, { index, step }, whose own instructions go with the teacher's. opening: what the AI said first where there are no steps, so what comes next follows from it.
export const workspaceContext = (workspace, state, sets, versions = {}, open = {}, teaching = null, section = null, at = null, opening = null) => {
  const run = workspace ? workspaceRunContext(workspace, state, sets, versions) : null;
  const taught = teachingContext(teaching, section);
  const told_step = stepWords(workspace, at, opening);
  if (!run && !taught && !told_step) return null;
  const { answer_key: key, answer_reached: reached, answer_holds: holds, question_text: question, ...view } = run?.context || {};
  const place = open.place || 'message';
  const told = Boolean(run?.view) && place !== 'variables';
  const instructed = Boolean(taught) && place !== 'variables';
  return {
    workspace: { ...view, ...(taught ? { teaching: taught.context } : {}) },
    ...(key ? { answer_key: key } : {}), ...(reached ? { answer_reached: true } : {}), ...(holds ? { answer_holds: true } : {}), ...(question ? { question } : {}),
    ...(told ? { workspace_view: run.view, workspace_place: place } : {}),
    ...(instructed ? { teaching_view: taught.text } : {}),
    ...(told_step && place !== 'variables' ? { step_view: told_step } : {}),
    ...(told || instructed || (told_step && place !== 'variables') ? { workspace_reach: open.reaches || 'reply' } : {})
  };
};
