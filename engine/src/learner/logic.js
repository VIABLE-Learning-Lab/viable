/**
 * What both hosts of the learner pages decide the same way, as pure functions: reading what a page
 * sends, what it may be told back, when an activity is open, how a course's home is laid out, and a run
 * as server-sent events. Who the learner is, what is kept and how limits count stay with the host.
 * Nothing here trusts the page: a key or a teacher's note never enters what these return.
 */
import { deliverOutput } from '../agents/citations.js';
import { CHAT_PAGE_LIMITS } from './settings.js';
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

// Recordings browsers make (webm/ogg Opus, or mp4 AAC on Safari) and plain audio files, with the
// extension transcription providers expect.
const VOICE_TYPES = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };
// Images a page sends (large photos go as JPEG, at most 2048 px on their long side) and PDFs.
const ATTACHMENT_TYPES = { 'image/png': 'images', 'image/jpeg': 'images', 'image/webp': 'images', 'image/gif': 'images', 'application/pdf': 'files' };

/**
 * Images and PDFs attached to a message, as data URIs, where the page offers them (attaches: { images,
 * files }): content parts the agent's steps read.
 */
export function messageAttachments(value, attaches) {
  if (value == null || (Array.isArray(value) && !value.length)) return [];
  if (!Array.isArray(value) || value.length > CHAT_PAGE_LIMITS.attachments) throw pageError(`Attach at most ${CHAT_PAGE_LIMITS.attachments} files to a message.`, 400, 'too_many_attachments');
  let total = 0;
  return value.map((item) => {
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(item?.data ?? ''));
    if (!match) throw pageError('An attachment didn’t arrive in a form the assistant can read. Attach it again.', 400, 'invalid_attachment');
    const type = match[1].toLowerCase();
    const kind = ATTACHMENT_TYPES[type];
    if (!kind) throw pageError('Attach images (PNG, JPEG, WebP or GIF) or PDFs.', 415, 'unsupported_attachment');
    if (!attaches?.[kind]) throw pageError(kind === 'images' ? 'This assistant can’t look at images here. Describe it in words instead.' : 'This assistant can’t read documents here. Paste the part you mean instead.', 400, 'attachments_not_available');
    const bytes = Math.floor((match[2].length * 3) / 4) - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
    total += bytes;
    if (bytes > CHAT_PAGE_LIMITS.attachmentBytes || total > CHAT_PAGE_LIMITS.attachmentsBytes) throw pageError('Attachments can be at most 8 MB each, and 10 MB in all.', 413, 'attachment_too_large');
    const data = `data:${type};base64,${match[2]}`;
    return kind === 'images' ? { type: 'image_url', image_url: { url: data } } : { type: 'file', file: { filename: String(item?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document.pdf', mime_type: type, file_data: data } };
  });
}

/** A spoken message: a base64 data URI of a recording, bounded and of a type providers transcribe. */
export function voiceRecording(value, hears, seconds = CHAT_PAGE_LIMITS.voiceSeconds) {
  if (!hears) throw pageError('This assistant can’t listen to recordings. Type your message instead.', 400, 'voice_not_available');
  // The byte bound scales with the page's longest recording (voice.max_seconds).
  const maxBytes = Math.ceil((CHAT_PAGE_LIMITS.voiceBytes * seconds) / CHAT_PAGE_LIMITS.voiceSeconds);
  const tooLong = () => pageError(`Recordings can be at most ${seconds} seconds. Try a shorter one.`, 413, 'voice_message_too_long');
  if (typeof value === 'string' && value.length > Math.ceil(maxBytes / 3) * 4 + 200) throw tooLong();
  const match = typeof value === 'string' ? /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)((?:;[a-z0-9-]+=[^;,]*)*);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value.trim()) : null;
  if (!match) throw pageError('The recording didn’t arrive in a form the assistant can read. Try recording again.', 400, 'invalid_voice_message');
  const type = match[1].toLowerCase();
  if (!VOICE_TYPES[type]) throw pageError('Record in this browser, or use an MP3, M4A, WAV, WebM or OGG recording.', 415, 'unsupported_voice_format');
  const data = match[3];
  const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (bytes < 1) throw pageError('The recording is empty. Try recording again.', 400, 'invalid_voice_message');
  if (bytes > maxBytes) throw tooLong();
  return { type, filename: `voice-message.${VOICE_TYPES[type]}`, data: `data:${type};base64,${data}` };
}

/** A beacon or a page's call that may name a run: only something shaped like one reaches a lookup. */
export const RUN_ID = /^[A-Za-z0-9_-]{8,80}$/;
/** A conversation a page names; whether it is this visitor's is the host's to check. */
export const CONVERSATION_ID = /^agtc_[A-Za-z0-9-]{8,80}$/;

/** The website an embed says it runs on (an origin, or nothing). */
export function embedSite(value) {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost') ? url.origin : null; } catch { return null; }
}

/**
 * The page of that website the chat is open on, as the embed reports it (page_context): its address
 * on that site with nothing after ? or #, and its title. Data for the agent, never instructions.
 */
export function embedPage(value, site) {
  if (!site || !value || typeof value !== 'object') return null;
  let url;
  try { url = new URL(String(value.url || '')); } catch { return null; }
  if (url.origin !== site) return null;
  const title = String(value.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return { url: `${url.origin}${url.pathname}`.slice(0, 500), ...(title ? { title } : {}) };
}

// --- What a page is told -------------------------------------------------------------------------

/**
 * The reply to a message: its text with [n] markers, sources, pictures and audio at https addresses.
 * ownMedia: the origin of a host that keeps them at its own /media/ (server/learner.js).
 */
export function chatReply({ output: raw, conversationId, runId, stale = false, transcript = null, heard = false, ownMedia = null }) {
  const output = deliverOutput(raw, 'none');
  const shown = (type, most) => (output.attachments || []).filter((item) => item?.type === type).map((item) => String(item.url || '')).map((url) => (/^https:\/\//i.test(url) ? url : ownMedia && url.startsWith('/media/') ? `${ownMedia}${url}` : null)).filter(Boolean).slice(0, most).map((url) => ({ url }));
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
      images: shown('image', 4),
      audio: shown('audio', 2),
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

/**
 * A learner's step as the page gets it, with only the panels open so far whole. now: { index, at }. extended: the learner has
 * more time from their teacher (an accommodation), so no timer moves them on: a step that would open on its own waits until
 * they say they're ready, its minutes still the earliest.
 */
export function stepReply(workspace, sets, now, { extended = false } = {}) {
  const { steps } = workspace;
  const next = steps[now.index + 1] || null;
  const shown = publicWorkspace(workspace, sets, { through: now.index });
  const moveOf = (move) => (extended && move === 'auto' ? 'ready' : move);
  return {
    object: 'workspace.step', index: now.index, started_at: now.at,
    steps: steps.map(({ id, title, panels, ai, chat, says = null, move = null, minutes = 0, back = false }) => ({ id, title, panels, ai, chat, says, move: moveOf(move), minutes, back })),
    next: next ? { move: moveOf(next.move), minutes: next.minutes, opens_at: next.minutes && now.at ? new Date(Date.parse(now.at) + next.minutes * 60000).toISOString() : null } : null,
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
  // A link learners click is a web address, whatever a package says.
  return { ...info, people: (info.people || []).map(({ email, show_email: shown, ...person }) => ({ ...person, email: shown ? email : null })), ...(info.links ? { links: info.links.filter((link) => /^https?:\/\//i.test(String(link?.url ?? ''))) } : {}) };
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
