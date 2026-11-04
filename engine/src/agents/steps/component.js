const KEEPS_GOING = { is: { on_error: 'continue' } };

export default {
  type: 'component',
  version: 1,
  label: 'Component',
  category: 'tools',
  summary: 'Run another team’s method as a step: a component you call with only the learner data its manifest lists.',
  use: 'No model call of its own. Runs a step component (the Harness’s docs/components.md) from its manifest, pasted whole into the step: sends only the fields its receives lists, each worked out from inputs (a template per field), to its entry on a host its sends_to names, never following a redirect, 30 seconds and 1 MiB at most. It answers { output, flags }: later steps read {{id.output}} and {{id.flags}}. VIABLE calls http components only, over public HTTPS; an MCP server runs with viable-engine serve on your own machine. A refusal, timeout or answer out of shape stops the run unless on_error is continue (status failed, error).',
  guide: [
    'Paste or upload the component’s manifest, the JSON file its authors publish. Its slot must be step, and on VIABLE it runs over HTTPS.',
    'For each field the component receives, choose what the run sends, such as the learner’s message or a step’s reply. A field left empty isn’t sent.',
    'It sends only to the hosts its manifest names and never follows a redirect. Keep learners’ names and other identifiers out of what you send.',
    'Later steps read its answer and flags. If it can’t be reached or answers out of shape, the run stops, unless you choose to keep going without it.'
  ],
  keywords: 'component plugin research method partner external api https mcp manifest',
  docs: '/docs/build/steps#component',
  flow: { kind: 'next' },
  sentence: [
    { text: 'Runs another team’s method once you paste its manifest', when: { unset: 'manifest' } },
    { text: 'Runs {@component}, sending {@sends}', when: { set: 'manifest' } },
    { text: '. If it fails, keeps going without its answer', when: KEEPS_GOING }
  ],
  settings: [
    { key: 'manifest', label: 'Component manifest', widget: 'json', level: 'setup', placeholder: '{ "id": "owner/name", "slot": "step", … }', tip: 'The manifest its authors publish, as JSON: what it receives, the hosts it calls, its license and evidence. Its slot must be step.' },
    { key: 'inputs', label: 'What it sends', widget: 'fields', level: 'setup', refs: true, when: { set: 'manifest' }, unused_note: 'Used once the manifest is pasted.', tip: 'What the run sends for each field the manifest receives, such as {{input}} for learner_message. An empty field isn’t sent.', ai: 'Name only fields the manifest’s receives lists; never a learner’s name or ID.' },
    { key: 'on_error', label: 'If the component fails', widget: 'select', level: 'recovery', options: ['stop', 'continue'], option_labels: { stop: 'Stop the run', continue: 'Keep going without it' }, default: 'stop', tip: 'Keep going returns status failed, no answer and the error; the run trace keeps the reason. Default: stop the run.' }
  ],
  parts: [],
  outputs: [
    { path: 'output', label: 'Answer', type: 'any', tip: 'What the component answered: text, a number, a list or named fields.' },
    { path: 'flags', label: 'Flags', type: 'list', tip: 'What it marked, each with a label and a reason.' },
    { path: 'component', label: 'Component and version', type: 'string', tip: 'Such as acme/fraction-hints@0.1.0.' },
    { path: 'status', label: 'Status', type: 'string', tip: 'completed, or failed when the run kept going without it.', when: KEEPS_GOING },
    { path: 'error', label: 'What went wrong', type: 'any', tip: 'Its code (component_refused, component_timeout or component_failed) and message, when it failed.', when: KEEPS_GOING }
  ],
  presets: [],
  defaults: {}
};
