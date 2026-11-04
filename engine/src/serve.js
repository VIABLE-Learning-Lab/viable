/**
 * viable-engine serve: agent files and course packages answered over HTTP on your own machine and
 * model keys, by the web-standard handler (server/handler.js) on node:http (server/node.js). This
 * adds what needs a disk: files and folders read from it, memory and media kept in folders.
 */
import { randomBytes } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { knowledgeFolders, packageKnowledge, readInFolder, readsLocally } from './knowledge.js';
import { memoryFiles } from './memory.js';
import { pickAgent, readAgentFile, runAgent } from './run.js';
import { consoleRoutes } from './console/index.js';
import { createHandler } from './server/handler.js';
import { storeMemory } from './server/memory.js';
import { modelWarnings } from './server/models.js';
import { listen } from '../../harness/src/net/node.js';
import { agentsFrom, courseLibrary } from './server/library.js';
import { agentsToServe, graphOf, meaningFrom } from './server/runtime.js';
import { learnerNotes, learnerRoutes, pageLinks, pagesOf } from './server/learner.js';
import { fileAssets } from './server/learnerAssets.js';
import { featuresOf, modelSettings } from './server/settings.js';
import { publicFetch } from '../../harness/src/net/publicFetch.js';

export { readTurn, runTrace } from './server/handler.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SWEEP_MS = 6 * 3600000;
const isPackage = (doc) => doc?.format === 'viable.course-package';
const componentSteps = (graph) => graph.nodes.filter((node) => node.type === 'component' && node.config?.manifest?.runs?.kind === 'mcp').map((node) => node.config.manifest.id);
const knowledgeIds = (graph) => [...new Set(graph.nodes.flatMap((node) => [node.type === 'knowledge' ? node.config?.knowledge_bases : null, node.config?.tools?.knowledge_bases]).filter(Array.isArray).flat())];

/**
 * The agents to serve from agent files, course packages (.json or .viable.zip) and folders of them:
 * { agents: [{ slug, ref, name, description, doc, dir, zip, file }], skipped }, skipped being a
 * folder's files that hold no agent (agentsToServe says where each answers).
 */
export async function loadAgents(paths) {
  const found = [];
  const skipped = [];
  for (const path of paths) {
    const inFolder = (await stat(path)).isDirectory();
    const files = inFolder ? (await readdir(path)).filter((name) => /\.(json|zip)$/i.test(name) && !name.startsWith('.')).sort().map((name) => join(path, name)) : [path];
    for (const file of files) {
      try {
        const read = await readAgentFile(file);
        pickAgent(read.doc);
        found.push({ ...read, file, name: basename(file) });
      } catch (error) {
        if (!inFolder) throw error;
        skipped.push(`${file}: ${error.message}`);
      }
    }
  }
  return { agents: agentsToServe(found), skipped };
}

// What a knowledge base an agent searches can't do here, said before the first learner finds out.
function knowledgeNotes(agents, folders) {
  const notes = Object.entries(folders?.skipped || {}).map(([id, names]) => `Knowledge base ${id}: left out ${names.join(', ')} (only text, Markdown, CSV, JSON and HTML files are read).`);
  for (const agent of agents) {
    for (const id of knowledgeIds(graphOf(agent))) {
      if (folders?.dirs.has(id)) continue;
      const kb = isPackage(agent.doc) ? (agent.doc.knowledge_bases || []).find((item) => item.ref === id) : null;
      const named = (isPackage(agent.doc) ? kb?.name : agent.doc.requires?.knowledge_bases?.find((item) => item.id === id)?.name) || null;
      const label = `${agent.slug}: knowledge base ${id}${named ? ` (${named})` : ''}`;
      const unread = (kb?.file_refs || []).map((ref) => (agent.doc.files || []).find((file) => file.ref === ref)).filter((file) => file && !readsLocally(file)).map((file) => file.name);
      if (!kb) notes.push(`${label} has no folder, so its searches fail: add --knowledge ${id}=<folder>.`);
      else if (kb.websites?.some((site) => !site.snapshot?.length) && !unread.length) notes.push(`${label} has websites with no snapshot, which aren't searched: run viable-engine knowledge refresh on the package.`);
      else if (unread.length) notes.push(`${label} holds ${unread.join(', ')}, which a local run doesn't read, so its searches fail: save its files as text or Markdown in a folder and add --knowledge ${id}=<folder>.`);
    }
  }
  return notes;
}

