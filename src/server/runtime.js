/**
 * Running a VIABLE agent graph anywhere fetch and Web Crypto exist (a Worker, a function, a process):
 * VIABLE's engine (src/agents/engine.js) with its services replaced by an OpenAI-compatible endpoint
 * (chat, speech and images), a course package's own files and agents, and HTTP components. No Node
 * built-ins: run.js adds what needs a disk or a process (folders, MCP components).
 */
import { SUMMARY_MODEL, runAgentGraph } from '../agents/engine.js';
import { linkKnowledgeRefs, slugify, validateGraph } from '../agents/graph.js';
import { publicUrl } from '../agents/http.js';
import { callOut, overHttp, refused } from '../components/contract.js';
import { toMarkdown } from '../markdown.js';
import { teachingRunContext } from '../teaching.js';
import { readZip } from '../utils/zip.js';
import { applyModels } from './models.js';
import { searchPackage } from './search.js';

// A Worker has no process; a key there is passed as an option.
const shellValue = (name) => globalThis.process?.env?.[name];

const NEEDS_VIABLE = new Set(['needs_viable', 'knowledge_unavailable', 'subagent_disabled', 'http_markdown_unavailable']);

// A call that reached nothing. The endpoint is the person's own, so why is passed on, with what to do. A stop (the caller left, time ran out) stays what it is.
async function reach(fetch, url, init, { what, id, code }) {
  try { return await fetch(url, init); } catch (error) {
    if (['AbortError', 'TimeoutError'].includes(error?.name)) throw error;
    const inside = /^https?:\/\/(localhost|127\.|\[::1\])/i.test(url) ? ' In a container, localhost is the container itself: use the address of the machine the endpoint runs on, such as http://host.docker.internal:<port>/v1.' : '';
    const message = `The ${what} endpoint (${url}, model ${id}) can't be reached: ${error?.cause?.code || error?.cause?.message || error?.message}. Check OPENAI_BASE_URL.${inside}`;
    console.error(message);
    throw Object.assign(new Error(message), { status: 502, code });
  }
}

const needsViable = (what) => async () => {
  throw Object.assign(new Error(`${what} need VIABLE's hosted service, which a local run doesn't have. Remove the step, pass your own service to runAgent, or run the agent on VIABLE.`), { status: 422, code: 'needs_viable' });
};

/**
 * callChatModel for any OpenAI-compatible /chat/completions endpoint (OpenAI, or an open-weight
 * model behind vLLM, Ollama, llama.cpp, LM Studio...). `model` replaces every model the graph names,
 * and map ({ named: replacement }) the ones it lists; without them each step's model is sent as the
 * graph names it (a VIABLE alias such as viable-3 means nothing to another endpoint, so replace it for
 * an agent that uses one).
 */
export function openAICompatible({ baseUrl = shellValue('OPENAI_BASE_URL') || 'https://api.openai.com/v1', apiKey = shellValue('OPENAI_API_KEY'), model = null, map = null, fetch = (...args) => globalThis.fetch(...args) } = {}) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
  return async (_env, request, options = {}) => {
    const id = map?.[request.model] || model || request.model;
    // shortcut: an answer arrives whole, not token by token; stream here if a slow model's first words matter.
    const response = await reach(fetch, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ ...request, model: id, stream: false })
    }, { what: 'model', id, code: 'provider_error' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.error) {
      const reason = data?.error?.message || data?.error || response.statusText || 'no JSON in the answer';
      throw Object.assign(new Error(`The model endpoint (${url}, model ${id}) answered ${response.status}: ${reason}`), { status: response.ok ? 502 : response.status, code: 'provider_error' });
    }
    const content = data.choices?.[0]?.message?.content ?? '';
    if (content) options.onDelta?.(content);
    const usage = data.usage || {};
    const prompt = usage.prompt_tokens || 0;
    const completion = usage.completion_tokens || 0;
    return {
      content,
      usage: { prompt, completion, total: usage.total_tokens || prompt + completion },
      // Your endpoint, your bill: the harness doesn't price calls.
      cost: 0,
      response: data,
      resolution: { resolvedModel: id, provider: 'openai-compatible' },
      finishReason: data.choices?.[0]?.finish_reason || null
    };
  };
}

/**
 * save for a host without a disk: audio and pictures come back in the answer as data: URLs, which a
 * browser can show. One picture can be megabytes, so a host that keeps media elsewhere passes its own.
 */
