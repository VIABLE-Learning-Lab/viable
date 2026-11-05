/**
 * The console: the Engine's own pages for whoever runs it, at /console, behind the token and the session
 * of the teacher's page (server/session.js), so one sign-in opens both. PAGES is the route table: each
 * page says its title, how it renders and the JSON routes it answers under /console/api/, and the
 * navigation shows what is listed there. A routes module for the handler; no Node built-ins.
 */
import { unavailablePage, UNAVAILABLE_HEADERS } from '../learner/shell.js';
import { signInHeaders, signInPage, teacherSession, withCookies } from '../server/session.js';
import { onRole } from '../server/runtime.js';
import { storeClasses, storeRecords, storeThreads } from '../server/teacherData.js';
import { consoleHeaders, consolePage } from './layout.js';
import { activityPages } from './activity.js';
import { askPages } from './ask.js';
import { agentPages } from './agentPages.js';
import { chatPages } from './chatPages.js';
import { coursePages } from './course.js';
import { knowledgePages } from './knowledgePages.js';
import { modelsPage } from './models.js';
import { peoplePages } from './people.js';
import { progressPages } from './progress.js';
import { sharePages } from './share.js';

// A course's tabs come in this order.
const [courseList, activitiesTab, settingsTab] = coursePages;
const PAGES = [...askPages(() => PAGES), courseList, activitiesTab, ...peoplePages, ...progressPages, settingsTab, ...sharePages, ...activityPages, ...chatPages, ...agentPages, ...knowledgePages, modelsPage];
const TABS = PAGES.filter((page) => page.courseTab);

const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const refusal = (status, code, message) => answer(status, { error: { message, code } });
const nonceOf = () => crypto.randomUUID().replace(/-/g, '');

// Ask's model on a server of one's own: the role set for it, or whichever writes replies.
const serverAskModel = (settings, fetch, store) => ({
  missing: store ? 'Ask needs a model.' : 'Ask needs somewhere to keep a conversation: start this server with a data folder.',
  setUp: store ? '/console/models' : null,
  async ready() { const { roles } = await settings.resolve(); return Boolean(store && (roles.assistant ?? roles.reply)?.model); },
  async chat({ messages, tools }) {
    const { roles } = await settings.resolve();
    const role = roles.assistant ?? roles.reply;
    const { baseUrl, apiKey, fetch: reach } = onRole(role, fetch);
    const response = await reach(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify({ model: role.model, messages, tools, tool_choice: 'auto', temperature: 0.2 }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.choices?.[0]?.message) throw Object.assign(new Error(`The model (${role.model}) answered ${response.status}${data?.error?.message ? `: ${data.error.message}` : ''}.`), { status: 502, code: 'model_failed' });
    return { content: data.choices[0].message.content, calls: data.choices[0].message.tool_calls };
  }
});
// On a server of one's own a learner's page tries a course as a learner who stays out of Progress.
const tryHere = (code, key, { section = null, open = null } = {}) => `/course/${code}${key ? `/${key}` : ''}?${new URLSearchParams({ try: '1', ...(section ? { section } : {}), ...(open ? { open } : {}) })}`;

// A change comes from this console's own page, or from a program holding the token: a browser always says where a post comes from.
function fromHere(request, url) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if ((origin && origin !== url.origin) || (site && !['same-origin', 'none'].includes(site))) return false;
  return Boolean(origin) || /^Bearer\s/i.test(request.headers.get('authorization') || '');
}

// The pages a teacher needs, for a host that decides models, agents and knowledge for them.
export const TEACHING_PAGES = [...askPages(() => PAGES), courseList, activitiesTab, ...peoplePages, ...progressPages, settingsTab, ...sharePages, ...activityPages];
export const TEACHING_TABS = TEACHING_PAGES.filter((page) => page.courseTab);

/**
 * The console's pages and routes, for whichever host has signed someone in. tools: what they reach a course through (library,
 * classes, records, threads, askModel, tryLink...). pages: which it shows. notice: HTML above every page, the host's to say. origin, if given: where learners reach pages, when that isn't here.
 */
