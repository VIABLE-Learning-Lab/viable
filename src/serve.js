/**
 * viable-harness serve: agent files and course packages answered over HTTP on your own machine and
 * model keys, by the web-standard handler (server/handler.js) on node:http (server/node.js). This
 * adds what needs a disk: files and folders read from it, memory and media kept in folders.
 */
import { randomBytes } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { knowledgeFolders, packageKnowledge, readInFolder, readsLocally } from './knowledge.js';
import { memoryFiles } from './memory.js';
import { pickAgent, readAgentFile, runAgent } from './run.js';
import { createHandler } from './server/handler.js';
import { storeMemory } from './server/memory.js';
import { modelWarnings } from './server/models.js';
import { listen } from './server/node.js';
import { agentsToServe, graphOf } from './server/runtime.js';
import { learnerNotes, learnerRoutes, pageLinks } from './server/learner.js';
import { fileAssets } from './server/learnerAssets.js';
import { publicFetch } from './server/publicFetch.js';

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
      else if (kb.websites?.some((site) => !site.snapshot?.length) && !unread.length) notes.push(`${label} has websites with no snapshot, which aren't searched: run viable-harness knowledge refresh on the package.`);
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
 * fetch for Fetch URL steps and a package's files named by url.
 */
export async function serve(agents, { port = 8080, host = '127.0.0.1', token = null, cors = null, maxBodyBytes = 1024 * 1024, timeoutMs = 300000, maxRuns = 30, keepDays = null, knowledge = null, memoryDir = null, model = null, speechModel = null, imageModel = null, models = null, mediaDir = null, silent = false, baseUrl, apiKey, fetch = (...args) => globalThis.fetch(...args), log = (line) => process.stdout.write(`${JSON.stringify(line)}\n`), store = null, routes = [], pages = {}, componentRuns = ['http'], allowComponents = [], httpFetch = null } = {}) {
  if (!token && !LOCAL_HOSTS.has(host)) throw new Error(`Serving on ${host} without a token would let anyone who can reach this machine run these agents on your model keys. Give a token with --token-env <NAME>, or serve on 127.0.0.1.`);
  if (pages.learnerHeader && !token) throw new Error('A learner header says who is signed in, and whoever can send it is whoever it says, so it needs a server that isn\'t open to them: give a token with --token-env <NAME>.');
  // With no token of its own the server's teacher's page still takes one, made now. A try-out keeps its local grant.
  const teacherToken = token || pages.traces === 'local' ? null : randomBytes(24).toString('base64url');
  const folders = knowledge ? await knowledgeFolders(knowledge) : null;
  // Out to addresses a package or a learner chose, unlike the model calls: never to a private one.
  const outward = httpFetch ?? publicFetch();
  // One search and one memory for all runs: files are read once, and a learner's facts are saved one at a time.
  const ready = agents.map((agent) => ({ ...agent, searchKnowledge: isPackage(agent.doc) || folders ? packageKnowledge(isPackage(agent.doc) ? agent.doc : null, { dir: agent.dir, zip: agent.zip, folders, fetch: outward }) : null }));
  const memory = memoryDir ? memoryFiles(memoryDir) : store ? storeMemory(store) : null;
  const runtime = {
    memory,
    run: (agent, turn, { hooks, timed }) => runAgent(agent.doc, {
      input: turn.text, history: turn.history, context: turn.context, teaching: turn.teaching ?? null, section: turn.section ?? null, agent: agent.ref, dir: agent.dir, zip: agent.zip,
      model, speechModel, imageModel, models, mediaDir, silent: silent || turn.silent === true, baseUrl, apiKey, fetch: timed(fetch), conversation: turn.conversation ?? null,
      learner: memory ? turn.user : null, componentRuns, allowComponents,
      services: { httpFetch: timed(outward), ...(agent.searchKnowledge ? { searchKnowledge: agent.searchKnowledge } : {}), ...(memory ? { memory } : {}) },
      hooks
    })
  };
  // The pages learners open (server/learner.js), with their browser files when they are built.
  const learner = { assets: await fileAssets(), readPath: readInFolder, fetch: outward, teacherToken, ...pages };
  const servedBySlug = new Map(ready.map((agent) => [agent.slug, agent]));
  const handler = createHandler({ agents: ready, runtime, store, routes: [...routes, learnerRoutes(learner)], options: { token, cors, maxBodyBytes, timeoutMs, maxRuns, keepDays, log } });
  if (keepDays != null) {
    const sweep = () => handler.sweep().catch((error) => console.error(error));
    sweep();
    setInterval(sweep, SWEEP_MS).unref();
  }
  const { server, url } = await listen(handler, { port, host });
  const named = agents.map((agent) => ({ slug: agent.slug, graph: graphOf(agent) }));
  // --model replaces the reviewer too, so the warning covers it as well as a plan.
  return { server, url, handler, teacherToken, notes: [...knowledgeNotes(agents, folders), ...learnerNotes(servedBySlug, learner), ...[...new Set(agents.flatMap((agent) => componentSteps(graphOf(agent))))].filter((id) => !allowComponents.includes(id)).map((id) => `A component step asks to start ${id} on this computer, and it is refused: run viable-harness inspect to read what it starts, and add --allow-component ${id} if you trust it.`)], pages: pageLinks(servedBySlug, learner), warnings: modelWarnings(named, models ?? (model ? { reply: model, reviewer: null, map: {} } : null)) };
}
