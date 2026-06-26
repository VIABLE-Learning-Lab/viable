/**
 * Agent orchestration engine.
 *
 * Interprets a validated graph (see graph.js) as a node-to-node walk with
 * branching and back-edges (loops). Hard budgets — max steps, max model calls,
 * max loop iterations, and a wall-clock deadline — guarantee termination even
 * for cyclic graphs. Provider calls reuse the same clients as the fixed
 * endpoints (callChatModel, generateImageAsset) and are reported via hooks so
 * the caller can persist traces and per-call billing rows.
 *
 * Stateless by design: conversation history is passed in and new messages are
 * returned; the engine never touches the database.
 */

import { callChatModel } from '../utils/chatModelClient.js';
import { generateImageAsset } from '../services/imageGeneration.js';
import { evaluateCondition, evaluateExpression, renderTemplate, renderValue } from './expression.js';

export const DEFAULT_BUDGETS = Object.freeze({
  maxSteps: 50,
  maxModelCalls: 20,
  maxLoopIterations: 25,
  timeoutMs: 60000
});

export class AgentRunError extends Error {
  constructor(message, { status = 400, code = 'agent_run_error' } = {}) {
    super(message);
    this.name = 'AgentRunError';
    this.status = status;
    this.code = code;
  }
}

function budgetError(kind) {
  return new AgentRunError(`Agent run exceeded its ${kind} budget.`, {
    status: 422,
    code: 'agent_budget_exceeded'
  });
}

export async function runAgentGraph(env, graph, options = {}) {
  const budgets = { ...DEFAULT_BUDGETS, ...(options.budgets || {}) };
  const services = {
    callChatModel,
    generateImage: generateImageAsset,
    httpFetch: (...args) => fetch(...args),
    resolveSubAgent: null,
    httpAllowlist: options.httpAllowlist || null,
    ...(options.services || {})
  };
  const hooks = options.hooks || {};

  const nodeMap = new Map();
  for (const node of graph.nodes || []) nodeMap.set(node.id, node);

  const deadline = Date.now() + budgets.timeoutMs;

  const ctx = {
    input: options.input ?? '',
    requestId: options.requestId || null,
    messages: Array.isArray(options.history) ? options.history : [],
    outputs: {},
    variables: { ...(graph.variables || {}), ...(options.variables || {}) },
    loopCounts: {},
    steps: [],
    usage: { prompt: 0, completion: 0, total: 0 },
    cost: 0,
    modelCalls: 0,
    stepCount: 0,
    result: null,
    scope() {
      return {
        ...this.outputs,
        vars: this.variables,
        input: this.input,
        history: this.messages
      };
    },
    consumeModelCall() {
      this.modelCalls += 1;
      if (this.modelCalls > budgets.maxModelCalls) throw budgetError('model call');
    },
    addUsage(usage, cost) {
      if (usage) {
        this.usage.prompt += usage.prompt || 0;
        this.usage.completion += usage.completion || 0;
        this.usage.total += usage.total || 0;
      }
      if (typeof cost === 'number') this.cost += cost;
    }
  };

  let currentId = graph.entry;
  while (currentId != null) {
    if (ctx.stepCount >= budgets.maxSteps) throw budgetError('step');
    if (Date.now() > deadline) throw budgetError('time');

    const node = nodeMap.get(currentId);
    if (!node) throw new AgentRunError(`Graph references missing node "${currentId}".`, { status: 422, code: 'invalid_graph' });

    const handler = HANDLERS[node.type];
    if (!handler) throw new AgentRunError(`No handler for node type "${node.type}".`, { status: 422, code: 'invalid_graph' });

    const startedAt = Date.now();
    let next = null;
    let output = null;
    try {
      const result = await handler(node, ctx, env, services, hooks, budgets);
      output = result.output;
      next = result.next ?? null;
    } catch (error) {
      recordStep(ctx, node, { error, startedAt });
      hooks.onStep?.(ctx.steps[ctx.steps.length - 1]);
      throw error;
    }

    ctx.outputs[node.id] = output;
    recordStep(ctx, node, { output, startedAt });
    ctx.stepCount += 1;
    hooks.onStep?.(ctx.steps[ctx.steps.length - 1]);

    if (node.type === 'output') {
      ctx.result = output;
      break;
    }
    currentId = next;
  }

  return {
    output: ctx.result || { text: '', attachments: [] },
    steps: ctx.steps,
    usage: ctx.usage,
    cost: ctx.cost,
    modelCalls: ctx.modelCalls,
    stepCount: ctx.stepCount,
    outputs: ctx.outputs,
    variables: ctx.variables
  };
}

