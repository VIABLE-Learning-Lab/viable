/**
 * What Ask remembers of the person (open/harness/src/memory.js), on a page of its own: everything kept, to read, change, move
 * between always in mind and when it fits, or delete, and two switches. A host passes here.memory (the Engine's store, or a
 * platform's database) with the same shape; the page doesn't change. A name on the person's class lists is never kept. No Node built-ins.
 */
import { MEMORY_LIMITS, memoryRefusal } from '../../../harness/src/memory.js';
import { esc, FORMS_CSS, say, toggle } from './forms.js';

const refused = (message, status = 400, code = 'invalid_memory') => Object.assign(new Error(message), { status, code });
const day = (iso) => (iso ? `<time data-local datetime="${esc(iso)}">${esc(String(iso).slice(0, 10))}</time>` : '');

/** The names on the person's class lists: what no memory may hold. */
export async function learnerNamesOf(here) {
  const courses = here.library.titles ? await here.library.titles() : (await here.library.courses()).map(({ code }) => ({ code }));
  const people = (await Promise.all(courses.slice(0, 60).map(({ code }) => here.classes.people(code).catch(() => [])))).flat();
  return people.map((person) => person.name).filter(Boolean).flatMap((name) => [name, ...String(name).split(/\s+/).filter((part) => part.length >= 3)]);
}

/** A sentence that can be kept, or a refusal that says why not. */
export async function keepable(here, text) {
  const why = memoryRefusal(text, { names: await learnerNamesOf(here) });
  if (why) throw refused(why);
  return String(text).trim();
}

const where = (item) => (item.source?.kind !== 'ask' ? 'added here' : item.source.id ? `from <a href="/console/ask/${esc(item.source.id)}">${esc(item.source.title || 'a conversation')}</a>` : `from ${esc(item.source.title || 'a conversation')}, since deleted`);

function itemHtml(item) {
  const other = item.always ? { always: false, label: 'Only when it fits' } : { always: true, label: 'Keep always in mind' };
  return `<li class="mem-item" id="${esc(item.id)}" data-say-box>
<p class="mem-text">${esc(item.text)}</p>
<small class="mem-meta">Kept ${day(item.updated_at || item.created_at)} · ${where(item)}${item.used_at ? ` · last used ${day(item.used_at)}` : ''}</small>
<div class="mem-do">
<details class="mem-edit"><summary class="v-btn is-small">Edit</summary>
<form data-api="PATCH ask/memory/${esc(item.id)}" data-said="Changed."><label class="sr" for="text-${esc(item.id)}">What Ask remembers</label><textarea class="v-input" id="text-${esc(item.id)}" name="text" rows="2" maxlength="${MEMORY_LIMITS.text}" required>${esc(item.text)}</textarea><button class="v-btn is-small is-primary" type="submit">Save</button></form>
</details>
<button class="v-btn is-small" type="button" data-api="PATCH ask/memory/${esc(item.id)}" data-body='${esc(JSON.stringify({ always: other.always }))}' data-said="Moved.">${other.label}</button>
<button class="v-btn is-small danger" type="button" data-api="DELETE ask/memory/${esc(item.id)}" data-confirm="Delete “${esc(item.text)}”? Ask won’t remember it." data-yes="Delete">Delete</button>
</div>${say()}</li>`;
}

async function memoryBody(here) {
  if (!here.memory) return { title: 'What Ask remembers', body: '<div class="page-head"><h1>What Ask remembers</h1></div><p class="notice">This server keeps nothing for Ask: start it with a data folder to have Ask remember how you work.</p>' };
  const [settings, items] = await Promise.all([here.memory.settings(), here.memory.list()]);
  const always = items.filter((item) => item.always);
  const fits = items.filter((item) => !item.always);
  const list = (title, id, note, entries) => `<section class="block mem-part" aria-labelledby="${id}"><h2 id="${id}">${title} <small>${entries.length}</small></h2><p class="v-note">${note}</p>${entries.length ? `<ul class="mem-list">${entries.map(itemHtml).join('')}</ul>` : ''}</section>`;
  return {
    title: 'What Ask remembers',
    body: `<div class="page-head"><div><p class="crumbs"><a href="/console/ask">Ask</a></p><h1>What Ask remembers</h1>
<p class="v-lead">What you told Ask about how you work, so you needn’t say it again. Read it, change it or delete it here. What you say in a conversation always comes first. Ask is told to keep nothing about a learner, and refuses any name on your class lists.</p></div></div>
${settings.keep ? '' : '<p class="notice">Memory is off: Ask doesn’t keep or use anything here. What’s here stays until you delete it.</p>'}
<section class="block" aria-labelledby="mem-how" data-say-box>
<h2 id="mem-how">How Ask uses it</h2>
<form class="mem-settings" data-api="PATCH ask/memory/settings" data-said="Saved.">
${toggle('keep', 'Remember what I tell it', settings.keep, { hint: 'Ask keeps what you say about how you like to work, your setting and what you’re working toward, and brings back what fits each message. It says when it keeps something.' })}
${toggle('look_back', 'Look back through my earlier conversations', settings.look_back, { hint: 'When you mention something from before, Ask can search what you and it said in your earlier conversations here.' })}
<div class="actions"><button class="v-btn is-small is-primary" type="submit">Save</button></div>${say()}
</form>
</section>
<section class="block" aria-labelledby="mem-add" data-say-box>
<h2 id="mem-add">Tell it something to remember</h2>
<form class="mem-new" data-api="POST ask/memory" data-said="Kept.">
<label class="sr" for="mem-text">Something for Ask to remember</label>
<textarea class="v-input" id="mem-text" name="text" rows="2" maxlength="${MEMORY_LIMITS.text}" placeholder="My periods are 45 minutes, and learners share iPads" required></textarea>
${toggle('always', 'Keep it in mind with every message', false, { hint: 'For how you like to work in general. Otherwise it comes up when your words meet it.' })}
<div class="actions"><button class="v-btn is-small is-primary" type="submit">Remember this</button></div>${say()}
</form>
</section>
${items.length ? `${list('Always in mind', 'mem-always', `With every message. At most ${MEMORY_LIMITS.always}, the latest first.`, always)}
${list('When it fits', 'mem-fits', `Up to ${MEMORY_LIMITS.fits} come up with a message whose words meet them, and Ask can look up the rest.`, fits)}
<section class="block" aria-labelledby="mem-all" data-say-box><h2 id="mem-all">Start again</h2><p class="v-note">Your conversations stay. Only what Ask remembers goes.</p><div class="actions"><button class="v-btn is-small danger" type="button" data-api="DELETE ask/memory" data-confirm="Delete everything Ask remembers about you? This can’t be undone." data-yes="Delete everything">Delete everything</button></div>${say()}</section>`
    : '<p class="v-note mem-none">Nothing yet. Tell Ask about how you work in a conversation, or above, and it shows here.</p>'}`,
    css: `${FORMS_CSS}\n${MEMORY_CSS}`
  };
}

