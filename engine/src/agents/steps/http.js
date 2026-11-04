const READS = { is: { method: ['GET', 'HEAD'] } };

export default {
  type: 'http',
  version: 1,
  label: 'Fetch URL',
  category: 'tools',
  summary: 'Read one public HTTPS address, or send JSON to an API. It doesn’t search the web or run a site’s JavaScript.',
  use: 'No model. GET reads one public HTTPS URL (10 seconds, 5 MiB download, 256 KiB after cleanup; no web search or JavaScript); POST, PUT, PATCH or DELETE with a JSON body sends to an API or webhook, for example to notify staff. Needs the exact URL; never credentials. A step saved without a method sends POST, as older graphs did.',
  guide: [
    'Paste a full website or API address, such as https://example.com. GET reads it; headers and body can stay empty.',
    'Returns JSON or plain text. HTML comes back as Markdown plus its links and images (address and ALT text). PDFs, images, login-only pages and pages built by JavaScript can’t be read.',
    'POST, PUT, PATCH and DELETE send a JSON body and may change data at the destination. Never put passwords, keys or tokens in a workflow: every project member can read them.',
    'For pages your agent should always know, add them to a knowledge base instead: they are read once and refreshed on a schedule.'
  ],
  keywords: 'http request api web page read url fetch webhook json post',
  docs: '/docs/build/steps#fetch-url',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Calls a web address once you set one', when: { unset: 'url' } },
    { text: 'Reads {url}', when: READS },
    { text: 'Sends a {method} request to {url}', when: { all: [{ not: READS }, { set: 'method' }] } },
    { text: 'Sends a POST request to {url}', when: { unset: 'method' } },
    { text: ' with a JSON body', when: { all: [{ not: READS }, { set: 'body' }] } }
  ],
  settings: [
    { key: 'url', label: 'Web address', widget: 'text', level: 'setup', refs: true, placeholder: 'https://example.com', tip: 'The exact public HTTPS address to read. Insert a field only if an earlier step supplies the address.' },
    { key: 'method', label: 'Request method', widget: 'select', level: 'option', options: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'POST', tip: 'GET reads the address; the others send to an API and may change data there. New steps start with GET. Default: POST, as in older graphs.' },
    { key: 'body', label: 'Request body', widget: 'json', level: 'option', refs: true, when: { not: READS }, unused_note: 'A GET or HEAD request with a body fails. Remove it.', placeholder: '{ "query": "{{input}}" }', tip: 'The JSON the destination API expects, such as { "query": "{{input}}" }. GET and HEAD send none.' },
    { key: 'headers', label: 'Headers', widget: 'json', level: 'advanced', placeholder: '{}', tip: 'Only headers the destination API requires. Never secrets: every project member can read them. Default: Content-Type application/json.' }
  ],
  parts: [],
  outputs: [
    { path: 'data', label: 'Response', type: 'any', tip: 'JSON, text, or for a web page Markdown with its links and images.' },
    { path: 'data.markdown', label: 'Web page as Markdown', type: 'string', tip: 'For HTML pages.' },
    { path: 'data.links', label: 'Web page links', type: 'list', tip: 'For HTML pages.' },
    { path: 'data.images', label: 'Web page images', type: 'list', tip: 'Addresses and ALT text, for HTML pages.' },
    { path: 'ok', label: 'Succeeded', type: 'boolean', tip: 'True for a 2xx status.' },
    { path: 'status', label: 'HTTP status', type: 'number' },
    { path: 'url', label: 'Address read', type: 'string', tip: 'After any redirects.' }
  ],
  presets: [
    { id: 'page', label: 'Read a web page', tip: 'One public page as Markdown, such as a course page an LLM then reads.', config: { method: 'GET', url: '' } },
    { id: 'api', label: 'Send JSON to an API', tip: 'Such as telling a staff channel’s webhook that a learner needs help.', config: { method: 'POST', url: '', body: { text: '{{input}}' } } }
  ],
  defaults: { method: 'GET' }
};
