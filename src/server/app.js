/**
 * A course package as a server, from its bytes and a host's settings: what each cloud's scaffold
 * (deploy/) calls in a few lines. vars holds them, from the environment or a Worker's env:
 * OPENAI_BASE_URL, OPENAI_API_KEY, VIABLE_HARNESS_TOKEN, VIABLE_HARNESS_CORS, VIABLE_HARNESS_KEEP_DAYS,
 * VIABLE_HARNESS_MAX_RUNS, VIABLE_HARNESS_TIMEOUT (seconds) and VIABLE_HARNESS_CLASS_CODE and VIABLE_HARNESS_LEARNER_HEADER. No Node built-ins.
 */
import { createHandler } from './handler.js';
import { storeMemory } from './memory.js';
import { modelPlan } from './models.js';
import { learnerRoutes } from './learner.js';
import { agentsToServe, createRuntime, readPackage } from './runtime.js';

// Route modules every deployed server carries, before the built-in ones (createHandler's routes).
export const serverRoutes = (pages) => [learnerRoutes(pages)];

// A cloud shares a process among many learners, so the limit is higher than serve's 4.
const MAX_RUNS = 50;

// A secret piped in with a newline would never match.
const setting = (value) => (typeof value === 'string' ? value.trim() : value) || null;

const whole = (value, name, fallback) => {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${name} must be a whole number, not "${value}".`);
  return number;
};

/**
 * The handler for a package: bytes (a .viable.zip, or JSON), name (its file's name), vars, store
 * (store.js; null keeps nothing between requests), models (a models.json's contents), routes, pages
 * (learnerRoutes' options: assets, with the pages' browser files where the host has them; classCode),
 * services (the engine's, such as a host's callComponent), fetch, log. The server refuses every agent
 * call until vars has a token; /health still answers.
 */
export async function createApp({ bytes, name = 'package', vars = {}, store = null, models = null, pages = {}, routes = serverRoutes({ classCode: vars.VIABLE_HARNESS_CLASS_CODE || null, learnerHeader: vars.VIABLE_HARNESS_LEARNER_HEADER || null, ...pages }), services = {}, fetch, log }) {
  const { doc, zip } = await readPackage(bytes, name);
  const agents = agentsToServe([{ doc, zip, file: name, name }]);
  const runtime = createRuntime({
    baseUrl: setting(vars.OPENAI_BASE_URL) ?? undefined, apiKey: setting(vars.OPENAI_API_KEY) ?? undefined, ...(fetch ? { fetch } : {}),
    models: modelPlan({ models }), memory: store ? storeMemory(store) : null, services
  });
  return createHandler({
    agents, runtime, store, routes,
    options: {
      requireToken: true, token: setting(vars.VIABLE_HARNESS_TOKEN), cors: setting(vars.VIABLE_HARNESS_CORS),
      maxRuns: whole(vars.VIABLE_HARNESS_MAX_RUNS, 'VIABLE_HARNESS_MAX_RUNS', MAX_RUNS),
      timeoutMs: whole(vars.VIABLE_HARNESS_TIMEOUT, 'VIABLE_HARNESS_TIMEOUT', 300) * 1000,
      keepDays: whole(vars.VIABLE_HARNESS_KEEP_DAYS, 'VIABLE_HARNESS_KEEP_DAYS', null),
      ...(log ? { log } : {})
    }
  });
}
