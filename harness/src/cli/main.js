// viable-harness: what teaching needs, around any model or agent. The Engine's command line adds running agents.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { KINDS, validateDocument } from '../validate.js';
import { measureLearner } from '../measures.js';
import { checkReply } from '../check.js';
import { agentAt, draftCases, judgeReplies, runAgentTests } from '../testRuns.js';
import { calibrateJudge, casesFromTurns } from '../testCases.js';
import { findMisconceptions } from '../utils/misconceptions.js';
import { COMPONENTS, SLOTS } from '../components/index.js';
import { CATALOG_KINDS, openForAnyUse, searchCatalog } from '../catalog.js';
import { callComponent, measure as measureWith } from '../components/call.js';
import { teacherView, viewInputs } from '../view.js';
import { serveStdio } from '../mcp.js';
import { SUITES, runConformance } from '../conformance.js';
import { toStatements } from '../xapi.js';
import { suggestChanges } from '../suggest.js';
import { GATEWAY_USAGE, gatewayCommand } from './gateway.js';
import { showTestRun, testRunPage } from './testPage.js';
import { CONNECTOR_OPTIONS, RESOURCES_USAGE, connectorChoices, creditLines, resourceOptions, resourcesCommand } from './resources.js';
import { resourceJudge, useResource } from '../resources/index.js';
import { MOMENT_USAGE, prepareCommand } from './prepare.js';

export const HARNESS_COMMANDS = ['prepare', 'check', 'test', 'draft-tests', 'tests-from-records', 'calibrate', 'misconceptions', 'components', 'catalog', 'resources', 'component', 'view', 'suggest', 'mcp', 'gateway', 'measure', 'xapi', 'validate', 'conformance'];

const USAGE = `Usage:
${MOMENT_USAGE}
  viable-harness check --reply "..." [--message "..."] (--guideline "..." | --question "..." --answer-key "...")
                       [--key-concepts "a, b"] [--teaching teaching.json] [--section <id>] [--rewrite <n>]
                       --model <id> [--reviewer <id>] [--json]
  viable-harness test (<cases.json> | --suite <resource> [--limit <n>] [--standard <code>]) --endpoint <url> --endpoint-model <id>
                      --judge-model <id> [--system "..."] [--judge <resource>/<name>] [--accept-license] [--dir <folder>]
                      [--html [--out report.html] [--no-open]] [--json]
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
  viable-harness view <record.json | run.json | package.json | folder...> [--teaching teaching.json] [--out report.html]
  viable-harness suggest <record.json | run.json | package.json | folder...> [--teaching teaching.json] [--json]
  viable-harness mcp
${GATEWAY_USAGE}
  viable-harness measure <events.json> [--component <manifest.json>]
  viable-harness xapi <events.json> --home-page <url> [--activity-base <url>] [--include-text]
  viable-harness validate <file> [--kind ${KINDS.join('|')}]
  viable-harness conformance [${SUITES.join('|')}]

Model calls go to an OpenAI-compatible endpoint: OPENAI_BASE_URL (default https://api.openai.com/v1) and OPENAI_API_KEY.

prepare prints what a model should be given before it replies at this moment, chosen from the teaching settings; with
--picker-model a small model reads the moment instead of rules.
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
and a record by changing one URL (docs/with-your-stack.md).

To run agents and courses too: @viable-lab/engine, whose viable-engine does all this as well.`;

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

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`Couldn't read ${file} as JSON: ${error.message}`); }
};

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


/**
 * Runs one command. host: what a command line built on this one adds: runAgent for test, serveStdio for mcp,
 * validateDocument, readDocument for validate, runConformance, and usage printed in place of this one's.
 */
