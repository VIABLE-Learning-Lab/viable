/**
 * viable-engine deploy: a ready-to-deploy folder for a package on one target, from the templates in
 * deploy/ (a target's layers, later files replacing earlier ones). It holds the package with its files
 * as one zip, models.json, the few files people read, and under vendor/ the harness's code that runs
 * them, found by following imports. Nothing is sent anywhere: this only writes the folder.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, cpSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { knowledgeFolders, readInFolder } from '../knowledge.js';
import { readAgentFile } from '../run.js';
import { inspectPackage } from '../server/inspect.js';
import { TARGET_NAMES, TARGETS } from '../server/targets.js';
import { readZip } from '../../../harness/src/utils/zip.js';
import { MODEL_OPTIONS, RULE, blue, bold, columns, command, dim, oneLine, plainStrings, planOf, red, stopped, usageError, wrap } from './common.js';
import { zipFile } from './zipFile.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPOSITORY = resolve(ROOT, '..');
const OPTIONS = { ...MODEL_OPTIONS, out: { type: 'string' }, name: { type: 'string' }, store: { type: 'string' }, endpoint: { type: 'string' }, knowledge: { type: 'string', multiple: true }, force: { type: 'boolean' } };
const IMPORTS = /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;

// The harness's files a target runs, by following imports from its entries; and the npm packages they need.
function vendorFiles(entries) {
  const files = new Set();
  const packages = new Set();
  const visit = (path) => {
    if (files.has(path)) return;
    files.add(path);
    if (!path.endsWith('.js')) return;
    for (const match of readFileSync(path, 'utf8').matchAll(IMPORTS)) {
      const spec = match[1] || match[2] || match[3];
      if (spec.startsWith('.')) visit(resolve(dirname(path), spec));
      else if (!spec.startsWith('node:')) packages.add(spec.split('/')[0]);
    }
  };
  for (const entry of entries) visit(join(ROOT, 'src', entry));
  return { files: [...files], packages: [...packages] };
}

// Every value reaches a generated file through here, and a package's words among them land in code: on one
// line, a comment can't end. Only the README's own section keeps its line breaks, written here from a report
// that plainStrings has already cleaned.
const template = (text, values, withStore) => text
  .replace(/\{\{#store\}\}([\s\S]*?)\{\{\/store\}\}/g, (_, inner) => (withStore ? inner : ''))
  .replace(/\{\{\^store\}\}([\s\S]*?)\{\{\/\^store\}\}/g, (_, inner) => (withStore ? '' : inner))
  .replace(/\{\{#package\}\}([\s\S]*?)\{\{\/package\}\}/g, (_, inner) => (values.package ? inner : ''))
  .replace(/\{\{#endpoint\}\}([\s\S]*?)\{\{\/endpoint\}\}/g, (_, inner) => (values.endpoint ? inner : ''))
  .replace(/\{\{([a-z_]+)\}\}/g, (whole, key) => (key === 'common' ? values[key] : key in values ? oneLine(values[key]) : whole));

// A file name as the one string it becomes in generated code: only these characters can't end it.
const safeFileName = (name) => name.replace(/[^\w.-]+/g, '-').replace(/^[.-]+/, '') || 'package.viable.zip';

function layerFiles(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? layerFiles(path, join(prefix, name)) : [{ path, to: join(prefix, name) }];
  });
}

// The folder's one zip: as downloaded if nothing changes, else the package with every file it names and the knowledge folders given.
async function bundle(read, file, folders) {
  const isPackage = read.doc?.format === 'viable.course-package';
  if (read.zip && !folders) return { bytes: read.zip, name: safeFileName(basename(file)), doc: read.doc };
  const stem = basename(file).replace(/\.viable\.zip$|\.zip$|\.agent\.json$|\.json$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
  const doc = isPackage ? structuredClone(read.doc) : {
    format: 'viable.course-package', version: 1, exported_at: read.doc.exported_at, title: read.doc.name || stem,
    agents: [{ ref: stem, slug: stem, name: read.doc.name || stem, description: read.doc.description ?? null, graph: read.doc.graph ?? read.doc }], files: [], knowledge_bases: [],
    ...(read.doc.requires ? { requires: read.doc.requires } : {})
  };
  const entries = new Map();
  const paths = (doc.files || []).flatMap((item) => [item.path, item.text_path]).filter(Boolean);
  if (read.zip) for (const [name, bytes] of await readZip(read.zip, (entry) => paths.includes(entry), { binary: true })) entries.set(name, bytes);
  else for (const path of paths) entries.set(path, await readInFolder(path, read.dir).catch((error) => { throw stopped(`The package names ${path}, and ${error.message}`); }));
  if (folders) {
    const found = await knowledgeFolders(folders);
    for (const item of found.files) {
      const id = item.ref.slice(0, item.ref.indexOf(':'));
      const inside = `knowledge/${id}/${item.path.split(/[\\/]/).join('/')}`;
      entries.set(inside, new Uint8Array(readFileSync(join(found.dirs.get(id), item.path))));
      doc.files = [...(doc.files || []), { ref: item.ref, name: item.name, path: inside }];
    }
    const given = new Set(found.knowledge_bases.map((kb) => kb.ref));
    doc.knowledge_bases = [...(doc.knowledge_bases || []).filter((kb) => !given.has(kb.ref)), ...found.knowledge_bases];
  }
  const packed = zipFile([{ name: 'package.viable.json', data: JSON.stringify(doc) }, ...[...entries].map(([name, data]) => ({ name, data }))]);
  return { bytes: packed, name: `${stem}.viable.zip`, doc };
}

const knowledgeOf = (pairs = []) => {
  const folders = {};
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    if (at < 1 || at === pair.length - 1) throw usageError(`--knowledge takes <knowledge base id>=<folder>, not "${pair}".`);
    folders[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return Object.keys(folders).length ? folders : null;
};

function commonSection(report, place, withStore, modelsJson) {
  const agents = report.agents.map((agent) => `| \`${agent.slug}\` | ${agent.name} | \`POST ${agent.address}\` |`).join('\n');
  const models = report.models.map((row) => `| ${row.role} | ${row.replaced_by ? `${row.model} → **${row.replaced_by}**` : row.model} |`).join('\n');
  return `## Set it up

Open \`/console\` at its address and sign in with \`VIABLE_ENGINE_TOKEN\`. Add a model, then courses, class lists and chat pages.${report.agents.length ? ' What you change there is kept in its store, and replaces the package in this folder from then on.' : ' This folder holds no package: everything is made there, or added from a file.'}

## Put it on your site

Once \`viable-engine verify\` finds a chat page, it prints the \`<script>\` line to swap in and the
origins your site's Content-Security-Policy must allow. Apps call the API with the token, from your
server, never from a web page: anyone who has the token can run these agents on your model keys.

${agents ? `| Agent | Name | Address |
| --- | --- | --- |
${agents}

## Models

Set in \`models.json\`, or at \`/console\`. Every model here must exist on your endpoint.

| Role | Model |
| --- | --- |
${models}` : '## Models\n\nSet at \`/console\`.'}

${report.warnings.length ? `## Read these first\n\n${report.warnings.map((line) => `- ${line}`).join('\n')}\n\n` : ''}## What it keeps

${withStore ? `Conversations, runs, what learners wrote on pages and Memory steps' facts, in ${place.store.says}. Check who can read this store, and how long you may keep it ([deploying.md](https://github.com/VIABLE-Learning-Lab/viable/blob/main/engine/docs/deploying.md)). \`VIABLE_ENGINE_KEEP_DAYS\` deletes, that many days after each last changed, conversations, runs, turns and their traces, and a learner's drafts, answers, highlights and events. A learner's code and how far they got stay until \`viable-engine forget\`, and a Memory step's facts until you delete \`memory/<learner>\`.` : 'Nothing between requests: no conversations, and Memory steps are skipped. Apps send the earlier messages themselves, with `history_mode: "client"`.'}

Each run logs one JSON line: its timing and outcome, never what a learner wrote.

## What it can't do here

${place.limits.map((line) => `- ${line}`).join('\n')}
- Websites in a knowledge base are read when you say so: at \`/console\`, or with \`viable-engine knowledge refresh\` before you deploy. They are searched from what was read, never live.
- Voice, reading aloud, photos and PDFs, and search by meaning stay off until a model is set for them: at \`/console\`, or in \`models.json\`.

## Settings

| Name | What it does |
| --- | --- |
| \`OPENAI_BASE_URL\` | An OpenAI-compatible endpoint, if you don't set models at \`/console\`. Set, it wins over \`/console\` for replies and reviews. Every learner's message goes to it. |
| \`OPENAI_API_KEY\` | Its key, if it needs one. Secret. |
| \`VIABLE_ENGINE_TOKEN\` | What callers send as \`Authorization: Bearer\`, and what opens the console at \`/console\`. Agent calls are refused until it is set. Secret. |
| \`VIABLE_ENGINE_SECRET\` | Encrypts the provider keys saved in the console. Needed to save one, unless the store is a folder, which keeps a key of its own. Secret. |
| \`VIABLE_ENGINE_TRUST_PROXY\` | On Node and in a container: \`1\` when a proxy in front is the only way in, so limits count each visitor's address from its \`X-Forwarded-For\`, not the proxy's. |
| \`VIABLE_ENGINE_CORS\` | The one web page origin allowed to call it from a browser. Default: none. |
| \`VIABLE_ENGINE_KEEP_DAYS\` | Days to keep what learners wrote, conversations and runs. Empty keeps them until you delete them. |
| \`VIABLE_ENGINE_ALLOW_COMPONENTS\` | On Node: IDs of MCP components this server may start, comma-separated. Default: none. |
| \`VIABLE_ENGINE_MAX_RUNS\` | Runs at once in one process; more get 429. Default: 50. |
| \`VIABLE_ENGINE_TIMEOUT\` | Seconds a run may take. Default: 300. |

## A new version

To change a course, use \`/console\`: it saves versions in the store, and no deploy is needed. To take a new version of a package, add its file at \`/console\`. To update the Engine itself, run the same \`viable-engine deploy\` with \`--force\` and deploy again. A course edited at \`/console\` stays as it is.

## What's in this folder

- \`vendor/\` is the Engine's and the Harness's own code (MIT), copied here so nothing depends on a registry. Don't edit it.
- \`package/\` is your package with its files, as one zip. It may hold what you uploaded to VIABLE, so keep this folder as private as the course.
- \`models.json\` replaces the models the package names: ${modelsJson === '{}' ? 'it replaces none so far' : 'read it before you deploy'}.

How far this path has been tried: ${place.ran}.
`;
}

/** Writes the folder: { object, target, out, package, store, files, warnings, limits, commands, next }. */
export async function scaffold(target, file, { out, name = null, store = null, endpoint = '', plan = null, knowledge = null, force = false, pageFiles = join(ROOT, 'dist', 'v1', 'agents', 'chat-assets') } = {}) {
  const place = TARGETS[target];
  if (endpoint && !/^https?:\/\/[\w.~:\/%-]+$/.test(endpoint)) throw usageError(`--endpoint takes an address such as https://api.openai.com/v1, not "${oneLine(endpoint)}".`);
  if (store != null && store !== 'none') throw usageError(`--store takes only "none". On ${place.label} the store is ${place.store.says}.`);
  const withStore = store !== 'none';
  if (!file && !withStore) throw usageError('With no package and no store there would be nothing to serve or set up: name a package, or leave out --store none.');
  let read = null;
  if (file) { try { read = await readAgentFile(file); } catch (error) { throw stopped(error.code === 'ENOENT' ? `There is no file ${file}.` : error.message); } }
  const packed = read ? await bundle(read, file, knowledge).catch((error) => { throw error.next || error.usage ? error : stopped(error.message); }) : { bytes: new Uint8Array(), name: '', doc: null };
  if (place.maxZipBytes && packed.bytes.length > place.maxZipBytes) throw stopped(`${packed.name} is ${(packed.bytes.length / 1048576).toFixed(1)} MiB, more than ${place.label} takes as one file (${place.maxZipBytes / 1048576} MiB).`, 'Download the course without its largest files, or choose aws-lambda, cloud-run or docker.');
  let report = { title: 'VIABLE Engine', agents: [], models: [], warnings: [] };
  try { if (read) report = plainStrings(await inspectPackage({ doc: packed.doc, zip: new Uint8Array(packed.bytes), file: packed.name, plan, target })); } catch (error) { throw stopped(error.message, 'Download the package from VIABLE again, or fix what this names.'); }
  const slug = name ?? (report.agents[0]?.slug.slice(0, 40) || 'viable-engine');
  if (!/^[a-z][a-z0-9-]{0,48}[a-z0-9]$/.test(slug)) throw usageError(`"${slug}" can't name a service: use lowercase letters, digits and dashes, starting with a letter. Give one with --name.`);
  const folder = resolve(out);
  if (existsSync(folder) && readdirSync(folder).length && !force) throw stopped(`${folder} isn't empty.`, 'Choose another --out, or add --force to write over it (what you changed there would be replaced).');

  const modelsJson = plan ? JSON.stringify(Object.fromEntries(Object.entries(plan).filter(([key, value]) => (key === 'map' ? Object.keys(value).length : value))), null, 2) : '{}';
  const { files: vendored, packages } = vendorFiles(place.entries);
  const manifest = JSON.parse(readFileSync(join(REPOSITORY, 'package.json'), 'utf8'));
  const values = {
    name: slug, package: packed.name, package_from: read ? `from \`${packed.name}\`` : 'with no package yet, to be set up at `/console`', endpoint, title: report.title, title_yaml: report.title.replace(/[^\p{L}\p{N} .,'-]/gu, ' ').replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 200), version: manifest.version,
    entities_version: manifest.dependencies.entities, uqr_version: manifest.dependencies.uqr, first_slug: report.agents[0]?.slug ?? '',
    common: commonSection(report, place, withStore, modelsJson)
  };
  const written = new Map();
  for (const layer of place.layers) {
    for (const { path, to } of layerFiles(join(ROOT, 'deploy', layer))) written.set(to, path);
  }
  for (const [to, path] of written) {
    const name2 = basename(to);
    if (name2 === 'store.js' && !withStore) continue;
    if (!withStore && /^firestore\./.test(name2)) continue;
    if (name2 === 'records.js' && !withStore) continue;
    if (name2 === 'compose.yaml' && target !== 'docker') continue;
    const target2 = join(folder, to);
    mkdirSync(dirname(target2), { recursive: true });
    writeFileSync(target2, template(readFileSync(path, 'utf8'), values, withStore));
  }
  // npm leaves a .gitignore out of a package, and this folder will hold secrets and learners' work.
  if (!existsSync(join(folder, '.gitignore'))) writeFileSync(join(folder, '.gitignore'), 'node_modules/\n.env\n.dev.vars\ndata/\n.wrangler/\n');
  const root = join(folder, place.root);
  mkdirSync(join(root, 'package'), { recursive: true });
  if (read) writeFileSync(join(root, 'package', packed.name), packed.bytes);
  writeFileSync(join(root, 'models.json'), `${modelsJson}\n`);
  const vendor = join(root, 'vendor');
  for (const path of vendored) {
    const copy = join(vendor, relative(REPOSITORY, path));
    mkdirSync(dirname(copy), { recursive: true });
    cpSync(path, copy);
  }
  for (const name3 of ['package.json', 'LICENSE', 'NOTICE']) cpSync(join(REPOSITORY, name3), join(vendor, name3));
  // The learner pages' browser files: private assets beside the package on Cloudflare, files in the
  // function everywhere else (no target has a shared disk). Without them pages work, as plain text.
  if (existsSync(join(pageFiles, 'manifest.json'))) cpSync(pageFiles, target === 'cloudflare' ? join(root, 'package', 'chat-assets') : join(vendor, 'engine', 'dist', 'v1', 'agents', 'chat-assets'), { recursive: true });
  else report.warnings.push('The learner pages\' browser files aren\'t built, so this scaffold\'s pages show replies as plain text and leave out Reading panels. Run npm run build:assets in the repository, and deploy again.');
  const unknown = packages.filter((item) => !(item in manifest.dependencies));
  if (unknown.length) throw stopped(`The harness imports ${unknown.join(', ')}, which its package.json doesn't list.`);

  return {
    object: 'harness.scaffold', target, label: place.label, out: folder, package: packed.name || null, name: slug,
    store: withStore ? place.store : { kind: 'none', says: 'nothing between requests' },
    limits: place.limits, warnings: report.warnings, tested: place.ran,
    readme: join(folder, 'README.md')
  };
}

function printResult(result) {
  console.log(`${bold(`${result.name} for ${result.label}`)}\n${dim(RULE)}`);
  console.log(columns([['folder', result.out], ['package', result.package ?? 'none: add one at /console'], ['store', result.store.says], ['tested', dim(result.tested)]]));
  if (result.warnings.length) {
    console.log(`\n${bold('Warnings')}`);
    for (const warning of result.warnings) console.log(wrap(warning, '    ', `  ${red('!')} `));
  }
  console.log(`\n${bold('Next')}\n${wrap(`Its README has the exact commands: ${result.readme}`)}\n  ${blue(`viable-engine verify <its address> --token-env VIABLE_ENGINE_TOKEN`)}`);
}

export const deployCommand = (argv) => command(argv, OPTIONS, async (values, positionals) => {
  const [target, file] = positionals;
  if (!TARGET_NAMES.includes(target)) throw usageError(target ? `There is no target "${target}".` : 'Name a target.', `viable-engine deploy <${TARGET_NAMES.join(' | ')}> [package] --out <dir>`);
  if (!values.out) throw usageError('Say where the folder goes with --out <dir>.');
  const result = await scaffold(target, file, { out: values.out, name: values.name ?? null, store: values.store ?? null, endpoint: values.endpoint ?? '', plan: planOf(values), knowledge: knowledgeOf(values.knowledge), force: values.force === true });
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else printResult(result);
});
