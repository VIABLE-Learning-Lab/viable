// Shared request controls for both VETTING routes and native Agent steps.
export function agentVettingControls(config) {
  return {
    requireClosingQuestion: config.require_closing_question,
    chatModel: { modelId: config.model, maxTokens: config.max_tokens, maxCompletionTokens: config.max_completion_tokens, temperature: config.temperature, topP: config.top_p, reasoningEffort: config.reasoning_effort },
    verificationModel: { modelId: config.verification_model, maxTokens: config.verification_max_tokens, maxCompletionTokens: config.verification_max_completion_tokens, temperature: config.verification_temperature, topP: config.verification_top_p, reasoningEffort: config.verification_reasoning_effort }
  };
}

// How long a review may run. An empty review counts as a failure, and a reasoning model can spend a smaller
// limit before it answers; a reviewer that answers at once stops long before this.
export const REVIEW_TOKENS = 1024;

// Gemini thinking models count their thinking against the token limit and, left to choose, can spend
// a VETTING default limit before writing (a cut-off or empty reply). They get low effort and room for both.
// model: the resolved model ID (resolvedModelId in config/models.js), not an alias.
export function thinkingBudget(model, maxTokens) {
  const id = String(model || '');
  return /^gemini-(2\.5-(flash|pro)$|3)/.test(id) ? { maxTokens: Math.max(maxTokens * 4, 2048), reasoningEffort: 'low' } : { maxTokens };
}

// A reasoning model's limit for one VETTING call. models: a host's catalog, to resolve an alias.
export function reasoningBudget(models, model, maxTokens) {
  let id = String(model || '');
  try { id = models?.resolve(id)?.resolvedModel || id; } catch { /* Unknown models are validated elsewhere. */ }
  return /^gpt-[56]/.test(id) ? { maxTokens: Math.max(maxTokens * 4, 2048), reasoningEffort: 'low' } : thinkingBudget(id, maxTokens);
}

export function vettingModelOptions(options = {}, defaults = {}) {
  const maxCompletionTokens = options.maxCompletionTokens ?? defaults.maxCompletionTokens;
  return {
    temperature: options.temperature ?? defaults.temperature,
    maxTokens: maxCompletionTokens == null ? options.maxTokens ?? defaults.maxTokens : undefined,
    maxCompletionTokens,
    topP: options.topP ?? defaults.topP,
    reasoningEffort: options.reasoningEffort ?? options.reasoning_effort ?? defaults.reasoningEffort
  };
}

export function vettingControlErrors(config, label = 'config') {
  const errors = [];
  if (config.requireClosingQuestion !== undefined && typeof config.requireClosingQuestion !== 'boolean') errors.push(`${label}.requireClosingQuestion must be a boolean.`);
  for (const name of ['chatModel', 'verificationModel']) {
    const options = config[name];
    if (options === undefined) continue;
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      errors.push(`${label}.${name} must be a JSON object.`);
      continue;
    }
    if (options.modelId !== undefined && (typeof options.modelId !== 'string' || !options.modelId.trim())) errors.push(`${label}.${name}.modelId must be a nonempty string.`);
    for (const field of ['maxTokens', 'maxCompletionTokens']) {
      if (options[field] !== undefined && (!Number.isSafeInteger(options[field]) || options[field] < 1)) errors.push(`${label}.${name}.${field} must be a positive integer.`);
    }
    if (options.temperature !== undefined && (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)) errors.push(`${label}.${name}.temperature must be between 0 and 2.`);
    if (options.topP !== undefined && (!Number.isFinite(options.topP) || options.topP < 0 || options.topP > 1)) errors.push(`${label}.${name}.topP must be between 0 and 1.`);
    for (const field of ['reasoningEffort', 'reasoning_effort']) {
      if (options[field] !== undefined && (typeof options[field] !== 'string' || !options[field].trim())) errors.push(`${label}.${name}.${field} must be a nonempty string supported by the model.`);
    }
  }
  return errors;
}
