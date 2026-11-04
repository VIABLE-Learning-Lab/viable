#!/usr/bin/env node
// viable-harness: run a VIABLE agent on your own model keys, check the open formats, compute the measures.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pickAgent, readAgentFile, runAgent } from '../src/run.js';
import { loadAgents, serve } from '../src/serve.js';
import { KINDS, validateDocument } from '../src/validate.js';
import { measureLearner } from '../src/measures.js';
import { checkReply } from '../src/check.js';
import { draftCases, judgeReplies, runAgentTests } from '../src/testRuns.js';
import { calibrateJudge, casesFromTurns } from '../src/testCases.js';
import { findMisconceptions } from '../src/utils/misconceptions.js';
import { COMPONENTS, SLOTS } from '../src/components/index.js';
import { CATALOG_KINDS, openForAnyUse, searchCatalog } from '../src/catalog.js';
import { callComponent } from '../src/components/call.js';
import { teacherView, viewInputs } from '../src/view.js';
import { serveStdio } from '../src/mcp.js';
import { SUITES, runConformance } from '../src/conformance.js';
import { toStatements } from '../src/xapi.js';
import { suggestChanges } from '../src/suggest.js';
import { GATEWAY_USAGE, gatewayCommand } from '../src/cli/gateway.js';
import { TRY_USAGE, tryCommand } from '../src/cli/try.js';
import { showTestRun, testRunPage } from '../src/cli/testPage.js';
import { fontRoutes } from '../src/ui/theme.js';
import { KNOWLEDGE_USAGE, knowledgeCommand } from '../src/cli/knowledge.js';
import { RECORDS_USAGE, forgetCommand, recordsCommand } from '../src/cli/records.js';
import { fileStore, writableFolder } from '../src/server/fileStore.js';
import { MODEL_OPTIONS, planOf } from '../src/cli/common.js';
import { deployCommand } from '../src/cli/deploy.js';
import { inspectCommand } from '../src/cli/inspect.js';
import { verifyCommand } from '../src/cli/verify.js';
import { modelWarnings } from '../src/server/models.js';
import { stopOnSignal } from '../src/server/node.js';
import { TARGET_NAMES } from '../src/server/targets.js';
import { CONNECTOR_OPTIONS, RESOURCES_USAGE, connectorChoices, creditLines, resourceOptions, resourcesCommand } from '../src/cli/resources.js';
import { resourceJudge, useResource } from '../src/resources/index.js';
import { measure as measureWith } from '../src/components/call.js';

