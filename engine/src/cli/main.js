// viable-engine: run VIABLE's agents and courses yourself. Everything viable-harness does works here too.
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { HARNESS_COMMANDS, harnessMain } from '../../../harness/src/cli/main.js';
import { fileStore, writableFolder } from '../../../harness/src/store/fileStore.js';
import { openBrowser } from '../../../harness/src/cli/open.js';
import { fontRoutes } from '../../../harness/src/ui/theme.js';
import { stopOnSignal } from '../../../harness/src/net/node.js';
import { CONNECTOR_OPTIONS, resourceOptions } from '../../../harness/src/cli/resources.js';
import { resourceJudge, useResource } from '../../../harness/src/resources/index.js';
import { runConformance } from '../conformance.js';
import { serveStdio } from '../mcp.js';
import { pickAgent, readAgentFile, runAgent } from '../run.js';
import { loadAgents, serve } from '../serve.js';
import { KINDS, validateDocument } from '../validate.js';
import { modelWarnings } from '../server/models.js';
import { TARGET_NAMES } from '../server/targets.js';
import { MODEL_OPTIONS, planOf } from './common.js';
import { localExamples } from './examples.js';
import { deployCommand } from './deploy.js';
import { inspectCommand } from './inspect.js';
import { KNOWLEDGE_USAGE, knowledgeCommand } from './knowledge.js';
import { RECORDS_USAGE, forgetCommand, recordsCommand } from './records.js';
import { TRY_USAGE, tryCommand } from './try.js';
import { verifyCommand } from './verify.js';

const USAGE = `Usage:
${TRY_USAGE}
  viable-engine run <agent.json | package.json | course.viable.zip> --input "..." [--context file.json] [--allow-component <id>...]
                    [--teaching teaching.json] [--section <id>] [--agent <ref>] [--model <id>] [--speech-model <id>]
                    [--image-model <id>] [--media-dir <dir>] [--no-speech] [--memory-dir <dir> --learner <id>]
                    [--knowledge <kb-id>=<folder>...] [--no-teaching] [--map <named>=<model>...] [--models models.json]
                    [--reviewer-model <id>] [--json]
  viable-engine start [course.viable.zip | folder]... [--data-dir <dir>] [--port 8080] [--host 127.0.0.1] [--no-open] [--trust-proxy]
                      What most people want: a server of your own, set up in the browser, keeping everything in
                      --data-dir (default ~/.viable-engine). It takes serve's options too.
  viable-engine serve [agent.json | package.json | course.viable.zip | folder]... [--port 8080] [--host 127.0.0.1]
                      [--token-env <NAME>] [--class-code-env <NAME>] [--learner-header <name>] [--cors <origin>] [--max-body <bytes>]
                      [--timeout <seconds>] [--max-runs <n>] [--model <id>] [--speech-model <id>] [--image-model <id>] [--media-dir <dir>]
                      [--no-speech] [--memory-dir <dir>] [--knowledge <kb-id>=<folder>...] [--map <named>=<model>...]
                      [--models models.json] [--reviewer-model <id>] [--data-dir <dir>] [--keep-days <n>] [--panel] [--allow-component <id>...]
  viable-engine inspect <package> [--map <named>=<model>...] [--models models.json] [--reviewer-model <id>]
                        [--target ${TARGET_NAMES.join('|')}] [--json]
  viable-engine deploy <${TARGET_NAMES.join('|')}> <package> --out <dir>
                       [--name <name>] [--endpoint <url>] [--store none] [--knowledge <kb-id>=<folder>...]
                       [--map <named>=<model>...] [--models models.json] [--model <id>] [--reviewer-model <id>]
                       [--force] [--json]
  viable-engine verify <url> [--token-env <NAME>] [--agent <slug>] [--turn] [--input "..."] [--json]
  viable-engine test <agent.json | package.json> (<cases.json> | --suite <resource> [--limit <n>] [--standard <code>])
                     --judge-model <id> [--judge <resource>/<name>] [--model <id>] [--agent <ref>]
                     [--teaching teaching.json] [--section <id>] [--accept-license] [--dir <folder>] [--allow-component <id>...]
                     [--html [--out report.html] [--no-open]] [--json]
${KNOWLEDGE_USAGE}
${RECORDS_USAGE}

Every viable-harness command works here too: ${HARNESS_COMMANDS.join(', ')}. viable-engine <command> --help shows them.

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
its file's name, a package's agents at their refs. With no agents yet it starts anyway, and / goes to the console,
/console, where you add providers and say what each model is for; --data-dir saves that, and the environment and
the flags win over it. --token-env names the variable holding the token callers send
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
`;

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`Couldn't read ${file} as JSON: ${error.message}`); }
};

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


const ENGINE_COMMANDS = new Set(['start', 'serve', 'run']);
// What test takes here beyond viable-harness's.
const ENGINE_TEST_OPTIONS = { 'allow-component': { type: 'string', multiple: true }, agent: { type: 'string' } };

