// {{title}} on AWS Lambda, answering through a function URL. The package is in the function's code.
import { readFile } from 'node:fs/promises';
import { createApp } from './vendor/harness/src/server/app.js';
import { lambdaStreamHandler } from './vendor/harness/src/server/lambda.js';
import { fileAssets } from './vendor/harness/src/server/learnerAssets.js';
import { nodeServices } from './vendor/harness/src/server/onNode.js';
{{#store}}import { s3Store } from './store.js';
{{/store}}
const PACKAGE = '{{package}}';
const here = (path) => new URL(path, import.meta.url);
const { services, outward } = nodeServices(process.env);

const handle = await createApp({
  bytes: await readFile(here(`./package/${PACKAGE}`)),
  name: PACKAGE,
  vars: process.env,
  models: JSON.parse(await readFile(here('./models.json'), 'utf8')),
  store: {{#store}}s3Store(process.env.VIABLE_STORE_BUCKET){{/store}}{{^store}}null{{/^store}},
  services,
  pages: { assets: await fileAssets(), fetch: outward }
});

export const handler = lambdaStreamHandler(handle);
{{#store}}
// The daily schedule in template.yaml: what VIABLE_HARNESS_KEEP_DAYS has passed goes.
export const sweep = () => handle.sweep();
{{/store}}