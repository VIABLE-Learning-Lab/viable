// viable-harness prepare: what a model should be given before it does this piece of teaching work.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { prepare, runTask } from '../harness.js';
import { TASKS } from '../tasks/index.js';

export const MOMENT_USAGE = `  viable-harness prepare [--task ${Object.keys(TASKS).join('|')}] --teaching teaching.json
                         [--message "..."] [--history history.json] [--section <id>] [--picker-model <id>] [--whole]
                         [--records <record.json>...] [--strategy <id>] [--goal "..."] [--run --model <id>] [--json]`;

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`Couldn't read ${file} as JSON: ${error.message}`); }
};

export async function prepareCommand(argv) {
  const { values } = parseArgs({ args: argv, options: {
    task: { type: 'string' }, teaching: { type: 'string' }, message: { type: 'string' }, history: { type: 'string' }, section: { type: 'string' },
    'picker-model': { type: 'string' }, whole: { type: 'boolean' }, records: { type: 'string', multiple: true }, strategy: { type: 'string' }, goal: { type: 'string' },
    run: { type: 'boolean' }, model: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }
  } });
  if (values.help) return console.log(`Usage:\n${MOMENT_USAGE}`);
  const input = {
    task: values.task ?? 'tutoring',
    teaching: values.teaching ? readJson(values.teaching) : null,
    message: values.message ?? '',
    history: values.history ? readJson(values.history) : [],
    section: values.section ?? null,
    pickerModel: values['picker-model'] ?? null,
    whole: values.whole === true,
    records: (values.records ?? []).flatMap((file) => [].concat(readJson(file))),
    ...(values.strategy ? { strategy: values.strategy } : {}),
    ...(values.goal ? { goal: values.goal } : {})
  };
  if (values.run) {
    if (!values.model) throw new Error('--run asks a model: name it with --model <id>.');
    const done = await runTask({ ...input, model: values.model });
    if (done.problems.length) process.exitCode = 1;
    return console.log(JSON.stringify({ output: done.output, problems: done.problems }, null, 2));
  }
  const turn = await prepare(input);
  if (values.json) return console.log(JSON.stringify(turn, null, 2));
  if (turn.moment) console.error(`Moment: ${turn.moment}, read by ${turn.by}. Misconceptions chosen: ${turn.chosen.misconceptions.length}.${turn.flag ? ` Flag: ${turn.flag}.` : ''}`);
  console.log(turn.instructions ?? (turn.messages ? turn.messages.map((message) => `[${message.role}]\n${message.content}`).join('\n\n') : '(The teaching settings say nothing yet.)'));
}
