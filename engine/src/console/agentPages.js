/**
 * The console's Agents: the list, by where each lives; a new agent; an agent's page, with the form for a
 * simple one (agentShape.js) or a read-only list of steps for one made elsewhere; how it looks; testing it
 * on the real run path; its file; removing it. An agent is a part of a package's document, changed through
 * the library. No Node built-ins.
 */
import { graphAgentSlugs, graphKnowledgeRefs } from '../agents/graph.js';
import { stepManifest } from '../agents/steps/index.js';
import { PROFILE_LIMITS, profileLook, profileSettings } from '../learner/settings.js';
import { activityKeys, courseCodes } from '../server/library.js';
import { forgetChat } from '../server/learner.js';
import { applyModels, stepModels } from '../server/models.js';
import { graphOf } from '../server/runtime.js';
import { CONSOLE_SCRIPT } from './client.js';
import { formOf, graphFrom } from './agentShape.js';
import { choose, esc, FORMS_CSS, say, text, toggle } from './forms.js';
import { activitiesUsing, addAgent, agentAt, agentsIn, changeAgent, clean, group, knowledgeIn, linesOf, NO_STORE, OWN, placeLabel, plural, refused, ROWS_CSS } from './places.js';

const NAME_CHARS = 80;
const INSTRUCTION_CHARS = 20000;
const WHAT_FOR_CHARS = 600;
const MOST_KNOWLEDGE = 5;
const TEST_CHARS = 4000;
const TEST_USER = 'console-test';

// An agent the form made names the model "default", which only a role can make a real one.
const namesDefault = (graph) => stepModels(graph).some((row) => row.model === 'default');
const lacksModel = (graph, using) => !using.roles.reply || namesDefault(applyModels(graph, using.plan));
/** What says no model will answer for these agents, and the way to one. */
export const noModelNotice = (using, agents) => (agents.some((agent) => lacksModel(agent.graph, using)) ? '<p class="notice">No model writes replies yet, so this can’t answer. <a href="/console/models">Set one up in Models</a>.</p>' : '');
const remembers = (graph) => graph.nodes.some((node) => node.type === 'memory' || node.config?.tools?.memory);
const pillFor = (agent) => (agent.chat_page ? (agent.chat_page.status === 'paused' ? '<span class="v-pill">Chat page paused</span>' : '<span class="v-pill is-open">Chat page on</span>') : '<span class="v-pill">No chat page</span>');

// What an agent uses, in a few words: the model now, the knowledge it searches, whether it is checked.
function usesWords(agent, entry, using) {
  const models = [...new Set(stepModels(applyModels(agent.graph, using.plan)).filter((row) => row.role !== 'reviewer').map((row) => row.model))].filter((model) => model !== 'default');
  const searched = graphKnowledgeRefs(agent.graph).map((ref) => knowledgeIn(entry).find((kb) => kb.ref === ref)?.name || ref);
  return [models.length ? models.join(', ') : 'No model yet', ...(searched.length ? [`Searches ${searched.join(', ')}`] : []), ...(agent.graph.nodes.some((node) => node.type === 'vetting') ? ['Checks each reply'] : [])].join(' · ');
}

function activityLinks(agent, entry, entries) {
  const used = activitiesUsing(entry, agent);
  if (!used.length) return null;
  const code = courseCodes(entries.map((item) => item.doc)).get(entry.doc);
  const all = entry.doc.course.activities;
  const keys = activityKeys(all);
  return used.map((activity) => `<a href="/console/courses/${esc(code)}/activities/${esc(keys[all.indexOf(activity)])}">${esc(activity.title)}</a>`).join(', ');
}

// --- The list -----------------------------------------------------------------------------------------

function agentRow(agent, entry, entries, using) {
  const used = activityLinks(agent, entry, entries);
  return `<li class="row"><div class="row-what"><a href="/console/agents/${esc(agent.slug)}"><strong>${esc(agent.name)}</strong></a><span class="v-note">${esc(usesWords(agent, entry, using))}</span><span class="v-note">${used ? `Used in ${used}` : 'Not in an activity'}</span></div>${pillFor(agent)}</li>`;
}

