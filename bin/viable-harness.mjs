#!/usr/bin/env node
// viable-harness: run a VIABLE agent on your own model keys, check the open formats, compute the measures.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runAgent } from '../src/run.js';
import { KINDS, validateDocument } from '../src/validate.js';
import { measureLearner } from '../src/measures.js';

const USAGE = `Usage:
  viable-harness run <agent.json | package.json> --input "..." [--context file.json] [--teaching teaching.json]
                     [--section <id>] [--agent <ref>] [--model <id>] [--no-teaching] [--json]
  viable-harness validate <file> [--kind ${KINDS.join('|')}]
  viable-harness measure <events.json>

run calls an OpenAI-compatible endpoint: OPENAI_BASE_URL (default https://api.openai.com/v1) and OPENAI_API_KEY.
--model replaces every model the agent names (needed for anything but OpenAI). From a course package it runs
the first agent (or --agent) with the teaching settings of the first activity that uses it.`;

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`Couldn't read ${file} as JSON: ${error.message}`); }
};

function printRun(result) {
  console.log(`Agent: ${result.agent}${result.activity ? ` (with the teaching settings of "${result.activity}")` : result.teaching ? ' (with your teaching settings)' : ''}\n`);
  console.log(result.output.text || '(no reply text)');
  console.log('\nSteps:');
  for (const step of result.steps) {
    const model = step.model ? `, ${step.model}` : '';
    const tokens = step.tokens != null ? `, ${step.tokens} tokens` : '';
    console.log(`  ${step.stepNumber}. ${step.nodeId} (${step.nodeType}) ${step.status} in ${step.durationMs} ms${model}${tokens}${step.error ? `: ${step.error}` : ''}`);
    if (step.nodeType === 'vetting' && step.output) {
      for (const round of step.output.attempt_details || []) console.log(`       round ${round.attempt}: ${round.verdict}${round.feedback ? `: ${String(round.feedback).replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
      console.log(`       outcome: ${step.output.outcome}`);
    }
  }
  console.log(`\n${result.modelCalls} model calls, ${result.usage.total} tokens.`);
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { input: { type: 'string', short: 'i' }, context: { type: 'string' }, teaching: { type: 'string' }, section: { type: 'string' }, 'no-teaching': { type: 'boolean' }, agent: { type: 'string' }, model: { type: 'string' }, json: { type: 'boolean' }, kind: { type: 'string' }, help: { type: 'boolean', short: 'h' } }
  });
  const [command, file] = positionals;
  if (values.help || !command) return console.log(USAGE);
  if (!file) throw new Error(`Name a file.\n\n${USAGE}`);
  const doc = readJson(file);
  if (command === 'run') {
    if (values.input == null) throw new Error('Give the learner\'s message with --input "...".');
    const result = await runAgent(doc, {
      input: values.input,
      context: values.context ? readJson(values.context) : null,
      teaching: values['no-teaching'] ? false : values.teaching ? readJson(values.teaching) : null,
      section: values.section ?? null,
      agent: values.agent ?? null,
      model: values.model ?? null
    });
    return values.json ? console.log(JSON.stringify(result, null, 2)) : printRun(result);
  }
  if (command === 'validate') {
    const { kind, errors } = validateDocument(doc, values.kind);
    if (!errors.length) return console.log(`${file}: a valid ${kind} file.`);
    console.error(`${file}: not a valid ${kind} file:\n${errors.map((error) => `  ${error}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  if (command === 'measure') return console.log(JSON.stringify(measureLearner(doc), null, 2));
  throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  if (error.agentSteps?.length) console.error(error.agentSteps.map((step) => `  ${step.stepNumber}. ${step.nodeId} (${step.nodeType}) ${step.status}${step.error ? `: ${step.error}` : ''}`).join('\n'));
  process.exitCode = 1;
});