const USAGE = `Usage:
${TRY_USAGE}
  viable-harness run <agent.json | package.json | course.viable.zip> --input "..." [--context file.json] [--allow-component <id>...]
                     [--teaching teaching.json] [--section <id>] [--agent <ref>] [--model <id>] [--speech-model <id>]
                     [--image-model <id>] [--media-dir <dir>] [--no-speech] [--memory-dir <dir> --learner <id>]
                     [--knowledge <kb-id>=<folder>...] [--no-teaching] [--map <named>=<model>...] [--models models.json]
                     [--reviewer-model <id>] [--json]
  viable-harness serve <agent.json | package.json | course.viable.zip | folder>... [--port 8080] [--host 127.0.0.1]
                       [--token-env <NAME>] [--class-code-env <NAME>] [--learner-header <name>] [--cors <origin>] [--max-body <bytes>] [--timeout <seconds>] [--max-runs <n>]
                       [--model <id>] [--speech-model <id>] [--image-model <id>] [--media-dir <dir>] [--no-speech]
                       [--memory-dir <dir>] [--knowledge <kb-id>=<folder>...] [--map <named>=<model>...]
                       [--models models.json] [--reviewer-model <id>] [--data-dir <dir>] [--keep-days <n>] [--panel] [--allow-component <id>...]
  viable-harness inspect <package> [--map <named>=<model>...] [--models models.json] [--reviewer-model <id>]
                         [--target ${TARGET_NAMES.join('|')}] [--json]
  viable-harness deploy <${TARGET_NAMES.join('|')}> <package> --out <dir>
                        [--name <name>] [--endpoint <url>] [--store none] [--knowledge <kb-id>=<folder>...]
                        [--map <named>=<model>...] [--models models.json] [--model <id>] [--reviewer-model <id>]
                        [--force] [--json]
  viable-harness verify <url> [--token-env <NAME>] [--agent <slug>] [--turn] [--input "..."] [--json]
  viable-harness validate <file> [--kind ${KINDS.join('|')}]
  viable-harness measure <events.json> [--component <manifest.json>]
  viable-harness check --reply "..." [--message "..."] (--guideline "..." | --question "..." --answer-key "...")
                       [--key-concepts "a, b"] [--teaching teaching.json] [--section <id>] [--rewrite <n>]
                       --model <id> [--reviewer <id>] [--json]
  viable-harness test <agent.json | package.json> (<cases.json> | --suite <resource> [--limit <n>] [--standard <code>])
                      --judge-model <id> [--judge <resource>/<name>] [--model <id>] [--agent <ref>]
                      [--teaching teaching.json] [--section <id>] [--accept-license] [--dir <folder>] [--allow-component <id>...] [--json]
                      [--html [--out report.html] [--no-open]]
  viable-harness draft-tests <package.json | teaching.json> --model <id> [--count <n>] [--section <id>] [--out cases.json]
  viable-harness tests-from-records <record.json...> [--teaching teaching.json | package.json] [--count <n>] [--out cases.json]
  viable-harness calibrate (<results.json> <labels.json> | --set <resource> --judge-model <id> [--limit <n>] [--evaluator <name>]
                           [--dimension <name>] [--accept-license] [--dir <folder>]) [--json]
  viable-harness misconceptions "<a few words, or a standard's text>" [--json]
  viable-harness components [--json]
  viable-harness catalog [words...] [--kind ${CATALOG_KINDS.join('|')}]
                         [--slot ${SLOTS.join('|')}] [--open] [--connected] [--json]
${RESOURCES_USAGE}
  viable-harness component <manifest.json> --input payload.json [--json]
${KNOWLEDGE_USAGE}
${RECORDS_USAGE}
  viable-harness view <record.json | run.json | package.json | folder...> [--teaching teaching.json] [--out report.html]
  viable-harness suggest <record.json | run.json | package.json | folder...> [--teaching teaching.json] [--json]
  viable-harness mcp
${GATEWAY_USAGE}
  viable-harness xapi <events.json> --home-page <url> [--activity-base <url>] [--include-text]
  viable-harness conformance [${SUITES.join('|')}]

run calls an OpenAI-compatible endpoint: OPENAI_BASE_URL (default https://api.openai.com/v1) and OPENAI_API_KEY.
--model replaces every chat model the agent names (needed for anything but OpenAI), --speech-model every speech
model and --image-model every image model; Speech and Image steps call the endpoint's /audio/speech and
/images/generations (or /images/edits) and save the audio and pictures in --media-dir (or --audio-dir; default: a
new temp folder); --no-speech lets Speech steps pass on. Memory steps keep what they save in --memory-dir, one file
per --learner (a pseudonymous ID, never a name); delete <dir>/<id>.json to forget a learner. Without them, Memory
steps are skipped. From a course package it runs the first agent (or --agent) with the teaching settings of the first
activity that uses it, and searches the package's own files for its Knowledge steps; a .viable.zip (a course
downloaded with its files) holds them. --knowledge kb_123=./guides searches a folder's text files for the knowledge
base an agent file names kb_123 (a package's by its ref), once per knowledge base.
try, or no command at all, opens the real pages on this computer with what the AI did beside them: scripted
replies with no key, your own model with OPENAI_API_KEY or OPENAI_BASE_URL. --tour plays the scene by itself;
--export writes a static copy of demo mode for a website.

serve answers apps over HTTP as VIABLE answers their agent runs (docs/self-hosting.md): POST /v1/agents/<slug>/runs
with the same fields, GET /v1/agents/<slug>/runs/<run_id>, GET /v1/agents and GET /health. An agent file answers at
its file's name, a package's agents at their refs. --token-env names the variable holding the token callers send
(Authorization: Bearer); without one it serves only this computer, refuses another website's posts and any other name,
and makes a token for the teacher's page and --panel at start, printed once. --learner-header needs --token-env. With --memory-dir, a run's user is the learner's
pseudonymous ID for Memory steps. Limits: --max-body (default 1048576 bytes), --timeout (default 300 seconds) and
--max-runs at once (default 30, a class). It logs one JSON line per run, without what the learner wrote.
--map a=b (repeatable) replaces the model a by b; --models models.json replaces them by role ({"reply": "...",
"reviewer": "...", "speech": "...", "image": "...", "map": {"a": "b"}}). --model replaces every chat model, the reviewer
too unless --reviewer-model names it, and a reviewer that is the model it checks gets a warning: the point of the check
is a second model. With --data-dir it keeps conversations (conversation_id), runs and memory in a folder, and --keep-days
deletes conversations, runs and what learners wrote on a page after that many days without a change.
inspect reports everything a package needs before it runs elsewhere. deploy writes a folder ready to deploy on a target,
with a README of exact commands, and sends nothing anywhere. verify checks a running server from outside, and prints the
line for a site and the origins its Content-Security-Policy must allow; only --turn costs a model call. These three
exit 0 when done, 1 when something failed, 2 when the command was given wrongly; with --json, stdout is one JSON document.
check reviews one reply with VETTING (the reviewer is --reviewer, else --model); with --rewrite, a failed reply is
rewritten by --model and reviewed again. test runs each case through the agent and has --judge-model rate the reply.
draft-tests has --model draft cases from How the AI helps, for a person to read before they run; tests-from-records
takes cases from learners' past turns (reuse learners' words only with consent); calibrate compares test --json
results with a person's pass or fail per case (labels.json: {"case name": "pass" | "fail"}).
view writes the teacher's page from learner records and run --json traces, with a package's (or --teaching)
settings and the changes suggest proposes from them; it prints it without --out.
component calls an out-of-process component (http or mcp) with the fields of the payload its manifest receives,
and prints its answer as its slot reads it (docs/components.md). An MCP server starts in the manifest's folder.
A component step in an agent file or a package is different: someone else wrote it, so run, serve and test call only
http components at public addresses, unless you name its ID with --allow-component, after reading what inspect says it does.
catalog searches the public goods catalog (docs/catalog.md) by words, kind and the slot each would fill; --open keeps
what anyone may download and use, commercially too, and --connected what has an effect on an agent. Entries describe, not
endorse: check a license before you use it.
resources fetches a public good into ~/.viable-harness/resources/<id>/ (or --dir) and turns it into what the harness runs
(docs/resources.md): a test suite (test --suite), a judge (test --judge), a calibration set (calibrate --set), a knowledge
folder (--knowledge <id>=resource:<resource>), a context lookup or a measure. It shows the license first, and needs
--accept-license where the license limits use. test, calibrate and --knowledge fetch what they name if it isn't here yet.
mcp serves these as MCP tools over stdio (docs/mcp.md).
gateway stands in front of an OpenAI-compatible endpoint, so any AI app gets How the AI helps, a check on each reply
and a record by changing one URL (docs/with-your-stack.md).`;

