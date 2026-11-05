/**
 * The console's Chat pages: the agents with a page, a new page (an agent on its own, in one short form), and
 * a page's own: who can reach it and what it costs, its link, QR code and chat button, its look, limits and
 * allowed sites. A page's settings go through chatPageSettings; how it looks is its agent's profile. No Node
 * built-ins.
 */
import { CHAT_PAGE_LIMITS, LOOK, chatPageSettings, profileLook } from '../learner/settings.js';
import { messagesToday } from '../server/learner.js';
import { lookForm, newAgent, noModelNotice } from './agentPages.js';
import { choose, esc, FORMS_CSS, hereOnly, qrSvg, reachOf, say, text } from './forms.js';
import { addAgent, agentAt, agentsIn, changeAgent, clean, knowledgeIn, linesOf, NO_STORE, OWN, plural, refused, ROWS_CSS } from './places.js';

// What a new page may do until someone says otherwise: the shared defaults, and one browser can't use up the day.
const NEW_PAGE = { limits: { visitor_per_day: 50 } };

// A page's own settings as a package holds them: its look stays the agent's profile.
const ownSettings = (settings) => Object.fromEntries(Object.entries(settings).filter(([key]) => !LOOK.includes(key)));
// A file's settings may not hold (a site that isn't an address): its page is still shown, on the defaults, to be put right.
const settingsOf = (agent) => { try { return chatPageSettings(agent.chat_page?.settings || NEW_PAGE, agent.name); } catch { return chatPageSettings(NEW_PAGE, agent.name); } };
const whoAndCost = (settings) => `Anyone with the link can use it, on this server’s model keys, up to ${settings.daily_limit} messages a day.`;

// --- The list -----------------------------------------------------------------------------------------

async function pageRow(agent, tools) {
  const settings = settingsOf(agent);
  const on = agent.chat_page.status !== 'paused';
  const { base } = reachOf(tools.origin, tools.addresses);
  const link = `${base}/chat/${agent.slug}`;
  const today = tools.store ? ` · ${await messagesToday(tools.store, agent.slug)} of ${settings.daily_limit} messages today` : '';
  const { title } = profileLook(agent.profile || {}, agent.name);
  return `<li class="row" id="page-${esc(agent.slug)}" data-say-box>
<div class="row-what"><a href="/console/chat-pages/${esc(agent.slug)}"><strong>${esc(title)}</strong></a><span class="v-note"><code>${esc(link)}</code>${esc(today)}</span></div>
<span class="v-pill${on ? ' is-open' : ''}">${on ? 'On' : 'Paused'}</span>
<div class="actions">
<button class="v-btn is-small" type="button" data-copy="${esc(link)}" aria-label="Copy the link to ${esc(title)}">Copy link</button>
<a class="v-btn is-small" href="/console/chat-pages/${esc(agent.slug)}" aria-label="Settings of ${esc(title)}">Settings</a>
<a class="v-btn is-small" href="/teacher?chat=${esc(agent.slug)}" aria-label="How ${esc(title)} is going">How it’s going</a>
${statusButton(agent, settings, `status-${agent.slug}`, title)}
</div>${say()}
</li>`;
}

function statusButton(agent, settings, id, title = '') {
  const on = agent.chat_page && agent.chat_page.status !== 'paused';
  const api = `POST chat-pages/${esc(agent.slug)}/status`;
  const named = title ? ` aria-label="${on ? 'Pause' : 'Turn on'} ${esc(title)}"` : '';
  return on
    ? `<button class="v-btn is-small" type="button" id="${esc(id)}"${named} data-api="${api}" data-body='${esc(JSON.stringify({ status: 'paused' }))}' data-said="Paused.">Pause</button>`
    : `<button class="v-btn is-small is-primary" type="button" id="${esc(id)}"${named} data-api="${api}" data-body='${esc(JSON.stringify({ status: 'active' }))}' data-confirm="${esc(whoAndCost(settings))}" data-yes="Turn it on" data-said="On.">Turn it on</button>`;
}