export async function harnessMain(argv, host = {}) {
  const usage = host.usage ?? USAGE;
  if (argv[0] === 'gateway') return gatewayCommand(argv.slice(1));
  if (argv[0] === 'resources') return resourcesCommand(argv.slice(1));
  if (argv[0] === 'prepare') return prepareCommand(argv.slice(1));
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { html: { type: 'boolean' }, 'no-open': { type: 'boolean' }, reply: { type: 'string' }, message: { type: 'string' }, guideline: { type: 'string' }, question: { type: 'string' }, 'answer-key': { type: 'string' }, 'key-concepts': { type: 'string' }, rewrite: { type: 'string' }, reviewer: { type: 'string' }, 'judge-model': { type: 'string' }, teaching: { type: 'string' }, section: { type: 'string' }, model: { type: 'string' }, json: { type: 'boolean' }, kind: { type: 'string' }, help: { type: 'boolean', short: 'h' }, out: { type: 'string' }, 'home-page': { type: 'string' }, 'activity-base': { type: 'string' }, 'include-text': { type: 'boolean' }, count: { type: 'string' }, slot: { type: 'string' }, open: { type: 'boolean' }, suite: { type: 'string' }, judge: { type: 'string' }, set: { type: 'string' }, component: { type: 'string' }, connected: { type: 'boolean' }, 'accept-license': { type: 'boolean' }, refresh: { type: 'boolean' }, dir: { type: 'string' }, input: { type: 'string' }, endpoint: { type: 'string' }, 'endpoint-model': { type: 'string' }, system: { type: 'string' }, ...Object.fromEntries(CONNECTOR_OPTIONS.map((name) => [name, { type: 'string' }])), ...(host.options ?? {}) }
  });
  const [command, file] = positionals;
  if (values.help || !command) return console.log(usage);
  if (command === 'mcp') return (host.serveStdio ?? serveStdio)();
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
  if (command === 'conformance') return printConformance(await (host.runConformance ?? runConformance)(file ? [file] : undefined));
  if (command === 'calibrate' && values.set) return calibrateOnSet(values);
  if (!file && !(command === 'test' && values.suite)) throw new Error(`Name a file.\n\n${usage}`);
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
  // A package's zip validates by the package.viable.json inside it.
  const doc = command === 'validate' ? (host.readDocument ? await host.readDocument(file) : readJson(file)) : command === 'test' && values.endpoint ? null : readJson(file);
  if (command === 'draft-tests') {
    const drafted = await draftCases(teachingOf(doc), { model: values.model, count: values.count == null ? 8 : Number(values.count), section: values.section ?? null });
    for (const item of drafted.rejected) console.error(`Rejected case ${item.index}${item.name ? ` (${item.name})` : ''}: ${item.reason}`);
    if (drafted.missing.length) console.error(`No valid case covers: ${drafted.missing.join(', ')}. Draft again, or write those yourself.`);
    console.error(`${plural(drafted.cases.length, 'case')} drafted by ${drafted.model}${drafted.section ? ` for section ${drafted.section}: run them with --section ${drafted.section}` : ''}. A model's guesses: read and edit each before running it.`);
    if (!drafted.cases.length) { process.exitCode = 1; return; }
    return writeCases(drafted.cases, values.out);
  }
  if (command === 'validate') {
    const { kind, errors } = (host.validateDocument ?? validateDocument)(doc, values.kind);
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
    if (!values.input) throw new Error(`Give the payload with --input payload.json.\n\n${usage}`);
    const payload = readJson(values.input);
    const output = await callComponent(doc, payload, { dir: dirname(resolve(file)) }).catch((error) => { if (error.code) error.message = `${error.code}: ${error.message}`; throw error; });
    if (values.json) return console.log(JSON.stringify(output, null, 2));
    const sent = Object.keys(payload).filter((key) => doc.receives.includes(key));
    const left = Object.keys(payload).filter((key) => !sent.includes(key));
    console.log(`${doc.id} ${doc.version} (${doc.slot}, ${doc.runs.kind}) received ${sent.join(', ') || 'nothing'}${left.length ? `; left out ${left.join(', ')}, which it doesn't receive` : ''}.\n`);
    return console.log(JSON.stringify(output, null, 2));
  }
  if (command === 'test') {
    const behind = values.endpoint ? { baseUrl: values.endpoint, model: values['endpoint-model'], system: values.system ?? null } : null;
    if (!behind && !host.runAgent) throw new Error(`Test what's behind an OpenAI-compatible endpoint with --endpoint <url> --endpoint-model <id>, or run an agent file with viable-engine test.\n\n${usage}`);
    if (behind && !behind.model) throw new Error('Name the model behind the endpoint with --endpoint-model <id>.');
    const casesFile = behind ? file : positionals[2];
    if (!casesFile && !values.suite) throw new Error(`Name the cases file, or a suite with --suite <resource>.\n\n${usage}`);
    const fromResource = { ...resourceOptions(values), options: connectorChoices(values) };
    const suite = values.suite ? await useResource(values.suite, fromResource) : null;
    if (suite && (!suite.cases || suite.labels)) throw new Error(`${suite.name} isn't a test suite. See viable-harness resources list.`);
    const judging = values.judge ? await resourceJudge(values.judge, fromResource) : null;
    const cases = suite ? suite.cases : readJson(casesFile);
    const run = await runAgentTests(doc, cases, {
      runAgent: host.runAgent ?? agentAt(behind),
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
  throw new Error(`Unknown command "${command}".\n\n${usage}`);
}

export function fail(error) {
  console.error(error.message);
  if (error.agentSteps?.length) console.error(error.agentSteps.map((step) => `  ${step.stepNumber}. ${step.nodeId} (${step.nodeType}) ${step.status}${step.error ? `: ${step.error}` : ''}`).join('\n'));
  process.exitCode = 1;
}
