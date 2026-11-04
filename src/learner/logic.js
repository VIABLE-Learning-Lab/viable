/**
 * What both hosts of the learner pages decide the same way, as pure functions: reading what a page
 * sends, what it may be told back, when an activity is open, how a course's home is laid out, and a run
 * as server-sent events. Who the learner is, what is kept and how limits count stay with the host.
 * Nothing here trusts the page: a key or a teacher's note never enters what these return.
 */
import { deliverOutput } from '../agents/citations.js';
import { panelOpenAt, publicWorkspace } from './workspace.js';

const pageError = (message, status = 400, code = 'page_error') => Object.assign(new Error(message), { status, code });

// --- What a page sends --------------------------------------------------------------------------

/** A browser's random id, as every route takes it; what else a route may do with it is the host's. */
export const VISITOR = /^[A-Za-z0-9_-]{16,64}$/;
export function readVisitor(body, message = 'Reload the page to start a chat.') {
  const visitor = String(body?.visitor || '');
  if (!VISITOR.test(visitor)) throw pageError(message, 400, 'invalid_visitor');
  return visitor;
}

/** A message's text and its visitor. media: something other than text came with it. */
export function readMessage(body, settings, { media = false } = {}) {
  const message = String(body?.message ?? '').trim();
  if (!message && !media) throw pageError('Type a message first.', 400, 'empty_message');
  if (message.length > settings.limits.message_chars) throw pageError(`Messages can be at most ${settings.limits.message_chars} characters.`, 400, 'message_too_long');
  return { message, visitor: readVisitor(body) };
}

/** A beacon or a page's call that may name a run: only something shaped like one reaches a lookup. */
export const RUN_ID = /^[A-Za-z0-9_-]{8,80}$/;
/** A conversation a page names; whether it is this visitor's is the host's to check. */
export const CONVERSATION_ID = /^agtc_[A-Za-z0-9-]{8,80}$/;

/** The website an embed says it runs on (an origin, or nothing). */
export function embedSite(value) {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' || url.hostname === 'localhost' ? url.origin : null; } catch { return null; }
}

// --- What a page is told -------------------------------------------------------------------------