// A course package's first activity with teaching settings, or a teaching settings file itself.
const teachingOf = (doc) => (doc?.format === 'viable.course-package' ? (doc.course?.activities || []).find((item) => item?.teaching)?.teaching ?? null : doc);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The cases as an agent tests file, on stdout or in out; notes go to stderr.
function writeCases(cases, out) {
  const json = JSON.stringify({ format: 'viable.agent-tests', cases }, null, 2);
  if (!out) return console.log(json);
  writeFileSync(out, `${json}\n`);
  console.error(`Wrote ${out}.`);
}

function printCalibration(checked) {
  const { person_pass: pass, person_fail: fail } = checked.confusion;
  const cell = (value) => String(value).padStart(10);
  console.log(`The judge${checked.judge_model ? ` (${checked.judge_model})` : ''} against ${checked.people || 'a person'}, on ${plural(checked.labelled, 'labelled case')}${checked.unlabelled ? `; ${checked.unlabelled} judged but not labelled` : ''}.`);
  if (checked.unjudged.length) console.log(`Labelled, but the judge rated no reply by that name: ${checked.unjudged.join(', ')}.`);
  console.log(`\n               judge pass  judge fail\n  person pass  ${cell(pass.judge_pass)}  ${cell(pass.judge_fail)}\n  person fail  ${cell(fail.judge_pass)}  ${cell(fail.judge_fail)}\n`);
  if (checked.agreement != null) console.log(`Agreement ${checked.agreement}, Cohen's kappa ${checked.kappa ?? 'undefined'} (agreement by chance ${checked.chance}).`);
  console.log(checked.note);
  if (checked.disagreements.length) console.log(`\nDisagreements:\n${checked.disagreements.map((item) => `  ${item.name}: person ${item.person}, judge ${item.judge}${item.reason ? `: ${item.reason}` : ''}`).join('\n')}`);
}