/**
 * Starts serving agents (loadAgents) on host:port: { server, url, handler, teacherToken, notes, warnings },
 * notes being what the person starting it should know about its knowledge bases, warnings about its models,
 * and teacherToken what opens the teacher's page when it has no token: made now, for the person to be told once.
 * Without a token (Authorization: Bearer), only this machine may be served. token, cors, maxBodyBytes,
 * timeoutMs, maxRuns, keepDays and log are the handler's options, and store (conversations, runs and,
 * without memoryDir, memory) and routes its own, tried before the learner pages'. pages: learnerRoutes' options (classCode, traces,
 * links), and it also says where learners open them (pages). The other options are runAgent's, and knowledge ({ id:
 * folder }) and memoryDir are shared by every agent and run. httpFetch replaces the public-addresses-only
 * fetch for Fetch URL steps and a package's files named by url. secret encrypts the provider keys saved in the
 * console (default: VIABLE_ENGINE_SECRET, else a key in the store's folder). Only a try-out has no console.
 * consoleOptions: the rest of consoleRoutes' options. onlyLocalNames: answer only to this computer's names.
 * trustProxy: who is asking comes from the last X-Forwarded-For entry a proxy in front of this server adds.
 */
export async function serve(agents, { port = 8080, brief = true, host = '127.0.0.1', token = null, cors = null, maxBodyBytes = 1024 * 1024, timeoutMs = 300000, maxRuns = 30, keepDays = null, knowledge = null, memoryDir = null, model = null, speechModel = null, imageModel = null, models = null, mediaDir = null, silent = false, baseUrl, apiKey, fetch = (...args) => globalThis.fetch(...args), log = (line) => process.stdout.write(`${JSON.stringify(line)}\n`), store = null, routes = [], pages = {}, componentRuns = ['http'], allowComponents = [], httpFetch = null, secret = process.env.VIABLE_ENGINE_SECRET || null, consoleOptions = {}, onlyLocalNames = false, trustProxy = false } = {}) {
  if (!token && !LOCAL_HOSTS.has(host)) throw new Error(`Serving on ${host} without a token would let anyone who can reach this machine run these agents on your model keys. Give a token with --token-env <NAME>, or serve on 127.0.0.1.`);
  if (pages.learnerHeader && !token) throw new Error('A learner header says who is signed in, and whoever can send it is whoever it says, so it needs a server that isn\'t open to them: give a token with --token-env <NAME>.');
  // With no token of its own the server's teacher's page still takes one, made now. A try-out keeps its local grant.
  const teacherToken = token || pages.traces === 'local' ? null : randomBytes(24).toString('base64url');
  const folders = knowledge ? await knowledgeFolders(knowledge) : null;
  // Out to addresses a package or a learner chose, unlike the model calls: never to a private one.
  const outward = httpFetch ?? publicFetch();
  const settings = pages.traces === 'local' ? null : modelSettings({ store, secret, baseUrl: baseUrl ?? process.env.OPENAI_BASE_URL, apiKey: apiKey ?? process.env.OPENAI_API_KEY, plan: models, model, speechModel, imageModel });
  // One search and one memory for all runs: files are read once, and a learner's facts are saved one at a time.
  // What is held: the given files, and what the console saved. A try-out has only what it was given.
  const given = [...new Map(agents.map((agent) => [agent.doc, { doc: agent.doc, dir: agent.dir, zip: agent.zip, file: agent.file, name: agent.fileName }])).values()];
  const library = settings ? courseLibrary({ store, given, readPath: readInFolder, fetch: outward, trial: (doc) => pagesOf(new Map(agentsToServe([{ doc, file: 'it', name: 'it' }]).map((agent) => [agent.slug, agent])), { documents: [{ doc }] }) }) : null;
  // A given file that can't work says so at the start, as ever. What the console saved is tried before it is saved, and can't stop a start.
  pagesOf(new Map(agents.map((agent) => [agent.slug, agent])), { documents: given });
  const held = library ? agentsFrom(await library.documents()) : { agents, documents: null };
  const readPath = library ? library.readPath : readInFolder;
  const searches = new WeakMap();
  const prepared = (agent) => {
    if (!isPackage(agent.doc) && !folders) return { ...agent, searchKnowledge: null };
    if (!searches.has(agent.doc)) searches.set(agent.doc, packageKnowledge(isPackage(agent.doc) ? agent.doc : null, { dir: agent.dir, zip: agent.zip, folders, fetch: outward, readPath, ...(settings ? { meaning: meaningFrom(settings, fetch, store) } : {}) }));
    return { ...agent, searchKnowledge: searches.get(agent.doc) };
  };
  const ready = held.agents.map(prepared);
  const memory = memoryDir ? memoryFiles(memoryDir) : store ? storeMemory(store) : null;
  const runtime = {
    memory,
    run: async (agent, turn, { hooks, timed }) => runAgent(agent.doc, {
      input: turn.text, inputContent: turn.content, stopWhenSilent: turn.stopWhenSilent === true, briefing: turn.briefing ?? null, save: turn.save ?? null, using: settings ? await settings.resolve() : null,
      history: turn.history, context: turn.context, teaching: turn.teaching ?? null, section: turn.section ?? null, agent: agent.ref, dir: agent.dir, zip: agent.zip,
      model, speechModel, imageModel, models, mediaDir, silent: silent || turn.silent === true, baseUrl, apiKey, fetch: timed(fetch), conversation: turn.conversation ?? null,
      learner: memory ? turn.user : null, componentRuns, allowComponents, brief,
      services: { httpFetch: timed(outward), ...(agent.searchKnowledge ? { searchKnowledge: agent.searchKnowledge } : {}), ...(memory ? { memory } : {}) },
      hooks
    })
  };
  // The pages learners open (server/learner.js), with their browser files when they are built.
  const learner = { assets: await fileAssets(), readPath, fetch: outward, teacherToken, models: settings, modelFetch: fetch, noSpeech: silent, ...pages };
  const servedBySlug = new Map(ready.map((agent) => [agent.slug, agent]));
  const handler = createHandler({ agents: ready, runtime, store, library, documents: held.documents, prepare: prepared, routes: [...routes, ...(settings ? [consoleRoutes({ settings, library, teacherToken, fetch, outward, signIn: pages.learnerHeader ? 'proxy' : pages.classCode ? 'class' : null, ...consoleOptions })] : []), learnerRoutes(learner)], options: { token, cors, maxBodyBytes, timeoutMs, maxRuns, keepDays, log, onlyLocalNames, ...(settings ? { features: async () => featuresOf(await settings.resolve()) } : {}) } });
  if (keepDays != null) {
    const sweep = () => handler.sweep().catch((error) => console.error(error));
    sweep();
    setInterval(sweep, SWEEP_MS).unref();
  }
  const { server, url } = await listen(handler, { port, host, trustProxy });
  const named = ready.map((agent) => ({ slug: agent.slug, graph: graphOf(agent) }));
  const using = settings ? await settings.resolve() : null;
  // --model replaces the reviewer too, so the warning covers it as well as a plan.
  return { server, url, handler, teacherToken, settings, agents: ready, notes: [...knowledgeNotes(ready, folders), ...learnerNotes(servedBySlug, { ...learner, documents: held.documents, hears: Boolean(using?.roles.hearing), stored: Boolean(store) }), ...[...new Set(ready.flatMap((agent) => componentSteps(graphOf(agent))))].filter((id) => !allowComponents.includes(id)).map((id) => `A component step asks to start ${id} on this computer, and it is refused: run viable-engine inspect to read what it starts, and add --allow-component ${id} if you trust it.`)], pages: pageLinks(servedBySlug, { ...learner, documents: held.documents }), warnings: modelWarnings(named, using?.plan ?? models ?? (model ? { reply: model, reviewer: null, map: {} } : null)) };
}
