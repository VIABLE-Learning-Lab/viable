/**
 * Everything an operator or an AI needs to know about a package before running it elsewhere: one
 * report, exact for machines (the object it returns) and printed for people by cli/inspect.js. No
 * Node built-ins.
 */
import { graphAgentSlugs } from '../agents/graph.js';
import { chatPageSettings, lookOf, profileSettings } from '../learner/settings.js';
import { readZip } from '../utils/zip.js';
import { applyModels, modelWarnings, stepModels } from './models.js';
import { agentsToServe, graphOf, packageAgent } from './runtime.js';
import { readsLocally } from './search.js';
import { TARGET_NAMES, stepLimit } from './targets.js';

const ROLE_ORDER = ['reply', 'reviewer', 'helper', 'speech', 'image', 'transcribe'];
const isPackage = (doc) => doc?.format === 'viable.course-package';

function modelRows(agents, plan) {
  const rows = new Map();
  for (const agent of agents) {
    const graph = graphOf(agent);
    const after = stepModels(applyModels(graph, plan));
    for (const item of stepModels(graph)) {
      const becomes = after.find((other) => other.step === item.step && other.field === item.field)?.model ?? item.model;
      const key = `${item.role}\u0000${item.model}\u0000${becomes}`;
      if (!rows.has(key)) rows.set(key, { role: item.role, model: item.model, replaced_by: becomes === item.model ? null : becomes, default: item.default === true, steps: [] });
      rows.get(key).steps.push(`${agent.slug}/${item.step}`);
    }
  }
  return [...rows.values()].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.model.localeCompare(b.model));
}

async function knowledgeRows(doc, zip, agents) {
  const searched = new Set(agents.flatMap((agent) => graphOf(agent).nodes.flatMap((node) => [node.type === 'knowledge' ? node.config?.knowledge_bases : null, node.config?.tools?.knowledge_bases]).filter(Array.isArray).flat()));
  const files = new Map((doc.files || []).map((file) => [file.ref, file]));
  const paths = new Set((doc.files || []).flatMap((file) => [file.path, file.text_path]).filter(Boolean));
  const inZip = zip ? await readZip(zip, (name) => paths.has(name), { binary: true }) : null;
  const rows = (doc.knowledge_bases || []).map((kb) => {
    const held = (kb.file_refs || []).map((ref) => files.get(ref)).filter(Boolean);
    const websites = (kb.websites || []).map((site) => ({ kind: site.kind || 'crawl', url: site.url, pages: site.urls?.length ?? null, snapshot_pages: site.snapshot?.length ?? 0, refresh_hours: site.refresh_hours ?? 0 }));
    return {
      ref: kb.ref, name: kb.name, searched: searched.has(kb.ref),
      files: held.length, text_copies: held.filter((file) => file.text_path != null).length,
      unread: held.filter((file) => !readsLocally(file)).map((file) => file.name),
      missing: inZip ? held.flatMap((file) => [file.path, file.text_path]).filter((path) => path && !inZip.has(path)) : [],
      websites,
      // On VIABLE, how it was searched; a package from before VIABLE wrote this doesn't say.
      search_on_viable: kb.search_mode ?? null
    };
  });
  // An agent file names knowledge bases it doesn't hold.
  for (const id of searched) {
    if (!rows.some((row) => row.ref === id)) rows.push({ ref: id, name: doc.requires?.knowledge_bases?.find((item) => item.id === id)?.name ?? id, searched: true, files: 0, text_copies: 0, unread: [], missing: [], websites: [], search_on_viable: null, absent: true });
  }
  return rows;
}