// --knowledge <id>=<folder>, or <id>=resource:<resource> for a connector's folder, once per knowledge
// base: { id: folder }, or null without any.
async function knowledgeOf(pairs = [], values = {}) {
  const folders = new Map();
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    if (at < 1 || at === pair.length - 1) throw new Error(`--knowledge takes <knowledge base id>=<folder>, not "${pair}".`);
    if (folders.has(pair.slice(0, at))) throw new Error(`--knowledge names ${pair.slice(0, at)} twice.`);
    const place = pair.slice(at + 1);
    const resource = place.startsWith('resource:') ? await useResource(place.slice('resource:'.length), resourceOptions(values)) : null;
    if (resource && !resource.knowledge) throw new Error(`${resource.name} isn't a knowledge folder. See viable-harness resources list.`);
    folders.set(pair.slice(0, at), resource ? resource.knowledge : place);
  }
  return folders.size ? Object.fromEntries(folders) : null;
}

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
    if (step.output?.skipped) console.log(`       skipped: ${typeof step.output.skipped === 'string' ? step.output.skipped : step.output.reason}`);
    else if (step.nodeType === 'speech' && step.output?.url) console.log(`       audio: ${step.output.url}`);
    else if (step.nodeType === 'image') for (const url of step.output?.urls || []) console.log(`       picture: ${url}`);
    else if (step.nodeType === 'component') for (const flag of step.output?.flags || []) console.log(`       flag: ${flag.label}${flag.reason ? `: ${flag.reason}` : ''}`);
  }
  console.log(`\n${result.modelCalls} model calls, ${result.usage.total} tokens.`);
}

function printConformance(suites) {
  const cases = suites.flatMap((suite) => suite.cases);
  for (const { suite, cases: results } of suites) {
    console.log(suite);
    for (const item of results) console.log(`  ${item.passed ? 'pass' : 'FAIL'}  ${item.id}${item.passed ? '' : `: ${item.problems.join('; ')}`}`);
  }
  const failed = cases.filter((item) => !item.passed).length;
  console.log(`\n${cases.length - failed} of ${cases.length} cases pass.`);
  if (failed) process.exitCode = 1;
}

// calibrate --set: the judge model over a connector's rated replies, against the people who rated them.
async function calibrateOnSet(values) {
  const set = await useResource(values.set, { ...resourceOptions(values), options: connectorChoices(values) });
  if (!set.labels) throw new Error(`${set.name} isn't a calibration set. See viable-harness resources list.`);
  const run = await judgeReplies(set.cases, { judgeModel: values['judge-model'], judgePrompt: set.judge ?? null, onResult: values.json ? null : (entry) => console.error(`${entry.verdict.padEnd(5)} ${entry.name}`) });
  const compared = calibrateJudge(run, set.labels);
  const checked = { ...compared, note: compared.note.replace('one person', set.people), people: set.people, resource: set.id, ...(run.judge_prompt ? { judge_prompt: run.judge_prompt } : {}) };
  if (values.json) return console.log(JSON.stringify({ ...checked, license: set.license, cite: set.cite, shows: set.shows, results: run.results }, null, 2));
  printCalibration(checked);
  console.log(`\n${creditLines(set).join('\n')}`);
}