function newAgentForm(entries) {
  // A course, or a package that holds knowledge: elsewhere a new agent is on its own.
  const places = entries.filter((entry) => entry.doc.course || knowledgeIn(entry).length);
  const knowledgeFor = (entry) => (knowledgeIn(entry).length ? `<fieldset class="one-of" data-show-when="place=${esc(entry.id)}"><legend class="v-label">Knowledge bases it searches</legend><div class="tools">${knowledgeIn(entry).map((kb) => toggle('knowledge', kb.name, !entry.doc.course, { value: kb.ref })).join('')}</div></fieldset>` : '');
  return `<section class="block" aria-labelledby="new-title">
<h2 id="new-title">New agent</h2>
<form class="v-card stack" id="new-agent" data-api="POST agents">
${text('name', 'Its name', '', { required: true, maxlength: NAME_CHARS, autocomplete: 'off', placeholder: 'e.g. Research help desk' })}
${text('instructions', 'Its instructions', '', { rows: 5, required: true, maxlength: INSTRUCTION_CHARS, placeholder: 'e.g. You help students find and judge sources. Keep replies short, and ask what they have tried before you suggest anything.', hint: 'What it does and how it talks. You can add knowledge, a check and more on its page.' })}
${places.length ? choose('place', 'Where it lives', OWN, [{ value: OWN, label: 'On its own' }, ...places.map((entry) => ({ value: entry.id, label: placeLabel(entry) }))], { hint: 'An agent searches only the knowledge bases beside it. A course’s agents travel with the course’s file.' }) : `<input type="hidden" name="place" value="${OWN}">`}
${places.map(knowledgeFor).join('')}
<div class="actions"><button class="v-btn is-primary" type="submit">Create</button></div>${say()}
</form>
<div class="v-card stack from-file" id="agent-file" data-say-box>
<h3>From a file</h3>
<p class="v-note">An agent or a package (<code>.agent.json</code>, <code>.viable.json</code> or <code>.viable.zip</code>) from the Developer Platform or another Engine. A chat page in it starts paused.</p>
<div class="v-form"><label class="v-label" for="agent-upload">Choose the file</label><input class="v-input" id="agent-upload" type="file" accept=".zip,.json" data-upload="POST courses/from-file"></div>${say()}
</div>
</section>`;
}

async function listBody({ library, store, settings }) {
  const entries = await library.entries();
  const using = await settings.resolve();
  const inCourses = entries.filter((entry) => entry.doc.course && agentsIn(entry).length);
  const own = entries.filter((entry) => !entry.doc.course).flatMap((entry) => agentsIn(entry).map((agent) => agentRow(agent, entry, entries, using)));
  const any = inCourses.length || own.length;
  return `<h1>Agents</h1>
<p class="v-lead">An agent is what answers: its instructions, what it searches, and whether a second model checks it. <a href="/console/models">Models</a> says which model does what.</p>
${store ? '' : NO_STORE}
${noModelNotice(using, entries.flatMap(agentsIn))}
<section class="block" aria-label="Agents">
${any ? '' : '<p class="v-empty">No agents yet. Make the first one below.</p>'}
${inCourses.map((entry) => group(entry.doc.course.title, agentsIn(entry).map((agent) => agentRow(agent, entry, entries, using)))).join('')}
${own.length ? group(inCourses.length ? 'On their own' : null, own) : ''}
</section>
${store ? newAgentForm(entries) : ''}`;
}

// --- An agent's page ----------------------------------------------------------------------------------