const MEDIA_TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/opus', aac: 'audio/aac', flac: 'audio/flac', png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' };
export async function dataUrls(buffer, format = 'mp3') {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let at = 0; at < bytes.length; at += 32768) binary += String.fromCharCode(...bytes.subarray(at, at + 32768));
  return { url: `data:${MEDIA_TYPES[String(format).toLowerCase()] || 'application/octet-stream'};base64,${btoa(binary)}` };
}

// Kokoro's voices (af_heart: American English, female) on a model with OpenAI's voices: one of those, by gender.
const OPENAI_VOICES = { f: 'nova', m: 'onyx' };

/**
 * generateSpeech for an OpenAI-compatible /audio/speech endpoint (OpenAI's, or Kokoro behind
 * Kokoro-FastAPI, ...). `model` replaces every speech model the graph names. A Kokoro voice is sent
 * as it is to a Kokoro model, else as nova (female) or onyx (male); without a voice, af_heart or alloy.
 * save(buffer, format) keeps the audio (dataUrls, or mediaFiles on a disk).
 */
export function openAISpeech({ baseUrl = shellValue('OPENAI_BASE_URL') || 'https://api.openai.com/v1', apiKey = shellValue('OPENAI_API_KEY'), model = null, fetch = (...args) => globalThis.fetch(...args), save = dataUrls } = {}) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/audio/speech`;
  return async (_env, request, options = {}) => {
    const id = model || request.model;
    const kokoro = /kokoro/i.test(id || '');
    const named = request.voice || (kokoro ? 'af_heart' : 'alloy');
    const voice = !kokoro && /^[a-z][fm]_/.test(named) ? OPENAI_VOICES[named[1]] : named;
    const response = await reach(fetch, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ ...request, model: id, voice })
    }, { what: 'speech', id, code: 'speech_provider_error' });
    // An answer in JSON is an error, whatever its status.
    if (!response.ok || /json/.test(response.headers.get('content-type') || '')) {
      const text = await response.text().catch(() => '');
      let reason = null;
      try { const data = JSON.parse(text); reason = data?.error?.message || data?.error; } catch { /* Not JSON. */ }
      throw Object.assign(new Error(`The speech endpoint (${url}, model ${id}) answered ${response.status}: ${reason || text.slice(0, 200) || response.statusText}`), { status: response.ok ? 502 : response.status, code: 'provider_error' });
    }
    const audioBuffer = await response.arrayBuffer();
    const format = request.response_format || 'mp3';
    return {
      audioBuffer,
      contentType: response.headers.get('content-type') || 'audio/mpeg',
      usage: {},
      cost: 0,
      resolution: { resolvedModel: id, provider: 'openai-compatible' },
      requestPayload: { voice, response_format: format },
      ...(options.store ? { asset: await save(audioBuffer, format) } : {})
    };
  };
}

// What an endpoint's safety system says when it refuses a picture (as VIABLE reads it: src/services/imageGeneration.js).
const SAFETY_CODES = new Set(['content_policy_violation', 'moderation_blocked', 'safety_violation']);

/**
 * generateImage for an OpenAI-compatible endpoint: /images/generations, or /images/edits for an Image
 * step that changes a picture (as JSON, its images as the step gives them: web addresses or data URLs).
 * `model` replaces every image model the graph names. Each picture, whether the endpoint returns it as
 * base64 or as an address, is saved with save(buffer, format, 'image') (dataUrls, or mediaFiles on a
 * disk), and the step gets where each was saved.
 */
export function openAIImages({ baseUrl = shellValue('OPENAI_BASE_URL') || 'https://api.openai.com/v1', apiKey = shellValue('OPENAI_API_KEY'), model = null, fetch = (...args) => globalThis.fetch(...args), save = dataUrls } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  // response_format is how VIABLE delivers pictures, not a request to the model.
  return async (_env, { operation, response_format: _delivery, ...body }) => {
    const id = model || body.model;
    const url = `${base}/images/${operation === 'edit' ? 'edits' : 'generations'}`;
    const response = await reach(fetch, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ ...body, model: id })
    }, { what: 'image', id, code: 'image_provider_error' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.data?.length) {
      const reason = data?.error?.message || data?.error || (response.ok ? 'no pictures in the answer' : response.statusText || 'no JSON in the answer');
      const error = Object.assign(new Error(`The image endpoint (${url}, model ${id}) answered ${response.status}: ${reason}`), { status: response.ok ? 502 : response.status, code: 'image_provider_error' });
      // The engine's Image step reads these: a refusal isn't retried, a busy endpoint may be.
      if (SAFETY_CODES.has(data?.error?.code) || /safety system/i.test(reason)) error.imageFailureReason = 'safety';
      error.imageRetryable = !error.imageFailureReason && [429, 500, 502, 503].includes(response.status);
      error.retryAfterMs = Number(response.headers.get('retry-after')) * 1000 || 0;
      throw error;
    }
    const files = [];
    for (const item of data.data) {
      if (item.b64_json) files.push(await save(Uint8Array.from(atob(item.b64_json), (char) => char.charCodeAt(0)), data.output_format || 'png', 'image'));
      else if (item.url) {
        // An address may expire, so the picture is downloaded and kept; the API key never goes with it.
        const picture = await fetch(item.url);
        if (!picture.ok) throw Object.assign(new Error(`The image endpoint made a picture, and its address (${item.url}) answered ${picture.status}.`), { status: 502, code: 'image_provider_error' });
        files.push(await save(await picture.arrayBuffer(), /image\/(\w+)/.exec(picture.headers.get('content-type') || '')?.[1] || 'png', 'image'));
      }
    }
    const publicData = { data: files.map((file) => ({ url: file.url })) };
    return {
      publicData,
      responseData: publicData,
      usage: { imageCount: files.length },
      cost: 0,
      imageCount: files.length,
      resolution: { resolvedModel: id, provider: 'openai-compatible' }
    };
  };
}

/**
 * resolveSubAgent for a course package: another of its agents. A package names the agent a
 * Sub-agent step (config.slug) or an Agent step's tools.agents calls by the slug VIABLE published it
 * under; here that is an agent's slug or ref, else its name as a slug.
 */
export const packageAgent = (agents, slug) => agents.find((item) => item.slug === slug || item.ref === slug) || agents.find((item) => slugify(item.name) === slug);

export function packageAgents(pkg, plan = null) {
  const agents = Array.isArray(pkg?.agents) ? pkg.agents : [];
  return async (slug) => {
    const target = packageAgent(agents, slug);
    if (!target) {
      throw Object.assign(new Error(`Sub-agent "${slug}" isn't one of this package's agents (${agents.map((item) => item.ref).join(', ') || 'none'}). A local run calls only the package's own agents; an agent published elsewhere needs VIABLE's hosted service.`), { status: 422, code: 'subagent_unavailable' });
    }
    const graph = applyModels(linkKnowledgeRefs(target.graph, (ref) => ref), plan);
    validateGraph(graph);
    return { id: target.ref, graph };
  };
}

// A .viable.zip as VIABLE's course page downloads it with its files, held to the limits of VIABLE's import.
const ZIP_LIMITS = { archive: 50 * 1024 * 1024, package: 2 * 1024 * 1024 };

function parsed(text, what) {
  try { return JSON.parse(text); } catch (error) { throw new Error(`Couldn't read ${what} as JSON: ${error.message}`); }
}

