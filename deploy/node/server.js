// {{title}} as a Node server: the package in ./package, on the handler in ./vendor/harness.
import { readFile } from 'node:fs/promises';
import { createApp } from './vendor/harness/src/server/app.js';
import { fileAssets } from './vendor/harness/src/server/learnerAssets.js';
{{#store}}import { fileStore, writableFolder } from './vendor/harness/src/server/fileStore.js';
{{/store}}import { listen, stopOnSignal } from './vendor/harness/src/server/node.js';
import { nodeServices } from './vendor/harness/src/server/onNode.js';

const PACKAGE = '{{package}}';
const vars = process.env;
const here = (path) => new URL(path, import.meta.url);
const { services, outward } = nodeServices(vars);
{{#store}}const dataDir = vars.VIABLE_HARNESS_DATA_DIR || './data';
await writableFolder(dataDir).catch((error) => { console.error(error.message); process.exit(1); });
{{/store}}
const handle = await createApp({
  bytes: await readFile(here(`./package/${PACKAGE}`)),
  name: PACKAGE,
  vars,
  models: JSON.parse(await readFile(here('./models.json'), 'utf8')),
  store: {{#store}}fileStore(dataDir){{/store}}{{^store}}null{{/^store}},
  services,
  pages: { assets: await fileAssets(), fetch: outward }
});

const { server, url } = await listen(handle, { port: Number(vars.PORT ?? 8080), host: vars.HOST || '127.0.0.1' });
console.error(`Serving ${PACKAGE} at ${url}, with model calls to ${vars.OPENAI_BASE_URL || 'https://api.openai.com/v1'}`);
{{#store}}
// With VIABLE_HARNESS_KEEP_DAYS set, what it has passed is deleted: conversations, runs, and what learners wrote.
const sweep = () => handle.sweep().catch((error) => console.error(error));
sweep();
setInterval(sweep, 6 * 3600000).unref();
{{/store}}
stopOnSignal(server);