/** How an agent looks on a page, the same form on its page and its chat page's. */
export function lookForm(agent, version, { id = 'look-form' } = {}) {
  const look = profileLook(agent.profile || {}, agent.name);
  return `<form class="stack" id="${id}" data-api="PUT agents/${esc(agent.slug)}/look" data-guard>
<input type="hidden" name="version" value="${version}">
${text('title', 'Title', look.title, { required: true, maxlength: PROFILE_LIMITS.title, hint: look.avatar_url ? 'It keeps the picture that came with it.' : 'Its first letter, in the colour below, is its avatar.' })}
${text('tagline', 'A line under it', look.tagline, { maxlength: PROFILE_LIMITS.tagline, hint: 'Empty for none.' })}
${text('greeting', 'Greeting', look.greeting, { rows: 3, maxlength: PROFILE_LIMITS.greeting, hint: 'The first thing someone reads. Empty for none.' })}
${text('starters', 'Questions to start with', look.starters.join('\n'), { rows: 4, hint: `Up to ${PROFILE_LIMITS.starters}, one per line.` })}
${text('placeholder', 'In the message box', look.placeholder, { maxlength: PROFILE_LIMITS.placeholder })}
${text('notice', 'Notice', look.notice, { rows: 2, maxlength: PROFILE_LIMITS.notice, hint: 'Under the message box: what the AI is, and what not to share. Empty for none.' })}
<div class="fields two">
${text('color', 'Colour', look.color, { type: 'color', hint: 'On its chat page. A course has its own.' })}
${choose('theme', 'Light or dark', look.theme, [{ value: 'auto', label: 'As the visitor’s device is set' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }])}
</div>
<div class="actions"><button class="v-btn" type="submit">Save the look</button></div>${say()}
</form>`;
}

function simpleForm(agent, entry, values, using) {
  const kbs = knowledgeIn(entry);
  const reply = using.roles.reply?.model;
  const reviewer = using.roles.reviewer?.model;
  return `<form class="stack" id="agent-form" data-api="PUT agents/${esc(agent.slug)}" data-guard>
<input type="hidden" name="version" value="${entry.meta.version}">
${text('name', 'Its name', agent.name, { required: true, maxlength: NAME_CHARS })}
${text('description', 'What it is for', agent.description, { rows: 2, maxlength: WHAT_FOR_CHARS, hint: 'For whoever looks after it. Learners and visitors don’t see this.' })}
${text('instructions', 'Its instructions', values.instructions, { rows: 8, required: true, maxlength: INSTRUCTION_CHARS, hint: entry.doc.course ? 'In an activity, How the AI helps is added to these.' : '' })}
<fieldset class="one-of"><legend class="v-label">Knowledge bases it searches</legend>
${kbs.length ? `<small class="v-note">Searched with every message; it is told to answer from what it finds.</small><div class="tools">${kbs.map((kb) => toggle('knowledge', kb.name, values.knowledge.includes(kb.ref), { value: kb.ref })).join('')}</div>` : `<small class="v-note">None beside it yet. <a href="/console/knowledge?place=${esc(entry.id)}">Add a knowledge base</a>.</small>`}
</fieldset>
<fieldset class="one-of"><legend class="v-label">What else it does</legend><div class="tools">
${toggle('check', 'Check each reply with a second model', values.check, { hint: `A reviewer checks each reply against the instructions. One that fails is rewritten, up to 3 tries, and if none passes the person is told so. Replies then arrive whole, not word by word. ${reviewer ? `${reviewer} reviews.` : 'No reviewer is set in Models yet, so the reply model reviews itself.'}` })}
${toggle('web', 'Read web pages it is given', values.web, { hint: 'It reads one public https page at a time, given its exact address. It can’t search the web.' })}
${toggle('memory', 'Remember who it talks to', values.memory, { hint: 'It can keep lasting facts about each learner or visitor between conversations, on this server.' })}
<small class="v-note">With either of the last two, the model chooses what to do, so one message can take several model calls.</small>
</div></fieldset>
<p class="v-note">${reply ? `It writes with <code>${esc(reply)}</code>, the model for replies.` : 'No model writes replies yet.'} <a href="/console/models">Change it in Models</a>.</p>
<div class="actions"><button class="v-btn is-primary" type="submit">Save</button></div>${say()}
</form>`;
}

