/**
 * Which model each step calls, and replacing them. A package names VIABLE's models, which another
 * endpoint may not have. A plan replaces them by role and by name: { reply, reviewer, speech, image,
 * transcribe, map: { named: replacement } }. A role's value replaces every model in that role, and
 * reply covers every chat model; a name in map wins over its role, except that reviewer wins over map,
 * since a reviewer is chosen on purpose. No Node built-ins.
 */
import { DEFAULT_VETTING_REVIEWER } from '../agents/graph.js';

const ROLES = ['reply', 'reviewer', 'speech', 'image', 'transcribe'];
// Roles no step's model takes: picker reads the moment, meaning searches knowledge.
const OTHER_ROLES = ['picker', 'meaning'];
// What each step's model is for. A helper is a chat model that doesn't write the reply.
const ROLE_OF = { llm: 'reply', agent: 'reply', vetting: 'reply', router: 'helper', guardrail: 'helper', memory: 'helper', speech: 'speech', image: 'image', transcribe: 'transcribe' };

/** [{ step, type, role, model, field }]: every model a graph calls, a Vetting step's reviewer with the default it gets if it names none. */
export function stepModels(graph) {
  const found = [];
  for (const node of graph?.nodes || []) {
    const role = ROLE_OF[node.type];
    if (!role) continue;
    if (node.config?.model) found.push({ step: node.id, type: node.type, role, model: node.config.model, field: 'model' });
    if (node.type === 'vetting') found.push({ step: node.id, type: node.type, role: 'reviewer', model: node.config?.verification_model || DEFAULT_VETTING_REVIEWER, field: 'verification_model', default: !node.config?.verification_model });
  }
  return found;
}

const choose = (plan, role, named) => (role === 'reviewer' ? plan.reviewer ?? plan.map[named] ?? plan.reply ?? named : plan.map[named] ?? plan[role === 'helper' ? 'reply' : role] ?? named);

/** A graph with its models replaced; the steps it names keep theirs without a plan. */
export function applyModels(graph, plan) {
  if (!plan || !Array.isArray(graph?.nodes)) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const role = ROLE_OF[node.type];
      if (!role) return node;
      const config = { ...node.config };
      // A role's replacement also fills a Speech or Image step that names no model.
      const model = config.model ? choose(plan, role, config.model) : plan[role] ?? null;
      if (model) config.model = model;
      if (node.type === 'vetting') config.verification_model = choose(plan, 'reviewer', config.verification_model || DEFAULT_VETTING_REVIEWER);
      return { ...node, config };
    })
  };
}

const named = (value, where) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${where} must be a model's name, not ${JSON.stringify(value)}.`);
  return value.trim();
};

/**
 * A plan from what a person gives: models (a models.json: its roles, and map), map ({ a: b }) and
 * flags ({ model, reviewerModel, speechModel, imageModel }), the flags winning. null if nothing is
 * replaced. A role may also hold { named: replacement }, for names only in that role's map. A models
 * file may also say what a model reads, since an endpoint doesn't report it reliably:
 * reads: { named: ['images', 'files'] }.
 */
export function modelPlan({ models = null, map = null, model = null, reviewerModel = null, speechModel = null, imageModel = null } = {}) {
  const plan = { reply: null, reviewer: null, speech: null, image: null, transcribe: null, map: {} };
  if (models != null) {
    if (typeof models !== 'object' || Array.isArray(models)) throw new Error('A models file is a JSON object: { "reply": "...", "reviewer": "...", "speech": "...", "image": "...", "map": { "named": "replacement" } }.');
    for (const [key, value] of Object.entries(models)) {
      if (key === 'map') for (const [from, to] of Object.entries(value || {})) plan.map[from] = named(to, `map's ${from}`);
      else if (key === 'reads') plan.reads = Object.fromEntries(Object.entries(value || {}).map(([from, kinds]) => [from, [].concat(kinds)]));
      else if (OTHER_ROLES.includes(key)) { if (value != null) plan[key] = named(value, key); }
      else if (!ROLES.includes(key)) throw new Error(`A models file has no "${key}": its roles are ${[...ROLES, ...OTHER_ROLES].join(', ')}, map and reads.`);
      else if (value && typeof value === 'object') for (const [from, to] of Object.entries(value)) plan.map[from] = named(to, `${key}'s ${from}`);
      else if (value != null) plan[key] = named(value, key);
    }
  }
  for (const [from, to] of Object.entries(map || {})) plan.map[from] = named(to, `--map ${from}`);
  if (model) plan.reply = named(model, '--model');
  if (reviewerModel) plan.reviewer = named(reviewerModel, '--reviewer-model');
  if (speechModel) plan.speech = named(speechModel, '--speech-model');
  if (imageModel) plan.image = named(imageModel, '--image-model');
  return [...ROLES, ...OTHER_ROLES].some((role) => plan[role]) || Object.keys(plan.map).length ? plan : null;
}

/** --map a=b, repeated: { a: b }, or null without any. */
export function mapOf(pairs = []) {
  const map = {};
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    if (at < 1 || at === pair.length - 1) throw new Error(`--map takes <named model>=<model on your endpoint>, not "${pair}".`);
    map[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return Object.keys(map).length ? map : null;
}

/**
 * What a person must hear about the models each agent ends up with: a reviewer that is the model it
 * checks, since the point of the check is a second model. agents: [{ slug, graph }].
 */
export function modelWarnings(agents, plan) {
  const warnings = [];
  for (const { slug, graph } of agents) {
    for (const { step, model, role } of stepModels(applyModels(graph, plan))) {
      if (role !== 'reviewer') continue;
      const writer = stepModels(applyModels(graph, plan)).find((item) => item.step === step && item.field === 'model')?.model;
      if (writer && writer === model) warnings.push(`${slug}, step "${step}": the reviewer is ${model}, the same model that writes the reply${plan?.reply && !plan.reviewer ? ' (--model replaces the reviewer too)' : ''}. The point of the check is a second model: give it another with --reviewer-model <id>.`);
    }
  }
  return warnings;
}