// The token a started server keeps in its folder, readable only by whoever runs it.
function keptToken(folder) {
  const file = join(folder, '.console-token');
  mkdirSync(folder, { recursive: true });
  if (!existsSync(file)) writeFileSync(file, `${randomBytes(24).toString('base64url')}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return readFileSync(file, 'utf8').trim();
}

// One address that signs in whoever opens it, within minutes, once.
function oneTimeAddress() {
  const secret = randomBytes(24).toString('base64url');
  const until = Date.now() + 15 * 60000;
  let used = false;
  return { secret, take: (given) => { if (used || given !== secret || Date.now() > until) return false; used = true; return true; } };
}

// Where a class on this network reaches a server listening beyond this computer.
function networkAddresses(host, port) {
  if (!['0.0.0.0', '::'].includes(host)) return [];
  return Object.values(networkInterfaces()).flat().filter((item) => item && item.family === 'IPv4' && !item.internal).map((item) => `http://${item.address}:${port}`);
}

async function main(argv) {
  // No command, or only a try-out's flags (as npx github:... --demo), is the try-out.
  if (!argv.length || (argv[0].startsWith('--') && argv[0] !== '--help')) return tryCommand(argv);
  if (argv[0] === 'try') return tryCommand(argv.slice(1));
  if (argv[0] === 'knowledge') return knowledgeCommand(argv.slice(1));
  if (argv[0] === 'records') return recordsCommand(argv.slice(1));
  if (argv[0] === 'forget') return forgetCommand(argv.slice(1));
  if (argv[0] === 'inspect') return inspectCommand(argv.slice(1));
  if (argv[0] === 'deploy') return deployCommand(argv.slice(1));
  if (argv[0] === 'verify') return verifyCommand(argv.slice(1));
  if (argv[0] === '--help' || argv[0] === 'help') return console.log(USAGE);
  if (!ENGINE_COMMANDS.has(argv[0])) {
    return harnessMain(argv, { usage: USAGE, runAgent, serveStdio, validateDocument, runConformance, readDocument: async (file) => (await readAgentFile(file)).doc, options: ENGINE_TEST_OPTIONS });
  }
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { 'allow-component': { type: 'string', multiple: true }, 'no-open': { type: 'boolean' }, 'trust-proxy': { type: 'boolean' }, 'class-code-env': { type: 'string' }, panel: { type: 'boolean' }, 'learner-header': { type: 'string' }, input: { type: 'string', short: 'i' }, context: { type: 'string' }, teaching: { type: 'string' }, section: { type: 'string' }, 'no-teaching': { type: 'boolean' }, agent: { type: 'string' }, model: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, 'speech-model': { type: 'string' }, 'audio-dir': { type: 'string' }, 'no-speech': { type: 'boolean' }, 'image-model': { type: 'string' }, 'media-dir': { type: 'string' }, 'memory-dir': { type: 'string' }, learner: { type: 'string' }, knowledge: { type: 'string', multiple: true }, port: { type: 'string' }, host: { type: 'string' }, 'token-env': { type: 'string' }, cors: { type: 'string' }, 'max-body': { type: 'string' }, timeout: { type: 'string' }, 'max-runs': { type: 'string' }, 'data-dir': { type: 'string' }, 'keep-days': { type: 'string' }, 'accept-license': { type: 'boolean' }, dir: { type: 'string' }, ...MODEL_OPTIONS, ...Object.fromEntries(CONNECTOR_OPTIONS.map((name) => [name, { type: 'string' }])) } });
  const [command, file] = positionals;
  if (values.help) return console.log(USAGE);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (command === 'serve' || command === 'start') {
    const starting = command === 'start';
    if (starting) values['data-dir'] ??= process.env.VIABLE_ENGINE_DATA || join(homedir(), '.viable-engine');
    const whole = (name, fallback, least = 1) => {
      if (values[name] == null) return fallback;
      const n = Number(values[name]);
      if (!Number.isInteger(n) || n < least) throw new Error(`--${name} takes a whole number of at least ${least}, not "${values[name]}".`);
      return n;
    };
    const tokenEnv = values['token-env'];
    if (tokenEnv && !process.env[tokenEnv]) throw new Error(`--token-env ${tokenEnv}: set ${tokenEnv} to the token apps will send (Authorization: Bearer <token>).`);
    if (tokenEnv && process.env[tokenEnv].length < 16) console.error(`Warning: the token in ${tokenEnv} is short enough to guess. Make one with: openssl rand -hex 32`);
    if (values['learner-header'] && !tokenEnv) throw new Error('--learner-header says who is signed in, and whoever can send that header is whoever it says: it needs --token-env <NAME> too, and a proxy that nothing can get around.');
    const { agents, skipped } = await loadAgents(positionals.slice(1));
    for (const line of skipped) console.error(`Skipped ${line}`);
    if (!agents.length && positionals.length > 1) console.error(`No agent file or course package in ${positionals.slice(1).join(', ')}: set things up at /console. To serve files in a container, mount them: -v "$PWD/agents:/agents:ro". The folder must be one Docker can see, and Colima shares only your home folder unless you tell it otherwise.`);
    if (values['keep-days'] != null && !values['data-dir']) throw new Error('--keep-days deletes what --data-dir keeps: give --data-dir <dir> too.');
    if (values['data-dir']) await writableFolder(values['data-dir']);
    const classCodeEnv = values['class-code-env'];
    if (classCodeEnv && !process.env[classCodeEnv]) throw new Error(`--class-code-env ${classCodeEnv}: set ${classCodeEnv} to the code your class will type.`);
    // start keeps one token across restarts, so a bookmark and a session go on working.
    const kept = starting && !tokenEnv ? keptToken(values['data-dir']) : null;
    const welcome = starting ? oneTimeAddress() : null;
    // Filled in below, once the port is known.
    const addresses = [];
    const { server, url, agents: served, notes, warnings, pages, teacherToken, settings } = await serve(agents, {
      consoleOptions: { examples: localExamples(), ...(welcome ? { welcome } : {}), addresses },
      // Kept token, this computer: meant only for here, so no other name reaches it.
      onlyLocalNames: Boolean(kept) && ['127.0.0.1', 'localhost', '::1'].includes(values.host ?? '127.0.0.1'),
      trustProxy: values['trust-proxy'] === true,
      port: whole('port', 8080, 0), host: values.host ?? '127.0.0.1', token: tokenEnv ? process.env[tokenEnv] : kept, cors: values.cors ?? null,
      maxBodyBytes: whole('max-body', 1024 * 1024), timeoutMs: whole('timeout', 300) * 1000, maxRuns: whole('max-runs', 30),
      knowledge: await knowledgeOf(values.knowledge, values), memoryDir: values['memory-dir'] ?? null, models: planOf(values),
      mediaDir: values['media-dir'] ?? null, silent: values['no-speech'] === true, allowComponents: values['allow-component'] ?? [],
      store: values['data-dir'] ? fileStore(values['data-dir']) : null, keepDays: whole('keep-days', null),
      pages: { classCode: classCodeEnv ? process.env[classCodeEnv] : null, learnerHeader: values['learner-header'] ?? null, ...(values.panel ? { traces: 'token', panel: {} } : {}) },
      routes: values.panel ? [fontRoutes()] : []
    });
    addresses.push(...networkAddresses(values.host ?? '127.0.0.1', new URL(url).port));
    console.error(`Serving ${plural(served.length, 'agent')} at ${url}${tokenEnv ? `, to callers with the token in ${tokenEnv}` : ''}${served.length ? ':' : '.'}`);
    for (const agent of served) console.error(`  POST ${url}/v1/agents/${agent.slug}/runs  ${agent.name} (${agent.file}${agent.ref ? `, agent ${agent.ref}` : ''})`);
    for (const page of pages) console.error(`  Open ${url}${page.path}  ${page.title}`);
    if (pages.length) console.error(`  The teacher's page: ${url}/teacher${teacherToken ? `, with this token for this run, shown once: ${teacherToken}` : ''}`);
    if (pages.length && values.panel) console.error(`  What the AI did: sign in there, then add ?panel=1 to a page's address. A learner's own page never shows it.`);
    if (kept) {
      const here = addresses.length ? `http://127.0.0.1:${new URL(url).port}` : url;
      console.error(`  The console: ${here}/console, with the token in ${join(values['data-dir'], '.console-token')}`);
      console.error(`  Or open this once, on this computer: ${here}/console/welcome/${welcome.secret}`);
      for (const address of addresses) console.error(`  Learners on this network: ${address}`);
      if (values['no-open'] !== true && !process.env.CI) openBrowser(`${here}/console/welcome/${welcome.secret}`);
    } else console.error(`  The console, to set up models and courses: ${url}/console${!teacherToken ? '' : pages.length ? ', with the same token' : `, with this token for this run, shown once: ${teacherToken}`}`);
    const { roles } = await settings.resolve();
    console.error(roles.reply?.saved ? `Model calls go where the console says: replies to ${roles.reply.provider.name}.` : roles.reply ? `Model calls go to ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}.` : 'No model writes replies yet: choose one in the console, or set OPENAI_BASE_URL and OPENAI_API_KEY.');
    if (!values['data-dir']) console.error('Nothing set in the console is saved without --data-dir: models come from the environment and the flags.');
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
  throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  if (error.agentSteps?.length) console.error(error.agentSteps.map((step) => `  ${step.stepNumber}. ${step.nodeId} (${step.nodeType}) ${step.status}${step.error ? `: ${step.error}` : ''}`).join('\n'));
  process.exitCode = 1;
});