async function listBody(tools) {
  const { library, store, settings } = tools;
  const entries = await library.entries();
  const withPage = entries.flatMap((entry) => agentsIn(entry).filter((agent) => agent.chat_page));
  const using = await settings.resolve();
  const places = entries.flatMap((entry) => knowledgeIn(entry).map((kb) => ({ value: `${entry.id}/${kb.ref}`, label: entry.doc.course ? `${kb.name} (in ${entry.doc.course.title})` : kb.name })));
  return `<h1>Chat pages</h1>
<p class="v-lead">A chat page puts an agent at a link anyone can open, and as a chat button on your website.</p>
${store ? '' : NO_STORE}
${noModelNotice(using, withPage)}
<section class="block" aria-label="Chat pages">
${withPage.length ? `<ul class="rows">${(await Promise.all(withPage.map((agent) => pageRow(agent, tools)))).join('')}</ul>` : '<p class="v-empty">No chat pages yet.</p>'}
</section>
${store ? `<section class="block" aria-labelledby="new-title">
<h2 id="new-title">New chat page</h2>
<form class="v-card stack" id="new-page" data-api="POST chat-pages">
${text('name', 'Its title', '', { required: true, maxlength: CHAT_PAGE_LIMITS.title, autocomplete: 'off', placeholder: 'e.g. Ask the research desk' })}
${text('instructions', 'What it should do', '', { rows: 4, required: true, maxlength: 20000, placeholder: 'e.g. You help students find and judge sources. Keep replies short.' })}
${places.length ? choose('knowledge', 'What it answers from', '', [{ value: '', label: 'Only its instructions' }, ...places], { hint: 'It searches this with every message.' }) : '<p class="v-note">To have it answer from your own guides, <a href="/console/knowledge">add them in Knowledge</a> first, or choose them later on its agent’s page.</p>'}
<p class="v-note">${esc(whoAndCost(chatPageSettings(NEW_PAGE)))} You can change that next.</p>
<div class="actions"><button class="v-btn is-primary" type="submit">Create it</button></div>${say()}
</form>
</section>` : ''}`;
}

// --- A page's own -------------------------------------------------------------------------------------

function shareBlock(agent, settings, tools) {
  const reach = reachOf(tools.origin, tools.addresses);
  const { local, others, base } = reach;
  const slug = esc(agent.slug);
  const link = `${base}/chat/${agent.slug}`;
  const snippet = `<script src="${base}/embed.js" data-agent="${agent.slug}" async></script>`;
  const unreachable = local && !tools.addresses?.length;
  return `<section class="block" aria-labelledby="share-title">
<h2 id="share-title">Share it</h2>
${hereOnly(reach, tools.addresses)}
${[base, ...others].map((address) => `<div class="share-line"><code>${esc(`${address}/chat/${agent.slug}`)}</code><button class="v-btn is-small" type="button" data-copy="${esc(`${address}/chat/${agent.slug}`)}">Copy link</button></div>`).join('')}
${unreachable ? '' : qrSvg(link, { label: `A QR code for ${link}` })}
<h3>A chat button on your website</h3>
<div class="snippet"><code>${esc(snippet)}</code><button class="v-btn is-small" type="button" data-copy="${esc(snippet)}">Copy</button></div>
<ul class="how">
<li>On any site: paste it once into the page’s HTML, before <code>&lt;/body&gt;</code>. A chat button appears in the corner.</li>
<li>On LibGuides: for one guide, add a Media / Widget asset to a box and paste it. For every guide, an admin pastes it into Admin → Look &amp; Feel → Custom JS/CSS.</li>
<li>The button asks this server how to look, so a change here reaches it without pasting again.</li>
<li>${settings.allowed_sites.length ? `It shows only on ${esc(settings.allowed_sites.join(', '))}, as listed below.` : 'Any site can show it, until you list sites below.'}</li>
${/^https:/.test(base) ? '' : '<li>A site on https can load it only from a server on https, and this address isn’t.</li>'}
</ul>
<p class="v-note"><a href="/chat/${slug}" target="_blank" rel="noopener">Open the page here</a></p>
</section>`;
}

