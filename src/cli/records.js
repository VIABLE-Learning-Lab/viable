/**
 * What a server with --data-dir keeps of its learners: viable-harness records, in the shape `view` and
 * `suggest` read, and viable-harness forget, one learner's gone.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chatRecords, forgetLearner, learnerRecords } from '../server/learner.js';
import { fileStore } from '../server/fileStore.js';
import { checkLearner } from '../server/memory.js';

export const RECORDS_USAGE = `  viable-harness records export --data-dir <dir> --out <folder> [--course <code>]
  viable-harness forget <learner's code or ID> --data-dir <dir> [--memory-dir <dir>] [--json]`;

async function coursesIn(store, only) {
  const found = new Set((await store.list('courses/')).map((key) => key.split('/')[1]));
  if (only && !found.has(only)) throw new Error(`No course "${only}" in this folder (it has: ${[...found].join(', ') || 'none'}).`);
  return only ? [only] : [...found];
}

export async function recordsCommand(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { 'data-dir': { type: 'string' }, out: { type: 'string' }, course: { type: 'string' } } });
  if (positionals[0] !== 'export' || !values['data-dir'] || !values.out) throw new Error(`Usage:\n${RECORDS_USAGE}`);
  const store = fileStore(values['data-dir']);
  const chats = values.course ? [] : [...new Set((await store.list('chats/')).map((key) => key.split('/')[1]))];
  for (const [course, read] of [...(await coursesIn(store, values.course)).map((code) => [code, learnerRecords]), ...chats.map((slug) => [slug, chatRecords])]) {
    const { records, runs } = await read(store, course);
    const folder = join(values.out, course);
    await mkdir(folder, { recursive: true });
    await Promise.all(records.map((record, i) => writeFile(join(folder, `record-${i + 1}.json`), `${JSON.stringify(record, null, 2)}\n`)));
    await Promise.all(runs.map((run, i) => writeFile(join(folder, `run-${i + 1}.json`), `${JSON.stringify(run, null, 2)}\n`)));
    console.log(`${course}: ${records.length} records and ${runs.length} runs in ${folder}. Read them with viable-harness view ${folder}/*.json. A record names a learner by their code: keep these private.`);
  }
}

export async function forgetCommand(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { 'data-dir': { type: 'string' }, 'memory-dir': { type: 'string' }, json: { type: 'boolean' } } });
  const [named] = positionals;
  if (!named || !values['data-dir']) throw new Error(`Usage:\n${RECORDS_USAGE}`);
  const removed = await forgetLearner(fileStore(values['data-dir']), named);
  if (values['memory-dir']) {
    // A file named by the ID, which checkLearner holds to letters, digits and a few marks: it can't climb out.
    const before = removed.memory;
    await rm(resolve(values['memory-dir'], `${encodeURIComponent(checkLearner(named))}.json`), { force: true }).then(() => { removed.memory = before + 1; }, () => {});
  }
  const total = removed.courses.length + removed.conversations + removed.runs + removed.memory + removed.gateway;
  if (values.json) console.log(JSON.stringify({ object: 'learner.forgotten', learner: named, removed }, null, 2));
  else if (!total) console.error(`Nothing here is kept for ${named}.`);
  else console.log(`Removed what was kept for ${named}: ${[removed.courses.length ? `their work in ${removed.courses.join(', ')}` : null, removed.conversations ? `${removed.conversations} conversations` : null, removed.runs ? `${removed.runs} runs` : null, removed.memory ? 'their memory' : null, removed.gateway ? `${removed.gateway} gateway records` : null].filter(Boolean).join(', ')}.`);
  if (!total) process.exitCode = 1;
}
