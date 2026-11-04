/**
 * The learner pages on a server of your own, at the paths VIABLE serves them, so the same browser code
 * works: an agent's chat page and its chat button, a course's home and its activities, with their
 * endpoints, the page's browser files, and the teacher's page behind the token. A routes module for the
 * handler (handler.js), web-standard: learnerRoutes(options) => (ctx) => (request, url, context) => Response | null.
 *
 * Who a learner is here: a random ID their browser holds, with a code they can re-enter on another
 * computer or after "Not you?"; or, with a class code, whoever has that code. Never a name or an email.
 * What they do is kept in the store (store.js) in the shape `viable-harness view` and `suggest` read
 * (learnerRecords). Class lists, sections, consent and studies aren't here; what the server can't do
 * (voice, reading aloud, attachments) isn't offered by its pages.
 *
 * Every route assumes its caller has read this file: it checks where a post comes from, who the
 * visitor is and what the activity allows, and answers only with what a learner may see.
 */
import { chatPageHeaders, FRAME_CSP, UNAVAILABLE_HEADERS, escapeHtml, pageHeaders, palette, BASE_CSS, unavailablePage } from '../learner/shell.js';
import { ASSET_PATH, embedScript, renderChatPage } from '../learner/chatPage.js';
import { renderHome } from '../learner/home.js';
import { CHAT_PAGE_LIMITS, chatPageConfig, chatPageSettings, lookOf, profileSettings } from '../learner/settings.js';
import { draftTexts, embedOrigins, keptEvents, openedNow, panelOpenAt, versionsFrom, workspaceContext, workspaceSettings } from '../learner/workspace.js';
import { gradeResponse, normalizeItems } from '../learner/questions.js';
import { CONVERSATION_ID, RUN_ID, SSE_HEADERS, annotationTarget, answersSoFar, chatReply, doneButton, doneHow, embedSite, homeUnits, kindOf, learnerInfo, noteOf, progressHooks, questionReplies, readMessage, readVisitor, releaseState, runEvents, sseStream, stepAllows, stepMove, stepReply } from '../learner/logic.js';
import { sanitizeAfter, sanitizeSignals } from '../utils/researchMetrics.js';
import { teachingSettings } from '../utils/teaching.js';
import { suggestChanges } from '../suggest.js';
import { TEACHER_PAGE_HEADERS, teacherView } from '../view.js';
import { settingsShown, watchHooks, watchSlot } from '../learner/watch.js';
import { isLocalRequest } from './local.js';
import { packageFileBytes, packageFilesPath } from './search.js';
import { memoryStore } from './store.js';