function recordStep(ctx, node, { output = null, error = null, startedAt }) {
  ctx.steps.push({
    stepNumber: ctx.steps.length + 1,
    nodeId: node.id,
    nodeType: node.type,
    status: error ? 'failed' : 'completed',
    output: error ? null : summarizeOutput(output),
    model: output?.model || null,
    tokens: output?.usage?.total ?? null,
    cost: typeof output?.cost === 'number' ? output.cost : null,
    error: error ? String(error.message || error).slice(0, 500) : null,
    durationMs: Date.now() - startedAt
  });
}

function summarizeOutput(output) {
  if (output == null) return null;
  try {
    const json = JSON.stringify(output);
    return json.length > 8000 ? { truncated: true, preview: json.slice(0, 8000) } : output;
  } catch (_) {
    return { unserializable: true };
  }
}

// ---------------------------------------------------------------------------
// Node handlers: (node, ctx, env, services, hooks, budgets) -> { output, next }
// ---------------------------------------------------------------------------

const HANDLERS = {
  input(node, ctx) {
    return { output: { message: ctx.input, history: ctx.messages }, next: node.next };
  },

  async llm(node, ctx, env, services, hooks) {
    const cfg = node.config || {};
    const scope = ctx.scope();
    const outputs = normalizeOutputs(cfg.outputs);
    const wantsJson = outputs.length > 0 || Boolean(cfg.json || cfg.output_schema) || cfg.response_format?.type === 'json_object';

    const messages = [];
    const systemParts = [];
    if (cfg.system) systemParts.push(renderTemplate(cfg.system, scope));
    if (outputs.length) systemParts.push(buildOutputInstruction(outputs));
    else if (cfg.json) systemParts.push('Respond ONLY with a single valid JSON object — no markdown, no extra text.');
    if (systemParts.length) messages.push({ role: 'system', content: systemParts.join('\n\n') });

    if (cfg.includeHistory !== false) messages.push(...ctx.messages);
    const userContent = cfg.user != null ? renderTemplate(cfg.user, scope) : ctx.input;
    if (userContent) messages.push({ role: 'user', content: userContent });

    const requestData = { model: cfg.model, messages, ...mapModelParams(cfg) };
    if (wantsJson) requestData.response_format = { type: 'json_object' };
    else if (cfg.response_format) requestData.response_format = cfg.response_format;

    ctx.consumeModelCall();
    let result = await services.callChatModel(env, requestData);
    ctx.addUsage(result.usage, result.cost);
    logLlmProviderCall(hooks, node, cfg, result, requestData, 0);

    let json = wantsJson ? safeParseJson(result.content) : null;
    if (wantsJson && json == null) {
      const retryRequest = {
        ...requestData,
        messages: buildJsonRetryMessages(messages, result.content),
        response_format: { type: 'json_object' }
      };
      ctx.consumeModelCall();
      result = await services.callChatModel(env, retryRequest);
      ctx.addUsage(result.usage, result.cost);
      logLlmProviderCall(hooks, node, cfg, result, retryRequest, 1);
      json = safeParseJson(result.content);
      if (json == null) {
        throw new AgentRunError(`LLM node "${node.id}" returned invalid JSON after retry.`, {
          status: 422,
          code: 'llm_json_parse_failed'
        });
      }
    }

    const output = {
      content: result.content,
      json,
      model: result.resolution?.resolvedModel || cfg.model,
      provider: result.resolution?.provider || null,
      usage: result.usage,
      cost: result.cost,
      finishReason: result.finishReason
    };

    return { output, next: node.next };
  },

  condition(node, ctx) {
    const cfg = node.config || {};
    const scope = ctx.scope();

    if (Array.isArray(cfg.cases)) {
      for (const branch of cfg.cases) {
        if (branch && evaluateCondition(branch.when, scope)) {
          return { output: { matched: branch.when }, next: branch.to };
        }
      }
      return { output: { matched: null }, next: cfg.default ?? node.next ?? null };
    }

    // Structured form (built by the UI): { field, op, value }. Falls back to a
    // raw expression for advanced users.
    let result;
    if (cfg.field) {
      const left = evaluateExpression(cfg.field, scope);
      result = compareValues(left, cfg.op || '==', cfg.value);
    } else {
      result = evaluateCondition(cfg.expr, scope);
    }

    const branches = node.branches || {};
    const next = result ? branches.true : branches.false;
    return { output: { result }, next: next ?? node.next ?? null };
  },

  async image(node, ctx, env, services, hooks) {
    const cfg = node.config || {};
    const scope = ctx.scope();
    const prompt = renderTemplate(cfg.prompt ?? '{{input}}', scope);

    const requestBody = {
      model: cfg.model,
      prompt,
      ...(cfg.n != null ? { n: cfg.n } : {}),
      ...(cfg.size ? { size: cfg.size } : {}),
      ...(cfg.quality ? { quality: cfg.quality } : {}),
      response_format: cfg.response_format || 'url'
    };

    ctx.consumeModelCall();
    const result = await services.generateImage(env, requestBody, { requestId: ctx.requestId });
    ctx.addUsage(null, result.cost);

    const urls = (result.publicData?.data || [])
      .map((item) => item.url)
      .filter(Boolean);

    const output = {
      url: urls[0] || null,
      urls,
      prompt,
      model: result.resolution?.resolvedModel || cfg.model,
      cost: result.cost
    };

    hooks.logProviderCall?.({
      operation: 'image_generation',
      nodeId: node.id,
      model: output.model,
      provider: result.resolution?.provider || null,
      requestedModel: cfg.model,
      usage: { imageCount: result.imageCount },
      cost: result.cost,
      requestBody,
      responseBody: result.responseData,
      operationMetadata: {
        assetUrls: urls,
        assetDelivery: result.responseData?._viablelab?.asset_delivery || null
      }
    });

    return { output, next: node.next };
  },

  async http(node, ctx, env, services) {
    const cfg = node.config || {};
    const scope = ctx.scope();
    const url = renderTemplate(cfg.url || '', scope);
    assertAllowedHttpUrl(url, services.httpAllowlist);

    const method = (cfg.method || 'POST').toUpperCase();
    const headers = renderValue(cfg.headers || { 'Content-Type': 'application/json' }, scope);
    const body = cfg.body != null ? JSON.stringify(renderValue(cfg.body, scope)) : undefined;

    const response = await services.httpFetch(url, { method, headers, body });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = text; }

    return { output: { status: response.status, ok: response.ok, data }, next: node.next };
  },

  loop(node, ctx, env, services, hooks, budgets) {
    const cfg = node.config || {};
    const count = (ctx.loopCounts[node.id] || 0) + 1;
    ctx.loopCounts[node.id] = count;
    if (count > budgets.maxLoopIterations) throw budgetError('loop iteration');

    const varName = cfg.var || `${node.id}_iteration`;
    ctx.variables[varName] = count;

    let shouldContinue;
    if (cfg.count != null) shouldContinue = count <= Number(cfg.count);
    else if (cfg.while) shouldContinue = evaluateCondition(cfg.while, ctx.scope());
    else shouldContinue = false;

    const branches = node.branches || {};
    const next = shouldContinue ? branches.continue : branches.done;
    return { output: { iteration: count, continue: shouldContinue }, next: next ?? node.next ?? null };
  },

  transform(node, ctx) {
    const cfg = node.config || {};
    const output = renderValue(cfg.output ?? {}, ctx.scope());
    return { output, next: node.next };
  },

  output(node, ctx) {
    const cfg = node.config || {};
    const scope = ctx.scope();
    const text = cfg.text != null ? renderTemplate(cfg.text, scope) : '';
    const attachments = normalizeAttachments(renderValue(cfg.attachments ?? [], scope));
    return { output: { text, attachments }, next: null };
  },

  async subagent(node, ctx, env, services, hooks) {
    if (typeof services.resolveSubAgent !== 'function') {
      throw new AgentRunError('Sub-agent execution is not enabled in this context.', {
        status: 422,
        code: 'subagent_disabled'
      });
    }
    const cfg = node.config || {};
    const scope = ctx.scope();
    const slug = renderTemplate(cfg.slug || '', scope);
    const input = cfg.input != null ? renderTemplate(cfg.input, scope) : ctx.input;

    const nested = await services.resolveSubAgent(slug, { input, ctx });
    ctx.addUsage(nested.usage, nested.cost);
    if (Array.isArray(nested.providerCalls)) {
      for (const call of nested.providerCalls) hooks.logProviderCall?.(call);
    }
    return { output: nested.output, next: node.next };
  }
};