function knowledgeWarnings(rows) {
  const warnings = [];
  for (const kb of rows.filter((row) => row.searched)) {
    if (kb.absent) warnings.push(`Knowledge base "${kb.name}" has no files here, so its searches fail: add --knowledge ${kb.ref}=<folder>.`);
    const unread = kb.websites.filter((site) => !site.snapshot_pages);
    if (unread.length) warnings.push(`Knowledge base "${kb.name}" holds ${unread.length === 1 ? 'a website' : `${unread.length} websites`} (${unread[0].url}) with no snapshot, which ${unread.length === 1 ? 'isn\'t' : 'aren\'t'} searched here: run viable-harness knowledge refresh on the package.`);
    if (kb.websites.some((site) => site.refresh_hours)) warnings.push(`Knowledge base "${kb.name}" was read again on a schedule on VIABLE; here its snapshot stays as it is until you run viable-harness knowledge refresh and deploy again.`);
    if (kb.unread.length) warnings.push(`Knowledge base "${kb.name}" holds ${kb.unread.join(', ')} with no text copy, so its searches fail: download the package again from VIABLE, or add --knowledge ${kb.ref}=<folder>.`);
    if (kb.missing.length) warnings.push(`Knowledge base "${kb.name}" names ${kb.missing.join(', ')}, which the package's zip doesn't hold.`);
    if (kb.search_on_viable === 'hybrid') warnings.push(`Knowledge base "${kb.name}" was searched by keywords and meaning on VIABLE; here it is searched by keywords only, so some answers may find less.`);
  }
  return warnings;
}

// Each agent's chat page, as the package carries it: its address, who may frame it and its daily cap.
function chatPagesOf(doc, agents) {
  return agents.flatMap((agent) => {
    const item = isPackage(doc) ? (doc.agents || []).find((entry) => entry.ref === agent.ref) : doc;
    if (!item?.chat_page) return [];
    const settings = chatPageSettings(item.chat_page.settings || {}, agent.name);
    return [{ agent_ref: agent.ref, slug: agent.slug, status: item.chat_page.status || 'active', address: `/chat/${agent.slug}`, title: lookOf(profileSettings(item.profile || {}, agent.name)).title, sites: settings.allowed_sites, daily_limit: settings.daily_limit, ...(settings.limits.daily_cost ? { daily_cost: settings.limits.daily_cost } : {}) }];
  });
}

function callsOut(agents) {
  const calls = [];
  for (const agent of agents) {
    for (const node of graphOf(agent).nodes) {
      if (node.type === 'http' && node.config?.url) calls.push({ agent: agent.slug, step: node.id, kind: 'fetch_url', address: String(node.config.url) });
      if (node.type === 'component' && node.config?.manifest?.runs) {
        const { id, runs, receives = [], sends_to: sendsTo = [] } = node.config.manifest;
        calls.push({ agent: agent.slug, step: node.id, kind: `component_${runs.kind}`, component: id ?? null, address: runs.kind === 'mcp' ? null : runs.entry ?? null, ...(runs.kind === 'mcp' ? { starts: [runs.server?.command, ...(runs.server?.args || [])].map(String) } : {}), receives, sends_to: sendsTo });
      }
    }
  }
  return calls;
}

