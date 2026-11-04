/**
 * Where things live, for the Agents, Chat pages and Knowledge pages. Each agent and knowledge base lives in
 * a package, since refs are per package and a course travels as one file: a course's stay in its package,
 * and anything else is on its own, in a package with no course. No Node built-ins.
 */
import { slugOf } from '../server/library.js';
import { agentsToServe, pickAgent } from '../server/runtime.js';
import { esc } from './forms.js';

export const refused = (message, status = 400, code = 'invalid_request') => Object.assign(new Error(message), { status, code });
export const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
export const linesOf = (value) => String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const utc = (at) => `${String(at).slice(0, 16).replace('T', ' ')} UTC`;
export const OWN = 'own';
export const NO_STORE = '<p class="notice">This server has no store, so nothing here can be changed. Start it with a data folder (<code>viable-engine start</code>), or deploy it with a store.</p>';

/** A ref no other of its kind in the package has. */
export function freeRef(base, taken, fallback) {
  const start = slugOf(base, fallback).slice(0, 40);
  let ref = start;
  for (let n = 2; taken.has(ref); n += 1) ref = `${start}-${n}`;
  return ref;
}

/** The agents an entry holds, in one shape: { slug, ref, name, description, graph, profile, chat_page }. ref is null for an agent file that hasn't been changed yet. */
export function agentsIn(entry) {
  let served;
  try { served = agentsToServe([entry]); } catch { return []; }
  return served.map(({ slug, ref, name, description }) => {
    const item = ref ? entry.doc.agents.find((agent) => agent.ref === ref) : entry.doc;
    return { slug, ref, name, description, graph: pickAgent(entry.doc, ref).graph, profile: item.profile ?? null, chat_page: item.chat_page ?? null };
  });
}

export const knowledgeIn = (entry) => entry.doc.knowledge_bases || [];
export const activitiesUsing = (entry, agent) => (entry.doc.course?.activities || []).filter((activity) => agent.ref != null && activity.agent_ref === agent.ref);

/** The agent at this slug and the package it lives in, or a refusal a page can show. */
export async function agentAt(library, slug) {
  const entries = await library.entries();
  for (const entry of entries) {
    const agent = agentsIn(entry).find((item) => item.slug === slug);
    if (agent) return { entry, agent, entries };
  }
  throw refused('That agent isn’t on this server.', 404, 'agent_not_found');
}

/** A change to one agent, on the version the person saw: work(agent, doc) changes it and may refuse. */
export async function changeAgent(library, slug, version, work, note) {
  const { entry } = await agentAt(library, slug);
  return library.change(entry.id, version, (doc) => {
    const agent = doc.agents.find((item) => (item.slug || item.ref) === slug);
    if (!agent) throw refused('That agent isn’t on this server.', 404, 'agent_not_found');
    return work(agent, doc);
  }, note);
}

/** A new agent, on its own or in the package named: where it answers. */
export async function addAgent(library, place, agent) {
  if (place === OWN) {
    const { id } = await library.add({ format: 'viable.course-package', version: 1, title: agent.name, agents: [{ ref: freeRef(agent.name, new Set(), 'agent'), ...agent }] });
    return (await library.get(id)).doc.agents[0].slug;
  }
  const made = await library.change(place, null, (doc) => {
    const agents = doc.agents ||= [];
    if (agents.length >= 20) throw refused('A package holds at most 20 agents.');
    const ref = freeRef(agent.name, new Set(agents.map((item) => item.ref)), 'agent');
    agents.push({ ref, ...agent });
    return ref;
  }, `Added ${agent.name}`);
  return made.doc.agents.find((item) => item.ref === made.answer).slug;
}

/** What a package is called where a person chooses it. */
export function placeLabel(entry) {
  if (entry.doc.course) return `In the course “${entry.doc.course.title}”`;
  const names = [...agentsIn(entry).map((agent) => agent.name), ...knowledgeIn(entry).map((kb) => kb.name)];
  return `With “${[...new Set(names)].slice(0, 2).join('” and “')}”`;
}

/** How each row of the three lists reads. */
export const ROWS_CSS = `.group{margin:26px 0 8px;font-size:1.0625rem;font-weight:600;letter-spacing:0}
.rows{margin:0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--public-rule)}
.row-what{display:grid;gap:2px;min-width:0}
.row-what a{color:var(--public-ink);text-decoration:none}
.row-what a:hover{text-decoration:underline}
.row-what strong{font-weight:600}
.row .say,.row .actions{grid-column:1/-1}
.v-pill.is-open{border-color:transparent;background:var(--field-sage);color:var(--public-ink)}
[data-show-when][hidden]{display:none}
.stack{display:grid;gap:16px;max-width:680px}
.tools{display:grid;gap:10px}
.danger{border-color:var(--pencil-red);color:var(--pencil-red)}
.file-actions{margin-top:12px}
.part-note{margin-top:8px}`;

export const group = (title, rows) => `${title ? `<h2 class="group">${esc(title)}</h2>` : ''}<ul class="rows">${rows.join('')}</ul>`;