function readOnlySteps(agent, using) {
  const models = stepModels(applyModels(agent.graph, using.plan));
  const told = new Set();
  const rows = agent.graph.nodes.filter((node) => node.type !== 'note').map((node) => {
    const manifest = stepManifest(node.type);
    const own = models.filter((row) => row.step === node.id).map((row) => `${row.role === 'reviewer' ? 'Reviewer' : 'Model'}: <code>${esc(row.model)}</code>`).join(' · ');
    // What a kind of step does is said once.
    const summary = manifest?.summary && !told.has(node.type) ? manifest.summary : '';
    told.add(node.type);
    return `<li><strong>${esc(manifest?.label || node.type)}</strong> <code>${esc(node.id)}</code>${own ? `<br><span class="v-note">${own}</span>` : ''}${summary ? `<br><small class="v-note">${esc(summary)}</small>` : ''}</li>`;
  }).join('');
  return `<p class="notice">This agent’s steps were made elsewhere and run as they are. To change them, change it on the Developer Platform, then add it here again. Its look and its chat page can be changed here.</p>
<ol class="steps">${rows}</ol>`;
}

async function agentBody({ library, settings, store }, match) {
  const { entry, agent, entries } = await agentAt(library, match[1]);
  const using = await settings.resolve();
  const values = formOf(agent.graph);
  const used = activityLinks(agent, entry, entries);
  const slug = esc(agent.slug);
  const version = entry.meta.version;
  const inUse = whyKept(entry, agent);
  return {
    title: `${agent.name} · Agents`,
    body: `<nav class="crumbs" aria-label="Where you are"><a href="/console/agents">Agents</a>${entry.doc.course ? ` / ${esc(entry.doc.course.title)}` : ''}</nav>
<h1>${esc(agent.name)}</h1>
<div class="share-line"><a href="/console/chat-pages/${slug}">${pillFor(agent)}</a><span class="v-note">${used ? `Used in ${used}` : 'Not in an activity'}</span></div>
${store ? '' : NO_STORE}
${noModelNotice(using, [agent])}
${version === 0 ? `<p class="notice">This agent comes from <code>${esc(entry.file)}</code>. The first change makes a copy on this server, at the same address, and the file is no longer read.</p>` : ''}
<section class="block" aria-labelledby="does-title">
<h2 id="does-title">What it does</h2>
${values ? simpleForm(agent, entry, values, using) : readOnlySteps(agent, using)}
</section>
<section class="block" aria-labelledby="test-title">
<h2 id="test-title">Test it</h2>
<p class="v-note">This runs the agent as it is saved, the way a real message does. It uses the models set in Models, on this server’s keys, so it counts as a real call. Each message starts afresh${entry.doc.course ? ', without any activity’s How the AI helps' : ''}. ${remembers(agent.graph) ? 'Only what it remembers is kept, under a test visitor.' : 'Nothing is kept.'}</p>
<form class="test" id="test-agent" data-run="POST agents/${slug}/test" data-into="test-found">
<label class="sr" for="test-message">A message to send it</label><textarea class="v-input" id="test-message" name="message" rows="2" required maxlength="${TEST_CHARS}" placeholder="What someone might ask"></textarea>
<div class="actions"><button class="v-btn" type="submit">Send</button></div>
</form>
<div id="test-found" class="test-found" aria-live="polite"></div>
</section>
<section class="block" aria-labelledby="look-title">
<h2 id="look-title">How it looks on a page</h2>
<p class="v-note">On its chat page, and in the activities that use it.</p>
${lookForm(agent, version)}
</section>
<section class="block" aria-labelledby="page-title" data-say-box>
<h2 id="page-title">Its chat page</h2>
${agent.chat_page ? `<p class="v-note">${agent.chat_page.status === 'paused' ? 'Paused: its link says it isn’t available.' : 'On: anyone with its link can use it.'}</p><div class="actions file-actions"><a class="v-btn is-small" href="/console/chat-pages/${slug}">Its link, limits and sites</a></div>` : `<p class="v-note">A chat page puts this agent at a link, and as a chat button on a website. Nothing is public until you turn it on.</p><div class="actions file-actions"><a class="v-btn is-small" href="/console/chat-pages/${slug}">Set one up</a></div>`}
</section>
<section class="block" aria-labelledby="file-title" data-say-box>
<h2 id="file-title">The agent as a file</h2>
<p class="v-note">Download it to keep it, or to open it on the Developer Platform or another Engine. On the Developer Platform, models it doesn’t have become its default, and the import says so.</p>
<div class="actions file-actions"><a class="v-btn is-small" href="/console/api/agents/${slug}/download">Download</a>
${inUse ? '' : `<button class="v-btn is-small danger" type="button" id="remove-agent" data-api="DELETE agents/${slug}" data-confirm="Remove “${esc(agent.name)}” from this server? ${agent.chat_page ? 'Its chat page goes with it, and what visitors said there. ' : ''}This can’t be undone. Download it first if you may want it." data-yes="Remove">Remove it</button>`}</div>${inUse ? `<p class="v-note part-note">${esc(inUse)}</p>` : ''}${say()}
</section>`,
    css: AGENT_CSS
  };
}