/**
 * An agent file, a course package or a graph from its bytes: { doc, zip }. A .viable.zip (known by its
 * first bytes, PK\x03\x04, as VIABLE's import knows it) gives the package.viable.json at its root, and
 * its bytes as zip, where the files the package names by path are read; any other file is JSON. name
 * says which file it is, in errors.
 */
export async function readPackage(bytes, name = 'the package') {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data[0] !== 0x50 || data[1] !== 0x4b || data[2] !== 0x03 || data[3] !== 0x04) return { doc: parsed(new TextDecoder().decode(data), name), zip: null };
  if (data.length > ZIP_LIMITS.archive) throw new Error(`${name} is larger than 50 MB, more than a course package with its files can be.`);
  let json;
  try { json = (await readZip(data, (entry) => entry === 'package.viable.json', { binary: true, maxBytes: ZIP_LIMITS.package })).get('package.viable.json'); } catch (error) {
    throw new Error(error.code === 'zip_entry_too_large' ? `${name}: its package.viable.json is larger than 2 MB.` : `${name} can't be read: it isn't a whole zip file.`);
  }
  if (!json) throw new Error(`${name} has no package.viable.json at its root.`);
  return { doc: parsed(new TextDecoder().decode(json), `${name}'s package.viable.json`), zip: data };
}

/**
 * The agent a file holds: an .agent.json, a bare graph, or one of a course package's agents (by ref,
 * else the first) with the teaching settings of the first activity that uses it.
 */
