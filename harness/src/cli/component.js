// viable-harness component new | try | add: making a component, seeing what a context component changes, and
// adding its guidance to an activity's settings (docs/components.md).
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { turnBrief } from '../brief.js';
import { lookup } from '../components/call.js';
import { checkManifest, guidanceFrom } from '../components/contract.js';
import { TEACHING_LIMITS, teachingSettings } from '../utils/teaching.js';

export const COMPONENT_USAGE = `  viable-harness component new <owner/name> [--slot context|detector] [--out <folder>]
  viable-harness component try <manifest.json> --teaching teaching.json --message "..." [--items 1,2] [--history history.json]
  viable-harness component add <manifest.json> --teaching teaching.json [--items 1,2] [--out teaching.json]`;
const TEMPLATES = { context: '_template-context', detector: '_template' };
const ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new Error(`Couldn't read ${path}: ${error.message}`); }
};
const numbersOf = (value) => (value == null ? null : String(value).split(',').map((item) => Number(item.trim())));

function makeNew(id, values) {
  if (!ID.test(id ?? '')) throw new Error(`Name it as owner/name in lowercase, such as your-lab/your-framework.\n\nUsage:\n${COMPONENT_USAGE}`);
  const template = TEMPLATES[values.slot ?? 'context'];
  if (!template) throw new Error(`A template exists for ${Object.keys(TEMPLATES).join(' and ')}. The other slots are in docs/components.md, "The slots that call one".`);
  const out = values.out ?? basename(id);
  if (existsSync(out)) throw new Error(`${out} already exists. Choose another with --out.`);
  cpSync(fileURLToPath(new URL(`../../integrations/${template}/`, import.meta.url)), out, { recursive: true });
  const file = join(out, 'manifest.json');
  writeFileSync(file, `${JSON.stringify({ ...readJson(file), id }, null, 2)}\n`);
  console.log(`Made ${out}/ for ${id}.\n\nWrite what your work says in ${file}, then see what it changes:\n  viable-harness component try ${file} --teaching activity.json --message "a learner's message"`);
}

// What an activity would take from it: a data component's items, or what one out of process answers for the goal.
async function guidanceIn(manifest, teaching, numbers, dir) {
  checkManifest(manifest, 'context');
  const { items } = await lookup(manifest, teachingSettings(teaching)?.goal ?? '', { dir });
  if (!numbers && items.length > TEACHING_LIMITS.guidance) throw new Error(`${manifest.id} has ${items.length} items, and an activity keeps at most ${TEACHING_LIMITS.guidance}. Choose with --items 1,3,5.`);
  return guidanceFrom(manifest, { items, chosen: numbers });
}

async function tryIt(file, values) {
  if (!values.teaching || !values.message) throw new Error(`Give --teaching teaching.json and --message "...".\n\nUsage:\n${COMPONENT_USAGE}`);
  const manifest = readJson(file);
  const teaching = readJson(values.teaching);
  const taken = await guidanceIn(manifest, teaching, numbersOf(values.items), join(file, '..'));
  const turn = { message: values.message, history: values.history ? readJson(values.history) : [] };
  const without = await turnBrief({ ...teaching, guidance: [] }, turn);
  const withIt = await turnBrief({ ...teaching, guidance: taken }, turn);
  console.log(`What a model is told for "${values.message}" (the moment read: ${withIt.moment})\n`);
  console.log(`Without ${manifest.id}:\n\n${without.text}\n`);
  if (!withIt.guidance.length) return console.log(`With it: the same. Of its ${taken.length} items, none fits this moment. Items carry "when" (the moments they are for) and "about" (the words they apply to).`);
  console.log(`With it, this is added, ${withIt.guidance.length} of its ${taken.length} items:\n`);
  for (const item of withIt.guidance) console.log(`  - ${item.text}${item.source ? ` (${item.source})` : ''}`);
}

async function addIt(file, values) {
  if (!values.teaching) throw new Error(`Give --teaching teaching.json.\n\nUsage:\n${COMPONENT_USAGE}`);
  const manifest = readJson(file);
  const teaching = readJson(values.teaching);
  const taken = await guidanceIn(manifest, teaching, numbersOf(values.items), join(file, '..'));
  const guidance = [...(teaching.guidance ?? []), ...taken];
  if (guidance.length > TEACHING_LIMITS.guidance) throw new Error(`An activity keeps at most ${TEACHING_LIMITS.guidance} pieces of guidance, and this would make ${guidance.length}. Choose fewer with --items.`);
  const out = values.out ?? values.teaching;
  writeFileSync(out, `${JSON.stringify({ ...teaching, guidance }, null, 2)}\n`);
  console.log(`Added ${taken.length} from ${manifest.id} to ${out}, as they are now, with where they came from.`);
}

export async function componentCommand(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { slot: { type: 'string' }, out: { type: 'string' }, teaching: { type: 'string' }, message: { type: 'string' }, items: { type: 'string' }, history: { type: 'string' } } });
  const [verb, target] = positionals;
  if (verb === 'new') return makeNew(target, values);
  if (!target) throw new Error(`Name the manifest.\n\nUsage:\n${COMPONENT_USAGE}`);
  return verb === 'try' ? tryIt(target, values) : addIt(target, values);
}