async function main(argv) {
  // No command, or only a try-out's flags (as npx github:... --demo), is the try-out.
  if (!argv.length || (argv[0].startsWith('--') && argv[0] !== '--help')) return tryCommand(argv);
  if (argv[0] === 'try') return tryCommand(argv.slice(1));
  if (argv[0] === 'gateway') return gatewayCommand(argv.slice(1));
  if (argv[0] === 'resources') return resourcesCommand(argv.slice(1));
  if (argv[0] === 'knowledge') return knowledgeCommand(argv.slice(1));
  if (argv[0] === 'records') return recordsCommand(argv.slice(1));
  if (argv[0] === 'forget') return forgetCommand(argv.slice(1));
  if (argv[0] === 'inspect') return inspectCommand(argv.slice(1));
  if (argv[0] === 'deploy') return deployCommand(argv.slice(1));
  if (argv[0] === 'verify') return verifyCommand(argv.slice(1));
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { 'allow-component': { type: 'string', multiple: true }, 'class-code-env': { type: 'string' }, panel: { type: 'boolean' }, html: { type: 'boolean' }, 'no-open': { type: 'boolean' }, 'learner-header': { type: 'string' }, reply: { type: 'string' }, message: { type: 'string' }, guideline: { type: 'string' }, question: { type: 'string' }, 'answer-key': { type: 'string' }, 'key-concepts': { type: 'string' }, rewrite: { type: 'string' }, reviewer: { type: 'string' }, 'judge-model': { type: 'string' }, input: { type: 'string', short: 'i' }, context: { type: 'string' }, teaching: { type: 'string' }, section: { type: 'string' }, 'no-teaching': { type: 'boolean' }, agent: { type: 'string' }, model: { type: 'string' }, json: { type: 'boolean' }, kind: { type: 'string' }, help: { type: 'boolean', short: 'h' }, out: { type: 'string' }, 'speech-model': { type: 'string' }, 'audio-dir': { type: 'string' }, 'no-speech': { type: 'boolean' }, 'home-page': { type: 'string' }, 'activity-base': { type: 'string' }, 'include-text': { type: 'boolean' }, count: { type: 'string' }, 'image-model': { type: 'string' }, 'media-dir': { type: 'string' }, 'memory-dir': { type: 'string' }, learner: { type: 'string' }, knowledge: { type: 'string', multiple: true }, port: { type: 'string' }, host: { type: 'string' }, 'token-env': { type: 'string' }, cors: { type: 'string' }, 'max-body': { type: 'string' }, timeout: { type: 'string' }, 'max-runs': { type: 'string' }, slot: { type: 'string' }, open: { type: 'boolean' }, map: MODEL_OPTIONS.map, models: MODEL_OPTIONS.models, 'reviewer-model': MODEL_OPTIONS['reviewer-model'], 'data-dir': { type: 'string' }, 'keep-days': { type: 'string' }, suite: { type: 'string' }, judge: { type: 'string' }, set: { type: 'string' }, component: { type: 'string' }, connected: { type: 'boolean' }, 'accept-license': { type: 'boolean' }, refresh: { type: 'boolean' }, dir: { type: 'string' }, ...Object.fromEntries(CONNECTOR_OPTIONS.map((name) => [name, { type: 'string' }])) }
  });
  const [command, file] = positionals;
  if (values.help || !command) return console.log(USAGE);
  if (command === 'mcp') return serveStdio();
  if (command === 'check') {
    const checked = await checkReply({
      reply: values.reply, message: values.message ?? '', guideline: values.guideline ?? '', question: values.question ?? '', answerKey: values['answer-key'] ?? '',
      keyConcepts: values['key-concepts'] ?? [], teaching: values.teaching ? readJson(values.teaching) : null, section: values.section ?? null,
      rewrite: values.rewrite == null ? 0 : Number(values.rewrite), model: values.model ?? null, reviewer: values.reviewer ?? null
    });
    if (values.json) return console.log(JSON.stringify(checked, null, 2));
    for (const round of checked.rounds) console.log(`round ${round.attempt} (${round.source}): ${round.verdict}${round.feedback ? `: ${String(round.feedback).replace(/\s+/g, ' ')}` : ''}`);
    console.log(`\noutcome: ${checked.outcome}${checked.revised ? ' (rewritten)' : ''}`);
    if (checked.revised) console.log(`\n${checked.reply}`);
    if (!checked.passed) process.exitCode = 1;
    return;
  }
  if (command === 'components') {
    if (values.json) return console.log(JSON.stringify(COMPONENTS, null, 2));
    for (const item of COMPONENTS) {
      console.log(`${item.id} ${item.version} (${item.slot}): ${item.label}`);
      console.log(`  receives: ${item.receives.join(', ') || 'nothing'}; ${item.uses_models ? 'calls models through the host' : 'calls no model'}; sends to: ${item.sends_to.join(', ') || 'no other host'}`);
      console.log(`  evidence: ${item.evidence.integration}`);
    }
    return;
  }
  if (command === 'catalog') {
    const found = searchCatalog(positionals.slice(1).join(' '), { kind: values.kind ?? null, slot: values.slot ?? null, open: values.open === true, connected: values.connected === true });
    if (values.json) return console.log(JSON.stringify(found, null, 2));
    if (!found.entries.length) return console.log('No public good matched. Try other words, or fewer filters.');
    for (const entry of found.entries) {
      console.log(`${entry.name} (${entry.kind}${entry.status === 'expected' ? ', not yet released' : ''}): ${entry.summary}`);
      console.log(`  license: ${entry.license.spdx.join(', ') || 'none stated'}${entry.license.unclear ? ' (unclear)' : ''}${entry.license.note ? `: ${entry.license.note}` : ''}`);
      console.log(`  access: ${entry.access}${openForAnyUse(entry) ? ', and its licenses allow any use' : ''}; fits: ${entry.fits.slots.join(', ') || 'no slot yet'}${entry.in_harness ? `; built in as ${entry.in_harness}` : ''}`);
      console.log(`  connected: level ${entry.connect.level} of 3${entry.connect.as.length ? `, as ${entry.connect.as.join(', ')}` : ''}: ${entry.connect.command ?? entry.connect.note}`);
      console.log(`  ${entry.url}  (checked ${entry.verified_at})`);
    }
    return console.log(`\n${plural(found.entries.length, 'public good')}${found.match === 'most_words' ? ' sharing the most words (none had them all)' : ''}. Entries describe, not endorse: check each license before you use it.`);
  }
  if (command === 'misconceptions') {
    const found = findMisconceptions(positionals.slice(1).join(' '));
    if (values.json) return console.log(JSON.stringify(found, null, 2));
    if (!found.data.length) return console.log('No construct matched. Try other words, such as the operation and the kind of number (Eedi writes "different denominators").');
    for (const construct of found.data) {
      console.log(`${construct.description}  (shares: ${construct.matched.join(', ')})`);
      for (const misconception of construct.misconceptions) console.log(`  - ${misconception.description}`);
    }
    return console.log(`\n${found.source.attribution}`);
  }
  if (command === 'conformance') return printConformance(await runConformance(file ? [file] : undefined));
  if (command === 'calibrate' && values.set) return calibrateOnSet(values);
  if (!file) throw new Error(`Name a file.\n\n${USAGE}`);
  if (command === 'view' || command === 'suggest') {
    // A folder stands for every JSON file in it, such as what a gateway's --data-dir keeps.
    const files = positionals.slice(1).flatMap((name) => (statSync(name).isDirectory() ? readdirSync(name, { recursive: true }).filter((item) => item.endsWith('.json')).sort().map((item) => join(name, item)) : [name]));
    const inputs = viewInputs(files.map((name) => ({ name, doc: readJson(name) })));
    const teaching = values.teaching ? readJson(values.teaching) : inputs.teaching;
    const suggestions = suggestChanges({ teaching, runs: inputs.runs, records: inputs.records });
    if (command === 'suggest') {
      if (values.json) return console.log(JSON.stringify(suggestions, null, 2));
      if (!suggestions.length) return console.log('No suggestions from this evidence.');
      for (const item of suggestions) console.log(`${item.change}\n  why: ${item.why}\n${item.evidence.map((line) => `  - ${line}`).join('\n')}\n  ${item.patch ? `changes: ${Object.keys(item.patch).join(', ')} (--json shows the new settings)` : 'changes nothing: look at the evidence'}\n`);
      return console.log('The teacher decides.');
    }
    const html = teacherView({ ...inputs, teaching, suggestions });
    if (!values.out) return process.stdout.write(html);
    writeFileSync(values.out, html);
    return console.log(`Wrote ${values.out}.`);
  }
  if (command === 'tests-from-records') {
    const records = positionals.slice(1).flatMap((name) => [].concat(readJson(name)));
    const { cases, eligible } = casesFromTurns(records, values.teaching ? teachingOf(readJson(values.teaching)) : null, { limit: values.count == null ? 10 : Number(values.count) });
    console.error(`${plural(cases.length, 'case')} from ${plural(eligible.not_passed + eligible.after_wrong_answer + eligible.first_turn, 'eligible turn')} (${eligible.not_passed} VETTING didn't pass, ${eligible.after_wrong_answer} after a wrong answer, ${eligible.first_turn} first messages). They hold learners' own words: reuse them only with consent, and read each before running or sharing it.`);
    if (!cases.length) { process.exitCode = 1; return; }
    return writeCases(cases, values.out);
  }
  if (command === 'calibrate') {
    if (!positionals[2]) throw new Error(`Name the labels file.\n\n${USAGE}`);
    const checked = calibrateJudge(readJson(file), readJson(positionals[2]));
    return values.json ? console.log(JSON.stringify(checked, null, 2)) : printCalibration(checked);
  }
  if (command === 'serve') {
    const whole = (name, fallback, least = 1) => {
      if (values[name] == null) return fallback;
      const n = Number(values[name]);
      if (!Number.isInteger(n) || n < least) throw new Error(`--${name} takes a whole number of at least ${least}, not "${values[name]}".`);
      return n;
    };
    const tokenEnv = values['token-env'];
    if (tokenEnv && !process.env[tokenEnv]) throw new Error(`--token-env ${tokenEnv}: set ${tokenEnv} to the token apps will send (Authorization: Bearer <token>).`);
    if (values['learner-header'] && !tokenEnv) throw new Error('--learner-header says who is signed in, and whoever can send that header is whoever it says: it needs --token-env <NAME> too, and a proxy that nothing can get around.');
    const { agents, skipped } = await loadAgents(positionals.slice(1));
    for (const line of skipped) console.error(`Skipped ${line}`);
    if (!agents.length) throw new Error(`No agent file or course package in ${positionals.slice(1).join(', ')}. In a container, mount them: -v "$PWD/agents:/agents:ro". The folder must be one Docker can see, and Colima shares only your home folder unless you tell it otherwise.`);
    if (values['keep-days'] != null && !values['data-dir']) throw new Error('--keep-days deletes what --data-dir keeps: give --data-dir <dir> too.');
    if (values['data-dir']) await writableFolder(values['data-dir']);
    const classCodeEnv = values['class-code-env'];
    if (classCodeEnv && !process.env[classCodeEnv]) throw new Error(`--class-code-env ${classCodeEnv}: set ${classCodeEnv} to the code your class will type.`);
    const { server, url, notes, warnings, pages, teacherToken } = await serve(agents, {
      port: whole('port', 8080, 0), host: values.host ?? '127.0.0.1', token: tokenEnv ? process.env[tokenEnv] : null, cors: values.cors ?? null,
      maxBodyBytes: whole('max-body', 1024 * 1024), timeoutMs: whole('timeout', 300) * 1000, maxRuns: whole('max-runs', 30),
      knowledge: await knowledgeOf(values.knowledge, values), memoryDir: values['memory-dir'] ?? null, models: planOf(values),
      mediaDir: values['media-dir'] ?? null, silent: values['no-speech'] === true, allowComponents: values['allow-component'] ?? [],
      store: values['data-dir'] ? fileStore(values['data-dir']) : null, keepDays: whole('keep-days', null),
      pages: { classCode: classCodeEnv ? process.env[classCodeEnv] : null, learnerHeader: values['learner-header'] ?? null, ...(values.panel ? { traces: 'token', panel: {} } : {}) },
      routes: values.panel ? [fontRoutes()] : []
    });
    console.error(`Serving ${plural(agents.length, 'agent')} at ${url}${tokenEnv ? `, to callers with the token in ${tokenEnv}` : ''}:`);
    for (const agent of agents) console.error(`  POST ${url}/v1/agents/${agent.slug}/runs  ${agent.name} (${agent.file}${agent.ref ? `, agent ${agent.ref}` : ''})`);
    for (const page of pages) console.error(`  Open ${url}${page.path}  ${page.title}`);
    if (pages.length) console.error(`  The teacher's page: ${url}/teacher${teacherToken ? `, with this token for this run, shown once: ${teacherToken}` : ''}`);
    if (pages.length && values.panel) console.error(`  What the AI did: sign in there, then add ?panel=1 to a page's address. A learner's own page never shows it.`);
    console.error(`Model calls go to ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}.`);
    for (const note of notes) console.error(`Note: ${note}`);
    for (const warning of warnings) console.error(`Warning: ${warning}`);
    if (values['data-dir']) console.error(`Keeping conversations, runs and memory in ${values['data-dir']}${values['keep-days'] != null ? `, what learners wrote, conversations and runs for ${values['keep-days']} days` : ', until you delete them'}.`);
    stopOnSignal(server);
    return;
  }
  if (command === 'run') {
    if (values.input == null) throw new Error('Give the learner\'s message with --input "...".');
    const { doc, dir, zip } = await readAgentFile(file);
    const plan = planOf(values);
    for (const warning of modelWarnings([{ slug: values.agent ?? 'agent', graph: pickAgent(doc, values.agent ?? null).graph }], plan)) console.error(`Warning: ${warning}`);
    const result = await runAgent(doc, {
      input: values.input,
      context: values.context ? readJson(values.context) : null,
      teaching: values['no-teaching'] ? false : values.teaching ? readJson(values.teaching) : null,
      section: values.section ?? null,
      agent: values.agent ?? null,
      models: plan,
      mediaDir: values['media-dir'] ?? values['audio-dir'] ?? null,
      memoryDir: values['memory-dir'] ?? null,
      learner: values.learner ?? null,
      silent: values['no-speech'] === true,
      knowledge: await knowledgeOf(values.knowledge, values),
      allowComponents: values['allow-component'] ?? [],
      dir,
      zip
    });
    return values.json ? console.log(JSON.stringify(result, null, 2)) : printRun(result);
  }
  // A package's zip validates by the package.viable.json inside it.
  const doc = command === 'validate' ? (await readAgentFile(file)).doc : readJson(file);
  if (command === 'draft-tests') {
    const drafted = await draftCases(teachingOf(doc), { model: values.model, count: values.count == null ? 8 : Number(values.count), section: values.section ?? null });
    for (const item of drafted.rejected) console.error(`Rejected case ${item.index}${item.name ? ` (${item.name})` : ''}: ${item.reason}`);
    if (drafted.missing.length) console.error(`No valid case covers: ${drafted.missing.join(', ')}. Draft again, or write those yourself.`);
    console.error(`${plural(drafted.cases.length, 'case')} drafted by ${drafted.model}${drafted.section ? ` for section ${drafted.section}: run them with --section ${drafted.section}` : ''}. A model's guesses: read and edit each before running it.`);
    if (!drafted.cases.length) { process.exitCode = 1; return; }
    return writeCases(drafted.cases, values.out);
  }
  if (command === 'validate') {
    const { kind, errors } = validateDocument(doc, values.kind);
    if (!errors.length) return console.log(`${file}: a valid ${kind} file.`);
    console.error(`${file}: not a valid ${kind} file:\n${errors.map((error) => `  ${error}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  if (command === 'measure') {
    if (!values.component) return console.log(JSON.stringify(measureLearner(doc), null, 2));
    return console.log(JSON.stringify(await measureWith(readJson(values.component), doc, { dir: dirname(resolve(values.component)) }), null, 2));
  }
  if (command === 'component') {
    if (!values.input) throw new Error(`Give the payload with --input payload.json.\n\n${USAGE}`);
    const payload = readJson(values.input);
    const output = await callComponent(doc, payload, { dir: dirname(resolve(file)) }).catch((error) => { if (error.code) error.message = `${error.code}: ${error.message}`; throw error; });
    if (values.json) return console.log(JSON.stringify(output, null, 2));
    const sent = Object.keys(payload).filter((key) => doc.receives.includes(key));
    const left = Object.keys(payload).filter((key) => !sent.includes(key));
    console.log(`${doc.id} ${doc.version} (${doc.slot}, ${doc.runs.kind}) received ${sent.join(', ') || 'nothing'}${left.length ? `; left out ${left.join(', ')}, which it doesn't receive` : ''}.\n`);
    return console.log(JSON.stringify(output, null, 2));
  }
  if (command === 'test') {
    if (!positionals[2] && !values.suite) throw new Error(`Name the cases file, or a suite with --suite <resource>.\n\n${USAGE}`);
    const fromResource = { ...resourceOptions(values), options: connectorChoices(values) };
    const suite = values.suite ? await useResource(values.suite, fromResource) : null;
    if (suite && (!suite.cases || suite.labels)) throw new Error(`${suite.name} isn't a test suite. See viable-harness resources list.`);
    const judging = values.judge ? await resourceJudge(values.judge, fromResource) : null;
    const cases = suite ? suite.cases : readJson(positionals[2]);
    const run = await runAgentTests(doc, cases, {
      judgeModel: values['judge-model'], judgePrompt: judging?.judge ?? null, agent: values.agent ?? null, model: values.model ?? null,
      teaching: values.teaching ? readJson(values.teaching) : null, section: values.section ?? null, allowComponents: values['allow-component'] ?? [],
      onResult: values.json ? null : (entry) => console.log(`${entry.verdict.toUpperCase().padEnd(5)} ${entry.name}${entry.reason ? `: ${entry.reason}` : ''}`)
    });
    const credits = [suite, judging].filter(Boolean);
    if (values.json) console.log(JSON.stringify({ ...run, ...(credits.length ? { resources: credits.map(({ id, license, cite, shows, fetched_at }) => ({ id, license, cite, shows, fetched_at })) } : {}) }, null, 2));
    else {
      console.log(`\n${run.passed} passed, ${run.failed} failed, ${run.errors} errors (judge: ${[run.judge_model, run.judge_prompt].filter(Boolean).join(' with ')}).`);
      for (const used of credits) console.log(`\n${creditLines(used).join('\n')}`);
    }
    if (run.failed || run.errors) process.exitCode = 1;
    if (values.html) await showTestRun(testRunPage(run, Array.isArray(cases) ? cases : cases.cases ?? [], { title: `Tests of ${doc.title ?? doc.name ?? 'an agent'}`, credits: credits.flatMap(creditLines) }), { out: values.out ?? null, open: !values['no-open'] });
    return;
  }
  if (command === 'xapi') {
    if (!values['home-page']) throw new Error('Name the system whose learner ids these are with --home-page <url>.');
    return console.log(JSON.stringify(toStatements(doc, { homePage: values['home-page'], activityBase: values['activity-base'], includeText: values['include-text'] ?? false }), null, 2));
  }
  throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  if (error.agentSteps?.length) console.error(error.agentSteps.map((step) => `  ${step.stepNumber}. ${step.nodeId} (${step.nodeType}) ${step.status}${step.error ? `: ${step.error}` : ''}`).join('\n'));
  process.exitCode = 1;
});
