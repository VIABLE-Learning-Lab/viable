// viable-harness resources [list | get <id> | use <id>]: the catalog's connectors from the command line (docs/resources.md).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { getResource, listResources, resourcesHome, useResource } from '../resources/index.js';

export const RESOURCES_USAGE = `  viable-harness resources [list] [--connected] [--dir <folder>] [--json]
  viable-harness resources get <id> [--accept-license] [--refresh] [--dir <folder>] [--grade <n> --unit <n>]
                               [--jurisdiction <name>] [--subject <name>] [--json]
  viable-harness resources use <id> [words...] [--limit <n>] [--out <file>] [--accept-license] [--dir <folder>]
                               [--standard <code>] [--evaluator <name>] [--dimension <name>] [--code <code>] [--grade <n>] [--json]`;
const HEADINGS = [[2, 'Connected: one command from having an effect on your agent'], [3, 'Built in: in the core, no download'], [1, 'Fetchable: the files come down; nothing is made from them yet'], [0, 'Listed']];
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Shared with `test --suite`, `--judge` and `calibrate --set`: what a progress line and a license say. */
export const resourceOptions = (values) => ({
  dir: values.dir ?? null,
  acceptLicense: values['accept-license'] === true,
  refresh: values.refresh === true,
  onProgress: (url) => console.error(`Fetching ${url}`)
});
export const CONNECTOR_OPTIONS = ['limit', 'standard', 'evaluator', 'dimension', 'jurisdiction', 'subject', 'grade', 'unit', 'code'];
export const connectorChoices = (values) => Object.fromEntries(CONNECTOR_OPTIONS.filter((name) => values[name] != null).map((name) => [name, values[name]]));

/** The lines of credit a person keeps with what a resource made. */
export const creditLines = (used) => [`${used.name}: ${used.license.spdx.join(', ') || 'no stated license'}${used.license.accepted ? ' (license accepted)' : ''}. ${used.shows}`, `Cite: ${used.cite}`];

function printList(items) {
  for (const [level, heading] of HEADINGS) {
    const inLevel = items.filter((item) => item.level === level);
    if (!inLevel.length) continue;
    console.log(`${heading} (${inLevel.length})`);
    for (const item of inLevel) {
      console.log(`  ${item.id}${item.as.length ? ` (${item.as.join(', ')})` : ''}${item.fetched_at ? `, fetched ${item.fetched_at.slice(0, 10)}` : ''}`);
      console.log(`    ${item.command ?? item.note}`);
    }
    console.log('');
  }
}

function printUse(used, values) {
  const keep = (doc, note) => {
    if (values.out) { writeFileSync(values.out, `${JSON.stringify(doc, null, 2)}\n`); console.error(`Wrote ${values.out}. ${note}`); } else console.log(JSON.stringify(doc, null, 2));
  };
  if (used.labels) {
    const { cases, labels, people } = used;
    keep({ format: 'viable.calibration-set', resource: used.id, people, cases, labels }, `Run it: viable-harness calibrate --set ${used.id} --judge-model <model>`);
    if (used.as.includes('judge')) console.error(`As a judge: viable-harness test agent.json cases.json --judge ${used.id}/<evaluator> --judge-model <model>. The evaluators: ${used.evaluators.join(', ')}.`);
  } else if (used.cases) {
    keep({ format: 'viable.agent-tests', cases: used.cases }, `Run it: viable-harness test agent.json ${values.out} --judge-model <model>`);
  } else if (used.knowledge) {
    console.log(`A knowledge folder: ${used.knowledge}\nviable-harness run agent.json --input "..." --knowledge <kb-id>=${used.knowledge}`);
  } else if (used.manifest) {
    console.log(`A measure, in ${used.folder}. Read its README.md, then:\nviable-harness measure record.json --component ${used.manifest}`);
  } else if (used.found) {
    if (values.code) {
      if (!used.found.length) throw new Error(`No standard has the code "${values.code}" in this copy. Fetch another with --jurisdiction or --subject.`);
      // Into an existing settings file, keeping the rest; a new file is a settings file with only the standard.
      const settings = { ...(values.out && existsSync(values.out) ? JSON.parse(readFileSync(values.out, 'utf8')) : {}), standard: used.found[0] };
      keep(settings, `Use it: viable-harness run agent.json --input "..." --teaching ${values.out}`);
    } else {
      for (const item of used.found) console.log(`${item.code || item.uuid} (${[item.jurisdiction, item.subject, item.grades.length ? `grade ${item.grades.join(', ')}` : ''].filter(Boolean).join(', ')}): ${item.description}`);
      console.log(used.found.length ? `\nAdd --code <code> --out teaching.json to keep one in teaching settings.` : `No standard matched in this copy. Try other words, or another --grade.`);
    }
  } else {
    console.log(`${used.standards} standards here. Search them: viable-harness resources use ${used.id} "adding fractions" --grade 5`);
  }
}

/** Runs `viable-harness resources ...`, with its own options; fetch replaces the network in tests. */
export async function resourcesCommand(argv, { fetch = globalThis.fetch } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h' }, dir: { type: 'string' }, json: { type: 'boolean' }, connected: { type: 'boolean' }, 'accept-license': { type: 'boolean' }, refresh: { type: 'boolean' }, out: { type: 'string' }, ...Object.fromEntries(CONNECTOR_OPTIONS.map((name) => [name, { type: 'string' }])) }
  });
  if (values.help) return console.log(`Usage:\n${RESOURCES_USAGE}`);
  const [action = 'list', id, ...words] = positionals;
  if (action === 'list') {
    const items = listResources({ dir: values.dir ?? null }).filter((item) => !values.connected || item.level >= 2);
    if (values.json) return console.log(JSON.stringify(items, null, 2));
    printList(items);
    return console.log(`Copies are kept in ${values.dir ?? resourcesHome()}. Entries describe, not endorse: check each license before you use it.`);
  }
  if (action !== 'get' && action !== 'use') throw new Error(`resources takes list, get <id> or use <id>, not "${action}".\n\n${RESOURCES_USAGE}`);
  if (!id) throw new Error(`Name a resource: viable-harness resources ${action} <id>. See viable-harness resources list.`);
  const shared = { ...resourceOptions(values), fetch, options: { ...connectorChoices(values), ...(words.length ? { query: words.join(' ') } : {}) } };
  if (action === 'get') {
    const record = await getResource(id, shared);
    if (values.json) return console.log(JSON.stringify(record, null, 2));
    const license = record.license;
    console.log(`${record.name}: ${license.spdx.join(', ') || 'no stated license'}${license.note ? `. ${license.note}` : ''}`);
    console.log(`  ${license.source}${license.accepted ? '  (accepted)' : ''}`);
    console.log(record.reused
      ? `Already here, fetched ${record.fetched_at.slice(0, 10)}: ${record.folder}. Add --refresh to fetch it again.`
      : `Fetched ${record.files.length} file${record.files.length === 1 ? '' : 's'}, ${megabytes(record.files.reduce((sum, file) => sum + file.bytes, 0))}, to ${record.folder}. fetched.json records what came, from where and when.`);
    console.log(`Next: ${listResources({ dir: values.dir ?? null }).find((item) => item.id === id).command}`);
    return console.log(`Cite: ${record.cite}`);
  }
  const used = await useResource(id, shared);
  if (values.json) {
    const { judge, ...plain } = used;
    return console.log(JSON.stringify({ ...plain, ...(judge ? { judge: judge.id } : {}) }, null, 2));
  }
  for (const line of creditLines(used)) console.error(line);
  return printUse(used, values);
}