function mapModelParams(cfg) {
  const params = cfg.params || cfg;
  const out = {};
  if (params.temperature != null) out.temperature = params.temperature;
  if (params.top_p != null || params.topP != null) out.top_p = params.top_p ?? params.topP;
  if (params.max_tokens != null || params.maxTokens != null) out.max_tokens = params.max_tokens ?? params.maxTokens;
  if (params.reasoning_effort != null || params.reasoningEffort != null) {
    out.reasoning_effort = params.reasoning_effort ?? params.reasoningEffort;
  }
  return out;
}

// Structured LLM outputs (function-calling style). The author declares named
// fields with descriptions; we turn them into a JSON instruction the model
// follows, so downstream nodes can read node.json.<field> by name.
function compareValues(left, op, right) {
  switch (op) {
    case '==': return left == right; // eslint-disable-line eqeqeq
    case '!=': return left != right; // eslint-disable-line eqeqeq
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    case 'contains': return String(left ?? '').includes(String(right ?? ''));
    case 'truthy': return Boolean(left);
    case 'falsy': return !left;
    default: return left == right; // eslint-disable-line eqeqeq
  }
}

function normalizeOutputs(outputs) {
  if (!Array.isArray(outputs)) return [];
  return outputs
    .filter((o) => o && typeof o.name === 'string' && o.name.trim())
    .map((o) => ({ name: o.name.trim(), type: o.type || 'string', description: o.description || '' }));
}