/** The reply to a message: its text with [n] markers, sources, pictures and audio at https addresses. */
export function chatReply({ output: raw, conversationId, runId, stale = false, transcript = null, heard = false }) {
  const output = deliverOutput(raw, 'none');
  return {
    object: 'agent.chat_reply',
    ...(stale ? { stale: true } : {}),
    conversation_id: conversationId,
    run_id: runId,
    // What the agent heard the visitor say, for the page to show in place of their recording.
    ...(heard && transcript ? { transcript: { text: transcript.text, language: transcript.language ?? null } } : {}),
    reply: {
      text: output.text || '',
      citations: (output.citations || []).map((item) => ({ index: item.index, title: item.title || null, url: item.link || item.url || null, ...(item.page ? { page: item.page } : {}) })),
      images: (output.attachments || []).filter((item) => item?.type === 'image' && /^https:\/\//i.test(String(item.url || ''))).slice(0, 4).map((item) => ({ url: item.url })),
      audio: (output.attachments || []).filter((item) => item?.type === 'audio' && /^https:\/\//i.test(String(item.url || ''))).slice(0, 2).map((item) => ({ url: item.url })),
      ...(output.awaiting_input ? { awaiting_input: true } : {})
    }
  };
}

/** A visitor's answers so far in a panel, from their recorded answers in order: { item: { tries, response, correct, score } }. */
export function answersSoFar(rows) {
  const by = {};
  for (const { item, data = {} } of rows) by[item] = { tries: (by[item]?.tries || 0) + 1, response: data.response ?? null, correct: data.correct ?? null, score: data.score ?? null };
  return by;
}

/**
 * What a questions panel tells the page, by its feedback setting: never a key, and a model answer only
 * once the learner has written their own, after each answer or with the results at the end.
 */
export function questionReplies(panel, set) {
  const feedbackFor = (item, entry) => ({ correct: entry.correct, score: entry.score, ...(item.explanation ? { explanation: item.explanation } : {}) });
  const modelFor = (item, response) => (item?.show_model && item.answer?.model && String(response || '').trim() ? { model_answer: item.answer.model } : {});
  const eachModel = panel.feedback === 'each' ? modelFor : () => ({});
  return {
    state: (by) => ({ object: 'question.state', items: Object.fromEntries(Object.entries(by).map(([id, entry]) => [id, { tries: entry.tries, response: entry.response, ...(panel.feedback === 'each' ? { correct: entry.correct, score: entry.score } : {}), ...eachModel(set.items.find((item) => item.id === id), entry.response) }])) }),
    results(by) {
      if (panel.feedback !== 'end') throw pageError('These questions don’t show results at the end.', 400, 'no_results');
      if (set.items.some((item) => !by[item.id])) throw pageError('Answer every question first: the results come at the end.', 409, 'questions_unanswered');
      return { object: 'question.results', items: set.items.filter((item) => by[item.id]).map((item) => ({ item: item.id, ...feedbackFor(item, by[item.id]), ...modelFor(item, by[item.id].response) })) };
    },
    /** Which hint to show next, with what to record; the reply to send once it is. */
    hint(item, requested) {
      if (!panel.hints || !item.hints?.length) throw pageError('There are no hints for this question.', 404, 'no_hint');
      const index = Math.min(Math.max(0, Number.parseInt(requested, 10) || 0), item.hints.length - 1);
      return { index, event: { index, set: set.id, skill: item.skill || set.title, hints_available: item.hints.length }, reply: { object: 'question.hint', item: item.id, index, hint: item.hints[index], more: index < item.hints.length - 1 } };
    },
    tries(item, tries) { if (panel.tries && tries >= panel.tries) throw pageError('You’ve used your tries on this question.', 409, 'tries_used'); },
    answer: (item, graded, attempt, extra = {}) => ({
      object: 'question.answer', item: item.id, attempt, tries_left: panel.tries ? panel.tries - attempt : null, graded: graded.correct !== null,
      ...extra,
      ...(panel.feedback === 'each' ? feedbackFor(item, graded) : {}),
      ...eachModel(item, graded.response)
    })
  };
}

/** Whether a panel takes work, or the AI answers, at the learner's step; throws what the page shows. */
export function stepAllows(steps, index, { panelId = null, ai = false } = {}) {
  if (panelId && !panelOpenAt(steps, index, panelId)) throw pageError('That part of the activity isn’t open now.', 409, 'step_closed');
  if (ai && steps[index].ai === 'off') throw pageError('The AI isn’t part of this step.', 409, 'step_no_ai');
}

/** A learner's step as the page gets it, with only the panels open so far whole. now: { index, at }. */
export function stepReply(workspace, sets, now) {
  const { steps } = workspace;
  const next = steps[now.index + 1] || null;
  const shown = publicWorkspace(workspace, sets, { through: now.index });
  return {
    object: 'workspace.step', index: now.index, started_at: now.at,
    steps: steps.map(({ id, title, panels, ai, chat, move = null, minutes = 0, back = false }) => ({ id, title, panels, ai, chat, move, minutes, back })),
    next: next ? { move: next.move, minutes: next.minutes, opens_at: next.minutes && now.at ? new Date(Date.parse(now.at) + next.minutes * 60000).toISOString() : null } : null,
    panels: shown.panels.filter((panel) => !panel.locked && panelOpenAt(steps, now.index, panel.id))
  };
}

// --- Highlights and notes ------------------------------------------------------------------------

export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink'];
/** A highlight's place, as W3C Web Annotation selectors: the quoted text with a little before and after it, and its offsets in the page's text. */
export function annotationTarget(input) {
  const list = (Array.isArray(input?.selector) ? input.selector : []).slice(0, 4);
  const quote = list.find((entry) => entry?.type === 'TextQuoteSelector');
  const position = list.find((entry) => entry?.type === 'TextPositionSelector');
  const exact = String(quote?.exact || '').slice(0, 2000);
  if (!exact.trim()) throw pageError('Select some text to highlight.', 400, 'invalid_annotation');
  const out = [{ type: 'TextQuoteSelector', exact, prefix: String(quote.prefix || '').slice(-64), suffix: String(quote.suffix || '').slice(0, 64) }];
  const start = Number(position?.start); const end = Number(position?.end);
  if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end - start <= 4000) out.push({ type: 'TextPositionSelector', start, end });
  return { selector: out };
}
/** A note's text and color as they are kept. */
export const noteOf = (panel, body) => ({
  note: panel.notes && body?.note != null ? String(body.note).replace(/\r\n?/g, '\n').trim().slice(0, 2000) || null : null,
  color: NOTE_COLORS.includes(body?.color) ? body.color : 'yellow'
});

// --- A course's home -----------------------------------------------------------------------------

/**
 * Where an activity stands for a learner now: open, upcoming (with when it opens), closed, or hidden,
 * from its release, a host's override for their group, and any extension they were given.
 */
export function releaseState(activity, { override = null, extension = null, joinedAt = null, now = Date.now() } = {}) {
  const release = override?.release || activity.release;
  const opensAt = override ? override.opens_at : activity.opens_at;
  // An override's times are whole (no close there: it stays open). More time only ever adds: the
  // later of the learner's extension and the usual close (none: it never closes).
  const usual = override ? override.closes_at : activity.closes_at;
  let closesAt = usual && extension && Date.parse(extension) > Date.parse(usual) ? extension : usual;
  // A test stays open to someone who joined after it closed.
  if (closesAt && joinedAt && ['pretest', 'posttest'].includes(activity.role) && Date.parse(joinedAt) > Date.parse(closesAt)) closesAt = null;
  if (release === 'hidden') return { state: 'hidden', opens_at: null, closes_at: null };
  if (release === 'scheduled' && opensAt && Date.parse(opensAt) > now) return { state: 'upcoming', opens_at: opensAt, closes_at: closesAt || null };
  if (closesAt && Date.parse(closesAt) <= now) return { state: 'closed', opens_at: opensAt || null, closes_at: closesAt };
  return { state: 'open', opens_at: opensAt || null, closes_at: closesAt || null };
}

/** The kind of activity a card shows as. */
export const kindOf = (activity, settings) => (activity.role === 'survey' ? 'survey' : activity.role !== 'instruction' ? 'test' : settings.workspace?.panels?.[0]?.type || 'chat');

/** The home's units from its cards ({ unit_id, … }): each in its unit, the rest in one without a title, and empty ones left out. */
export const homeUnits = (units, cards) => [
  ...units.map((unit) => ({ title: unit.title, starts_on: unit.starts_on || null, ends_on: unit.ends_on || null, activities: cards.filter((card) => card.unit_id === unit.id) })),
  { title: null, starts_on: null, ends_on: null, activities: cards.filter((card) => !card.unit_id || !units.some((unit) => unit.id === card.unit_id)) }
].filter((unit) => unit.activities.length).map((unit) => ({ ...unit, activities: unit.activities.map(({ unit_id: _unit, ...card }) => card) }));

/** A course's information as learners get it: an email only where it is shown. Null when there is none. */
export function learnerInfo(info) {
  if (!info) return null;
  return { ...info, people: (info.people || []).map(({ email, show_email: shown, ...person }) => ({ ...person, email: shown ? email : null })) };
}

const completing = (panels) => panels.some((panel) => panel.type === 'embed' && panel.completes);
const trackable = (panels) => completing(panels) || panels.some((panel) => (panel.type === 'writing' && panel.submit !== false) || panel.type === 'questions');
/** Whether an activity has an "I'm done" button: the learner says so, or nothing else can tell. */
export const doneButton = (doneWhen, panels) => doneWhen === 'self' || (doneWhen === 'auto' && !trackable(panels));
/**
 * How what just happened ends an activity, or null: on opening, on the learner's say-so, or once all its
 * panels are done. kind: submit, answer, event, self, open…; allDone: () => Promise<boolean>, only asked when it matters.
 */
export async function doneHow({ doneWhen, panels, kind, allDone }) {
  if (doneWhen === 'opened') return 'opened';
  if (kind === 'self' && (doneWhen === 'self' || !trackable(panels))) return 'self';
  if (doneWhen === 'auto' && (['submit', 'answer'].includes(kind) || (kind === 'event' && completing(panels))) && await allDone()) return kind === 'submit' ? 'submitted' : kind === 'answer' ? 'answered' : 'completed';
  return null;
}

/** The step a learner may move to now, or null when it isn't the next; throws when its minutes aren't up. now: the time; early: a preview's. */
export function stepMove(steps, at, to, { now = Date.now(), early = false } = {}) {
  if (to !== at.index + 1 || !steps[to]) return null;
  const next = steps[to];
  const opensAt = next.minutes && at.at ? new Date(Date.parse(at.at) + next.minutes * 60000) : null;
  if (opensAt && !early && now < opensAt.getTime() - 2000) throw Object.assign(pageError(`“${next.title}” opens at ${opensAt.toISOString().slice(11, 16)} UTC.`, 409, 'step_not_open'), { details: { opens_at: opensAt.toISOString() } });
  return next;
}

// --- A run as server-sent events -----------------------------------------------------------------

// What a run is doing, as a reader may see it while waiting: the kind of work only, never step ids,
// tool names or the path taken, which would show how the agent is built.
export const PROGRESS_STAGES = Object.freeze(['thinking', 'listening', 'searching', 'reading', 'checking', 'creating', 'writing', 'speaking']);

// Steps that do no visible work (routing, shaping data, notes) don't change the stage. A Transcribe
// step listens only when a recording came with the message, so it reports that itself (onListening):
// a typed message skips it, and readers mustn't see "Listening to the recording".
const STEP_STAGES = { knowledge: 'searching', http: 'reading', guardrail: 'checking', vetting: 'checking', image: 'creating', speech: 'speaking', output: 'writing',
  llm: 'thinking', agent: 'thinking', router: 'thinking', classify: 'thinking', extract: 'thinking', memory: 'thinking', subagent: 'thinking', ask: 'writing' };
const TOOL_STAGES = { search_knowledge: 'searching', browse_knowledge: 'searching', read_document: 'searching', fetch_url: 'reading', recall_memory: 'thinking', save_memory: 'thinking', call_agent: 'thinking' };

export const stageOfStep = (type) => STEP_STAGES[type] || null;
export const stageOfTool = (name) => TOOL_STAGES[name] || 'thinking';

/**
 * Engine hooks that report each change of stage to onProgress(stage), once per change. Detailed
 * progress, for someone testing their own agent, also names the step (and tool) and reports each step:
 * onProgress(stage, {step, type, tool?}). Returns nothing to add without a listener.
 */
export function progressHooks(onProgress, { detailed = false } = {}) {
  if (typeof onProgress !== 'function') return {};
  let last = null;
  const report = (stage, node, tool = null) => {
    const key = detailed ? `${stage}|${node.id}|${tool || ''}` : stage;
    if (!stage || key === last) return;
    last = key;
    try {
      if (detailed) onProgress(stage, { step: node.id, type: node.type, ...(tool ? { tool } : {}) });
      else onProgress(stage);
    } catch { /* A listener never stops the run. */ }
  };
  return {
    onStepStart: (node) => report(stageOfStep(node.type) || (detailed ? 'thinking' : null), node),
    onToolStart: (node, name) => report(stageOfTool(name), node, name),
    // Back to the step's own work once its tools have answered.
    onToolsDone: (node) => report(stageOfStep(node.type), node),
    onListening: (node) => report('listening', node)
  };
}

export const SSE_HEADERS = Object.freeze({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
const KEEP_ALIVE_MS = 15000;

/** A stream to write events to: { readable, write, event, close }. A reader who leaves stops only the writing. */
export function sseStream() {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let open = true;
  const write = (text) => (open ? writer.write(encoder.encode(text)).catch(() => { open = false; }) : Promise.resolve());
  return {
    readable, write,
    event: (name, data) => write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`),
    close: async () => { if (open) await writer.close().catch(() => {}); }
  };
}

/**
 * A run on a stream: run.started, run.progress ({stage}), run.transcript ({text, language,
 * duration_seconds}) once a Transcribe step has heard the recording sent with the message, run.delta
 * ({text}) as a reply that goes straight to its reader is written, run.audio ({step, index, format,
 * audio}: a base64 piece of that reply read aloud, in order), then run.completed (the body a
 * non-streaming run returns) or run.failed ({status, error}). Comments every 15 seconds keep proxies
 * from closing the connection during long runs. The run finishes even if the reader leaves.
 *
 * run: (onProgress, onAnswer, onTranscript, onSpeech) => Promise<result>; finish: (result) => { body };
 * fail: (error) => { status, body }, or null for an unexpected error.
 */
export async function runEvents(stream, { slug, run, finish, fail, unexpected = { error: { message: 'The agent run failed. Try again shortly.', type: 'server_error', code: 'agent_run_failed' } } }) {
  const startedAt = Date.now();
  const keepAlive = setInterval(() => { stream.write(': keep-alive\n\n'); }, KEEP_ALIVE_MS);
  try {
    await stream.event('run.started', { object: 'agent.run.started', agent: slug });
    const result = await run(
      (stage, detail) => { stream.event('run.progress', { stage, elapsed_ms: Date.now() - startedAt, ...(detail || {}) }); },
      (text) => { stream.event('run.delta', { text }); },
      (heard) => { stream.event('run.transcript', { text: heard.text, language: heard.language ?? null, duration_seconds: heard.duration_seconds ?? null }); },
      (piece) => { stream.event('run.audio', piece); }
    );
    await stream.event('run.completed', (await finish(result)).body);
  } catch (error) {
    const failure = fail(error) || { status: 500, body: unexpected };
    await stream.event('run.failed', { status: failure.status, ...failure.body });
  } finally {
    clearInterval(keepAlive);
    await stream.close();
  }
}
