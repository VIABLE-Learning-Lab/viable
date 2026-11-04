// viable-harness gateway: the command, a Node server around gatewayHandler (src/gateway.js).
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { slugify } from '../utils/slug.js';
import { gatewayHandler } from '../gateway.js';
import { fileStore } from '../store/fileStore.js';
import { listen } from '../net/node.js';
import { teachingSettings } from '../teaching.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
export const GATEWAY_USAGE = `  viable-harness gateway --upstream <url> [--teaching t.json | --activities <dir>] [--picker-model <id>] [--whole-settings] [--reviewer-model <id>] [--rewrites <n>]
                         [--on-unverified fallback|pass] [--data-dir <dir>] [--keep-text] [--port 8090] [--host 127.0.0.1]
                         [--token-env <NAME>] [--api-key-env <NAME>]`;

const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new Error(`Couldn't read ${path}: ${error.message}`); }
};
const isPackage = (doc) => doc?.format === 'viable.course-package';
const taught = (activity) => ({ teaching: activity.teaching, title: activity.title ?? null });

// A settings file, or a course package's first activity with settings.
function teachingFile(path) {
  const doc = readJson(path);
  const activity = isPackage(doc) ? (doc.course?.activities || []).find((item) => item?.teaching) : null;
  if (isPackage(doc) && !activity) throw new Error(`${path}: no activity in this package has teaching settings.`);
  const settings = activity ? taught(activity) : doc;
  if (!teachingSettings(settings.teaching ?? settings) && !settings.guideline && !settings.answer_key) throw new Error(`${path} holds no teaching settings: see schemas/teaching.schema.json.`);
  return settings;
}

// One activity per settings file, named by the file; a course package gives one per activity with settings, named by its title.
function activitiesFolder(dir) {
  const activities = {};
  const add = (id, settings, from) => {
    if (Object.hasOwn(activities, id)) throw new Error(`${from}: a second activity "${id}" in ${dir}.`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error(`${from}: "${id}" can't name an activity: use letters, digits, dots, dashes, underscores or colons.`);
    activities[id] = settings;
  };
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.json') && !file.startsWith('.')).sort()) {
    const path = join(dir, name);
    const doc = readJson(path);
    if (isPackage(doc)) for (const activity of doc.course?.activities || []) { if (activity?.teaching) add(slugify(activity.title), taught(activity), path); }
    else add(basename(name, '.json'), teachingFile(path), path);
  }
  if (!Object.keys(activities).length) throw new Error(`${dir} has no activity: put one settings file per activity in it, named <activity>.json.`);
  return activities;
}

export async function gatewayCommand(argv, env = process.env) {
  const { values } = parseArgs({ args: argv, options: { upstream: { type: 'string' }, teaching: { type: 'string' }, activities: { type: 'string' }, 'reviewer-model': { type: 'string' }, 'picker-model': { type: 'string' }, 'whole-settings': { type: 'boolean' }, rewrites: { type: 'string' }, 'on-unverified': { type: 'string' }, 'data-dir': { type: 'string' }, 'keep-text': { type: 'boolean' }, port: { type: 'string' }, host: { type: 'string' }, 'token-env': { type: 'string' }, 'api-key-env': { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) return console.log(`Usage:\n${GATEWAY_USAGE}`);
  if (!values.upstream) throw new Error(`Name the OpenAI-compatible endpoint to stand in front of, with --upstream <url>.\n\nUsage:\n${GATEWAY_USAGE}`);
  if (values.teaching && values.activities) throw new Error('Give --teaching (one activity for every call) or --activities (a folder, picked by X-Viable-Activity), not both.');
  for (const name of ['token-env', 'api-key-env']) if (values[name] && !env[values[name]]) throw new Error(`--${name} ${values[name]}: that variable isn't set.`);
  const whole = (name, fallback, least) => {
    if (values[name] == null) return fallback;
    const n = Number(values[name]);
    if (!Number.isInteger(n) || n < least) throw new Error(`--${name} takes a whole number of at least ${least}, not "${values[name]}".`);
    return n;
  };
  const host = values.host ?? '127.0.0.1';
  const tokenEnv = values['token-env'];
  const token = tokenEnv ? env[tokenEnv] : null;
  if (!token && !LOCAL_HOSTS.has(host)) throw new Error(`Serving on ${host} without a token would let anyone who can reach this machine use your model endpoint. Give a token with --token-env <NAME>, or serve on 127.0.0.1.`);
  const keyEnv = values['api-key-env'] ?? 'OPENAI_API_KEY';
  const apiKey = env[keyEnv] || null;
  const reviewerModel = values['reviewer-model'] ?? null;
  const onUnverified = values['on-unverified'] ?? 'fallback';
  const rewrites = whole('rewrites', 2, 0);
  const teaching = values.teaching ? teachingFile(values.teaching) : null;
  const activities = values.activities ? activitiesFolder(values.activities) : null;
  // Records with no token still sit behind one: through a local proxy every visitor looks like this machine.
  const teacherToken = !token && values['data-dir'] ? randomBytes(24).toString('base64url') : null;
  const handler = gatewayHandler({
    upstream: values.upstream, apiKey, token, teacherToken, teaching, activities, reviewerModel, pickerModel: values['picker-model'] ?? null, wholeSettings: values['whole-settings'] === true, rewrites, onUnverified, keepText: values['keep-text'] === true,
    store: values['data-dir'] ? fileStore(values['data-dir']) : null,
    log: (line) => process.stdout.write(`${JSON.stringify(line)}\n`)
  });
  const { server, url: origin } = await listen(handler, { port: whole('port', 8090, 0), host });
  const url = `${origin}/v1`;
  console.error([
    `Gateway at ${url}, in front of ${values.upstream}.`,
    `  Upstream key: ${apiKey ? `from ${keyEnv}; the key a caller sends isn't used` : `each caller's own (Authorization: Bearer) is sent on; ${keyEnv} isn't set`}.`,
    `  Callers: ${token ? `must send the token in ${tokenEnv}, as X-Viable-Token${apiKey ? ' or as their API key' : ''}` : 'this machine only (no token)'}.`,
    `  Settings: ${teaching ? `one activity for every call (${values.teaching})` : activities ? `${Object.keys(activities).length} activities, picked by X-Viable-Activity: ${Object.keys(activities).join(', ')}` : 'none: no How the AI helps is added'}.`,
    `  Checks: ${reviewerModel ? `on, reviewer ${reviewerModel}, up to ${rewrites} rewrite${rewrites === 1 ? '' : 's'}; a reply that doesn't pass ${onUnverified === 'pass' ? 'is sent, marked unverified' : 'is replaced by the fallback text'}` : 'off: replies pass through unchecked (--reviewer-model turns them on)'}.`,
    `  Records: ${values['data-dir'] ? `in ${values['data-dir']}, ${values['keep-text'] ? 'with what learners and the AI wrote' : 'without what learners and the AI wrote (--keep-text keeps it)'}; the teacher's page is at ${origin}/teacher${teacherToken ? ` (any user name, and this password, shown once: ${teacherToken})` : ''}` : 'none (--data-dir keeps them)'}.`,
    `Point your app at it: OPENAI_BASE_URL=${url}`
  ].join('\n'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
}