function buildOutputInstruction(outputs) {
  const lines = outputs.map((o) => `- "${o.name}" (${o.type})${o.description ? `: ${o.description}` : ''}`);
  return `Respond ONLY with a single JSON object containing exactly these keys:\n${lines.join('\n')}\nReturn valid JSON only — no markdown fences, no extra text.`;
}

function buildJsonRetryMessages(messages, priorContent) {
  return [
    ...messages,
    {
      role: 'assistant',
      content: String(priorContent || '').slice(0, 2000)
    },
    {
      role: 'user',
      content: 'The previous response was not valid JSON. Return only one valid JSON object that follows the requested field contract. No markdown, no prose.'
    }
  ];
}

function logLlmProviderCall(hooks, node, cfg, result, requestBody, retry) {
  hooks.logProviderCall?.({
    operation: retry ? 'chat_json_retry' : 'chat',
    nodeId: node.id,
    model: result.resolution?.resolvedModel || cfg.model,
    provider: result.resolution?.provider || null,
    requestedModel: cfg.model,
    usage: result.usage,
    cost: result.cost,
    requestBody,
    responseBody: result.response,
    retry
  });
}

function safeParseJson(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) { /* fall through */ }
    }
    return null;
  }
}

function normalizeAttachments(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') return { type: 'image', url: item };
      return item;
    })
    .filter(Boolean);
}

function assertAllowedHttpUrl(url, allowlist) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    throw new AgentRunError(`Invalid HTTP node URL "${url}".`, { status: 400, code: 'invalid_http_url' });
  }
  if (parsed.protocol !== 'https:') {
    throw new AgentRunError('HTTP nodes may only call https:// URLs.', { status: 400, code: 'http_url_not_allowed' });
  }
  if (!Array.isArray(allowlist) || !allowlist.length) {
    throw new AgentRunError('HTTP nodes are disabled until AGENT_HTTP_ALLOWLIST contains at least one host.', {
      status: 400,
      code: 'http_host_not_allowed'
    });
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = allowlist.some((entry) => {
    const normalized = String(entry || '').toLowerCase().replace(/^\*\./, '');
    return host === normalized || host.endsWith(`.${normalized}`);
  });
  if (!allowed) {
    throw new AgentRunError(`HTTP node host "${parsed.hostname}" is not allow-listed.`, { status: 400, code: 'http_host_not_allowed' });
  }
}