function settingsForm(agent, settings, version) {
  return `<form class="stack" id="page-settings" data-api="PUT chat-pages/${esc(agent.slug)}" data-guard>
<input type="hidden" name="version" value="${version}">
<div class="fields three">
${text('visitor_per_minute', 'Messages per visitor, per minute', settings.limits.visitor_per_minute, { type: 'number', min: CHAT_PAGE_LIMITS.visitorMinuteMin, max: CHAT_PAGE_LIMITS.visitorMinuteMax, required: true })}
${text('visitor_per_day', 'Messages per visitor, per day', settings.limits.visitor_per_day, { type: 'number', min: 0, max: CHAT_PAGE_LIMITS.visitorDayMax, hint: '0 for no limit of its own.' })}
${text('daily_limit', 'Messages for the whole page, per day', settings.daily_limit, { type: 'number', min: CHAT_PAGE_LIMITS.dailyMin, max: CHAT_PAGE_LIMITS.dailyMax, required: true })}
</div>
<p class="v-note">A visitor is one browser, with no sign-in. Days are counted in UTC. When the page reaches its limit, it says so until the next day. What visitors say is kept on this server, under an anonymous code.</p>
${settings.limits.daily_cost ? `<p class="notice">Its package sets a daily spending cap of ${settings.limits.daily_cost} dollars. This server doesn’t price calls, so that cap isn’t enforced here. The message limits are.</p>` : ''}
${text('allowed_sites', 'Sites that may show it', settings.allowed_sites.join('\n'), { rows: 3, placeholder: 'https://guides.example.edu', hint: `One address per line, up to ${CHAT_PAGE_LIMITS.sites}. Only these sites can show the button or put the page in a frame. Empty: any site can. The link itself opens for anyone either way.` })}
<div class="fields two">
${text('button_label', 'The button’s label', settings.launcher.label, { maxlength: CHAT_PAGE_LIMITS.launcherLabel, hint: 'Shown when someone points at it, and read by screen readers.' })}
${choose('button_side', 'Which corner', settings.launcher.position, [{ value: 'right', label: 'Bottom right' }, { value: 'left', label: 'Bottom left' }])}
</div>
<div class="actions"><button class="v-btn is-primary" type="submit">Save</button></div>${say()}
</form>`;
}

async function pageBody(tools, match) {
  const { library, store, settings } = tools;
  const { entry, agent } = await agentAt(library, match[1]);
  const page = settingsOf(agent);
  const using = await settings.resolve();
  const title = profileLook(agent.profile || {}, agent.name).title;
  const on = agent.chat_page && agent.chat_page.status !== 'paused';
  const closed = entry.meta.status === 'closed';
  const crumbs = `<nav class="crumbs" aria-label="Where you are"><a href="/console/chat-pages">Chat pages</a></nav>`;
  if (!agent.chat_page) {
    return { title: `${title} · Chat pages`, body: `${crumbs}<h1>${esc(title)}</h1>
<section class="block" data-say-box>
<p class="v-lead">This agent has no chat page yet. Turned on, it has a link anyone can open, and a chat button for your website.</p>
<p class="notice">${esc(whoAndCost(page))}</p>
<div class="actions file-actions">${statusButton(agent, page, 'status')}</div>${say()}
</section>` };
  }
  return {
    title: `${title} · Chat pages`,
    body: `${crumbs}<h1>${esc(title)}</h1>
<div class="share-line" data-say-box><span class="v-pill${on ? ' is-open' : ''}">${on ? 'On' : 'Paused'}</span>${statusButton(agent, page, 'status')}<a class="v-btn is-small" href="/console/agents/${esc(agent.slug)}">Its agent</a>${say()}</div>
${store ? '' : NO_STORE}
${noModelNotice(using, [agent])}
${closed ? '<p class="notice">Its course is closed, so this page isn’t open either.</p>' : ''}
<p class="v-lead">${on ? esc(whoAndCost(page)) : 'Paused: its link says it isn’t available. Nothing is answered, and nothing is spent.'}${store ? ` ${esc(plural(await messagesToday(store, agent.slug), 'message'))} so far today.` : ''}</p>
${shareBlock(agent, page, tools)}
<section class="block" aria-labelledby="limits-title">
<h2 id="limits-title">Limits and sites</h2>
${settingsForm(agent, page, entry.meta.version)}
</section>
<section class="block" aria-labelledby="look-title">
<h2 id="look-title">How it looks</h2>
<p class="v-note">This is its agent’s look, so activities using the agent show it too. What it says and searches is on <a href="/console/agents/${esc(agent.slug)}">its agent’s page</a>.</p>
${lookForm(agent, entry.meta.version)}
</section>`
  };
}

