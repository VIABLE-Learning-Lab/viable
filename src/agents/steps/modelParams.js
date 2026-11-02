// Sampling settings shared by the LLM, Agent and Router manifests (engine.js mapModelParams reads
// node.config.params). VETTING keeps its own, one set per model, in vetting.js.
export const MODEL_PARAMS = [
  { key: 'params.temperature', label: 'Temperature', widget: 'number', level: 'advanced', min: 0, max: 2, placeholder: 'The model’s default', tip: 'Lower gives steadier answers, higher more varied ones, 0 to 2. Default: the model’s.' },
  { key: 'params.top_p', label: 'Top P', widget: 'number', level: 'advanced', min: 0, max: 1, placeholder: 'The model’s default', tip: 'Picks only from the likeliest words that together make up this share, 0 to 1. Change this or Temperature, not both. Default: the model’s.' },
  { key: 'params.max_tokens', label: 'Longest answer (tokens)', widget: 'number', level: 'advanced', min: 1, integer: true, placeholder: 'The model’s default', tip: 'Stops the answer after this many tokens, about ¾ of a word each. Default: the model’s.' },
  { key: 'params.max_completion_tokens', label: 'Longest answer with reasoning (tokens)', widget: 'number', level: 'advanced', min: 1, integer: true, placeholder: 'The model’s default', tip: 'Wins over Longest answer. Reasoning models count their thinking in it; others read it as Longest answer. Default: the model’s.' },
  { key: 'params.reasoning_effort', label: 'Reasoning effort', widget: 'select', level: 'advanced', loader: 'reasoning_efforts', options: ['minimal', 'low', 'medium', 'high'], tip: 'How long a reasoning model thinks before it answers. Higher is slower and costs more; the choices depend on the model. Default: the model’s.' }
];