export function consoleApp({ tools, pages = PAGES, readBody, readJson, brand, signOut, links, notice, origin = null }) {
  const place = (url) => origin || url.origin;
  async function api(path, request, url) {
    if (!['GET', 'HEAD'].includes(request.method) && !fromHere(request, url)) return refusal(403, 'origin_not_allowed', 'Open the console to change this.');
    const route = pages.flatMap((page) => page.api ?? []).find(([method, pattern]) => method === request.method && pattern.test(path));
    if (!route) return refusal(404, 'not_found', 'Not found.');
    try {
      const here = { ...tools, url, origin: place(url), request };
      // A route with a size takes a file's bytes, up to that; any other, JSON.
      const size = route[3]?.bytes;
      const body = request.method === 'GET' ? null : size ? await readBody(request, size).catch((error) => { throw error.code === 'agent_input_too_large' ? Object.assign(new Error(`A file here can be at most ${Math.round(size / 1048576)} MB.`), { status: 413, code: 'file_too_large' }) : error; }) : await readJson(request);
      if (!size && body !== null && (typeof body !== 'object' || Array.isArray(body))) return refusal(400, 'invalid_json', 'Send a JSON object.');
      const made = await route[2](here, route[1].exec(path), body);
      return made instanceof Response ? made : answer(200, made);
    } catch (error) {
      const known = error?.status >= 400 && error.status < 500 && error.code;
      if (!known) console.error(error);
      return known ? refusal(error.status, error.code, error.message) : refusal(500, 'server_error', 'Something went wrong. Try again.');
    }
  }
  async function renderPage(rest, request, url) {
    const page = pages.find((item) => (item.match ? item.match.test(rest) : rest === item.id));
    if (!page) return new Response(unavailablePage({ title: 'Not here', message: 'There’s no such page.', back: { href: '/console', label: 'Go back' } }), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', ...UNAVAILABLE_HEADERS } });
    const nonce = nonceOf();
    let made;
    try { made = await page.render({ ...tools, url, origin: place(url), request }, page.match?.exec(rest)); } catch (error) {
      if (error?.status !== 404) throw error;
      return new Response(unavailablePage({ title: 'Not here', message: error.message, back: { href: '/console', label: 'Go back' } }), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', ...UNAVAILABLE_HEADERS } });
    }
    return new Response(consolePage({ title: made.title || page.title, pages, current: page.section || page.id, brand, signOut, links, notice, ...made }, nonce), { status: 200, headers: consoleHeaders(nonce) });
  }
  return { api, renderPage };
}

/**
 * settings: the server's model settings (server/settings.js). library: what it serves (server/library.js).
 * teacherToken: what opens it on a server with no token of its own. fetch reaches the providers it tests.
 * examples: [{ id, title, summary, read() }], what a course can start from where the host has them.
 * welcome: { take(secret) }: a one-time address, for the person who just started the server.
 * addresses: where this server's learners reach it on this network, when it knows.
 * outward: what reads a website a person names, which a host on Node keeps to public addresses: never fetch, which may reach a local model.
 * signIn: 'class' or 'proxy', when the server's own way of knowing learners wins over each course's.
 */
export function consoleRoutes({ settings = null, library = null, teacherToken = null, fetch = (...args) => globalThis.fetch(...args), outward = (...args) => globalThis.fetch(...args), now = () => Date.now(), examples = [], welcome = null, addresses = [], signIn = null } = {}) {
  return (ctx) => {
    if (!settings) return async () => null;
    const secret = () => ctx.options.token || teacherToken;
    const session = teacherSession({ secret, now });
    const tools = { settings, library, classes: storeClasses(ctx.store), records: storeRecords(ctx.store), threads: storeThreads(ctx.store), askModel: settings ? serverAskModel(settings, fetch, ctx.store) : null, now, tryLink: tryHere, fetch, outward, examples, addresses, signIn, store: ctx.store, tabs: TABS, served: ctx.served, runTurn: ctx.runTurn };

    const { api, renderPage } = consoleApp({ tools, readBody: ctx.readBody, readJson: ctx.readJson });

    return async (request, url) => {
      const path = url.pathname;
      // A server with nothing to serve yet starts here, to be set up.
      if (request.method === 'GET' && path === '/' && !ctx.served.size) return Response.redirect(new URL('/console', url), 302);
      if (path !== '/console' && !path.startsWith('/console/')) return null;
      // The person who started the server, once: this address signs them in, and there is no token in it.
      const once = /^\/console\/welcome\/([\w-]{16,128})$/.exec(path);
      if (once && request.method === 'GET') {
        return welcome?.take?.(once[1]) ? withCookies('/console', session.cookies(await session.newSession(), url)) : Response.redirect(new URL('/console', url), 302);
      }
      let wanted = null;
      if (path.startsWith('/console/api/')) { try { wanted = decodeURI(path.slice('/console/api/'.length)); } catch { return refusal(400, 'bad_address', 'That address isn’t right.'); } }
      if (url.searchParams.has('token')) return refusal(400, 'token_in_url', 'A token doesn’t go in an address, where it would be logged and kept in a browser’s history.');
      if (!secret()) return new Response(unavailablePage({ title: 'This server isn’t set up yet', message: ctx.options.requireToken ? 'It needs its token before anyone can use it. Set one, and open this again.' : 'Give this server a token to open its console.' }), { status: ctx.options.requireToken ? 503 : 403, headers: { 'content-type': 'text/html; charset=utf-8', ...UNAVAILABLE_HEADERS } });
      if (!await session.holdsToken(request)) {
        if (wanted !== null) return refusal(401, 'sign_in_required', 'Sign in to the console.');
        const nonce = nonceOf();
        return new Response(signInPage({ title: 'Sign in', text: 'Enter this server’s token to open its console.', next: 'console' }, nonce), { status: request.headers.get('accept')?.includes('text/html') ? 200 : 401, headers: { 'content-type': 'text/html; charset=utf-8', ...signInHeaders(nonce) } });
      }
      if (wanted !== null) return api(wanted, request, url);
      if (!['GET', 'HEAD'].includes(request.method)) return null;
      // With a model, the conversation is the front door; before one is set, the courses page says how.
      if (path === '/console' || path === '/console/') return Response.redirect(new URL(`/console/${await tools.askModel?.ready() ? 'ask' : 'courses'}`, url), 302);
      return renderPage(path.slice('/console/'.length).replace(/\/$/, ''), request, url);
    };
  };
}
