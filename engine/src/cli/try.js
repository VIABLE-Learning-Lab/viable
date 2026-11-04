import { openBrowser } from '../../../harness/src/cli/open.js';
/**
 * viable-engine try: see it work. The real pages on this computer, with what the AI did beside them,
 * and no key needed: without one, the model's words are scripted (try/demo.js).
 */
import { execFile } from 'node:child_process';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickAgent, readAgentFile } from '../run.js';
import { serve } from '../serve.js';
import { agentsToServe } from '../server/runtime.js';
import { fileAssets } from '../server/learnerAssets.js';
import { modelWarnings } from '../server/models.js';
import { memoryStore } from '../../../harness/src/store/store.js';
import { demoModel, sampleRounds } from '../try/demo.js';
import { PUBLISHES, exportStatic } from '../try/export.js';
import { readyToTry, tryOut } from '../try/server.js';
import { MODEL_OPTIONS, bold, command, dim, planOf, stopped } from './common.js';

export const TRY_USAGE = '  viable-engine try [package or agent file...] [--port <n>] [--no-open] [--demo] [--tour] [--model <id>] [--reviewer-model <id>]\n  viable-engine try [package or agent file...] --export <dir> [--base <path>] [--publish-answers]';

const ENGINE = fileURLToPath(new URL('../../', import.meta.url));
const EXAMPLES = fileURLToPath(new URL('../../../examples/', import.meta.url));
const DEFAULT_PORT = 5730;
export const DEMO_NOTE = 'Demo mode: the replies are scripted, no model is called, and what you type stays on this computer. To run on your own model, set OPENAI_API_KEY or OPENAI_BASE_URL and start again.';

/** An example's file by its path under examples/files/. */
export async function exampleFile(path) {
  const root = resolve(EXAMPLES, 'files');
  const full = resolve(root, path);
  if (!full.startsWith(root + sep)) return null;
  return readFile(full).catch(() => null);
}

/** The agents named, ready to open together: the examples if none. A folder is its files that hold an agent, as serve reads one. */
async function agentsFrom(paths) {
  const files = [];
  for (const path of paths.length ? paths : [EXAMPLES]) {
    const inFolder = (await stat(path).catch(() => { throw stopped(`There is no ${path}.`); })).isDirectory();
    const names = inFolder ? (await readdir(path)).filter((name) => /\.(json|zip)$/i.test(name) && !name.startsWith('.')).sort().map((name) => join(path, name)) : [path];
    for (const file of names) {
      try {
        const read = await readAgentFile(file);
        pickAgent(read.doc);
        files.push({ ...read, file, name: basename(file) });
      } catch (error) { if (!inFolder) throw error; }
    }
  }
  if (!files.length) throw stopped(`No agent file or course package in ${paths.join(', ')}.`);
  return { files, agents: agentsToServe(readyToTry(files)), examples: !paths.length };
}

/** A made-up class for the teacher's page: examples/class. */
async function theClass() {
  const dir = join(EXAMPLES, 'class');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const docs = await Promise.all(names.map(async (name) => JSON.parse(await readFile(join(dir, name), 'utf8'))));
  return { records: docs.filter((doc) => Array.isArray(doc.events)), runs: docs.filter((doc) => Array.isArray(doc.steps)) };
}

// The pages look right only with their browser files: a checkout that hasn't built them builds them
// now. Returns what is wrong if it couldn't, for the person to read before they see plain text.
async function makeSurePagesBuilt() {
  const built = await fileAssets() && await access(join(ENGINE, 'dist/try/app.js')).then(() => true, () => false);
  if (built) return null;
  console.log(dim('  Building the pages\' browser files, which happens once...'));
  try {
    await promisify(execFile)(process.execPath, [join(ENGINE, 'scripts/build-learner-assets.mjs')], { cwd: ENGINE });
    return null;
  } catch {
    return 'Replies show as plain text here, and Reading panels are left out, because the pages\' browser files aren\'t built. To fix it, run npm install --include=dev && npm run build:assets in the harness, then start again.';
  }
}

export { openBrowser };