const AGENT_CSS = `.steps{margin:14px 0 0;padding:0 0 0 22px}
.steps li{padding:5px 0;line-height:1.45}
.steps strong{font-weight:600;color:var(--public-ink)}
.steps small{font-size:.875rem}
.test{display:grid;gap:10px;margin-top:12px;max-width:680px}
.test textarea{min-height:0}
.test-found{display:grid;gap:10px;max-width:680px;margin-top:14px}
.test-found:empty{display:none}
.test-found h3{font-size:.9375rem;font-weight:600;letter-spacing:0}
.test-reply{margin:0;padding:12px 14px;border-radius:var(--radius-sm);background:var(--field-mist);color:var(--public-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.test-found ol,.test-found ul{display:grid;gap:4px;margin:0;padding:0 0 0 20px;font-size:.9375rem}
.test-found strong{font-weight:600;color:var(--public-ink)}
.test-bad{margin:0;color:var(--pencil-red);overflow-wrap:anywhere}
.share-line a{text-decoration:none}`;

// --- Testing it ---------------------------------------------------------------------------------------

// A provider's own words, without a key if it says one back.
const scrubbed = (message, using) => [...Object.values(using.roles), using.fallback].reduce((said, role) => (role?.apiKey ? said.replaceAll(role.apiKey, '[its key]') : said), String(message)).slice(0, 600);

const REVIEW_WORDS = { passed: 'passed', unverified: 'none passed', attention: 'needs attention' };

function stepDone(step, using) {
  const out = step.output || {};
  const facts = [
    ...(step.model ? [step.model] : []),
    ...(step.nodeType === 'knowledge' ? [`${plural(out.count ?? 0, 'passage')} found${out.results?.length ? `, in ${[...new Set(out.results.map((item) => item.title))].slice(0, 3).join(', ')}` : ''}`] : []),
    ...(step.nodeType === 'vetting' && out.outcome ? [`${REVIEW_WORDS[out.outcome] || out.outcome} after ${plural(out.attempts ?? 0, 'review')}`, ...(out.verification_model ? [`reviewed by ${out.verification_model}`] : [])] : []),
    ...(step.nodeType === 'agent' && out.tool_calls?.length ? [`${plural(out.tool_calls.length, 'tool call')}: ${[...new Set(out.tool_calls.map((call) => call.tool || call.name))].join(', ')}`] : []),
    `${(step.durationMs / 1000).toFixed(1)} s`
  ];
  return `<li><strong>${esc(stepManifest(step.nodeType)?.label || step.nodeType)}</strong> ${esc(facts.join(' · '))}${step.error ? `<br><span class="test-bad">${esc(scrubbed(step.error, using))}</span>` : ''}</li>`;
}

