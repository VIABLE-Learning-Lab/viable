/**
 * Runs a VIABLE agent graph on your own machine and model keys: VIABLE's engine
 * (src/agents/engine.js) with its services replaced by an OpenAI-compatible
 * endpoint (chat, speech and images), a course package's own files and agents (its
 * knowledge bases and sub-agents), folders standing in for an agent file's knowledge bases, a local
 * HTML-to-Markdown reader, components called over HTTP or as MCP servers started here and, when
 * asked for, memory kept in a folder. What only VIABLE's hosted platform has (published
 * agents and knowledge bases elsewhere, transcription) is absent or fails with a
 * clear message. Pass `services` to plug in your own.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runAgentGraph } from './agents/engine.js';
import { callComponent } from './components/call.js';
import { linkKnowledgeRefs, slugify, validateGraph } from './agents/graph.js';
import { knowledgeFolders, packageKnowledge } from './knowledge.js';
import { toMarkdown } from './markdown.js';
import { checkLearner, memoryFiles } from './memory.js';
import { teachingRunContext } from './teaching.js';
import { readZip } from './utils/zip.js';

// What each step type does in a local run (the README's table is this list).
export const LOCAL_STEPS = {
  works: ['input', 'llm', 'condition', 'router', 'agent', 'vetting', 'guardrail', 'transform', 'state', 'loop', 'each', 'parallel', 'ask', 'output', 'note', 'http', 'component'],
  partly: {
    knowledge: 'in a course package (or its .viable.zip), and in the folders you map an agent file\'s knowledge bases to: text, Markdown, CSV, JSON and HTML files, and a PDF or Office file through the text copy VIABLE packages with it, by keywords (no websites)',
    subagent: 'in a course package: its own agents',
    speech: 'on your endpoint\'s /audio/speech, saved to audio files',
    image: 'on your endpoint\'s /images/generations and /images/edits, saved to picture files (not kept by number for later turns)',
    memory: 'with a memory folder and a learner\'s pseudonymous ID: one JSON file per learner, recalled by keywords; skipped otherwise'
  },
  skipped: { transcribe: 'skipped: a local run sends no recording' }
};

const NEEDS_VIABLE = new Set(['needs_viable', 'knowledge_unavailable', 'subagent_disabled', 'http_markdown_unavailable']);

const needsViable = (what) => async () => {
  throw Object.assign(new Error(`${what} need VIABLE's hosted service, which a local run doesn't have. Remove the step, pass your own service to runAgent, or run the agent on VIABLE.`), { status: 422, code: 'needs_viable' });
};

/**
 * callChatModel for any OpenAI-compatible /chat/completions endpoint (OpenAI, or an open-weight
 * model behind vLLM, Ollama, llama.cpp, LM Studio...). `model` replaces every model the graph names;
 * without it each step's model is sent as the graph names it (a VIABLE alias such as viable-3 means
 * nothing to another endpoint, so pass `model` for an agent that uses one).
 */
export function openAICompatible({ baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', apiKey = process.env.OPENAI_API_KEY, model = null, fetch = globalThis.fetch } = {}) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
  return async (_env, request, options = {}) => {
    const id = model || request.model;
    // shortcut: no token streaming; an answer arrives whole (as VIABLE does for providers that don't stream).
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ ...request, model: id, stream: false })
    });
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
 * A folder for the audio and pictures a run's Speech and Image steps make: dir, else a new one in the
 * system's temp folder. Returns save(buffer, format, kind = 'speech') → { url: the file's path }.
 */
export function mediaFiles(dir = null) {
  let folder = null;
  return async (buffer, format = 'mp3', kind = 'speech') => {
    folder ||= dir ? mkdir(resolve(dir), { recursive: true }).then(() => resolve(dir)) : mkdtemp(join(tmpdir(), 'viable-harness-'));
    // The format comes from the agent file or the endpoint: never a path.
    const extension = String(format).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'bin';
    const path = join(await folder, `${kind}-${randomUUID().slice(0, 8)}.${extension}`);
    await writeFile(path, new Uint8Array(buffer));
    return { url: path };
  };
}

