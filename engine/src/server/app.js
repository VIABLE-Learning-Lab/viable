/**
 * A course package as a server, from its bytes and a host's settings: what each cloud's scaffold
 * (deploy/) calls in a few lines. vars holds them, from the environment or a Worker's env:
 * OPENAI_BASE_URL, OPENAI_API_KEY, VIABLE_ENGINE_TOKEN, VIABLE_ENGINE_CORS, VIABLE_ENGINE_KEEP_DAYS,
 * VIABLE_ENGINE_MAX_RUNS, VIABLE_ENGINE_TIMEOUT (seconds), VIABLE_ENGINE_CLASS_CODE, VIABLE_ENGINE_LEARNER_HEADER
 * and VIABLE_ENGINE_SECRET. No Node built-ins.
 */
import { consoleRoutes } from '../console/index.js';
import { createHandler } from './handler.js';
import { storeMemory } from './memory.js';
import { modelPlan } from './models.js';
import { learnerRoutes, pagesOf } from './learner.js';
import { agentsFrom, courseLibrary } from './library.js';
import { agentsToServe, createRuntime, readPackage } from './runtime.js';
import { featuresOf, modelSettings } from './settings.js';

// Route modules every deployed server carries, before the built-in ones (createHandler's routes).
export const serverRoutes = (pages) => [consoleRoutes({ settings: pages.models, library: pages.library, fetch: pages.modelFetch, outward: pages.fetch, signIn: pages.learnerHeader ? 'proxy' : pages.classCode ? 'class' : null }), learnerRoutes(pages)];

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
export async function createApp({ bytes, name = 'package', vars = {}, store = null, models = null, pages = {}, routes = null, services = {}, fetch, log }) {
  // With no package it starts empty, to be set up in its console.
  const given = bytes ? [{ ...await readPackage(bytes, name), file: name, name }] : [];
  const library = courseLibrary({ store, given, ...(fetch ? { fetch } : {}), trial: (doc) => pagesOf(new Map(agentsToServe([{ doc, file: 'it', name: 'it' }]).map((agent) => [agent.slug, agent])), { documents: [{ doc }] }) });
  if (given.length) pagesOf(new Map(agentsToServe(given).map((agent) => [agent.slug, agent])), { documents: given, ...pages });
  const held = agentsFrom(await library.documents());
  const plan = modelPlan({ models });
  const settings = modelSettings({ store, secret: setting(vars.VIABLE_ENGINE_SECRET), baseUrl: setting(vars.OPENAI_BASE_URL), apiKey: setting(vars.OPENAI_API_KEY), plan });
  const runtime = createRuntime({
    baseUrl: setting(vars.OPENAI_BASE_URL) ?? undefined, apiKey: setting(vars.OPENAI_API_KEY) ?? undefined, ...(fetch ? { fetch } : {}),
    models: plan, memory: store ? storeMemory(store) : null, services, settings, store, readPath: library.readPath
  });
  return createHandler({
    agents: held.agents, documents: held.documents, library, runtime, store,
    routes: routes ?? serverRoutes({ classCode: vars.VIABLE_ENGINE_CLASS_CODE || null, learnerHeader: vars.VIABLE_ENGINE_LEARNER_HEADER || null, models: settings, library, readPath: library.readPath, ...(fetch ? { modelFetch: fetch } : {}), ...pages }),
    options: {
      features: async () => featuresOf(await settings.resolve()),
      requireToken: true, token: setting(vars.VIABLE_ENGINE_TOKEN), cors: setting(vars.VIABLE_ENGINE_CORS),
      maxRuns: whole(vars.VIABLE_ENGINE_MAX_RUNS, 'VIABLE_ENGINE_MAX_RUNS', MAX_RUNS),
      timeoutMs: whole(vars.VIABLE_ENGINE_TIMEOUT, 'VIABLE_ENGINE_TIMEOUT', 300) * 1000,
      keepDays: whole(vars.VIABLE_ENGINE_KEEP_DAYS, 'VIABLE_ENGINE_KEEP_DAYS', null),
      ...(log ? { log } : {})
    }
  });
}
