// {{title}} as a Firebase Function (2nd gen). The package is in the function's code.
import { readFile } from 'node:fs/promises';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
{{#store}}import { onSchedule } from 'firebase-functions/v2/scheduler';
{{/store}}import { createApp } from './vendor/engine/src/server/app.js';
import { nodeListener } from './vendor/harness/src/net/node.js';
import { fileAssets } from './vendor/engine/src/server/learnerAssets.js';
import { nodeServices } from './vendor/harness/src/net/onNode.js';
{{#store}}import { firestoreStore } from './store.js';
{{/store}}
const PACKAGE = '{{package}}';
const here = (path) => new URL(path, import.meta.url);
const token = defineSecret('VIABLE_ENGINE_TOKEN');
const apiKey = defineSecret('OPENAI_API_KEY');
const baseUrl = defineString('OPENAI_BASE_URL', { default: '{{endpoint}}' });
const { services, outward } = nodeServices(process.env);

let listener = null;

async function start() {
  return createApp({
    bytes: PACKAGE ? await readFile(here(`./package/${PACKAGE}`)) : null,
    name: PACKAGE,
    // A secret can only be read while a request runs, so the server starts on the first one.
    vars: { OPENAI_BASE_URL: baseUrl.value(), OPENAI_API_KEY: apiKey.value(), VIABLE_ENGINE_TOKEN: token.value(), VIABLE_ENGINE_SECRET: process.env.VIABLE_ENGINE_SECRET, VIABLE_ENGINE_KEEP_DAYS: process.env.VIABLE_ENGINE_KEEP_DAYS ?? '180' },
    models: JSON.parse(await readFile(here('./models.json'), 'utf8')),
    store: {{#store}}firestoreStore(){{/store}}{{^store}}null{{/^store}},
    services,
    pages: { assets: await fileAssets(), fetch: outward }
  });
}

export const harness = onRequest({ secrets: [token, apiKey], timeoutSeconds: 540, memory: '1GiB', cpu: 1, concurrency: 40, invoker: 'public' }, async (req, res) => {
  listener ??= nodeListener(await start());
  return listener(req, res);
});
{{#store}}
// Once a day, what VIABLE_ENGINE_KEEP_DAYS has passed goes: a request alone never sweeps.
export const sweep = onSchedule({ schedule: 'every 24 hours', secrets: [token, apiKey], timeoutSeconds: 540, memory: '1GiB' }, async () => {
  await (await start()).sweep();
});
{{/store}}