function testAnswer(result, using) {
  const steps = result.steps.filter((step) => !['input', 'output', 'note'].includes(step.nodeType));
  const sources = result.output.citations || [];
  const reply = result.output.text || (result.output.attachments?.length ? `(${plural(result.output.attachments.length, 'attachment')}, not shown here)` : '(an empty reply)');
  return `<h3>Its reply</h3><p class="test-reply">${esc(scrubbed(reply, using))}</p>
${sources.length ? `<h3>Sources</h3><ol>${sources.map((source) => `<li>${esc(source.title || source.url || 'A passage')}${source.heading ? ` · ${esc(source.heading)}` : ''}</li>`).join('')}</ol>` : ''}
<h3>What it did</h3><ol>${steps.map((step) => stepDone(step, using)).join('')}</ol>
<p class="v-note">${esc(plural(result.modelCalls, 'model call'))} · ${esc(plural(result.usage?.total ?? 0, 'token'))}</p>`;
}

async function testAgent({ served, runTurn, settings, request }, match, body) {
  const message = clean(body?.message, TEST_CHARS);
  if (!message) return { html: '<p class="v-note">Type a message first.</p>' };
  const agent = served.get(match[1]);
  if (!agent) throw refused('This agent isn’t being served, so it can’t be tested: its course may be closed.', 409, 'agent_not_served');
  const using = await settings.resolve();
  if (lacksModel(graphOf(agent), using)) return { html: '<p class="test-bad">No model writes replies yet, so nothing was sent. <a href="/console/models">Set one up in Models</a>.</p>' };
  try {
    // teaching: false, since How the AI helps is an activity's, and this is the agent alone.
    const result = await runTurn(agent, { text: message, history: [], context: null, teaching: false, silent: true, signal: request.signal, ...(remembers(graphOf(agent)) ? { user: TEST_USER } : {}) });
    return { html: testAnswer(result, using) };
  } catch (error) {
    return { html: `<p class="test-bad">It didn’t answer: ${esc(scrubbed(error?.message || 'something went wrong', using))}</p>${error?.agentSteps?.length ? `<h3>What it did</h3><ol>${error.agentSteps.filter((step) => !['input', 'output', 'note'].includes(step.nodeType)).map((step) => stepDone(step, using)).join('')}</ol>` : ''}` };
  }
}

// --- Changes ------------------------------------------------------------------------------------------

// What the form says, checked against what is beside the agent.
function formFields(body, doc = {}) {
  const name = clean(body?.name, NAME_CHARS);
  const instructions = clean(body?.instructions, INSTRUCTION_CHARS);
  if (!name) throw refused('Give it a name.');
  if (!instructions) throw refused('Write its instructions: what it does and how it talks.');
  const knowledge = Array.isArray(body?.knowledge) ? body.knowledge.map(String) : [];
  if (knowledge.some((ref) => !(doc.knowledge_bases || []).some((kb) => kb.ref === ref))) throw refused('That knowledge base isn’t beside this agent. An agent searches only the ones in its package.');
  if (knowledge.length > MOST_KNOWLEDGE) throw refused(`An agent can search at most ${MOST_KNOWLEDGE} knowledge bases.`);
  return { name, instructions, knowledge };
}

/** A new agent, from a form's name, instructions and knowledge. */
export function newAgent(body, doc) {
  const fields = formFields(body, doc);
  return { name: fields.name, description: null, graph: graphFrom(fields) };
}

async function createAgent({ library }, _match, body) {
  const place = String(body?.place ?? OWN);
  const entry = place === OWN ? null : (await library.get(place));
  return { go: `/console/agents/${await addAgent(library, place, newAgent(body, entry?.doc))}` };
}

