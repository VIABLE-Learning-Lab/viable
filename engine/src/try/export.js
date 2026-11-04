/**
 * viable-engine try --export: a static copy of demo mode for a website, with nothing to install. The
 * same pages, written out by the same handler, with a small script (static.browser.js, bundled to
 * dist/try/) answering their requests in the visitor's own browser. That script is written here and
 * nowhere else: no route serves it.
 */
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../server/handler.js';
import { learnerRoutes, pagesOf } from '../server/learner.js';
import { fileAssets } from '../server/learnerAssets.js';
import { agentsToServe, createRuntime } from '../server/runtime.js';
import { memoryStore } from '../../../harness/src/store/store.js';
import { demoModel, sampleRounds } from './demo.js';
import { readyToTry, tryOut } from './server.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url));
export const EXPORTED_NOTE = 'Demo mode: the replies are scripted and answered in your browser, so what you type stays on your computer. To run it on your own model, get the harness.';
const BUILT_APP = join(ROOT, 'dist/try/app.js');
const EXAMPLES = join(REPOSITORY, 'examples');
export const PUBLISHES = 'each agent\'s instructions, every question with its answer key, hints and explanations, and what the package holds for its knowledge bases';
// The bundled examples are public already, so only an exact copy of one goes without saying so.
async function bundledExamples() {
  const names = (await readdir(EXAMPLES)).filter((name) => name.endsWith('.json'));
  return new Set(await Promise.all(names.map(async (name) => JSON.stringify(JSON.parse(await readFile(join(EXAMPLES, name), 'utf8'))))));
}
// A copy runs in the visitor's browser, so it needs its instructions and its keys. It doesn't need a teacher's notes.
const withoutNotes = ({ notes: _notes, ...doc }) => JSON.parse(JSON.stringify(doc), (key, value) => (key === 'watch_for' ? undefined : value));
// What pages name by an address from the site's root.
const ROOTED = /(["'`(=])\/(?=(?:course|chat|teacher|resources|try|v1\/agents\/chat-assets|_viable|_try)\b)|(href=")\/(?=["?])/g;

/** A page's text for a site served under base. */
export const underBase = (html, base) => (base ? html.replace(ROOTED, (_, quote, link) => `${quote ?? link}${base}/`) : html);

/** Answers a page's posts in the browser, loading the rest only when the first one is sent. */
const LOADER = `(function () {
  var root = document.currentScript.src.replace(/\\/_try\\/static\\.js(?:\\?.*)?$/, '');
  var base = new URL(root).pathname.replace(/\\/$/, '');
  var real = window.fetch.bind(window);
  var app = null;
  window.fetch = async function (input, init) {
    var request = new Request(input, init);
    var url = new URL(request.url);
    var path = url.pathname.startsWith(base + '/') ? url.pathname.slice(base.length) : url.pathname;
    if (url.origin !== location.origin || request.method !== 'POST' || !/^\\/(?:chat|course|try|teacher)\\//.test(path)) return real(input, init);
    app = app || import(root + '/_try/app.js').then(function (module) { return module.start({ root: root, real: real }); });
    var handle = await app;
    return handle(new Request('http://localhost' + path + url.search, { method: 'POST', headers: request.headers, body: await request.text(), signal: request.signal }));
  };
  navigator.sendBeacon = function (url, data) { window.fetch(url, { method: 'POST', body: data }).catch(function () {}); return true; };
})();
`;

/**
 * Writes the copy to dir: { dir, pages }. files: the agents' files, as agentsToServe takes them. Anyone who
 * opens the site can read all a copy holds, so anything but the bundled examples is refused unless
 * publishAnswers is set, and then goes without its teacher's notes.
 */
export async function exportStatic(given, { dir, base = '', classFiles = null, exampleFile = null, publishAnswers = false }) {
  const examples = await bundledExamples();
  const own = given.filter((file) => !examples.has(JSON.stringify(file.doc)));
  if (own.length && !publishAnswers) throw Object.assign(new Error(`${own[0].name ?? 'This package'}: a static copy puts all of a package where anyone who opens the site can read it: ${PUBLISHES}.`), { next: 'If that is what you mean, add --publish-answers. If it isn\'t, serve it instead: viable-engine deploy.' });
  const files = given.map((file) => (own.includes(file) ? { ...file, doc: withoutNotes(file.doc) } : file));
  const assets = await fileAssets();
  const app = await readFile(BUILT_APP, 'utf8').catch(() => null);
  if (!assets || !app) throw Object.assign(new Error('A static copy needs the pages\' browser files, and they aren\'t built.'), { next: 'Run npm install --include=dev && npm run build:assets in the harness, then try again.' });
  const zipped = files.find((file) => file.zip);
  if (zipped) throw Object.assign(new Error(`${zipped.name}: a .viable.zip can't go in a static copy.`), { next: 'Give its package JSON, whose files are on the web, instead.' });
  const cleanBase = String(base).replace(/\/+$/, '').replace(/^(?!\/)(?=.)/, '/');
  if (cleanBase && !/^(?:\/[A-Za-z0-9._~-]+)+$/.test(cleanBase)) throw Object.assign(new Error(`--base ${base}: give the path the copy will be served under, such as /try.`), { usage: true });

  const ready = readyToTry(files);
  const agents = agentsToServe(ready);
  const docs = ready.map((file) => file.doc);
  const store = memoryStore();
  const model = demoModel({ docs, files: exampleFile, pace: 0 });
  const parts = tryOut({ note: EXPORTED_NOTE, endpoint: { fetch: model }, store, assets: { names: assets.names }, classFiles, rounds: sampleRounds(docs), exported: true });
  const handler = createHandler({ agents, runtime: createRuntime({ baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', fetch: model, brief: { model: 'demo-reader' } }), store, routes: [...parts.routes, learnerRoutes({ ...parts.pages, assets: { names: assets.names } })], options: { log: () => {} } });

  const out = resolve(dir);
  const { chats, courses } = pagesOf(new Map(agents.map((agent) => [agent.slug, agent])), { assets: { names: assets.names } });
  const paths = ['/', '/resources', '/teacher', ...[...courses.values()].flatMap((course) => [`/course/${course.code}`, ...[...course.activities.keys()].map((key) => `/course/${course.code}/${key}`)]), ...[...chats.keys()].map((slug) => `/chat/${slug}`)];
  const write = async (path, content) => { await mkdir(dirname(join(out, path)), { recursive: true }); await writeFile(join(out, path), content); };
  const fonts = new Set();
  let pages = 0;
  for (const path of paths) {
    const response = await handler(new Request(`http://localhost${path}`), {});
    if (response.status !== 200 || !/text\/html/.test(response.headers.get('content-type') || '')) continue;
    const policy = (response.headers.get('content-security-policy') || '').replace(/\s*frame-ancestors[^;]*;?/, '').replace(/script-src /, "script-src 'self' ");
    const html = await response.text();
    for (const [, font] of html.matchAll(/url\((\/_viable\/fonts\/[^)]+)\)/g)) fonts.add(font);
    const head = `<head>\n${policy ? `<meta http-equiv="Content-Security-Policy" content="${policy.replaceAll('"', '&quot;')}">\n` : ''}<script src="${cleanBase}/_try/static.js"></script>`;
    await write(`${path.replace(/\/$/, '')}/index.html`, underBase(html, cleanBase).replace('<head>', head));
    pages += 1;
  }
  for (const font of fonts) await write(font, new Uint8Array(await (await handler(new Request(`http://localhost${font}`), {})).arrayBuffer()));
  await cp(join(ROOT, 'dist/v1/agents/chat-assets'), join(out, 'v1/agents/chat-assets'), { recursive: true });
  await cp(join(REPOSITORY, 'examples/files'), join(out, '_try/files'), { recursive: true });
  await write('_try/static.js', LOADER);
  await write('_try/app.js', app);
  await write('_try/packages.json', JSON.stringify({ files: files.map(({ doc, name, file }) => ({ doc, name, file: name ?? file })), classFiles, names: assets.names, note: EXPORTED_NOTE }));
  return { dir: out, pages };
}