const pageError = (message, status = 400, code = 'page_error', extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const later = (message, seconds = 60, code = 'rate_limited') => pageError(message, 429, code, { headers: { 'retry-after': String(seconds) } });
const slugOf = (text, fallback) => String(text ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
const PANEL = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const NOTE_ID = /^ann_[a-f0-9]{24}$/;
const ASSET = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const CONTENT_TYPES = { js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', html: 'text/html; charset=utf-8', json: 'application/json', wasm: 'application/wasm', css: 'text/css; charset=utf-8', pfb: 'application/octet-stream', ttf: 'font/ttf', bcmap: 'application/octet-stream', icc: 'application/octet-stream' };
// This server's own ceilings, per minute: a class shares one address, so each visitor has a budget and
// the address only a high ceiling, which is what bounds anyone making up visitors.
const PER_MINUTE = { home: [60, 3000], join: [10, 300], fresh: [10, 300], learner: [30, 3000], events: [60, 3000], draft: [60, 3000], questions: [40, 3000], notes: [60, 3000], reading: [30, 1000], step: [30, 3000], rate: [30, 3000], after: [30, 3000], open: [30, 3000], done: [30, 3000] };
// Sign-in tries a minute: from one address, and in all, so one person's tries never lock out another's.
const SIGN_IN = { address: 10, ceiling: 600 };
const SIGN_IN_BYTES = 4096;
// How long a teacher's session lasts, whatever a browser keeps: the server checks the time in its value.
const SESSION_MS = 8 * 3600000;
const LEARNER_TEXT = /^courses\/[^/]+\/(?:turns|drafts|answers|notes|events)\/|^chats\/[^/]+\/turns\/|^traces\/|^pages\/[^/]+\/runs\//;
const EVENT_TIME = /\/events\/.*\/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)-[^/]+$/;
const MESSAGES_PER_ADDRESS = 600;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
// The sign-out form posts here, and a form's post from a page with no referrer says its origin is null.
const TEACHER_PAGE = { ...TEACHER_PAGE_HEADERS, 'Content-Security-Policy': TEACHER_PAGE_HEADERS['Content-Security-Policy'].replace("form-action 'none'", "form-action 'self'"), 'Referrer-Policy': 'same-origin' };
const OWN_LINKS = { poweredBy: { label: 'the VIABLE harness', href: 'https://github.com/VIABLE-Learning-Lab/viable-harness' } };

const today = (now) => new Date(now).toISOString().slice(0, 10);
const newCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const randomId = () => hex(crypto.getRandomValues(new Uint8Array(12)));

// --- What the package says --------------------------------------------------------------------------

const PLACEHOLDER_SET = `qs_${'0'.repeat(24)}`;
const PLACEHOLDER_DOCUMENT = { knowledge_base_id: `kb_${'0'.repeat(24)}`, document_id: `kd_${'0'.repeat(24)}` };

// An activity's panels as the core checks them, on the package's refs. A panel this server can't show
// (a reading with no PDF in the package, or no pdf.js built) leaves with the steps that showed only it.
function panelsOf(raw, doc, { reads }) {
  if (!raw || !Array.isArray(raw.panels)) return null;
  const files = new Map((doc.files || []).map((file) => [file.ref, file]));
  const sets = new Map((doc.question_sets || []).map((set) => [set.ref, set]));
  const shown = (panel) => (panel?.type === 'reading' ? reads && files.has(panel.file_ref) : panel?.type !== 'questions' || sets.has(panel.set_ref));
  const panels = raw.panels.filter(shown);
  const gone = new Set(raw.panels.filter((panel) => !shown(panel)).map((panel) => panel.id));
  const steps = Array.isArray(raw.steps) ? raw.steps.map((step) => ({ ...step, panels: (step.panels || []).filter((id) => !gone.has(id)) })).filter((step) => step.panels.length) : raw.steps;
  const checked = workspaceSettings({ ...raw, steps, panels: panels.map((panel) => (panel.type === 'questions' ? { ...panel, set_id: PLACEHOLDER_SET } : panel.type === 'reading' ? { ...panel, document: { ...PLACEHOLDER_DOCUMENT, title: panel.document?.title || panel.title } } : panel)) });
  if (!checked) return null;
  checked.panels.forEach((panel, i) => {
    if (panel.type === 'questions') panel.set_id = panels[i].set_ref;
    if (panel.type === 'reading') panel.document = { file_ref: panels[i].file_ref, title: panel.document.title };
  });
  return checked;
}

// The agent's own look; a chat page adds its settings.
const lookFor = (item, name) => ({ profile: profileSettings(item?.profile || {}, name), settings: (more) => ({ ...chatPageSettings(more, name), ...lookOf(profileSettings(item?.profile || {}, name)) }) });

/** What the served agents make of pages: { chats: slug → page, courses: code → course }. Throws what's wrong with a package, at start. */
export function pagesOf(served, { assets = null } = {}) {
  const chats = new Map();
  const courses = new Map();
  const docs = new Map();
  for (const agent of served.values()) {
    const isPackage = agent.doc?.format === 'viable.course-package';
    const item = isPackage ? agent.doc.agents.find((entry) => entry.ref === agent.ref) : agent.doc;
    if (isPackage && agent.doc.course) { if (!docs.has(agent.doc)) docs.set(agent.doc, { ...agent, agents: new Map() }); docs.get(agent.doc).agents.set(agent.ref, agent); }
    if (!item?.chat_page || item.chat_page.status === 'paused') continue;
    const look = lookFor(item, agent.name);
    chats.set(agent.slug, { kind: 'chat', slug: agent.slug, id: agent.slug, agent, settings: look.settings(item.chat_page.settings || {}), open: look.profile.open, level: 'process', how: { identify: 'browser' }, workspace: null, sets: new Map() });
  }
  for (const [doc, from] of docs) {
    const course = doc.course;
    let code = slugOf(course.title, 'course');
    for (let n = 2; courses.has(code); n += 1) code = `${slugOf(course.title, 'course')}-${n}`;
    const level = course.data_level || 'minimal';
    const sets = new Map((doc.question_sets || []).map((set) => [set.ref, { id: set.ref, title: set.title, version: 1, items: normalizeItems(set.items).filter((item) => item.type !== 'spoken') }]));
    const units = (course.units || []).map((unit) => ({ id: unit.ref, title: unit.title, starts_on: unit.starts_on || null, ends_on: unit.ends_on || null }));
    const activities = new Map();
    for (const raw of course.activities || []) {
      let key = slugOf(raw.title, 'activity');
      for (let n = 2; activities.has(key); n += 1) key = `${slugOf(raw.title, 'activity')}-${n}`;
      const agent = raw.agent_ref ? from.agents.get(raw.agent_ref) : null;
      const item = agent ? doc.agents.find((entry) => entry.ref === agent.ref) : null;
      const look = lookFor(item, agent?.name || course.title);
      const workspace = panelsOf(raw.workspace, doc, { reads: Boolean(assets?.names?.pdf) });
      const titled = workspace ? { ...workspace, title: workspace.title || raw.title } : null;
      const settings = { ...look.settings({ daily_limit: CHAT_PAGE_LIMITS.dailyMax, limits: { visitor_per_day: course.learner_daily_messages || 0 }, learners: { signals: level !== 'minimal' } }), color: course.appearance?.color || null, course_theme: course.appearance?.theme || null };
      activities.set(key, {
        kind: 'activity', key, id: `${code}/${key}`, slug: `learn-${code}-${key}`, code, title: raw.title, summary: raw.summary || null, role: raw.role || 'instruction', minutes: raw.minutes ?? null,
        release: raw.release || 'open', opens_at: raw.opens_at || null, closes_at: raw.closes_at || null, done_when: raw.done_when || 'auto', survey: raw.survey || null, unit_id: raw.unit_ref || null,
        agent, teaching: raw.teaching || null, open: look.profile.open, workspace: titled, settings, level, sets, how: { identify: 'code' }, doc, dir: from.dir, zip: from.zip
      });
    }
    courses.set(code, { code, doc, title: course.title, description: course.description || null, audience: course.audience || null, data_level: level, shared_devices: Boolean(course.shared_devices), appearance: course.appearance || null, info: learnerInfo(course.info), units, activities, sets });
  }
  return { chats, courses };
}

/** Where learners open what is served: [{ title, path }]. */
export function pageLinks(served, options = {}) {
  const { chats, courses } = pagesOf(served, options);
  return [...[...courses.values()].map((course) => ({ title: course.title, path: `/course/${course.code}` })), ...[...chats.values()].map((page) => ({ title: page.settings.title, path: `/chat/${page.slug}` }))];
}

/** What a person starting the server should know of what its pages can't do, said before a learner finds out. */
export function learnerNotes(served, { assets = null, classCode = null } = {}) {
  const notes = [];
  const { courses, chats } = pagesOf(served, { assets });
  if (!assets?.names && (courses.size || chats.size)) notes.push('The pages\' browser files aren\'t built: replies show as plain text, and Reading panels are left out. Run npm run build:assets in the harness.');
  for (const course of courses.values()) {
    const raw = course.doc.course;
    if (['ask', 'code', 'link'].includes(raw.identify) && !classCode) notes.push(`${course.title}: on VIABLE it ${raw.identify === 'link' ? 'takes an ID from each learner\'s link' : raw.identify === 'code' ? 'takes codes from its class list' : 'asks who each learner is'}. Here each browser is a learner with a code of its own, unless you set a class code.`);
    if ((course.doc.question_sets || []).some((set) => set.items?.some((item) => item.type === 'spoken'))) notes.push(`${course.title}: spoken questions aren't asked here: recordings are kept and scored on VIABLE.`);
    for (const activity of raw.activities || []) {
      for (const panel of activity.workspace?.panels || []) if (panel.type === 'reading' && !panel.file_ref) notes.push(`${course.title}, ${activity.title}: its Reading panel has no PDF in the package, so it is left out. Download the course with files.`);
      if (activity.voice?.input) notes.push(`${course.title}, ${activity.title}: learners type here: voice needs VIABLE's transcription.`);
    }
    if (raw.sections_from && raw.sections_from !== 'none') notes.push(`${course.title}: sections aren't kept here: every learner is in one class.`);
  }
  for (const page of chats.values()) if (page.settings.limits.daily_cost) notes.push(`${page.slug}: its daily spending cap (${page.settings.limits.daily_cost} dollars) isn't enforced here, since this server doesn't price calls. Its daily message cap is.`);
  return notes;
}

// --- What the store keeps ----------------------------------------------------------------------------

const keys = {
  visitor: (code, visitor) => `courses/${code}/visitors/${visitor}`,
  byCode: (code, learnerCode) => `courses/${code}/codes/${learnerCode}`,
  learner: (code, id) => `courses/${code}/learners/${id}`,
  progress: (code, id, key) => `courses/${code}/progress/${id}/${key}`,
  draft: (code, id, key, panel) => `courses/${code}/drafts/${id}/${key}/${panel}`,
  answers: (code, id, key, panel) => `courses/${code}/answers/${id}/${key}/${panel}`,
  events: (code, id, key) => `courses/${code}/events/${id}/${key}/`,
  notes: (code, id, key, panel) => `courses/${code}/notes/${id}/${key}/${panel}/`,
  turns: (code, id) => `courses/${code}/turns/${id}/`,
  run: (page, id) => `pages/${page.slug}/runs/${id}`,
  chatTurn: (slug, owner) => `chats/${slug}/turns/${owner}/`,
  trace: (id) => `traces/${id}`,
  day: (scope, date, who = '') => `limits/${date}/${scope}${who ? `/${who}` : ''}`
};

/**
 * What the store holds of a course, in the shape `viable-harness view` and `suggest` read: records,
 * one per learner and activity ({ user, activity, events, turns }; a learner's code as their user,
 * never a name), and runs, each reply's review.
 */
export async function learnerRecords(store, code) {
  const records = [];
  const runs = [];
  const learners = await store.list(`courses/${code}/learners/`);
  for (const key of learners) {
    const learner = await store.get(key);
    if (!learner) continue;
    const byActivity = new Map();
    const of = (activity) => { if (!byActivity.has(activity)) byActivity.set(activity, { user: learner.code, activity, events: [], turns: [] }); return byActivity.get(activity); };
    for (const eventKey of await store.list(`courses/${code}/events/${learner.id}/`)) {
      const batch = await store.get(eventKey);
      if (batch) of(batch.activity).events.push(...batch.events);
    }
    for (const turnKey of await store.list(keys.turns(code, learner.id))) {
      const { run, ...turn } = (await store.get(turnKey)) || {};
      if (!turn.activity) continue;
      of(turn.activity).turns.push(turn);
      if (run) runs.push(run);
    }
    records.push(...byActivity.values());
  }
  return { records, runs };
}

/** A chat page's visitors' records, in the same shape: { user: an anonymous hash, activity, events: [], turns } and runs. */
export async function chatRecords(store, slug) {
  const byOwner = new Map();
  const runs = [];
  for (const key of await store.list(`chats/${slug}/turns/`)) {
    const { run, ...turn } = (await store.get(key)) || {};
    if (!turn.started_at) continue;
    const owner = key.split('/')[3];
    if (!byOwner.has(owner)) byOwner.set(owner, { user: `chat:${owner}`, activity: slug, events: [], turns: [] });
    byOwner.get(owner).turns.push(turn);
    if (run) runs.push(run);
  }
  return { records: [...byOwner.values()], runs };
}

/**
 * Removes what a store holds of one learner, by the code they know a course by or the pseudonymous ID an
 * app or a proxy names them by: their records in every course, conversations and runs, memory, and an
 * app's gateway records. Returns what was deleted, by kind.
 */
export async function forgetLearner(store, named) {
  const given = String(named ?? '');
  const removed = { courses: [], conversations: 0, runs: 0, records: 0, memory: 0, gateway: 0 };
  const code = given.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const ids = new Set(given ? [given] : []);
  const courses = [...new Set((await store.list('courses/')).map((key) => key.split('/')[1]))];
  for (const course of courses) {
    const found = (await store.get(keys.byCode(course, code))) || (await store.get(keys.learner(course, given)) ? { learner: given } : null);
    if (!found) continue;
    const { learner: id } = found;
    ids.add(id);
    const learner = await store.get(keys.learner(course, id));
    for (const part of ['progress', 'drafts', 'answers', 'events', 'notes', 'turns']) {
      for (const key of await store.list(`courses/${course}/${part}/${id}/`)) {
        if (part === 'turns') {
          const runId = (await store.get(key))?.run_id;
          if (runId) { await store.delete(keys.trace(runId)); for (const pointer of await store.list('pages/')) if (pointer.endsWith(`/runs/${runId}`)) await store.delete(pointer); }
        }
        await store.delete(key);
        removed.records += 1;
      }
    }
    for (const key of await store.list(`courses/${course}/visitors/`)) if ((await store.get(key))?.learner === id) await store.delete(key);
    for (const key of await store.list(`courses/${course}/identities/`)) if ((await store.get(key))?.learner === id) await store.delete(key);
    await store.delete(keys.byCode(course, learner?.code || code));
    await store.delete(keys.learner(course, id));
    removed.courses.push(course);
  }
  for (const key of await store.list('conversations/')) {
    if (!ids.has((await store.get(key))?.user)) continue;
    await store.delete(key);
    removed.conversations += 1;
  }
  for (const key of await store.list('runs/')) {
    if (!ids.has((await store.get(key))?.user)) continue;
    await store.delete(key);
    removed.runs += 1;
  }
  for (const id of ids) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) continue;
    if (await store.get(`memory/${id}`)) { await store.delete(`memory/${id}`); removed.memory += 1; }
    // The gateway keeps each call under the learner's ID, in two folders per activity.
    for (const key of await store.list('gateway/')) {
      const parts = key.split('/');
      if (['runs', 'records'].includes(parts[2]) && parts[3] === id) { await store.delete(key); removed.gateway += 1; }
    }
  }
  return removed;
}

// --- The routes ---------------------------------------------------------------------------------------

/**
 * options: assets ({ names, read(path) } of the pages' browser files; server/learnerAssets.js on a disk,
 * or { names } where the host serves them itself), classCode, links, teacherToken (what opens the teacher's
 * page on a server with no token of its own; with neither, it stays shut), traces (who may read a turn's
 * trace: 'token', 'local' for a try-out on this machine, or false), embeds (false: a chat page's settings
 * aren't handed to other sites), readPath (reads a package's file from its
 * folder), learnerHeader (a request header a reverse proxy sets to who is signed in; only where nothing
 * else can reach this server, since whoever can send it is whoever it says), fetch (downloads a package's
 * file), now. How long a turn is kept is the server's keepDays. panel: the "what the AI did" panel
 * (learner/watch.js), for those traces lets read a trace and nobody else: { note, mode, hint, control,
 * extra, listen }, or a function of the page and the request giving them; listen({ message,
 * misconceptions }) answers which were heard. With 'token' it shows only on an address that asks for it
 * (?panel=1), so a learner's ordinary page in a browser a teacher signed in on stays a learner's. teachingOf: a page's teaching settings, where a host lets
 * someone change them for a while.
 */