// The name from when the folder held only audio.
export const audioFiles = mediaFiles;

// Kokoro's voices (af_heart: American English, female) on a model with OpenAI's voices: one of those, by gender.
const OPENAI_VOICES = { f: 'nova', m: 'onyx' };

/**
 * generateSpeech for an OpenAI-compatible /audio/speech endpoint (OpenAI's, or Kokoro behind
 * Kokoro-FastAPI, ...). `model` replaces every speech model the graph names. A Kokoro voice is sent
 * as it is to a Kokoro model, else as nova (female) or onyx (male); without a voice, af_heart or alloy.
 * save(buffer, format) keeps the audio (audioFiles).
 */
export function openAISpeech({ baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', apiKey = process.env.OPENAI_API_KEY, model = null, fetch = globalThis.fetch, save = audioFiles() } = {}) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/audio/speech`;
  return async (_env, request, options = {}) => {
    const id = model || request.model;
    const kokoro = /kokoro/i.test(id || '');
    const named = request.voice || (kokoro ? 'af_heart' : 'alloy');
    const voice = !kokoro && /^[a-z][fm]_/.test(named) ? OPENAI_VOICES[named[1]] : named;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ ...request, model: id, voice })
    });
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
 * base64 or as an address, is saved with save(buffer, format, 'image') (mediaFiles), and the step gets
 * the files' paths.
 */