const PAGE_CSS = `.page h3{margin-top:22px;font-size:1rem;font-weight:600;letter-spacing:0}
.qr{display:block;width:min(100%,196px);height:auto;margin-top:14px;border-radius:var(--radius-sm)}
.snippet{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;margin-top:10px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--field-mist)}
.snippet code{font-size:.8125rem;overflow-wrap:anywhere}
.how{display:grid;gap:6px;margin:12px 0;padding:0 0 0 20px;color:var(--public-text);font-size:.9375rem;line-height:1.5}
.fields.three{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));align-items:end}`;

// --- Changes ------------------------------------------------------------------------------------------

async function createPage({ library }, _match, body) {
  const chosen = String(body?.knowledge ?? '');
  const [id, ref] = chosen ? chosen.split('/') : [null, null];
  const held = id ? (await library.get(id)).doc : {};
  // It lives beside what it answers from: refs are per package.
  const agent = newAgent({ ...body, knowledge: ref ? [ref] : [] }, held);
  const settings = chatPageSettings(NEW_PAGE, agent.name);
  const slug = await addAgent(library, id ?? OWN, { ...agent, chat_page: { status: 'active', settings: ownSettings(settings) } });
  return { go: `/console/chat-pages/${slug}` };
}

async function savePage({ library }, match, body) {
  await changeAgent(library, match[1], body?.version, (agent) => {
    const held = agent.chat_page?.settings || NEW_PAGE;
    // Only what the form names changes: voice, attachments and the rest stay as they came.
    const settings = chatPageSettings({
      ...held,
      allowed_sites: linesOf(body.allowed_sites),
      daily_limit: body.daily_limit,
      limits: { ...held.limits, visitor_per_minute: body.visitor_per_minute, visitor_per_day: body.visitor_per_day ?? 0 },
      launcher: { ...held.launcher, label: clean(body.button_label, CHAT_PAGE_LIMITS.launcherLabel), position: body.button_side }
    }, agent.name);
    agent.chat_page = { status: agent.chat_page?.status ?? 'active', settings: ownSettings(settings) };
  }, 'Chat page settings');
  return { said: 'Saved. The next message uses it.' };
}

async function setStatus({ library }, match, body) {
  if (!['active', 'paused'].includes(body?.status)) throw refused('On or paused.');
  await changeAgent(library, match[1], null, (agent) => {
    // Settings from a file are read now, so a page that can't be served isn't turned on.
    agent.chat_page = { status: body.status, settings: body.status === 'active' ? ownSettings(chatPageSettings(agent.chat_page?.settings || NEW_PAGE, agent.name)) : agent.chat_page?.settings || ownSettings(chatPageSettings(NEW_PAGE, agent.name)) };
  }, body.status === 'active' ? 'Chat page on' : 'Chat page paused');
  return {};
}

export const chatPages = [
  {
    id: 'chat-pages', title: 'Chat pages',
    render: async (tools) => ({ body: await listBody(tools), css: `${FORMS_CSS}\n${ROWS_CSS}` }),
    api: [
      ['POST', /^chat-pages$/, createPage],
      ['PUT', /^chat-pages\/([\w.-]+)$/, savePage],
      ['POST', /^chat-pages\/([\w.-]+)\/status$/, setStatus]
    ]
  },
  {
    id: 'chat-page', title: 'Chat page', section: 'chat-pages', nav: false,
    match: /^chat-pages\/([\w.-]+)$/,
    render: async (tools, match) => { const made = await pageBody(tools, match); return { ...made, css: `${FORMS_CSS}\n${ROWS_CSS}\n${PAGE_CSS}` }; },
    api: []
  }
];