export function learnerRoutes({ assets = null, classCode = null, links = OWN_LINKS, traces = false, teacherToken = null, embeds = true, readPath = null, learnerHeader = null, fetch: download = (...args) => globalThis.fetch(...args), panel = null, teachingOf = (page) => page.teaching ?? null, now = () => Date.now() } = {}) {
  return (ctx) => {
    const store = ctx.store || memoryStore();
    const { chats, courses } = pagesOf(ctx.served, { assets });
    const started = { swept: null };

    // Per minute, in this process. shortcut: two instances each count their own; a store-backed counter if a server runs many.
    const minutes = new Map();
    const withinMinute = (bucket, limit) => {
      const at = now();
      if (minutes.size > 50000) for (const [key, entry] of minutes) if (entry.reset <= at) minutes.delete(key);
      const entry = minutes.get(bucket);
      if (!entry || entry.reset <= at) { minutes.set(bucket, { count: 1, reset: at + 60000 }); return true; }
      entry.count += 1;
      return entry.count <= limit;
    };
    const limited = (name, visitor, address) => {
      const [perVisitor, perAddress] = PER_MINUTE[name];
      if (!withinMinute(`${name}:v:${visitor || 'none'}`, perVisitor) || (address && !withinMinute(`${name}:a:${address}`, perAddress))) throw later('Too many requests. Wait a minute and try again.');
    };
    // Per day, in the store, one at a time here. shortcut: two instances can undercount a little; a store with atomic counters if a server runs many.
    const dayCounts = new Map();
    const addToDay = async (key) => {
      const next = (dayCounts.get(key) || store.get(key).then((value) => value?.count || 0)).then((count) => count + 1);
      dayCounts.set(key, next);
      const count = await next;
      await store.put(key, { count });
      return count;
    };
    // Yesterday's counters go.
    const sweepDays = async () => {
      const date = today(now());
      if (started.swept === date) return;
      started.swept = date;
      dayCounts.clear();
      for (const key of await store.list('limits/')) if (key.split('/')[1] < date) await store.delete(key);
    };

    const sameOrigin = (request, url) => {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return false;
      return request.headers.get('sec-fetch-site') !== 'cross-site' || !origin;
    };
    const noStore = { 'cache-control': 'no-store' };
    const answer = (body, status = 200, headers = {}) => ctx.json(status, body, { ...noStore, ...headers });
    // What a learner is told of something going wrong: what they can act on, never a stack or an internal reason.
    const failed = (error, context) => {
      const known = error?.status >= 400 && error.status < 500 && error.code && !error.fromRun;
      if (!known && !error?.fromRun) console.error(error);
      if (error?.fromRun && error.code === 'rate_limit_exceeded') return { status: 429, headers: { 'retry-after': '5' }, body: { error: { message: 'The assistant is busy with others. Try again in a moment.', code: 'chat_busy', request_id: context.requestId || null } } };
      return known
        ? { status: error.status, headers: error.headers || {}, body: { error: { message: error.message, code: error.code, request_id: context.requestId || null, ...(error.details ? { details: error.details } : {}) } } }
        : { status: error?.fromRun ? 502 : 500, headers: {}, body: { error: { message: error?.fromRun ? 'The assistant couldn’t answer just now. Try again in a moment.' : 'Something went wrong. Try again.', code: error?.fromRun ? 'chat_unavailable' : 'server_error', request_id: context.requestId || null } } };
    };
    const respond = async (work, context) => {
      try { return answer(await work()); } catch (error) { const failure = failed(error, context); return answer(failure.body, failure.status, failure.headers); }
    };
    const refused = () => answer({ error: { message: 'Open the page to continue.', code: 'chat_origin_not_allowed' } }, 403);
    const html = (text, status, headers) => new Response(text, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
    const unavailable = (title, message, status = 404, extra = {}) => html(unavailablePage({ title, message, ...extra }), status, UNAVAILABLE_HEADERS);

    // --- Who a learner is ------------------------------------------------------------------------

    const learnerOf = async (code, visitor) => {
      const seen = await store.get(keys.visitor(code, visitor));
      return seen ? store.get(keys.learner(code, seen.learner)) : null;
    };
    const newLearner = async (course, visitor, address) => {
      if (address && !withinMinute(`new:a:${address}`, PER_MINUTE.home[1])) throw later('Too many requests. Wait a minute and try again.');
      let learnerCode = newCode();
      while (await store.get(keys.byCode(course.code, learnerCode))) learnerCode = newCode();
      const learner = { id: `lrn_${randomId()}`, code: learnerCode, created_at: new Date(now()).toISOString() };
      await store.put(keys.learner(course.code, learner.id), learner);
      await store.put(keys.byCode(course.code, learnerCode), { learner: learner.id });
      await store.put(keys.visitor(course.code, visitor), { learner: learner.id });
      return learner;
    };
    // shortcut: two instances starting at once can each make a salt, and the loser's learners get new codes; make it once at deploy if a server runs many.
    let salting = null;
    const identitySalt = () => (salting ??= (async () => {
      const held = await store.get('identity-salt');
      if (held?.salt) return held.salt;
      const salt = randomId();
      await store.put('identity-salt', { salt });
      return salt;
    })());
    // Signed in through a proxy: the learner its header names, kept by a salted hash (a list of emails hashed
    // elsewhere finds nobody here; the salt is in the store, so someone holding the store can still try one), and this browser theirs.
    const fromHeader = async (course, request, visitor) => {
      const named = String(request.headers.get(learnerHeader) || '').trim();
      if (!named) throw pageError('Sign in through your school to open this course.', 401, 'sign_in_required');
      const key = `courses/${course.code}/identities/${await sha256(`${await identitySalt()}:${named}`)}`;
      const found = await store.get(key);
      const learner = found ? await store.get(keys.learner(course.code, found.learner)) : await newLearner(course, visitor);
      if (!found) await store.put(key, { learner: learner.id });
      else await store.put(keys.visitor(course.code, visitor), { learner: learner.id });
      return learner;
    };
    const known = async (activity, visitor) => {
      const learner = await learnerOf(activity.code, visitor);
      if (!learner) throw pageError('Say who you are to start.', 403, 'join_required');
      return learner;
    };
    const me = (learner) => ({ code: learner.code, name: null, section: null });

    // An activity's place for a learner: where they may use it now.
    const gate = (activity) => {
      const { state } = releaseState(activity, { now: now() });
      if (state === 'upcoming') throw pageError('This activity hasn’t opened yet.', 403, 'activity_not_open');
      if (state === 'closed') throw pageError('This activity has closed. Ask your teacher if you need more time.', 403, 'activity_closed');
      if (state !== 'open') throw pageError('This activity isn’t open for your class yet.', 403, 'activity_not_open');
    };
    const progressOf = (activity, learner) => store.get(keys.progress(activity.code, learner.id, activity.key));
    const stepOf = async (activity, learner) => {
      const row = await progressOf(activity, learner);
      return { index: Math.min(row?.step || 0, (activity.workspace?.steps?.length || 1) - 1), at: row?.step_at || row?.opened_at || null };
    };
    const atStep = async (activity, learner, what) => {
      const steps = activity.workspace?.steps;
      if (!steps) return null;
      const at = await stepOf(activity, learner);
      stepAllows(steps, at.index, what);
      return { ...at, step: steps[at.index] };
    };
    const allDone = async (activity, learner, row) => {
      for (const panel of activity.workspace?.panels || []) {
        if (panel.type === 'writing' && panel.submit !== false && !(await store.get(keys.draft(activity.code, learner.id, activity.key, panel.id)))?.submitted_at) return false;
        if (panel.type === 'questions') {
          const answered = new Set(((await store.get(keys.answers(activity.code, learner.id, activity.key, panel.id)))?.rows || []).map((entry) => entry.item));
          if (answered.size < (activity.sets.get(panel.set_id)?.items.length || 0)) return false;
        }
        if (panel.type === 'embed' && panel.completes && !row?.completed?.[panel.id]) return false;
      }
      return true;
    };
    const touch = async (activity, learner, kind, more = {}) => {
      const key = keys.progress(activity.code, learner.id, activity.key);
      const at = new Date(now()).toISOString();
      const row = { opened_at: at, ...(await store.get(key)), last_at: at, ...more };
      const how = await doneHow({ doneWhen: activity.done_when, panels: activity.workspace?.panels || [], kind, allDone: () => allDone(activity, learner, row) });
      if (how && !row.done_at) Object.assign(row, { done_at: at, done_how: how });
      await store.put(key, row);
      return row;
    };
    const record = async (activity, learner, events, session) => {
      if (!events.length) return 0;
      const at = now();
      await store.put(`${keys.events(activity.code, learner.id, activity.key)}${new Date(at).toISOString()}-${randomId()}`, { activity: activity.key, session: /^[A-Za-z0-9_-]{8,64}$/.test(String(session || '')) ? session : null, events });
      return events.length;
    };

    // --- A message ---------------------------------------------------------------------------------

    async function postMessage(page, request, url, context, body) {
      if (body?.audio) throw pageError('This assistant can’t listen to recordings. Type your message instead.', 400, 'voice_not_available');
      if (Array.isArray(body?.attachments) && body.attachments.length) throw pageError('This assistant can’t read attachments here. Paste the part you mean instead.', 400, 'attachments_not_available');
      const { settings } = page;
      const { message, visitor } = readMessage(body, settings);
      // What the AI did goes only to a request the host granted it, on that request's own stream.
      const stream = body?.stream === true ? sseStream() : null;
      const watched = stream ? await panelFor(page, request, url, context) : null;
      const trace = watched ? (event) => stream.event('run.trace', event) : null;
      const owner = (await sha256(`${page.id}:${visitor}`)).slice(0, 32);
      const learner = page.kind === 'activity' ? await known(page, visitor) : null;
      if (page.kind === 'activity') gate(page);
      if (!page.agent) throw pageError('This activity has no assistant.', 404, 'no_assistant');
      const address = context.address || '';
      if (!withinMinute(`chat:${page.id}:v:${owner}`, settings.limits.visitor_per_minute) || (address && !withinMinute(`chat:${page.id}:a:${address}`, MESSAGES_PER_ADDRESS))) throw later('Too many messages. Wait a minute and try again.');
      await sweepDays();
      const date = today(now());
      if (settings.limits.visitor_per_day && await addToDay(keys.day(page.id.replace(/\//g, '-'), date, owner)) > settings.limits.visitor_per_day) throw later('You’ve reached today’s message limit for this assistant. Try again tomorrow.', 3600, 'chat_page_visitor_limit');
      if (await addToDay(keys.day(page.id.replace(/\//g, '-'), date)) > settings.daily_limit) throw later('This assistant has answered all it can for today. Try again tomorrow.', 3600, 'chat_page_daily_limit');
      const at = learner ? await atStep(page, learner, { ai: true }) : null;
      // A conversation continues only for the visitor who started it; a step that starts afresh takes none begun before it.
      const user = learner?.id || `chat:${owner}`;
      let earlier = null;
      if (typeof body?.conversation_id === 'string' && CONVERSATION_ID.test(body.conversation_id)) {
        const stored = await store.get(`conversations/${body.conversation_id}`);
        if (stored?.user === user && stored.agent === page.agent.slug && !(at?.step.chat === 'new' && at.at && stored.created_at < at.at)) earlier = { id: body.conversation_id, count: stored.count || 0 };
      }
      const startedAt = new Date(now()).toISOString();
      // What the learner has open, as its panels allow the AI to see it; never a key in what the page
      // shows, and only a panel open at their step counts.
      const state = panelOpenAt(page.workspace?.steps, at?.index ?? 0, body?.workspace?.panel) ? body?.workspace : null;
      const open = page.workspace?.panels.find((panel) => panel.id === state?.panel);
      const versions = open?.type === 'writing' && open.context?.versions && learner ? await recentVersions(page, learner, open, state) : {};
      const hintsOpened = open?.type === 'questions' && open.hints && learner ? await hintsGiven(page, learner, open, state) : 0;
      const teaching = await teachingOf(page);
      const context_ = page.kind === 'activity' ? workspaceContext(page.workspace, state, page.sets, { ...versions, hintsOpened }, page.open, teaching) : null;
      const signals = sanitizeSignals(page.level !== 'minimal' ? body?.signals : { source: body?.signals?.source });
      const previous = learner && page.level !== 'minimal' && body?.after && typeof body.after === 'object' ? noteAfter(page, owner, body.after) : null;
      const opened = openedNow(page.workspace, state, page.level);
      const site = embedSite(body?.site);
      const runId = `agtr_${crypto.randomUUID().replaceAll('-', '')}`;
      const begun = now();
      const run = async (onProgress, onAnswer) => {
        await previous;
        let result;
        const hooks = { ...progressHooks(onProgress), ...(settings.stream_replies !== false && onAnswer ? { onAnswer } : {}) };
        trace?.({ kind: 'turn', message, teaching: settingsShown(teaching) });
        const listening = trace ? heardIn(watched, message, teaching).then((items) => { if (items.length) trace({ kind: 'heard', items }); }).catch(() => {}) : null;
        let conversationId;
        // No signal: a learner who closes the tab mid-turn keeps the turn in their conversation, for when
        // they come back. Only the API's runs stop on a hang-up.
        try {
          ({ result, conversationId } = await ctx.runInConversation(page.agent, { text: message, history: [], context: context_, teaching: page.kind === 'activity' ? false : teaching || false, silent: true, user, mode: 'server', conversationId: earlier?.id ?? null }, trace ? watchHooks(trace, hooks) : hooks, store));
        } catch (error) {
          ctx.log({ at: new Date().toISOString(), request_id: context.requestId, page: page.slug, run_id: null, code: error?.code || 'agent_run_failed', duration_ms: now() - begun });
          trace?.({ kind: 'failed', message: String(error?.message || error) });
          throw Object.assign(error, { fromRun: true });
        }
        const reply = chatReply({ output: result.output, conversationId, runId });
        // A package's file is linked on this server: the renderer takes only whole addresses.
        for (const cite of reply.reply.citations) if (String(cite.url || '').startsWith('/package-files/')) cite.url = `${url.origin}${cite.url}${cite.page ? `#page=${cite.page}` : ''}`;
        await listening;
        trace?.({ kind: 'reached', text: reply.reply.text, citations: reply.reply.citations, outcome: result.steps?.filter((step) => step.nodeType === 'vetting').at(-1)?.output?.outcome ?? null });
        await keepTurn(page, { learner, owner, runId, startedAt, message, result, reply, conversationId, turnIndex: Math.floor((earlier?.count || 0) / 2) + 1, signals, opened, site, teaching });
        ctx.log({ at: new Date().toISOString(), request_id: context.requestId, page: page.slug, run_id: runId, status: 200, duration_ms: now() - begun, model_calls: result.modelCalls, tokens: result.usage?.total });
        return reply;
      };
      if (body?.stream !== true) return answer(await run());
      const work = runEvents(stream, { slug: page.slug, run, finish: (reply) => ({ body: reply }), fail: (error) => failed(error, context) });
      context.waitUntil?.(work);
      return new Response(stream.readable, { status: 200, headers: { ...SSE_HEADERS, ...noStore } });
    }

    const recentVersions = async (page, learner, panel, state) => {
      const prefix = keys.events(page.code, learner.id, page.key);
      const rows = [];
      for (const key of (await store.list(prefix)).slice(-40).reverse()) for (const event of [...((await store.get(key))?.events || [])].reverse()) if (event.panel === panel.id && event.type === 'writing.snapshot') rows.push({ data: event.data, at: event.at });
      const c = panel.context;
      return { versions: c.draft !== 'none' ? versionsFrom(rows, { limit: c.versions, current: state?.draft, field: 'draft' }) : [], planVersions: c.plan && panel.plan ? versionsFrom(rows, { limit: c.versions, current: state?.plan, field: 'plan' }) : [] };
    };

    // How many hints this learner was given on the question, from the record of giving them.
    // shortcut: the latest 200 batches of events; a hint older than those reads as not given, until a store keeps hints apart.
    const hintsGiven = async (page, learner, panel, state) => {
      let last = -1;
      for (const key of (await store.list(keys.events(page.code, learner.id, page.key))).slice(-200)) for (const event of (await store.get(key))?.events || []) if (event.panel === panel.id && event.type === 'questions.hint' && event.item === state?.item) last = Math.max(last, Number(event.data?.index) || 0);
      return last + 1;
    };

    async function keepTurn(page, { learner, owner, runId, startedAt, message, result, reply, conversationId, turnIndex, signals, opened, site, teaching }) {
      const turnKey = `${learner ? keys.turns(page.code, learner.id) : keys.chatTurn(page.slug, owner)}${startedAt}-${runId}`;
      // Only the steps a teacher reads: the learner's message and each review.
      const steps = (result.steps || []).filter((step) => ['input', 'vetting'].includes(step.nodeType));
      const run = { run_id: runId, label: `${page.title || page.slug}, ${startedAt}`, agent: page.agent.name, activity: page.title || null, teaching: teaching || null, output: { text: reply.reply.text }, steps };
      await store.put(turnKey, { run_id: runId, activity: page.key || page.slug, conversation_id: conversationId, turn_index: turnIndex, started_at: startedAt, message, reply: reply.reply.text, signals: signals || null, after: null, rating: null, opened: opened || null, ...(site ? { site } : {}), run });
      await store.put(keys.run(page, runId), { key: turnKey, owner, started_at: startedAt });
      if (traces) await store.put(keys.trace(runId), { object: 'turn.trace', run_id: runId, agent: page.agent.slug, started_at: startedAt, teaching: teaching || null, usage: result.usage || null, steps: result.steps || [], output: { text: reply.reply.text } });
    }

    const turnOf = async (page, owner, runId) => {
      if (!RUN_ID.test(runId)) return null;
      const found = await store.get(keys.run(page, runId));
      if (found?.owner !== owner) return null;
      const turn = await store.get(found.key);
      return turn ? { key: found.key, turn } : null;
    };
    async function noteAfter(page, owner, after) {
      const clean = sanitizeAfter(after);
      if (!clean) return false;
      const found = await turnOf(page, owner, String(after.run_id || ''));
      if (found) await store.put(found.key, { ...found.turn, after: clean });
      return Boolean(found);
    }

    // --- The endpoints every page has -----------------------------------------------------------------

    const postJson = async (request) => {
      let body = {};
      try { body = await ctx.readJson(request); } catch (error) { if (error.status === 413) throw error; }
      return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    };

    async function pageEndpoint(page, name, request, url, context) {
      if (request.method !== 'POST') return null;
      if (!sameOrigin(request, url)) return name === 'after' ? new Response(null, { status: 204 }) : refused();
      const address = context.address || '';
      const body = await postJson(request).catch((error) => error);
      if (body instanceof Error) { const failure = failed(body, context); return answer(failure.body, failure.status, failure.headers); }
      const visitor = String(body?.visitor || '');
      const owner = async () => (await sha256(`${page.id}:${readVisitor(body, 'Reload the page to continue.')}`)).slice(0, 32);
      if (name === 'messages') {
        try { return await postMessage(page, request, url, context, body); } catch (error) { const failure = failed(error, context); return answer(failure.body, failure.status, failure.headers); }
      }
      if (name === 'after') {
        // A beacon: never an error the page would have to handle.
        try { limited('after', visitor, address); if (page.level !== 'minimal') await noteAfter(page, await owner(), { ...body.after, run_id: body.run_id }); } catch { /* nothing to report */ }
        return new Response(null, { status: 204 });
      }
      return respond(async () => {
        if (name === 'transcribe') throw pageError('This assistant can’t listen to recordings. Type your message instead.', 400, 'voice_not_available');
        if (name === 'study') throw pageError('This page isn’t part of a study.', 404, 'study_not_found');
        if (name === 'rate') {
          limited('rate', visitor, address);
          const found = await turnOf(page, await owner(), String(body.run_id || ''));
          if (!found) throw pageError('That reply can’t be rated here.', 404, 'turn_not_found');
          const rating = body.rating === 1 || body.rating === -1 ? body.rating : null;
          await store.put(found.key, { ...found.turn, rating });
          return { object: 'chat.rating', run_id: body.run_id, rating };
        }
        if (name === 'learner') {
          readVisitor(body);
          limited('learner', visitor, address);
          if (page.kind === 'chat') {
            if (body.code != null || body.entry != null || body.link != null) throw pageError('This chat doesn’t ask who you are.', 400, 'join_not_asked');
            return { object: 'chat.learner', identify: 'browser', joined: false, code: null, name: null, study: null };
          }
          const learner = await learnerOf(page.code, visitor);
          return { object: 'chat.learner', identify: learnerHeader ? 'browser' : 'code', joined: Boolean(learner), code: learner?.code || null, name: null, variant: null };
        }
        if (page.kind !== 'activity') {
          if (['events', 'draft', 'questions', 'annotations'].includes(name)) { if (name === 'events') return { object: 'workspace.events', recorded: 0 }; throw pageError('That isn’t on this page.', 404, 'panel_not_found'); }
          return null;
        }
        return activityEndpoint(page, name, body, visitor, address);
      }, context);
    }

    async function activityEndpoint(activity, name, body, visitor, address) {
      readVisitor(body, 'Reload the page to continue.');
      const panelOf = (type) => {
        const panel = PANEL.test(String(body.panel || '')) ? activity.workspace?.panels.find((item) => item.id === body.panel && item.type === type) : null;
        if (!panel) throw pageError(type === 'questions' ? 'Those questions aren’t on this page.' : type === 'reading' ? 'That reading isn’t on this page.' : 'That writing task isn’t on this page.', 404, 'panel_not_found');
        return panel;
      };
      if (name === 'events') {
        if (!activity.workspace) return { object: 'workspace.events', recorded: 0 };
        limited('events', visitor, address);
        const learner = await known(activity, visitor);
        gate(activity);
        const list = keptEvents(activity.workspace, body.events, { level: activity.level });
        const recorded = await record(activity, learner, list, body.session);
        const completed = Object.fromEntries(list.filter((event) => event.type === 'embed.event' && (event.data.verb === 'completed' || event.data.completion === true)).map((event) => [event.panel, true]));
        const row = await progressOf(activity, learner);
        await touch(activity, learner, 'event', Object.keys(completed).length ? { completed: { ...row?.completed, ...completed } } : {});
        return { object: 'workspace.events', recorded };
      }
      if (name === 'draft') {
        limited('draft', visitor, address);
        if (!activity.workspace) throw pageError('That writing task isn’t on this page.', 404, 'panel_not_found');
        const learner = await known(activity, visitor);
        gate(activity);
        if (body.action === 'load') {
          const drafts = {};
          for (const panel of activity.workspace.panels.filter((item) => item.type === 'writing')) {
            const saved = await store.get(keys.draft(activity.code, learner.id, activity.key, panel.id));
            if (saved) drafts[panel.id] = saved;
          }
          return { object: 'workspace.drafts', drafts };
        }
        const panel = panelOf('writing');
        await atStep(activity, learner, { panelId: panel.id });
        const key = keys.draft(activity.code, learner.id, activity.key, panel.id);
        const before = await store.get(key);
        if (panel.lock_on_submit && before?.submitted_at) throw pageError('You’ve handed this in, so it can’t be changed.', 409, 'draft_locked');
        // base: the version the page's text was built on: nothing written on another device is saved over.
        const base = body.base === undefined ? undefined : typeof body.base === 'string' ? body.base.slice(0, 40) : null;
        if (base !== undefined && (before?.updated_at ?? null) !== base) throw pageError('This was changed on another device since it opened here.', 409, 'draft_changed', { details: { draft: { plan: before?.plan || '', draft: before?.draft || '', submitted_at: before?.submitted_at || null, updated_at: before?.updated_at || null } } });
        const texts = draftTexts(panel, { plan: body.plan, draft: body.draft });
        const at = new Date(now()).toISOString();
        const submit = body.submit === true;
        await store.put(key, { plan: texts.plan || '', draft: texts.draft, words: texts.words, submitted_at: submit ? at : before?.submitted_at || null, updated_at: at });
        await touch(activity, learner, submit ? 'submit' : 'draft');
        return { object: 'workspace.draft', panel: panel.id, words: texts.words, submitted_at: submit ? at : null, updated_at: at, locked: Boolean(panel.lock_on_submit && submit) };
      }
      if (name === 'questions') {
        limited('questions', visitor, address);
        const panel = panelOf('questions');
        const learner = await known(activity, visitor);
        gate(activity);
        await atStep(activity, learner, { panelId: panel.id });
        const set = activity.sets.get(panel.set_id);
        if (!set) throw pageError('Those questions aren’t available.', 404, 'question_set_not_found');
        const key = keys.answers(activity.code, learner.id, activity.key, panel.id);
        const rows = (await store.get(key))?.rows || [];
        const replies = questionReplies(panel, set);
        if (body.action === 'state') return replies.state(answersSoFar(rows));
        if (body.action === 'results') return replies.results(answersSoFar(rows));
        const item = set.items.find((entry) => entry.id === body.item);
        if (!item) throw pageError('That question isn’t in the set.', 404, 'question_not_found');
        const at = new Date(now()).toISOString();
        if (body.action === 'hint') {
          const { event, reply } = replies.hint(item, body.index);
          await record(activity, learner, keptEvents(activity.workspace, [{ panel: panel.id, type: 'hint', item: item.id, at, data: event }], { level: activity.level, trusted: true }), body.session);
          return reply;
        }
        const tries = answersSoFar(rows)[item.id]?.tries || 0;
        replies.tries(item, tries);
        const graded = gradeResponse(item, body.response);
        const attempt = tries + 1;
        const count = (value, max) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(Math.round(Number(value)), max) : undefined);
        const data = { response: typeof graded.response === 'string' ? graded.response : JSON.stringify(graded.response), ...(graded.correct === null ? {} : { correct: graded.correct, score: graded.score }), attempt, rt_ms: count(body.rt_ms, 1e8), changes: count(body.changes, 1e7), hints: count(body.hints, 100), ai_before: body.ai_before === true, set: set.id, version: set.version, item_type: item.type, skill: item.skill || set.title, hints_available: item.hints?.length || 0 };
        await store.put(key, { rows: [...rows, { item: item.id, data }], updated_at: at });
        await record(activity, learner, keptEvents(activity.workspace, [{ panel: panel.id, type: 'answer', item: item.id, at, data }], { level: activity.level, trusted: true }), body.session);
        await touch(activity, learner, 'answer');
        return replies.answer(item, graded, attempt);
      }
      if (name === 'annotations') {
        limited('notes', visitor, address);
        const panel = panelOf('reading');
        const learner = await known(activity, visitor);
        gate(activity);
        const prefix = keys.notes(activity.code, learner.id, activity.key, panel.id);
        const mine = async () => (await Promise.all((await store.list(prefix)).map((key) => store.get(key)))).filter((note) => note && !note.deleted_at);
        const shown = ({ deleted_at: _gone, ...note }) => note;
        if (body.action === 'list') return { object: 'list', data: (await mine()).sort((a, b) => (a.page || 0) - (b.page || 0) || String(a.created_at).localeCompare(String(b.created_at))).map(shown) };
        await atStep(activity, learner, { panelId: panel.id });
        if (!panel.highlights) throw pageError('This reading doesn’t take highlights.', 403, 'annotations_off');
        const at = new Date(now()).toISOString();
        const id = String(body.id || '');
        if (id && !NOTE_ID.test(id)) throw pageError('That highlight isn’t there anymore.', 404, 'annotation_not_found');
        if (body.action === 'remove') {
          const note = id ? await store.get(`${prefix}${id}`) : null;
          if (note) await store.put(`${prefix}${id}`, { ...note, deleted_at: at, updated_at: at });
          return { object: 'annotation', id, removed: true };
        }
        const { note, color } = noteOf(panel, body);
        if (id) {
          const stored = await store.get(`${prefix}${id}`);
          if (!stored || stored.deleted_at) throw pageError('That highlight isn’t there anymore.', 404, 'annotation_not_found');
          const next = { ...stored, note, color, updated_at: at };
          await store.put(`${prefix}${id}`, next);
          return shown(next);
        }
        if ((await mine()).length >= 500) throw pageError('That’s a lot of highlights: remove some before adding more.', 409, 'annotations_full');
        const page = Number.parseInt(body.page, 10);
        const made = { id: `ann_${randomId()}`, page: Number.isInteger(page) && page > 0 ? page : null, target: annotationTarget(body.target), note, color, created_at: at, updated_at: at };
        await store.put(`${prefix}${made.id}`, made);
        await touch(activity, learner, 'event');
        return shown(made);
      }
      if (name === 'step') {
        limited('step', visitor, address);
        const steps = activity.workspace?.steps;
        if (!steps) throw pageError('This activity has no steps.', 404, 'no_steps');
        const learner = await known(activity, visitor);
        gate(activity);
        let at = await stepOf(activity, learner);
        if (body.action === 'next') {
          const row = await touch(activity, learner, 'event');
          at = { index: Math.min(row.step || 0, steps.length - 1), at: row.step_at || row.opened_at };
          const next = stepMove(steps, at, Number(body.to), { now: now() });
          if (next) {
            const moved = new Date(now()).toISOString();
            await store.put(keys.progress(activity.code, learner.id, activity.key), { ...row, step: Number(body.to), step_at: moved });
            at = { index: Number(body.to), at: moved };
          }
        }
        return stepReply(activity.workspace, activity.sets, at);
      }
      if (name === 'open' || name === 'done') {
        limited(name, visitor, address);
        const learner = await known(activity, visitor);
        gate(activity);
        await touch(activity, learner, name === 'open' ? 'open' : 'self');
        if (name === 'done') return { object: 'course.done' };
        if (activity.role !== 'survey' || !activity.survey?.url) return { object: 'course.open' };
        const to = new URL(activity.survey.url);
        to.searchParams.set(activity.survey.param || 'pid', learner.code);
        return { object: 'course.open', redirect: to.href };
      }
      return null;
    }

    // A Reading panel's PDF, for a learner this activity lets in now: posted with their visitor, like every panel call.
    async function readingPdf(activity, panelId, request, url, context) {
      if (!sameOrigin(request, url)) return refused();
      try {
        const body = await postJson(request);
        const visitor = readVisitor(body, 'Reload the page to continue.');
        limited('reading', visitor, context.address || '');
        const panel = PANEL.test(panelId) ? activity.workspace?.panels.find((item) => item.id === panelId && item.type === 'reading') : null;
        if (!panel) throw pageError('That reading isn’t on this page.', 404, 'panel_not_found');
        const learner = await known(activity, visitor);
        gate(activity);
        await atStep(activity, learner, { panelId: panel.id });
        const file = (activity.doc.files || []).find((item) => item.ref === panel.document.file_ref);
        const bytes = file ? await packageFileBytes(file, { dir: activity.dir, zip: activity.zip, readPath, fetch: download }) : null;
        if (!bytes) throw pageError('This document isn’t available.', 404, 'document_not_found');
        return new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' } });
      } catch (error) {
        const failure = failed(error.status && error.code ? error : Object.assign(new Error('This document isn’t available.'), { status: 404, code: 'document_not_found' }), context);
        return answer(failure.body, failure.status, failure.headers);
      }
    }

    // --- Pages -----------------------------------------------------------------------------------------

    const host = (page) => ({ voice: false, speech: false, attachments: { images: false, files: false }, ratings: true, signals: page.level !== 'minimal', asks: false, assets: assets?.names || {}, links, codes: {}, slots: {} });
    // Who may see what the AI did: the host's grant, checked on each request. Never a learner.
    const granted = async (request, url, context) => (traces === 'token' ? holdsToken(request) : traces === 'local' ? isLocal(request, url, context) : false);
    // On a learner's page, only where a teacher asked for it too: a shared computer's browser keeps their cookie until it closes.
    const asksForPanel = (url) => traces !== 'token' || url.searchParams.get('panel') === '1';
    async function panelFor(page, request, url, context) {
      if (!panel || !asksForPanel(url) || !await granted(request, url, context)) return null;
      return typeof panel === 'function' ? panel(page, request, url) : panel;
    }
    const heardIn = async (watched, message, teaching) => {
      const misconceptions = teachingSettings(teaching)?.misconceptions?.map((item) => item.description) || [];
      return watched.listen && misconceptions.length ? watched.listen({ message, misconceptions }) : [];
    };
    const servePage = async (page, mode, { course = null, sites = '*', request, url, context }) => {
      const nonce = crypto.randomUUID().replace(/-/g, '');
      const reads = mode !== 'widget' && (page.workspace?.panels || []).some((item) => item.type === 'reading');
      const watched = mode === 'page' ? await panelFor(page, request, url, context) : null;
      const signedIn = traces === 'token';
      const beside = watched ? watchSlot({ ...watched, teaching: await teachingOf(page), signOut: signedIn ? '/teacher/signout' : null }, nonce) : null;
      // The panel's page goes on asking for it, and no other site frames it.
      return html(renderChatPage({ slug: page.slug, mode, settings: page.settings, workspace: page.workspace, course, how: page.how, sets: page.sets, host: { ...host(page), slots: beside ? { beside } : {}, query: beside && signedIn ? '?panel=1' : '' } }, nonce), 200, chatPageHeaders(nonce, { sites: beside ? "'self'" : sites, frames: embedOrigins(page.workspace), reads, fonts: Boolean(beside) }));
    };

    async function chatRoute(slug, rest, request, url, context) {
      const page = chats.get(slug);
      if (!page) {
        if (request.method !== 'GET' || (rest && rest !== 'config')) return answer({ error: { message: 'This chat isn’t available.', code: 'chat_page_not_found' } }, 404);
        return rest === 'config' ? answer({ error: { message: 'This chat isn’t available.', code: 'chat_page_not_found' } }, 404) : unavailable('This chat isn’t available', 'The assistant may have been paused or turned off. Check the link with whoever shared it.');
      }
      const sites = page.settings.allowed_sites || [];
      if (!rest && request.method === 'GET') return servePage(page, ['widget', 'inline'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'page', { sites: sites.length ? sites.join(' ') : '*', request, url, context });
      if (rest === 'config' && request.method === 'GET') {
        // The chat button asks before drawing itself: a site not on the list shows nothing.
        const origin = request.headers.get('origin');
        const cors = origin && embeds ? { 'access-control-allow-origin': origin, vary: 'Origin' } : { vary: 'Origin' };
        if (origin && sites.length && origin !== url.origin && !sites.includes(origin)) return ctx.json(403, { error: { message: 'This website isn’t on the chat page’s list of allowed websites.', code: 'chat_site_not_allowed' } }, { 'cache-control': 'public, max-age=30', vary: 'Origin' });
        return ctx.json(200, chatPageConfig(page.settings), { 'cache-control': 'public, max-age=60', ...cors });
      }
      return rest ? pageEndpoint(page, rest, request, url, context) : null;
    }

    const asked = { title: 'Enter your code', text: 'Use the code you were shown here before. It brings back your work on any computer.', label: 'Your code', code: true };
    const askedClass = { title: 'Enter your class code', text: 'Your teacher gave your class a code. If you have a code of your own from before, use that to get back to your work.', label: 'Your code', code: true };

    function homePage(course) {
      const nonce = crypto.randomUUID().replace(/-/g, '');
      return html(renderHome({ course, how: { identify: learnerHeader ? 'browser' : 'code' }, ask: classCode ? askedClass : asked, reenter: !classCode && !learnerHeader, tellsCode: !learnerHeader, host: {} }, nonce), 200, pageHeaders(nonce, { ancestors: '*' }));
    }

    async function courseHome(course, body, address) {
      const visitor = readVisitor(body, 'Reload the page to continue.');
      limited('home', visitor, address);
      const base = { object: 'course.home', course: { title: course.title, description: course.description, audience: course.audience, shared_devices: course.shared_devices, identify: learnerHeader ? 'browser' : 'code', ask: null, link_param: null, sections_from: 'none', preview: false, return_url: null, level: course.data_level, keep_recordings: false, info: course.info }, study: null };
      let learner = await learnerOf(course.code, visitor);
      if (!learner && classCode) return { ...base, learner: null, needs: 'join' };
      learner ||= await newLearner(course, visitor, address);
      const cards = [];
      for (const activity of course.activities.values()) {
        const state = releaseState(activity, { now: now() });
        if (state.state === 'hidden') continue;
        const mine = await progressOf(activity, learner);
        cards.push({ unit_id: activity.unit_id, key: activity.key, title: activity.title, summary: activity.summary, role: activity.role, kind: kindOf(activity, { workspace: activity.workspace }), minutes: activity.minutes, ...state, progress: mine?.done_at ? 'done' : mine?.opened_at ? 'started' : 'new' });
      }
      return { ...base, learner: me(learner), needs: null, return_url: null, units: homeUnits(course.units, cards) };
    }

    async function joinCourse(course, body, address) {
      const visitor = readVisitor(body, 'Reload the page to continue.');
      limited(body.fresh === true ? 'fresh' : 'join', visitor, address);
      if (body.fresh === true) {
        if (classCode) throw pageError('Enter your class code to start.', 400, 'join_not_asked');
        const learner = (await learnerOf(course.code, visitor)) || await newLearner(course, visitor, address);
        return { object: 'course.learner', joined: true, code: learner.code, name: null };
      }
      if (body.code == null) throw pageError('Type your code.', 400, 'join_not_asked');
      const said = String(body.code).toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 64);
      const found = said ? await store.get(keys.byCode(course.code, said)) : null;
      if (found) {
        await store.put(keys.visitor(course.code, visitor), { learner: found.learner });
        const learner = await store.get(keys.learner(course.code, found.learner));
        return { object: 'course.learner', joined: true, code: learner.code, name: null };
      }
      if (classCode && said && said === String(classCode).toUpperCase().replace(/[^0-9A-Z]/g, '')) {
        const learner = (await learnerOf(course.code, visitor)) || await newLearner(course, visitor, address);
        return { object: 'course.learner', joined: true, code: learner.code, name: null };
      }
      throw pageError('That code isn’t right. Check it and try again.', 404, 'code_not_found');
    }

    async function courseRoute(code, rest, request, url, context) {
      const course = courses.get(code);
      if (!course) return request.method === 'GET' && (!rest || !rest.includes('/')) ? unavailable('Not available', 'This course isn’t open right now. Check the link with your teacher.') : answer({ error: { message: 'This course isn’t available.', code: 'course_not_found' } }, 404);
      const address = context.address || '';
      if (!rest) return request.method === 'GET' ? homePage(course) : null;
      if (learnerHeader && request.method === 'POST' && sameOrigin(request, url)) {
        // Who is here comes from the proxy, on every call, before anything else is read.
        try { await fromHeader(course, request, readVisitor(await ctx.readJson(request.clone()).catch(() => ({})), 'Reload the page to continue.')); }
        catch (error) { const failure = failed(error, context); return answer(failure.body, failure.status, failure.headers); }
      }
      if (['home', 'join', 'section', 'study'].includes(rest)) {
        if (request.method !== 'POST') return null;
        if (!sameOrigin(request, url)) return refused();
        return respond(async () => {
          const body = await postJson(request);
          if (rest === 'home') return courseHome(course, body, address);
          if (rest === 'join') return joinCourse(course, body, address);
          throw pageError(rest === 'study' ? 'This course isn’t part of a study.' : 'This course has no classes to choose from.', 404, rest === 'study' ? 'study_not_found' : 'section_not_found');
        }, context);
      }
      const [key, ...more] = rest.split('/');
      const activity = course.activities.get(key);
      if (!activity) return request.method === 'GET' && !more.length ? unavailable('Not available', 'This activity isn’t in the course.', 404, { back: { href: `/course/${code}`, label: 'Go to the course' } }) : answer({ error: { message: 'This activity isn’t in the course.', code: 'activity_not_found' } }, 404);
      if (!more.length) {
        if (request.method !== 'GET') return null;
        if (activity.role === 'survey') return Response.redirect(new URL(`/course/${code}?open=${encodeURIComponent(key)}`, url), 302);
        const state = releaseState(activity, { now: now() });
        if (state.state !== 'open') {
          const at = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: course.doc.course.time_zone || 'UTC', timeZoneName: 'short' });
          const text = state.state === 'upcoming' ? `“${activity.title}” opens ${at(state.opens_at)}.` : state.state === 'closed' ? `“${activity.title}” closed ${at(state.closes_at)}. Ask your teacher if you need more time.` : `“${activity.title}” isn’t open yet. Your teacher will open it when it’s time.`;
          return unavailable('Not open', text, 200, { back: { href: `/course/${code}`, label: `Back to ${course.title}` }, color: activity.settings.color, look: activity.settings.course_theme });
        }
        return servePage(activity, 'page', { request, url, context, course: { title: course.title, url: `/course/${code}`, activity: activity.title, level: activity.level, identify: learnerHeader ? 'browser' : 'code', shared: course.shared_devices, done: doneButton(activity.done_when, activity.workspace?.panels || []) ? 'button' : 'auto' } });
      }
      if (more[0] === 'reading' && more.length === 2 && request.method === 'POST') return readingPdf(activity, more[1], request, url, context);
      return more.length === 1 ? pageEndpoint(activity, more[0], request, url, context) : null;
    }

    // --- The teacher's page: behind the token, which is never taken from an address -------------------

    const COOKIE = 'viable_teacher';
    // Reached by what the panel's pages need, and no further.
    const COOKIE_PATH = panel && traces === 'token' ? '/' : '/teacher';
    const isLocal = (request, url, context) => isLocalRequest(request, url, context);
    const secret = () => ctx.options.token || teacherToken;
    const sign = async (exp) => hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(`viable-teacher:${exp}`)));
    const sameValue = (a, b) => a.length === b.length && [...a].reduce((difference, ch, i) => difference | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
    const tokenIs = async (given) => sameValue(await sha256(given), await sha256(secret()));
    const newSession = async () => { const exp = now() + SESSION_MS; return `${exp}.${await sign(exp)}`; };
    // The value is its expiry and a signature over it, so the server decides when it ends.
    const validSession = async (request) => {
      const found = /(?:^|;\s*)viable_teacher=(\d{1,16})\.([a-f0-9]{64})/.exec(request.headers.get('cookie') || '');
      return Boolean(found) && Number(found[1]) > now() && sameValue(found[2], await sign(found[1]));
    };
    const holdsToken = async (request) => {
      if (!secret()) return false;
      const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
      return bearer ? tokenIs(bearer) : validSession(request);
    };
    // A try-out on this machine keeps its own grant. Everywhere else the page takes a token, because a local proxy makes every visitor look like this machine.
    const localGrant = (request, url, context) => traces === 'local' && isLocal(request, url, context);
    const teacherAllowed = async (request, url, context) => (secret() ? holdsToken(request) : localGrant(request, url, context));
    const cookieFor = (value, url, extra = '') => `${COOKIE}=${value}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict${extra}${url.protocol === 'https:' ? '; Secure' : ''}`;
    // same-origin, not no-referrer: a form's post from a page that sends no referrer says its origin is null, and is refused.
    const teacherHeaders = (nonce) => ({ 'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`, 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
    const signIn = (message, status = 200) => {
      const nonce = crypto.randomUUID().replace(/-/g, '');
      const doc = `<!doctype html><html lang="en" data-theme="auto"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>The teacher’s page</title><style nonce="${nonce}">${palette(null, null)}${BASE_CSS}body{min-height:100vh;display:grid;place-items:center;padding:24px}form{width:100%;max-width:380px;display:grid;gap:12px;padding:26px;border:var(--bw) solid var(--line);border-radius:var(--r);background:var(--panel);box-shadow:var(--shadow)}h1{margin:0;font:var(--head-weight) 1.35rem/1.25 var(--font-head);letter-spacing:var(--head-track)}p{margin:0;color:var(--ink-2);font-size:.92rem}input{width:100%;padding:12px 14px;border:var(--bw) solid var(--line);border-radius:var(--r-sm);background:var(--panel);color:var(--ink)}.err{color:var(--danger)}</style></head><body><form method="post" action="/teacher"><h1>The teacher’s page</h1><p>Enter this server’s token to see what the AI did with your learners.</p><label class="sr" for="token">Token</label><input id="token" name="token" type="password" autocomplete="current-password" required autofocus>${message ? `<p class="err" role="alert">${escapeHtml(message)}</p>` : ''}<button class="btn" type="submit">Continue</button></form></body></html>`;
      return html(doc, status, teacherHeaders(nonce));
    };

    // What only a signed-in teacher's page says: how to stop, and where the panel is.
    const signedInBar = (doc, links = []) => doc.replace('<body>', () => `<body><form method="post" action="/teacher/signout" style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:flex-end;padding:8px 16px;font:14px system-ui,sans-serif">${links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.title)}</a>`).join('')}<span>Signed in as the teacher.</span><button type="submit">Sign out</button></form>`);
    const panelLinks = (course) => (panel && traces === 'token' ? [...course.activities.values()].filter((activity) => activity.agent).slice(0, 8).map((activity) => ({ title: `${activity.title}, with what the AI did`, href: `/course/${course.code}/${activity.key}?panel=1` })) : []);

    async function teacherRoute(rest, request, url, context) {
      if (request.method === 'POST' && rest === 'signout') {
        if (!sameOrigin(request, url)) return refused();
        return new Response(null, { status: 303, headers: { location: '/teacher', 'set-cookie': cookieFor('', url, '; Max-Age=0'), 'cache-control': 'no-store' } });
      }
      if (request.method === 'POST' && !rest) {
        if (!sameOrigin(request, url)) return refused();
        if (!secret()) return Response.redirect(new URL('/teacher', url), 303);
        const tooMany = (context.address && !withinMinute(`teacher:a:${context.address}`, SIGN_IN.address)) || !withinMinute('teacher:all', SIGN_IN.ceiling);
        if (tooMany) return signIn('Too many tries. Wait a minute and try again.', 429);
        let form;
        try { form = new URLSearchParams(new TextDecoder().decode(await ctx.readBody(request, SIGN_IN_BYTES))); } catch (error) { return signIn('That isn’t this server’s token.', error.status === 413 ? 413 : 400); }
        if (!await tokenIs(form.get('token') || 'none')) return signIn('That isn’t this server’s token.', 401);
        return new Response(null, { status: 303, headers: { location: '/teacher', 'set-cookie': cookieFor(await newSession(), url), 'cache-control': 'no-store' } });
      }
      if (rest.startsWith('turns/')) return traceRoute(rest, request, url, context);
      if (request.method !== 'GET') return null;
      if (!secret() && !localGrant(request, url, context)) return unavailable('The teacher’s page needs a token', 'Give this server a token to open its teacher’s page.', 403);
      if (!await teacherAllowed(request, url, context)) return signIn(null, request.headers.get('accept')?.includes('text/html') ? 200 : 401);
      if (url.searchParams.has('token')) return answer({ error: { message: 'A token doesn’t go in an address, where it would be logged and kept in a browser’s history.', code: 'token_in_url' } }, 400);
      // What there is to read: each activity with How the AI helps, or the course, and each chat page.
      const targets = [...[...courses.values()].flatMap((course) => {
        const taught = [...course.activities.values()].filter((activity) => activity.teaching);
        return (taught.length ? taught : [null]).map((activity) => ({ title: activity ? `${course.title}: ${activity.title}` : course.title, query: `course=${encodeURIComponent(course.code)}${activity ? `&activity=${encodeURIComponent(activity.key)}` : ''}`, course, activity }));
      }), ...[...chats.values()].map((page) => ({ title: page.settings.title, query: `chat=${encodeURIComponent(page.slug)}`, page }))];
      if (!targets.length) return unavailable('Nothing here yet', 'This server has no course or chat page.');
      const asked = url.searchParams.get('chat') ? chats.get(url.searchParams.get('chat')) : url.searchParams.get('course') ? courses.get(url.searchParams.get('course')) : null;
      if (rest === 'records.json') {
        const code = url.searchParams.get('chat') || url.searchParams.get('course');
        if (!asked && code) return answer({ error: { message: 'Not found.', code: 'not_found' } }, 404);
        const one = asked || targets[0].course || targets[0].page;
        return answer({ object: 'course.records', ...(one.code ? { course: one.code } : { chat: one.slug }), ...await (one.code ? learnerRecords(store, one.code) : chatRecords(store, one.slug)) });
      }
      if (rest) return null;
      const barred = (doc, links) => (secret() ? signedInBar(doc, links) : doc);
      if (!asked && targets.length > 1) {
        const nonce = crypto.randomUUID().replace(/-/g, '');
        return html(`<!doctype html><html lang="en" data-theme="auto"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>The teacher’s page</title><style nonce="${nonce}">${palette(null, null)}${BASE_CSS}main{max-width:640px;margin:0 auto;padding:44px 20px}h1{font:var(--head-weight) 1.7rem/1.2 var(--font-head);letter-spacing:var(--head-track)}ul{margin:18px 0 0;padding:0;list-style:none}li+li{border-top:1px solid var(--line-2)}a{display:block;padding:14px 2px;color:inherit;text-decoration:none}a:hover{color:var(--accent-text)}</style></head><body><main><h1>What would you like to read?</h1><ul>${targets.map((target) => `<li><a href="/teacher?${escapeHtml(target.query)}">${escapeHtml(target.title)}</a></li>`).join('')}</ul></main></body></html>`, 200, teacherHeaders(nonce));
      }
      if (asked?.slug || (!asked && targets[0].page)) {
        const page = asked || targets[0].page;
        const { records, runs } = await chatRecords(store, page.slug);
        return html(barred(teacherView({ teaching: null, records, runs, title: page.settings.title, suggestions: suggestChanges({ teaching: null, runs, records }) }), panel && traces === 'token' ? [{ title: `${page.settings.title}, with what the AI did`, href: `/chat/${page.slug}?panel=1` }] : []), 200, TEACHER_PAGE);
      }
      const course = asked || targets[0].course;
      const { records, runs } = await learnerRecords(store, course.code);
      const chosen = course.activities.get(url.searchParams.get('activity')) || targets.find((target) => target.course === course)?.activity || null;
      const teaching = chosen?.teaching || null;
      return html(barred(teacherView({ teaching, records, runs, title: chosen ? `${course.title}: ${chosen.title}` : course.title, suggestions: suggestChanges({ teaching, runs, records }) }), panelLinks(course)), 200, TEACHER_PAGE);
    }

    // What the AI did on a turn: its instructions, drafts and reviewers' reasons. Off unless the host
    // grants it; granted, only to the token holder or in a try-out on this machine. Never a learner.
    async function traceRoute(rest, request, url, context) {
      const match = /^turns\/([A-Za-z0-9_-]{8,80})\/trace$/.exec(rest);
      if (request.method !== 'GET' || !match || !traces) return answer({ error: { message: 'Not found.', code: 'not_found' } }, 404);
      if (!await granted(request, url, context)) return answer({ error: { message: 'Not found.', code: 'not_found' } }, 404);
      const trace = await store.get(keys.trace(match[1]));
      return trace ? answer(trace) : answer({ error: { message: 'Not found.', code: 'not_found' } }, 404);
    }

    // --- The server's addresses --------------------------------------------------------------------------

    // A package's file, for a citation's link: only one in a knowledge base that allows links. Never run
    // here: an HTML file on this server's address could do anything a page here can.
    const linkable = new Map();
    for (const agent of ctx.served.values()) {
      if (agent.doc?.format !== 'viable.course-package') continue;
      const at = packageFilesPath(agent.doc);
      const files = new Map((agent.doc.files || []).map((file) => [file.ref, file]));
      for (const kb of agent.doc.knowledge_bases || []) if (kb.file_links) for (const ref of kb.file_refs || []) if (files.has(ref)) linkable.set(`${at}/${ref}`, { file: files.get(ref), agent });
    }
    async function packageFile(path) {
      const found = linkable.get(path.split('/').map((part) => { try { return decodeURIComponent(part); } catch { return part; } }).join('/'));
      if (!found) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff', ...noStore } });
      const { file, agent } = found;
      const bytes = await packageFileBytes(file, { dir: agent.dir, zip: agent.zip, readPath, fetch: download }).catch(() => null);
      if (!bytes) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff', ...noStore } });
      const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(String(file.name));
      const name = String(file.name).replace(/[^\w.-]+/g, '_');
      return new Response(bytes, { status: 200, headers: { 'content-type': pdf ? 'application/pdf' : 'text/plain; charset=utf-8', 'content-disposition': `${pdf ? 'inline' : 'attachment'}; filename="${name}"`, 'content-security-policy': "default-src 'none'; sandbox", 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex', 'cache-control': 'private, max-age=300' } });
    }

    function index(url) {
      const all = [...[...courses.values()].map((course) => ({ title: course.title, href: `/course/${course.code}` })), ...[...chats.values()].map((page) => ({ title: page.settings.title, href: `/chat/${page.slug}` }))];
      if (!all.length) return null;
      if (all.length === 1) return Response.redirect(new URL(all[0].href, url), 302);
      const nonce = crypto.randomUUID().replace(/-/g, '');
      return html(`<!doctype html><html lang="en" data-theme="auto"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Pages on this server</title><style nonce="${nonce}">${palette(null, null)}${BASE_CSS}main{max-width:640px;margin:0 auto;padding:44px 20px}h1{font:var(--head-weight) 1.7rem/1.2 var(--font-head);letter-spacing:var(--head-track)}ul{margin:18px 0 0;padding:0;list-style:none}li+li{border-top:1px solid var(--line-2)}a{display:block;padding:14px 2px;color:inherit;text-decoration:none}a:hover{color:var(--accent-text)}</style></head><body><main><h1>Pages on this server</h1><ul>${all.map((page) => `<li><a href="${escapeHtml(page.href)}">${escapeHtml(page.title)}</a></li>`).join('')}</ul></main></body></html>`, 200, pageHeaders(nonce, { ancestors: "'none'" }));
    }

    async function asset(path, request) {
      if (!['GET', 'HEAD'].includes(request.method) || !ASSET.test(path) || path.split('/').includes('..') || !assets?.read) return null;
      const bytes = await assets.read(path);
      if (!bytes) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff' } });
      const type = CONTENT_TYPES[path.slice(path.lastIndexOf('.') + 1)] || 'application/octet-stream';
      return new Response(bytes, { status: 200, headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', ...(/^diagram-.*\.html$/.test(path) ? { 'content-security-policy': FRAME_CSP, 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } : {}) } });
    }

    const unset = () => unavailable('This server isn’t set up yet', 'It needs its token before anyone can use it. Set one, and open this again.', 503);
    const route = async (request, url, context) => {
      const path = url.pathname;
      // A server made for a public host stays shut until it has a token: its pages spend someone's model key.
      if (ctx.options.requireToken && !ctx.options.token && !path.startsWith(ASSET_PATH) && (path === '/' || path === '/embed.js' || path === '/teacher' || /^\/(?:chat|course|teacher|package-files|v1\/learn)\//.test(path) || /^\/v1\/agents\/[^/]+\/chat(?:\/|$)/.test(path))) return unset();
      if (request.method === 'GET' && path === '/') return index(url);
      // A browser asks on every page; behind the token it would be an error in each page's console.
      if (request.method === 'GET' && path === '/favicon.ico') return new Response(null, { status: 204, headers: { 'cache-control': 'public, max-age=86400' } });
      if (request.method === 'GET' && (path === '/embed.js' || path === '/v1/agents/embed.js')) return new Response(embedScript(url.origin), { status: 200, headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' } });
      if (path.startsWith(ASSET_PATH)) return asset(path.slice(ASSET_PATH.length), request);
      if (path.startsWith('/package-files/') && ['GET', 'HEAD'].includes(request.method)) return packageFile(path);
      if (path === '/teacher' || path.startsWith('/teacher/')) return teacherRoute(path.slice('/teacher/'.length), request, url, context);
      let match = /^\/(?:chat\/([^/]+)|v1\/agents\/([^/]+)\/chat)(?:\/(.+?))?\/?$/.exec(path);
      if (match) return chatRoute(match[1] || match[2], match[3] || '', request, url, context);
      match = /^\/(?:course|v1\/learn)\/([^/]+)(?:\/(.+?))?\/?$/.exec(path);
      if (match) return courseRoute(match[1], match[2] || '', request, url, context);
      return null;
    };
    // What the server's keepDays has passed, from each one's last change: all a learner wrote and what was
    // done with it. Who a learner is and how far they got stay, so a code still brings them back.
    route.sweep = async (expired) => {
      let deleted = 0;
      for (const prefix of ['courses/', 'chats/', 'traces/', 'pages/']) {
        for (const key of await store.list(prefix)) {
          if (!LEARNER_TEXT.test(key)) continue;
          // A batch of events says its time in its key.
          const item = EVENT_TIME.test(key) ? null : await store.get(key);
          if (!expired(EVENT_TIME.exec(key)?.[1] ?? item?.started_at ?? item?.updated_at)) continue;
          await store.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    };
    return route;
  };
}