export function pickAgent(doc, ref = null) {
  if (doc?.format === 'viable.course-package') {
    const agents = Array.isArray(doc.agents) ? doc.agents : [];
    const agent = ref ? agents.find((item) => item.ref === ref) : agents[0];
    if (!agent) throw new Error(ref ? `The package has no agent "${ref}" (it has: ${agents.map((item) => item.ref).join(', ') || 'none'}).` : 'The package has no agents.');
    const activity = (doc.course?.activities || []).find((item) => item.agent_ref === agent.ref && item.teaching);
    return { name: agent.name, graph: agent.graph, teaching: activity?.teaching ?? null, activity: activity?.title ?? null };
  }
  if (doc?.format === 'viable.agent') return { name: doc.name, graph: doc.graph, teaching: null, activity: null };
  if (doc && Array.isArray(doc.nodes)) return { name: doc.name || 'agent', graph: doc, teaching: null, activity: null };
  throw new Error('Expected an agent file (format viable.agent), a course package (viable.course-package) or a graph with nodes.');
}

/** The graph an agent to serve runs: a package's name their knowledge bases by ref. */
export const graphOf = (agent) => {
  const { graph } = pickAgent(agent.doc, agent.ref);
  return agent.doc?.format === 'viable.course-package' ? linkKnowledgeRefs(graph, (ref) => ref) : graph;
};

/**
 * The agents to serve from what files hold ({ doc, dir, zip, file, name }, name being what an agent
 * file answers at before it is made a slug): [{ slug, ref, name, description, doc, dir, zip, file }].
 * An agent file answers at its file's name (VIABLE exports it as <slug>.agent.json), a package's
 * agents at their slugs from VIABLE (else their refs). Each graph is checked now, and two agents with
 * one slug are an error, so a server never starts with an agent it can't run.
 */
export function agentsToServe(files) {
  const agents = [];
  for (const { doc, dir = null, zip = null, file, name } of files) {
    const from = { doc, dir, zip, file };
    if (doc?.format === 'viable.course-package') for (const item of doc.agents) agents.push({ ...from, slug: item.slug || item.ref, ref: item.ref, name: item.name, description: item.description ?? null });
    else agents.push({ ...from, slug: String(name ?? '').replace(/\.json$/i, '').replace(/\.agent$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), ref: null, name: doc.name || 'agent', description: doc.description ?? null });
  }
  const seen = new Map();
  for (const agent of agents) {
    if (!agent.slug) throw new Error(`${agent.file}: its name gives no slug to serve it at; rename the file.`);
    // A slug ends up in addresses, pages and a scaffold's commands.
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(agent.slug)) throw new Error(`${agent.file}: an agent's slug takes letters, digits, dots, dashes and underscores, not "${agent.slug.slice(0, 40)}".`);
    if (seen.has(agent.slug)) throw new Error(`Two agents would answer at /v1/agents/${agent.slug}: ${seen.get(agent.slug).file} and ${agent.file}. Rename one file, or serve them from two servers.`);
    seen.set(agent.slug, agent);
    try { validateGraph(graphOf(agent)); } catch (error) { throw new Error(`${agent.file}${agent.ref ? ` (agent ${agent.ref})` : ''}: ${error.message}${error.details?.length ? ` ${error.details.join(" ")}` : ""}`); }
  }
  return agents;
}

// As VIABLE runs a turn, except that without its own limit an agent
// gets 5 minutes, as VIABLE's background jobs do: local and open-weight models are often slower.
function budgetsOf(graph) {
  const own = graph?.run_limits || {};
  return { maxModelCalls: own.max_model_calls || 20, timeoutMs: (own.timeout_seconds || 300) * 1000 };
}

// HTTP components only, at public addresses: a host that can't start processes refuses an MCP one before anything is sent.
const httpComponents = (fetch) => (manifest, payload, options) => callOut(manifest, payload, (component, sent, call) => {
  if (component.runs.kind !== 'http') throw refused(`${component.id} is an MCP server, which this host can't start. Run it behind an HTTP address, or serve this agent where it can start (viable-harness serve).`);
  return overHttp(component, sent, { ...call, fetch, checkEntry: (url) => publicUrl(url.href) });
}, options);

/**
 * Runs an agent once with the services given: run.js's runAgent, without what needs a disk or a
 * process. Takes its options but for dir, knowledge, mediaDir, audioDir and memoryDir; save keeps
 * audio and pictures (default: dataUrls). A service set to null in `services` is turned off. models
 * (modelPlan) replaces models by role and name, in place of model, speechModel and imageModel.
 * conversation carries what a kept conversation remembers: { state, resume, historySummary,
 * historyStart }.
 */
