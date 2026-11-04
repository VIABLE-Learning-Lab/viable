// {{title}} as a Node server: the package in ./package, on the handler in ./vendor/harness.
import { readFile } from 'node:fs/promises';
import { createApp } from './vendor/engine/src/server/app.js';
import { fileAssets } from './vendor/engine/src/server/learnerAssets.js';
{{#store}}import { fileStore, writableFolder } from './vendor/harness/src/store/fileStore.js';
{{/store}}import { listen, stopOnSignal } from './vendor/harness/src/net/node.js';
import { nodeServices } from './vendor/harness/src/net/onNode.js';

const PACKAGE = '{{package}}';
const vars = process.env;
const here = (path) => new URL(path, import.meta.url);
const { services, outward } = nodeServices(vars);
{{#store}}const dataDir = vars.VIABLE_ENGINE_DATA_DIR || './data';
await writableFolder(dataDir).catch((error) => { console.error(error.message); process.exit(1); });
{{/store}}
const handle = await createApp({
  bytes: PACKAGE ? await readFile(here(`./package/${PACKAGE}`)) : null,
  name: PACKAGE,
  vars,
  models: JSON.parse(await readFile(here('./models.json'), 'utf8')),
  store: {{#store}}fileStore(dataDir){{/store}}{{^store}}null{{/^store}},
  services,
  pages: { assets: await fileAssets(), fetch: outward }
});

const { server, url } = await listen(handle, { port: Number(vars.PORT ?? 8080), host: vars.HOST || '127.0.0.1', trustProxy: vars.VIABLE_ENGINE_TRUST_PROXY === '1' });
console.error(`Serving ${PACKAGE || 'what its console sets up'} at ${url}${vars.OPENAI_BASE_URL ? `, with model calls to ${vars.OPENAI_BASE_URL}` : ''}. Set up models at ${url}/console.`);
{{#store}}
// With VIABLE_ENGINE_KEEP_DAYS set, what it has passed is deleted: conversations, runs, and what learners wrote.
const sweep = () => handle.sweep().catch((error) => console.error(error));
sweep();
setInterval(sweep, 6 * 3600000).unref();
{{/store}}
stopOnSignal(server);
