/**
 * Runs a VIABLE agent graph on your own machine and model keys: VIABLE's engine
 * (src/agents/engine.js) with its services replaced by an OpenAI-compatible
 * chat endpoint, and the services only VIABLE's hosted platform has (knowledge
 * bases, memory, images, speech, sub-agents) absent or failing with a clear
 * message. Pass `services` to plug in your own.
 */
import { runAgentGraph } from '../../src/agents/engine.js';
import { validateGraph } from '../../src/agents/graph.js';
import { resolveModel } from '../../src/config/models.js';
import { teachingRunContext } from './teaching.js';

// What each step type does in a local run (the README's table is this list).
export const LOCAL_STEPS = {
  works: ['input', 'llm', 'condition', 'router', 'agent', 'vetting', 'guardrail', 'transform', 'state', 'loop', 'parallel', 'ask', 'output', 'note'],
  partly: { http: 'JSON and text; an HTML page needs a toMarkdown service (Workers AI on VIABLE)' },
  skipped: { memory: 'skipped with a reason (no memory store)', transcribe: 'skipped: a local run sends no recording' },
  fails: { knowledge: 'knowledge bases live on VIABLE', subagent: 'published sub-agents live on VIABLE', image: 'image generation runs on VIABLE', speech: 'speech runs on VIABLE' }
};

const NEEDS_VIABLE = new Set(['needs_viable', 'knowledge_unavailable', 'subagent_disabled', 'http_markdown_unavailable']);

const needsViable = (what) => async () => {
  throw Object.assign(new Error(`${what} need VIABLE's hosted service, which a local run doesn't have. Remove the step, pass your own service to runAgent, or run the agent on VIABLE.`), { status: 422, code: 'needs_viable' });
};

/** The model ID an OpenAI-compatible endpoint knows for a VIABLE model name (viable-3 → its provider model), else the name as given. */
export function endpointModel(model) {
  try { return resolveModel(model).providerModel || model; } catch { return model; }
}

/**
 * callChatModel for any OpenAI-compatible /chat/completions endpoint (OpenAI, or an open-weight
 * model behind vLLM, Ollama, llama.cpp, LM Studio...). `model` replaces every model the graph names.
 */
export function openAICompatible({ baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', apiKey = process.env.OPENAI_API_KEY, model = null, fetch = globalThis.fetch } = {}) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
  return async (_env, request, options = {}) => {
    const id = model || endpointModel(request.model);
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
      // Your endpoint, your bill: the kit doesn't price calls.
      cost: 0,
      response: data,
      resolution: { resolvedModel: id, provider: 'openai-compatible' },
      finishReason: data.choices?.[0]?.finish_reason || null
    };
  };
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
 * section: the learner's section ID, for a section's own help level and note.
 */
export async function runAgent(doc, { input = '', history = [], context = null, teaching = null, section = null, agent = null, model = null, baseUrl, apiKey, fetch, services = {}, hooks = {} } = {}) {
  const picked = pickAgent(doc, agent);
  validateGraph(picked.graph);
  const settings = teaching === false ? null : teaching ?? picked.teaching;
  try {
    const result = await runAgentGraph({}, picked.graph, {
      input,
      history,
      context: teachingRunContext(settings, context, section),
      budgets: budgetsOf(picked.graph),
      hooks,
      services: {
        callChatModel: openAICompatible({ baseUrl, apiKey, model, fetch }),
        generateImage: needsViable('Image steps'),
        generateSpeech: needsViable('Speech steps'),
        transcribeAudio: needsViable('Transcribe steps'),
        billsUsedUpCredits: () => false,
        ...services
      }
    });
    return { agent: picked.name, activity: settings ? picked.activity : null, teaching: settings, ...result };
  } catch (error) {
    if (NEEDS_VIABLE.has(error?.code) && !/VIABLE/.test(error.message)) error.message += ' This step needs VIABLE\'s hosted service; see the kit README, "What runs locally".';
    throw error;
  }
}
