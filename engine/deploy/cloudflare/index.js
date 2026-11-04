// {{title}} on Cloudflare Workers. The package is a private asset: run_worker_first (wrangler.toml)
// means only this code can read it.
import models from './models.json';
import { createApp } from './vendor/engine/src/server/app.js';
{{#store}}import { d1Store } from './store.js';
{{/store}}
const PACKAGE = '{{package}}';
let handle = null;

// The learner pages' browser files, beside the package in the same private assets; this Worker serves them.
async function pageFiles(env) {
  const read = async (path) => {
    const response = await env.PACKAGE.fetch(new Request(`https://package/chat-assets/${path}`));
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  };
  const manifest = await read('manifest.json');
  return manifest ? { names: JSON.parse(new TextDecoder().decode(manifest)), read } : null;
}

// Kept once made. Two first requests may each make one, which does no harm: a Worker can't safely wait on another request's work.
async function app(env) {
  if (handle) return handle;
  const response = PACKAGE ? await env.PACKAGE.fetch(new Request(`https://package/${PACKAGE}`)) : null;
  if (response && !response.ok) throw new Error(`The package ${PACKAGE} wasn't deployed with this Worker (${response.status}).`);
  handle = await createApp({ bytes: response ? await response.arrayBuffer() : null, name: PACKAGE, vars: env, models, store: {{#store}}d1Store(env.DB){{/store}}{{^store}}null{{/^store}}, pages: { assets: await pageFiles(env) } });
  return handle;
}

export default {
  async fetch(request, env, ctx) {
    const answer = await app(env);
    return answer(request, { address: request.headers.get('cf-connecting-ip'), waitUntil: (work) => ctx.waitUntil(work) });
  }{{#store}},
  // The daily cron in wrangler.toml: with VIABLE_ENGINE_KEEP_DAYS set, what it has passed is deleted: conversations, runs, and what learners wrote.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(app(env).then((answer) => answer.sweep()));
  }{{/store}}
};