export async function tryCommand(argv) {
  return command(argv, { port: { type: 'string' }, 'no-open': { type: 'boolean' }, demo: { type: 'boolean' }, tour: { type: 'boolean' }, export: { type: 'string' }, base: { type: 'string' }, 'publish-answers': { type: 'boolean' }, ...MODEL_OPTIONS }, async (values, paths) => {
    if (values.tour && !values.demo) throw stopped('--tour plays the scripted scene, which needs --demo.', 'viable-engine try --demo --tour');
    const { files, agents, examples } = await agentsFrom(paths);
    const warning = await makeSurePagesBuilt();
    if (values.export) {
      const publishAnswers = values['publish-answers'] === true;
      const { pages, dir } = await exportStatic(files, { dir: values.export, base: values.base ?? '', classFiles: examples ? await theClass() : null, exampleFile, publishAnswers });
      if (publishAnswers && !examples) console.log(`Anyone who opens this copy can read ${PUBLISHES}. What the teacher wants to hear about and the package's notes are left out.`);
      console.log(`Wrote a static copy of demo mode to ${dir}: ${pages} pages. Put the folder on any website${values.base ? ` under ${values.base}` : ' at its root, or give --base /its/path'}.`);
      return;
    }
    const live = !values.demo && Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL);
    const plan = live ? planOf(values) : null;
    const docs = [...new Set(agents.map((agent) => agent.doc))];
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    // Demo mode says nothing leaves this computer, so a Fetch URL step or an http component in a package named here stops.
    const nowhere = async (input) => { throw new Error(`Demo mode sends nothing anywhere, so it didn't call ${new URL(String(input?.url ?? input)).hostname}.`); };
    const fetchFor = live ? (...args) => globalThis.fetch(...args) : demoModel({ docs, files: exampleFile, pass: nowhere });
    const where = (() => { try { return new URL(baseUrl).host; } catch { return baseUrl; } })();
    const note = live ? `Running on your model at ${where}. What you type goes there and nowhere else.` : DEMO_NOTE;
    const store = memoryStore();
    const assets = await fileAssets();
    const parts = tryOut({
      note, ...(live ? { short: `Your model at ${where}` } : {}), warning, store, assets,
      endpoint: live ? { fetch: fetchFor, baseUrl, apiKey: process.env.OPENAI_API_KEY ?? null, plan } : { fetch: fetchFor },
      classFiles: examples ? await theClass() : null,
      rounds: sampleRounds(docs),
      tour: values.tour === true
    });
    const options = { host: '127.0.0.1', store, routes: parts.routes, pages: parts.pages, log: () => {}, ...(live ? { models: plan } : { brief: { model: 'demo-reader' }, fetch: fetchFor, httpFetch: fetchFor, baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', models: null }) };
    const start = async (port) => serve(agents, { ...options, port });
    const asked = values.port != null ? Number(values.port) : DEFAULT_PORT;
    if (!Number.isInteger(asked) || asked < 0 || asked > 65535) throw stopped(`--port: ${values.port} isn't a port number.`);
    const started = await start(asked).catch((error) => { if (error.code === 'EADDRINUSE' && values.port == null) return start(0); throw error; });
    const { server, url, notes, warnings } = started;
    console.log(`\n  ${bold('VIABLE')}  ${url}\n`);
    console.log(`  ${live ? `Running for real: your model at ${where}.` : 'Demo mode: scripted replies, no key needed, nothing leaves this computer.'}`);
    if (!live) console.log(dim('  To run on your own model, set OPENAI_API_KEY or OPENAI_BASE_URL and start again.'));
    if (live && !plan) console.log(dim('  The examples name VIABLE\'s models. If your endpoint doesn\'t have them, add --model <id>.'));
    if (warning) console.log(`\n  ${warning}`);
    if (!examples) for (const line of notes) console.log(dim(`  Note: ${line}`));
    if (live) for (const warning of warnings || modelWarnings(agents, plan)) console.log(dim(`  Warning: ${warning}`));
    console.log(dim('\n  Answers on this computer only. Press Ctrl-C to stop.\n'));
    if (!values['no-open']) openBrowser(`${url}/${values.tour ? '?tour=1' : ''}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
    await new Promise(() => {});
  });
}