const MEMORY_CSS = `.mem-part h2 small{margin-left:6px;color:var(--muted);font-weight:400}
.mem-list{display:grid;gap:0;margin:10px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.mem-item{display:grid;gap:4px;padding:12px 0;border-bottom:1px solid var(--public-rule)}
.mem-item:target{background:color-mix(in srgb,var(--ink-blue) 6%,transparent)}
.mem-text{margin:0;color:var(--public-ink);font-size:.9375rem;line-height:1.5;overflow-wrap:anywhere}
.mem-meta{color:var(--muted);font-size:.8125rem}
.mem-do{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;margin-top:4px}
.mem-edit{flex:1 1 100%}
.mem-edit>summary{list-style:none;width:fit-content}
.mem-edit>summary::-webkit-details-marker{display:none}
.page .mem-edit>summary::before{display:none}
.mem-edit[open]>summary{display:none}
.mem-edit form{display:grid;gap:8px;max-width:640px}
.mem-edit:not([open]){flex:0 0 auto}
.mem-settings,.mem-new{display:grid;gap:12px;max-width:640px}
.mem-none{margin-top:20px}
.danger{border-color:var(--pencil-red);color:var(--pencil-red)}`;

const clean = (value) => String(value ?? '').trim();

export const memoryPages = [{
  id: 'ask-memory', title: 'What Ask remembers', section: 'ask', nav: false,
  match: /^ask\/memory$/,
  render: memoryBody,
  api: [
    ['PATCH', /^ask\/memory\/settings$/, async (here, _match, body) => {
      if (!here.memory) throw refused('Ask keeps nothing here.', 409, 'memory_not_set_up');
      // One left out keeps its value, as on the Developer Platform.
      const set = await here.memory.setSettings(Object.fromEntries(['keep', 'look_back'].filter((name) => typeof body?.[name] === 'boolean').map((name) => [name, body[name]])));
      return { said: set.keep ? 'Saved.' : 'Saved. Ask won’t keep or use anything until you turn it back on.' };
    }],
    ['POST', /^ask\/memory$/, async (here, _match, body) => {
      if (!here.memory) throw refused('Ask keeps nothing here.', 409, 'memory_not_set_up');
      await here.memory.keep({ text: await keepable(here, clean(body?.text)), always: body?.always === true, source: { kind: 'person' } });
      return { said: 'Kept. It’s in the list below.' };
    }],
    ['PATCH', /^ask\/memory\/(mem_[a-f0-9]{8,32})$/, async (here, match, body) => {
      if (!here.memory) throw refused('Ask keeps nothing here.', 409, 'memory_not_set_up');
      const next = { ...(typeof body?.text === 'string' ? { text: await keepable(here, clean(body.text)) } : {}), ...(typeof body?.always === 'boolean' ? { always: body.always } : {}) };
      await here.memory.change(match[1], next);
      return { said: 'Changed.' };
    }],
    ['DELETE', /^ask\/memory\/(mem_[a-f0-9]{8,32})$/, async (here, match) => {
      if (!here.memory) throw refused('Ask keeps nothing here.', 409, 'memory_not_set_up');
      await here.memory.drop(match[1]);
      return { said: 'Deleted.' };
    }],
    ['DELETE', /^ask\/memory$/, async (here) => {
      if (!here.memory) throw refused('Ask keeps nothing here.', 409, 'memory_not_set_up');
      await here.memory.dropAll();
      return { said: 'Deleted. Ask remembers nothing about you now.' };
    }]
  ]
}];