export async function runWithServices(doc, { input = '', history = [], context = null, pictures = undefined, teaching = null, section = null, agent = null, model = null, speechModel = null, imageModel = null, models = null, conversation = null, baseUrl, apiKey, fetch, save = dataUrls, learner = null, silent = false, services = {}, hooks = {} } = {}) {
  const picked = pickAgent(doc, agent);
  const isPackage = doc?.format === 'viable.course-package';
  // A package names its knowledge bases by ref; a local run searches them under those refs.
  const graph = applyModels(isPackage ? linkKnowledgeRefs(picked.graph, (ref) => ref) : picked.graph, models);
  validateGraph(graph);
  const settings = teaching === false ? null : teaching ?? picked.teaching;
  const own = {
    // The engine's own summary model is named nowhere in the graph, so it is replaced where it is called.
    callChatModel: openAICompatible({ baseUrl, apiKey, model: models ? null : model, map: models ? { [SUMMARY_MODEL]: models.map[SUMMARY_MODEL] || models.reply } : null, fetch }),
    ...(isPackage ? { resolveSubAgent: packageAgents(doc, models) } : {}),
    generateSpeech: openAISpeech({ baseUrl, apiKey, model: speechModel, fetch, save }),
    storeAudio: async (_env, _requestId, buffer, { responseFormat } = {}) => save(buffer, responseFormat),
    generateImage: openAIImages({ baseUrl, apiKey, model: imageModel, fetch, save }),
    toMarkdown,
    callComponent: httpComponents(fetch),
    transcribeAudio: needsViable('Transcribe steps'),
    billsUsedUpCredits: () => false,
    ...services
  };
  // Without speech or images their steps fail clearly (the engine reads the other services' absence itself).
  if (own.generateSpeech === null) own.generateSpeech = needsViable('Speech steps');
  if (own.generateImage === null) own.generateImage = needsViable('Image steps');
  try {
    const result = await runAgentGraph({}, graph, {
      input,
      history,
      pictures,
      context: teachingRunContext(settings, context, section),
      budgets: budgetsOf(graph),
      // Memory's subject; the engine never sends it to a model.
      memorySubject: learner,
      silent,
      hooks,
      state: conversation?.state,
      resume: conversation?.resume,
      historySummary: conversation?.historySummary,
      historyStart: conversation?.historyStart,
      services: own
    });
    return { agent: picked.name, activity: settings ? picked.activity : null, teaching: settings, ...result };
  } catch (error) {
    if (error?.code === 'knowledge_unavailable' && !own.searchKnowledge) error.message += ' Map each knowledge base the agent names to a folder of its files with --knowledge <id>=<folder> (knowledge in runAgent), or run the agent on VIABLE\'s hosted service.';
    if (NEEDS_VIABLE.has(error?.code) && !/VIABLE/.test(error.message)) error.message += ' This step needs VIABLE\'s hosted service; see the harness README, "What runs locally".';
    throw error;
  }
}

/**
 * What the handler (handler.js) runs a turn with, on a host without a disk: an endpoint's options
 * (baseUrl, apiKey, fetch, models), silent, save, memory (storeMemory, or none: Memory steps are
 * skipped) and services (the engine's, such as a host's callComponent). Each package's files are searched from the zip's bytes it holds, read once for all its
 * agents. A host on Node passes services.httpFetch (server/onNode.js): only a Worker's own transport refuses private addresses by itself.
 */
export function createRuntime({ fetch = (...args) => globalThis.fetch(...args), memory = null, services = {}, ...endpoint } = {}) {
  const searches = new Map();
  const searchOf = (agent) => {
    if (agent.doc?.format !== 'viable.course-package') return null;
    if (!searches.has(agent.doc)) searches.set(agent.doc, searchPackage(agent.doc, { zip: agent.zip, fetch: services.httpFetch ?? fetch }));
    return searches.get(agent.doc);
  };
  return {
    memory,
    run(agent, turn, { hooks = {}, timed = (base) => base } = {}) {
      const search = searchOf(agent);
      return runWithServices(agent.doc, {
        ...endpoint, input: turn.text, history: turn.history, context: turn.context, teaching: turn.teaching ?? null, section: turn.section ?? null,
        conversation: turn.conversation ?? null, agent: agent.ref, fetch: timed(fetch), learner: memory ? turn.user : null, hooks, ...(turn.silent ? { silent: true } : {}),
        services: { ...(search ? { searchKnowledge: search } : {}), ...(memory ? { memory } : {}), ...services, httpFetch: timed(services.httpFetch ?? ((...args) => globalThis.fetch(...args))) }
      });
    }
  };
}