export function openAIImages({ baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', apiKey = process.env.OPENAI_API_KEY, model = null, fetch = globalThis.fetch, save = mediaFiles() } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  // response_format is how VIABLE delivers pictures, not a request to the model.
  return async (_env, { operation, response_format: _delivery, ...body }) => {
    const id = model || body.model;
    const url = `${base}/images/${operation === 'edit' ? 'edits' : 'generations'}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ ...body, model: id })
    });
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
      if (item.b64_json) files.push(await save(Buffer.from(item.b64_json, 'base64'), data.output_format || 'png', 'image'));
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
 * under; here that is an agent's ref, else its name as a slug.
 */
export function packageAgents(pkg) {
  const agents = Array.isArray(pkg?.agents) ? pkg.agents : [];
  return async (slug) => {
    const target = agents.find((item) => item.ref === slug) || agents.find((item) => slugify(item.name) === slug);
    if (!target) {
      throw Object.assign(new Error(`Sub-agent "${slug}" isn't one of this package's agents (${agents.map((item) => item.ref).join(', ') || 'none'}). A local run calls only the package's own agents; an agent published elsewhere needs VIABLE's hosted service.`), { status: 422, code: 'subagent_unavailable' });
    }
    const graph = linkKnowledgeRefs(target.graph, (ref) => ref);
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
 * An agent file, a course package or a graph from disk: { doc, dir, zip }. A .viable.zip (known by its
 * first bytes, PK\x03\x04, as VIABLE's import knows it) gives the package.viable.json at its root, and
 * its bytes as zip, where the files the package names by path are read; any other file is JSON, and dir
 * the folder it is in.
 */
export async function readAgentFile(path) {
  const bytes = await readFile(path);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return { doc: parsed(bytes.toString('utf8'), path), dir: dirname(resolve(path)), zip: null };
  if (bytes.length > ZIP_LIMITS.archive) throw new Error(`${path} is larger than 50 MB, more than a course package with its files can be.`);
  let json;
  try { json = (await readZip(bytes, (name) => name === 'package.viable.json', { binary: true, maxBytes: ZIP_LIMITS.package })).get('package.viable.json'); } catch (error) {
    throw new Error(error.code === 'zip_entry_too_large' ? `${path}: its package.viable.json is larger than 2 MB.` : `${path} can't be read: it isn't a whole zip file.`);
  }
  if (!json) throw new Error(`${path} has no package.viable.json at its root.`);
  return { doc: parsed(new TextDecoder().decode(json), `${path}'s package.viable.json`), dir: null, zip: bytes };
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

// As VIABLE runs a turn (agentExecution.js budgetsFromEnv), except that without its own limit an agent
// gets 5 minutes, as VIABLE's background jobs do: local and open-weight models are often slower.
function budgetsOf(graph) {
  const own = graph?.run_limits || {};
  return { maxModelCalls: own.max_model_calls || 20, timeoutMs: (own.timeout_seconds || 300) * 1000 };
}

/**
 * Runs an agent once. doc: an agent file, a course package or a graph. Returns the engine's result
 * (output, steps with VETTING rounds, usage, ...) and which agent ran with which teaching settings.
 * teaching: an activity's teaching settings (null keeps a package activity's; false runs without);
 * section: the learner's section ID, for a section's own help level and note. dir: the folder a
 * package's files named by path are in (zip: the bytes of the .viable.zip they are in instead); fetch
 * also downloads its files named by url. knowledge ({ id: folder }) searches each folder's text files
 * as the knowledge base of that ID: VIABLE's IDs in an agent file, refs in a package (knowledgeFolders).
 * speechModel and imageModel replace every speech and image model; mediaDir (or its older name, audioDir) keeps the
 * audio and pictures (default: a new temp folder); silent: Speech steps pass on without reading aloud.
 * Component steps call their component with fetch, an MCP server starting in dir (default: here).
 * memoryDir with learner (a pseudonymous ID, never a name) keeps that learner's memory in
 * memoryDir/<learner>.json; without them Memory steps are skipped. A service set to null in
 * `services` is turned off.
 */
export async function runAgent(doc, { input = '', history = [], context = null, pictures = undefined, teaching = null, section = null, agent = null, model = null, speechModel = null, imageModel = null, baseUrl, apiKey, fetch, dir = null, zip = null, knowledge = null, mediaDir = null, audioDir = null, memoryDir = null, learner = null, silent = false, services = {}, hooks = {} } = {}) {
  const picked = pickAgent(doc, agent);
  const isPackage = doc?.format === 'viable.course-package';
  // A package names its knowledge bases by ref; a local run searches them under those refs.
  const graph = isPackage ? linkKnowledgeRefs(picked.graph, (ref) => ref) : picked.graph;
  validateGraph(graph);
  const settings = teaching === false ? null : teaching ?? picked.teaching;
  if (memoryDir) checkLearner(learner);
  const save = mediaFiles(mediaDir ?? audioDir);
  const folders = knowledge ? await knowledgeFolders(knowledge) : null;
  const own = {
    callChatModel: openAICompatible({ baseUrl, apiKey, model, fetch }),
    ...(isPackage || folders ? { searchKnowledge: packageKnowledge(isPackage ? doc : null, { dir, fetch, zip, folders }) } : {}),
    ...(isPackage ? { resolveSubAgent: packageAgents(doc) } : {}),
    generateSpeech: openAISpeech({ baseUrl, apiKey, model: speechModel, fetch, save }),
    storeAudio: async (_env, _requestId, buffer, { responseFormat } = {}) => save(buffer, responseFormat),
    generateImage: openAIImages({ baseUrl, apiKey, model: imageModel, fetch, save }),
    ...(memoryDir ? { memory: memoryFiles(memoryDir) } : {}),
    toMarkdown,
    callComponent: (manifest, payload, options) => callComponent(manifest, payload, { ...options, fetch, dir: dir ?? undefined }),
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
      services: own
    });
    return { agent: picked.name, activity: settings ? picked.activity : null, teaching: settings, ...result };
  } catch (error) {
    if (error?.code === 'knowledge_unavailable' && !own.searchKnowledge) error.message += ' Map each knowledge base the agent names to a folder of its files with --knowledge <id>=<folder> (knowledge in runAgent), or run the agent on VIABLE\'s hosted service.';
    if (NEEDS_VIABLE.has(error?.code) && !/VIABLE/.test(error.message)) error.message += ' This step needs VIABLE\'s hosted service; see the harness README, "What runs locally".';
    throw error;
  }
}