async function saveAgent({ library }, match, body) {
  await changeAgent(library, match[1], body?.version, (agent, doc) => {
    if (!formOf(agent.graph)) throw refused('This agent’s steps were made elsewhere. Change them on the Developer Platform, then add it here again.');
    const fields = formFields(body, doc);
    if (agent.profile?.title === agent.name) agent.profile.title = fields.name;
    agent.name = fields.name;
    agent.description = clean(body.description, WHAT_FOR_CHARS) || null;
    agent.graph = graphFrom({ ...fields, check: body.check === true, web: body.web === true, memory: body.memory === true });
    if (!doc.course && doc.agents.length === 1) doc.title = fields.name;
  }, clean(body?.name, 80));
  return { said: 'Saved. Its next message uses it.' };
}

// What keeps an agent from being removed, in a sentence, or null.
function whyKept(entry, agent) {
  const activities = activitiesUsing(entry, agent).map((activity) => `“${activity.title}”`);
  if (activities.length) return `${activities.join(', ')} ${activities.length === 1 ? 'uses' : 'use'} this agent, so it can’t be removed. Choose another AI there first.`;
  const callers = agentsIn(entry).filter((other) => other.slug !== agent.slug && graphAgentSlugs(other.graph).some((slug) => slug === agent.slug || slug === agent.ref)).map((other) => `“${other.name}”`);
  return callers.length ? `${callers.join(', ')} ${callers.length === 1 ? 'calls' : 'call'} this agent, so it can’t be removed. Change ${callers.length === 1 ? 'it' : 'them'} first.` : null;
}

async function removeAgent({ library, store }, match) {
  const { entry, agent } = await agentAt(library, match[1]);
  const kept = whyKept(entry, agent);
  if (kept) throw refused(kept, 409, 'agent_in_use');
  // The last thing in a package takes the package with it; knowledge beside it stays, for the next agent.
  if (!entry.doc.course && agentsIn(entry).length === 1 && !knowledgeIn(entry).length) await library.remove(entry.id);
  else await library.change(entry.id, null, (doc) => { doc.agents = doc.agents.filter((item) => (item.slug || item.ref) !== agent.slug); }, `Removed ${agent.name}`);
  await forgetChat(store, agent.slug);
  return { go: '/console/agents' };
}

export const agentPages = [
  {
    id: 'agents', title: 'Agents',
    render: async (tools) => ({ body: await listBody(tools), css: `${FORMS_CSS}\n${ROWS_CSS}\n.from-file{margin-top:14px}.from-file h3{font-size:1rem;font-weight:600;letter-spacing:0}`, script: CONSOLE_SCRIPT }),
    api: [
      ['POST', /^agents$/, createAgent],
      ['PUT', /^agents\/([\w.-]+)$/, saveAgent],
      ['DELETE', /^agents\/([\w.-]+)$/, removeAgent],
      ['PUT', /^agents\/([\w.-]+)\/look$/, async ({ library }, match, body) => {
        await changeAgent(library, match[1], body?.version, (agent) => {
          agent.profile = profileSettings({ ...agent.profile, title: body.title, tagline: body.tagline, greeting: body.greeting, starters: linesOf(body.starters), placeholder: body.placeholder, notice: body.notice ?? '', color: body.color, theme: body.theme }, agent.name);
        }, 'The look');
        return { said: 'Saved. It shows the next time a page is opened.' };
      }],
      ['POST', /^agents\/([\w.-]+)\/test$/, testAgent],
      ['GET', /^agents\/([\w.-]+)\/download$/, async ({ library }, match) => {
        const { entry, agent } = await agentAt(library, match[1]);
        const file = await library.download(entry.id, { agent: agent.ref ?? agent.slug });
        return new Response(file.bytes, { status: 200, headers: { 'content-type': file.type, 'content-disposition': `attachment; filename="${file.name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      }]
    ]
  },
  {
    id: 'agent', title: 'Agent', section: 'agents', nav: false,
    match: /^agents\/([\w.-]+)$/,
    render: async (tools, match) => { const made = await agentBody(tools, match); return { ...made, css: `${FORMS_CSS}\n${ROWS_CSS}\n${made.css}`, script: CONSOLE_SCRIPT }; },
    api: []
  }
];
