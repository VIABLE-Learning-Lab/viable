// Writes docs/components/<owner>-<name>.md, one page per component the harness carries, from its
// manifest (src/components). Run with `npm run components:build`; never edit the pages by hand.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENTS } from '../src/components/index.js';

export const pagesDir = fileURLToPath(new URL('../docs/components/', import.meta.url));
const cell = (value) => String(value).replace(/\|/g, '\\|');
const code = (value) => `\`${value}\``;

const RUNS = {
  core: (runs) => `In the harness's own process, through ${code(runs.entry)}${runs.step_type ? ` and the graph's ${code(runs.step_type)} step` : ''}.`,
  http: (runs) => `Out of process: the harness POSTs JSON to ${runs.entry}.`,
  data: () => 'Nothing runs: its guidance is in this file, and an activity keeps the pieces chosen for it.',
  mcp: (runs) => `Out of process: the tool ${code(runs.entry)} of a stdio MCP server started as ${code([runs.server.command, ...(runs.server.args || [])].join(' '))}.`
};

const MOMENTS = { attempt: 'giving an answer or some working', asks_answer: 'asking for the answer', stuck: 'stuck, with nothing tried', repeated: 'still not there after trying' };

function guidancePart(items) {
  return ['## Its guidance', '', 'What a model is told, and when it fits. A turn takes at most two pieces from what an activity keeps.', '', ...items.flatMap((item, index) => [
    `${index + 1}. ${item.text}`,
    '',
    `   ${item.when ? `*For a learner ${item.when.map((moment) => MOMENTS[moment]).join(', or ')}.* ` : ''}${item.about ? `*When the subject is: ${item.about}.* ` : ''}${item.attribution || item.source || ''}`,
    ''
  ])];
}

export function componentPage(manifest) {
  const rows = [
    ['Id', `${code(manifest.id)}, version ${manifest.version}`],
    ['Slot', manifest.slot],
    ['Runs', RUNS[manifest.runs.kind](manifest.runs)],
    ['Receives', manifest.receives.map(code).join(', ') || 'nothing'],
    ['Sends it to', manifest.sends_to.join(', ') || 'no other host'],
    ['Models', manifest.uses_models ? 'calls models, through the host’s model service' : 'calls none'],
    ['License', [manifest.license.code ? `code ${manifest.license.code}` : '', manifest.license.data ? `data ${manifest.license.data}` : ''].filter(Boolean).join(', ')],
    ['Authors', manifest.authors.join(', ')],
    ['Risk', `${manifest.risk}${manifest.risk_notes ? `: ${manifest.risk_notes}` : ''}`],
    ['Maintainer', `${manifest.maintainer.name}${manifest.maintainer.issues ? ` (${manifest.maintainer.issues})` : ''}`],
    ['Harness', code(manifest.harness)],
    ...(manifest.fixtures ? [['Fixtures', code(manifest.fixtures)]] : [])
  ];
  return [
    `# ${manifest.label}`,
    '',
    '<!-- Written from the manifest in src/components/ by npm run components:build; don’t edit by hand. -->',
    '',
    manifest.summary,
    '',
    '| | |',
    '| --- | --- |',
    ...rows.map(([name, value]) => `| ${name} | ${cell(value)} |`),
    '',
    '## How to cite',
    '',
    manifest.cite,
    '',
    ...(manifest.attribution ? ['## Attribution', '', manifest.attribution, ''] : []),
    '## Evidence',
    '',
    `**What its authors showed.** ${manifest.evidence.original}`,
    '',
    `**What comparisons in the harness showed.** ${manifest.evidence.integration}`,
    '',
    `**What nobody has shown yet.** ${manifest.evidence.unknown}`,
    '',
    ...(manifest.runs.items ? guidancePart(manifest.runs.items) : [])
  ].join('\n');
}

export const componentPages = () => new Map(COMPONENTS.map((manifest) => [`${manifest.id.replace('/', '-')}.md`, componentPage(manifest)]));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pages = componentPages();
  mkdirSync(pagesDir, { recursive: true });
  for (const name of readdirSync(pagesDir)) if (name.endsWith('.md') && !pages.has(name)) rmSync(join(pagesDir, name));
  for (const [name, text] of pages) writeFileSync(join(pagesDir, name), text);
  console.log(`Wrote ${pages.size} pages in ${pagesDir}`);
}
