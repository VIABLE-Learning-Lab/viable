export default {
  type: 'knowledge',
  version: 1,
  label: 'Knowledge',
  category: 'knowledge',
  summary: 'Search your knowledge bases and pass the best passages, with sources, to later steps.',
  use: 'Search only, no chat model: fast and cheap. One search of 1–5 knowledge bases for the query it is given; returns passages with sources and a count. Best before an llm that must answer only from the sources. Short follow-ups (“and on Saturday?”) search better after an llm rewrites them.',
  guide: [
    'Insert {{stepId.context}} into an LLM’s instructions: numbered passages with titles and addresses, ready to cite as [n].',
    'Each knowledge base searches by keywords and meaning, reranked, or by keywords alone (no AI calls), as set on the knowledge base. {{stepId.results}} holds each passage, score and source; {{stepId.count}} is 0 when nothing matched, so a Branch can handle it.',
    'Manage documents and websites under Build → Knowledge.'
  ],
  keywords: 'rag retrieval search documents pdf files website vector embeddings sources passages',
  docs: '/docs/build/knowledge',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Searches {knowledge_bases}', when: { set: 'knowledge_bases' } },
    { text: 'Searches your knowledge bases', when: { unset: 'knowledge_bases' } },
    { text: ' for {query}', when: { set: 'query' } },
    { text: ' for the message', when: { unset: 'query' } },
    { text: ', returning up to {top_k} passages', when: { set: 'top_k' } }
  ],
  settings: [
    { key: 'knowledge_bases', label: 'Knowledge bases', widget: 'knowledge_bases', level: 'setup', tip: '1 to 5 knowledge bases of this project to search together.' },
    { key: 'query', label: 'Search for', widget: 'textarea', level: 'setup', refs: true, value: true, empty: 'the current message', empty_choice: ['The current message', 'Custom text'], tip: 'Short follow-ups search better after an LLM rewrites them into a whole question. Default: the current message.' },
    { key: 'top_k', label: 'Passages to return', widget: 'number', level: 'option', min: 1, max: 20, integer: true, default: 5, placeholder: 'Default: 5', tip: 'The best matches kept, 1 to 20. More gives the answer more to go on and costs more tokens. Default: 5.' }
  ],
  parts: [],
  outputs: [
    { path: 'context', label: 'Passages with sources', type: 'string', tip: 'Numbered for citing as [n], ready for an LLM’s instructions.' },
    { path: 'count', label: 'Passages found', type: 'number', tip: '0 when nothing matched.' },
    { path: 'results', label: 'Every passage', type: 'list', tip: 'Each with its number, text, score and source.' },
    { path: 'citations', label: 'Citations', type: 'list' }
  ],
  presets: [],
  defaults: {}
};