function stepRows(agents) {
  const rows = new Map();
  for (const agent of agents) {
    for (const node of graphOf(agent).nodes) {
      if (!rows.has(node.type)) rows.set(node.type, { type: node.type, count: 0, limits: {} });
      const row = rows.get(node.type);
      row.count += 1;
      for (const target of TARGET_NAMES) {
        const limit = stepLimit(node, target);
        if (limit) row.limits[target] = limit;
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.type.localeCompare(b.type));
}

/**
 * The report on what readPackage read: doc, zip, file (its name), plan (modelPlan, to see what a map
 * changes), target (for the next command). Throws if the package can't be served.
 */
export async function inspectPackage({ doc, zip = null, file = 'package', plan = null, target = null }) {
  const agents = agentsToServe([{ doc, zip, file, name: file.split(/[\\/]/).pop() }]);
  const activities = isPackage(doc) ? doc.course?.activities || [] : [];
  const knowledge = await knowledgeRows(doc, zip, agents);
  const models = modelRows(agents, plan);
  const calls = callsOut(agents);
  const pages = chatPagesOf(doc, agents);
  const aliases = [...new Set(models.filter((row) => !row.replaced_by && /^viable-/.test(row.model)).map((row) => row.model))];
  // A learner meets the agents nothing else calls, so those are the ones whose check matters here.
  const called = new Set(agents.flatMap((agent) => graphAgentSlugs(graphOf(agent))));
  const warnings = [
    ...modelWarnings(agents.map((agent) => ({ slug: agent.slug, graph: graphOf(agent) })), plan),
    ...aliases.map((name) => `${name} is VIABLE's own name for a model, which another endpoint won't know: replace it with --map ${name}=<model>.`),
    ...knowledgeWarnings(knowledge),
    ...agents.filter((agent) => !called.has(agent.slug) && !(graphOf(agent).nodes || []).some((node) => node.type === 'vetting')).map((agent) => `${agent.slug} has no check step, so a second model doesn't review its replies${plan?.reviewer ? ', and --reviewer-model does nothing for it' : ''}.`),
    ...pages.filter((page) => !page.sites?.length).map((page) => `${page.slug}: its chat page names no allowed sites, so any website can embed it, and each message costs you. Set them on VIABLE before you download, or in the package's chat_page.`),
    ...pages.filter((page) => page.daily_cost).map((page) => `${page.slug}: its daily spending cap (${page.daily_cost} dollars) isn't enforced here, since this server doesn't price calls. Its daily message cap is.`),
    ...agents.flatMap((agent) => graphAgentSlugs(graphOf(agent)).filter((slug) => !packageAgent(isPackage(doc) ? doc.agents : [], slug)).map((slug) => `${agent.slug} calls the agent "${slug}", which this file doesn't hold, so that step fails here.`)),
    ...calls.filter((call) => call.kind === 'fetch_url').map((call) => `${call.agent}, step "${call.step}" calls ${call.address}. A package leaves out a Fetch URL step's headers: if it needs a key, the step fails until you add one.`),
    ...calls.filter((call) => call.kind === 'component_http').map((call) => `${call.agent}, step "${call.step}" sends ${call.receives.join(', ') || 'nothing'} to ${call.address}, a component this package names (${call.component}). Read its manifest before learners use it.`),
    ...calls.filter((call) => call.kind === 'component_mcp').map((call) => `${call.agent}, step "${call.step}" asks to start a program on this computer: ${JSON.stringify(call.starts)}. It is refused unless you add --allow-component ${call.component}, and then it runs with your rights. Don't, unless you trust who wrote this package.`)
  ];
  const unplaced = models.filter((row) => !row.replaced_by).map((row) => row.model);
  const out = `./${agents[0].slug}-${target || '<target>'}`;
  return {
    object: 'harness.inspection',
    file,
    format: doc?.format ?? 'graph',
    title: doc?.title ?? doc?.course?.title ?? doc?.name ?? agents[0].name,
    exported_at: doc?.exported_at ?? null,
    agents: agents.map((agent) => ({ slug: agent.slug, ref: agent.ref, name: agent.name, description: agent.description, address: `/v1/agents/${agent.slug}/runs`, steps: graphOf(agent).nodes.length })),
    models,
    knowledge_bases: knowledge,
    chat_pages: pages,
    activities: activities.map((item) => ({ title: item.title, agent_ref: item.agent_ref ?? null, role: item.role ?? null, has_teaching: Boolean(item.teaching), release: item.release ?? null })),
    steps: stepRows(agents),
    calls_out: calls,
    settings: [
      { name: 'OPENAI_BASE_URL', secret: false, why: 'your OpenAI-compatible endpoint; every learner\'s message goes to it' },
      { name: 'OPENAI_API_KEY', secret: true, why: 'the key for that endpoint, if it needs one' },
      { name: 'VIABLE_HARNESS_TOKEN', secret: true, why: 'what callers send to run agents; the server refuses them until it is set' }
    ],
    warnings,
    // What VIABLE said it left out when this was downloaded.
    notes: Array.isArray(doc?.notes) ? doc.notes : [],
    next: {
      replace_models: unplaced.length ? [...new Set(unplaced)] : [],
      command: `viable-harness deploy ${target || '<target>'} ${file} --out ${out}`,
      targets: TARGET_NAMES
    }
  };
}
