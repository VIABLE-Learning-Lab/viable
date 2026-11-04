/**
 * What answers a static copy of demo mode (export.js), in the visitor's browser: the real handler and
 * the real engine, with the script as the model and this browser's storage as the store. Bundled to
 * dist/try/app.js by scripts/build-try-static.mjs, and written only into a copy.
 */
import { createHandler } from '../server/handler.js';
import { learnerRoutes } from '../server/learner.js';
import { agentsToServe, createRuntime } from '../server/runtime.js';
import { demoModel, sampleRounds } from './demo.js';
import { readyToTry, tryOut } from './server.js';

const PREFIX = 'viable-try:';

// What the pages keep, for this browser. Full or blocked storage leaves it in memory, for this page.
export function browserStore(storage = globalThis.localStorage) {
  const memory = new Map();
  const read = (key) => { try { return storage.getItem(PREFIX + key); } catch { return null; } };
  return {
    get: async (key) => JSON.parse(memory.get(key) ?? read(key) ?? 'null'),
    put: async (key, value) => { const text = JSON.stringify(value); try { storage.setItem(PREFIX + key, text); memory.delete(key); } catch { memory.set(key, text); } },
    delete: async (key) => { memory.delete(key); try { storage.removeItem(PREFIX + key); } catch { /* Nothing was kept. */ } },
    list: async (prefix = '') => {
      const kept = [...memory.keys()];
      try { for (let at = 0; at < storage.length; at += 1) { const key = storage.key(at); if (key.startsWith(PREFIX)) kept.push(key.slice(PREFIX.length)); } } catch { /* Memory is all there is. */ }
      return [...new Set(kept)].filter((key) => key.startsWith(prefix)).sort();
    }
  };
}

/** (request) => Response, from what export.js wrote under root. real: the browser's own fetch. */
export async function start({ root, real }) {
  const { files, classFiles, names, note } = await (await real(`${root}/_try/packages.json`)).json();
  const ready = readyToTry(files);
  const docs = ready.map((file) => file.doc);
  const store = browserStore();
  const model = demoModel({ docs, pass: real, files: async (path) => { const response = await real(`${root}/_try/files/${path}`); return response.ok ? response.arrayBuffer() : null; } });
  const parts = tryOut({ note, endpoint: { fetch: model }, store, assets: { names }, classFiles, rounds: sampleRounds(docs), exported: true });
  const handler = createHandler({ agents: agentsToServe(ready), runtime: createRuntime({ baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', fetch: model, brief: { model: 'demo-reader' } }), store, routes: [...parts.routes, learnerRoutes({ ...parts.pages, assets: { names }, fetch: model })], options: { log: () => {} } });
  return (request) => handler(request, {});
}
