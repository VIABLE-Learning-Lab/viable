import { MODEL_PARAMS } from './modelParams.js';

const NO_TOOLS = { all: [{ unset: 'tools.knowledge_bases' }, { not: { is: { 'tools.memory': true } } }, { not: { is: { 'tools.fetch': true } } }, { unset: 'tools.agents' }] };

export default {
  type: 'agent',
  version: 1,
  label: 'Agent',
  category: 'ai',
  summary: 'Let a model choose tools (knowledge search, memory, web pages, other agents) until it can answer.',
  use: 'A tool loop: each search, read or hand-off is one more model call (max_turns tool calls, 1–20, default 5, up to 4 at once), so it is slower and costlier than fixed steps and its path varies by question. Best for open-ended help that needs several searches, whole sections, memory, web pages or other agents. Returns text only ({{id.content}}, no named fields), so a rule that must hold every time should not rest on its instructions alone: add a check.',
  guide: [
    'Give clear instructions and only the tools it needs. Each tool call is one more model call; Most tool calls bounds the loop.',
    'The final answer is {{stepId.content}}; {{stepId.tool_calls}} lists what it did. Tools run with the same limits as the matching steps.',
    'Knowledge and agents must belong to this agent’s project. Memory needs a user identifier (user) or a server conversation.',
    'A run lasts 60 seconds unless the agent’s run limits allow more (up to 120); background jobs get 5 minutes. Near the limit the agent answers with what it has. For careful reading (complete lists, comparisons), a model with reasoning helps more than extra calls.'
  ],
  keywords: 'autonomous tools function calling react knowledge memory delegate web research',
  calls_model: 'always',
  docs: '/docs/build/steps#agent',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Answers using {@tools}', when: { not: NO_TOOLS } },
    { text: 'Answers without tools', when: NO_TOOLS },
    { text: ' with {model}', when: { set: 'model' } },
    { text: ', up to {max_turns} tool calls', when: { set: 'max_turns' } },
    { text: ', from {input}', when: { set: 'input' } }
  ],
  settings: [
    { key: 'model', label: 'Model', widget: 'model', level: 'setup', placeholder: 'viable-3', tip: 'The chat model that decides which tools to use and writes the answer. Every turn of the loop is one call on it.' },
    { key: 'system', label: 'Instructions', widget: 'prompt', level: 'setup', refs: true, placeholder: 'You are the course assistant for BIO 101. Answer from the course materials and cite sources as [n].', tip: 'The model’s role, task and rules, such as “answer from the course materials and cite them as [n]”.', ai: 'Say when to use each tool and what a finished answer contains.' },
    { key: 'tools.knowledge_bases', label: 'Use knowledge', widget: 'knowledge_bases', level: 'setup', tip: 'Up to 5 knowledge bases it can search, browse by section heading and read section by section, like a researcher.' },
    { key: 'tools.memory', label: 'Remember the user', widget: 'boolean', level: 'option', default: false, tip: 'Lets it recall and save lasting facts about this user. Needs a user identifier or a server conversation. Default: off.' },
    { key: 'tools.fetch', label: 'Read web pages', widget: 'boolean', level: 'option', default: false, tip: 'Lets it read one public HTTPS page at a time, given its exact address. It can’t search the web. Default: off.' },
    { key: 'tools.agents', label: 'Hand off to agents', widget: 'agents', level: 'option', tip: 'Up to 5 published agents of this project it can give sub-tasks to. Each runs inside this run’s limits.' },
    { key: 'max_turns', label: 'Most tool calls', widget: 'number', level: 'option', min: 1, max: 20, integer: true, default: 5, placeholder: 'Default: 5', tip: 'An upper limit, not a target: it stops when it has enough, up to 4 calls at once. 1 to 20. Default: 5.' },
    { key: 'input', label: 'Message', widget: 'textarea', level: 'option', refs: true, value: true, empty: 'the learner’s message', empty_choice: ['The learner’s message', 'Custom input'], tip: 'A custom input replaces the learner’s message for this step only. Default: the learner’s message.' },
    { key: 'includeHistory', label: 'Earlier turns', widget: 'boolean', level: 'option', default: true, tip: 'Sends earlier messages of the conversation, when there are any. Default: on.' },
    { key: 'includeContext', label: 'Reference data', widget: 'boolean', level: 'option', default: false, tip: 'Adds the context JSON sent with this request, such as the current task. Default: off.' },
    ...MODEL_PARAMS
  ],
  parts: [],
  outputs: [
    { path: 'content', label: 'Final answer', type: 'string' },
    { path: 'tool_calls', label: 'Tool calls', type: 'list', tip: 'Each tool it called, with what it asked and a short result.' },
    { path: 'turns', label: 'Model turns', type: 'number' }
  ],
  presets: [],
  defaults: { tools: {}, max_turns: 5 }
};
