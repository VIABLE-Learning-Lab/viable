/**
 * The console's Models page and its JSON routes: providers as cards, each tested and its models listed,
 * and one row per role saying what its model turns on. The server renders all of it; the page's script
 * posts a change, then takes the new page's main from the server, so there is one renderer and whatever a
 * provider said stays text. A key goes in, and never comes back: the page holds only has_key. No Node built-ins.
 */
import { openAICompatible } from '../../../harness/src/models.js';
import { h, mark, treeHtml } from '../../../harness/src/ui/parts.js';
import { escapeHtml as esc } from '../learner/shell.js';
import { onRole } from '../server/runtime.js';
import { FROM_FLAGS, ROLES } from '../server/settings.js';

const PRESETS = [
  { name: 'OpenAI', address: 'https://api.openai.com/v1' },
  { name: 'OpenRouter', address: 'https://openrouter.ai/api/v1' },
  { name: 'Ollama', address: 'http://127.0.0.1:11434/v1', keyless: true },
  { name: 'LM Studio', address: 'http://127.0.0.1:1234/v1', keyless: true },
  { name: '', label: 'Other OpenAI-compatible', address: '' }
];
const LIST_MS = 15000;
const TRY_MS = 30000;
const MOST_MODELS = 500;

// --- Asking a provider -------------------------------------------------------------------------------

// A provider's own words, without its key if it says it back.
const scrubbed = (text, key) => (key ? String(text).replaceAll(key, '[its key]') : String(text)).replace(/\s+/g, ' ').trim().slice(0, 300);
const why = (error, base) => {
  const reason = error?.cause?.code || error?.cause?.message || (['AbortError', 'TimeoutError'].includes(error?.name) ? 'it took too long' : error?.message) || 'no answer';
  return `It can’t be reached: ${reason}.${/^https?:\/\/(localhost|127\.|\[::1\])/i.test(base) ? ' That address is the computer this server runs on, or the container it runs in.' : ' Check the address.'}`;
};

async function listModels({ settings, fetch }, id) {
  const place = await settings.endpointOf(id);
  const { fetch: send } = onRole(place, fetch);
  let response;
  try {
    response = await send(`${place.baseUrl.replace(/\/+$/, '')}/models`, { headers: place.apiKey ? { authorization: `Bearer ${place.apiKey}` } : {}, signal: AbortSignal.timeout(LIST_MS) });
  } catch (error) { return { ok: false, message: why(error, place.baseUrl) }; }
  const data = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, message: `It answered ${response.status}: ${scrubbed(data?.error?.message || data?.error || response.statusText || 'no reason given', place.apiKey)}${response.status === 401 || response.status === 403 ? ' Check the key.' : response.status === 404 ? ' Add a model by name, and try it.' : ''}` };
  // OpenAI's shape, a local server's, and the Developer Platform's own.
  const names = (Array.isArray(data?.data) ? data.data.map((item) => item?.id) : Array.isArray(data?.models) ? data.models.map((item) => item?.name ?? item?.id) : Array.isArray(data?.available_models) ? data.available_models.map((item) => item?.id) : []).filter((name) => typeof name === 'string' && name && name.length <= 200).sort();
  if (!names.length) return { ok: false, message: 'It answered, and listed no models. Add one by name.' };
  // With no store the list isn't kept, and the test still says it answered.
  const kept = await settings.listModels(id, names.slice(0, MOST_MODELS)).then(() => true, (error) => { if (error.code !== 'no_store') throw error; return false; });
  return { ok: true, count: names.length, kept };
}

async function tryModel({ settings, fetch }, id, name) {
  const place = await settings.endpointOf(id);
  const model = String(name ?? '').trim();
  if (!model) return { ok: false, message: 'Name a model to try.' };
  const { fetch: send } = onRole(place, fetch);
  const started = Date.now();
  try {
    const answered = await openAICompatible({ baseUrl: place.baseUrl, apiKey: place.apiKey, model, fetch: (url, init) => send(url, { ...init, signal: AbortSignal.timeout(TRY_MS) }) })({}, { model, messages: [{ role: 'user', content: 'Reply with the word OK.' }] });
    return { ok: true, ms: Date.now() - started, reply: scrubbed(answered.content, place.apiKey).slice(0, 80) };
  } catch (error) {
    return { ok: false, message: ['AbortError', 'TimeoutError'].includes(error?.name) ? 'It took too long to answer.' : scrubbed(error?.message, place.apiKey) };
  }
}

// --- The page ----------------------------------------------------------------------------------------

const field = (id, label, control, hint = '') => `<div class="v-form"><label class="v-label" for="${id}">${esc(label)}</label>${control}${hint ? `<small class="v-note">${esc(hint)}</small>` : ''}</div>`;
const input = (id, name, value, more = '') => `<input class="v-input" id="${id}" name="${name}" value="${esc(value)}" ${more}>`;

function modelList(provider, view) {
  const locked = !view.saving;
  const rows = provider.models.map((model, i) => {
    const at = `m-${esc(provider.id)}-${i}`;
    const check = (what, label) => `<label class="switch"><input type="checkbox" id="${at}-${what}" data-read="${what}" data-model="${esc(model.id)}" aria-label="${esc(model.id)}: ${label}"${model[what] ? ' checked' : ''}${locked ? ' disabled' : ''}> ${label}</label>`;
    return `<li><code>${esc(model.id)}</code>${check('images', 'Reads images')}${check('files', 'Reads PDFs')}<button class="v-btn is-small" type="button" id="${at}-try" data-do="try" data-model="${esc(model.id)}" aria-label="Try ${esc(model.id)}">Try</button><span class="say" data-say role="status"></span></li>`;
  }).join('');
  return `<h3>Its models</h3>
${rows ? `<p class="v-note">A provider doesn’t say reliably what a model reads, so you do: a reply model that reads images or PDFs lets learners attach them. Try sends the model one short message.</p><ul class="models" tabindex="0" aria-label="Models ${esc(provider.name)} offers">${rows}</ul>` : '<p class="v-note">Test it to list its models, or add one by name.</p>'}
${locked ? '' : `<div class="add-model"><label class="sr" for="add-${esc(provider.id)}">A model’s name</label><input class="v-input" id="add-${esc(provider.id)}" data-new-model placeholder="A model’s name" autocomplete="off"><button class="v-btn is-small" type="button" id="add-${esc(provider.id)}-go" data-do="add-model">Add</button></div>`}`;
}

function providerCard(provider, view) {
  const id = esc(provider.id);
  if (provider.from_environment) {
    return `<article class="v-card provider" id="provider-${id}" data-id="${id}">
<div class="provider-head"><h3>${esc(provider.name)}</h3></div>
<p class="v-note">Set where this server starts. Change it there.</p>
<dl class="facts"><dt>Address</dt><dd><code>${esc(provider.base_url)}</code></dd><dt>Key</dt><dd>${provider.has_key ? 'Given by OPENAI_API_KEY' : 'None'}</dd></dl>
<div class="actions"><button class="v-btn is-small" type="button" id="p-${id}-test" data-do="test">Test</button></div>
<p class="say" data-say role="status"></p>
${modelList(provider, view)}
</article>`;
  }
  const keyNote = provider.key_unreadable ? 'This key can’t be read here anymore. Enter it again.' : provider.has_key ? 'A key is saved. It is never shown again; type a new one to replace it.' : view.keeps_keys ? 'Leave it empty if the provider needs none. It is encrypted here, and never shown again.' : 'Keys can’t be saved on this server.';
  return `<article class="v-card provider" id="provider-${id}" data-id="${id}">
<form data-provider="${id}">
<div class="fields">
${field(`p-${id}-name`, 'Name', input(`p-${id}-name`, 'name', provider.name, 'required maxlength="80" autocomplete="off"'))}
${field(`p-${id}-address`, 'Address', input(`p-${id}-address`, 'base_url', provider.base_url, 'required type="url" inputmode="url" autocomplete="off" spellcheck="false"'))}
${field(`p-${id}-key`, 'Key', `<input class="v-input" id="p-${id}-key" name="key" type="password" autocomplete="new-password" spellcheck="false"${view.keeps_keys ? '' : ' disabled'}>`, keyNote)}
</div>
<div class="actions">
<button class="v-btn is-small is-primary" type="submit" id="p-${id}-save">Save</button>
<button class="v-btn is-small" type="button" id="p-${id}-test" data-do="test">Test</button>
${provider.has_key ? `<button class="v-btn is-small" type="button" id="p-${id}-forget" data-do="forget-key">Remove key</button>` : ''}
<button class="v-btn is-small" type="button" id="p-${id}-remove" data-do="remove" data-name="${esc(provider.name)}">Remove</button>
</div>
<p class="say" data-say role="status"></p>
</form>
${modelList(provider, view)}
</article>`;
}

function addProvider(view) {
  return `<section class="add" aria-labelledby="add-title">
<h3 id="add-title">Add a provider</h3>
<div class="presets">${PRESETS.map((preset, i) => `<button class="v-btn is-small" type="button" id="preset-${i}" data-preset data-name="${esc(preset.name)}" data-address="${esc(preset.address)}"${preset.keyless ? ' data-keyless' : ''}>${esc(preset.label ?? preset.name)}</button>`).join('')}</div>
<form class="v-card new-provider" id="new-provider" hidden>
<div class="fields">
${field('new-name', 'Name', input('new-name', 'name', '', 'required maxlength="80" autocomplete="off"'))}
${field('new-address', 'Address', input('new-address', 'base_url', '', 'required type="url" inputmode="url" autocomplete="off" spellcheck="false"'), '127.0.0.1 is the computer this server runs on.')}
${field('new-key', 'Key', `<input class="v-input" id="new-key" name="key" type="password" autocomplete="new-password" spellcheck="false"${view.keeps_keys ? '' : ' disabled'}>`, view.keeps_keys ? 'Leave it empty if the provider needs none. It is encrypted here, and never shown again.' : 'Keys can’t be saved on this server.')}
</div>
<div class="actions"><button class="v-btn is-small is-primary" type="submit" id="new-go">Add and test</button><button class="v-btn is-small" type="button" id="new-cancel" data-do="cancel">Cancel</button></div>
<p class="say" data-say role="status"></p>
</form>
</section>`;
}

const fromWhere = (names) => `Set where this server starts: ${new Intl.ListFormat('en').format(names)}. That wins over what is saved here.`;

function roleRow(name, role, view) {
  const ownFeatures = view.features.filter((item) => item.role === name);
  const addressHeld = role.from_environment.some((item) => item !== FROM_FLAGS);
  const modelHeld = role.from_environment.includes(FROM_FLAGS);
  const locked = !view.saving;
  const chosen = role.provider ?? role.saved?.provider ?? '';
  const options = view.providers.map((provider) => `<option value="${esc(provider.id)}"${provider.id === chosen ? ' selected' : ''}>${esc(provider.name)}</option>`).join('');
  const saved = role.saved && (role.saved.provider !== role.provider || role.saved.model !== role.model) ? `<p class="v-note">Saved here, for when that is gone: ${esc(view.providers.find((provider) => provider.id === role.saved.provider)?.name ?? 'a provider')}, ${esc(role.saved.model)}.</p>` : '';
  return `<li class="role" id="role-${name}">
<h3>${esc(role.label)}</h3>
<form data-role="${name}">
${field(`role-${name}-provider`, 'Provider', `<select class="v-input" id="role-${name}-provider" name="provider"${addressHeld || locked ? ' disabled' : ''}><option value="">Not set</option>${options}</select>`)}
${field(`role-${name}-model`, 'Model', `<input class="v-input" id="role-${name}-model" name="model" value="${esc(role.model ?? role.saved?.model ?? '')}" list="${chosen ? `models-${esc(chosen)}` : ''}" autocomplete="off" spellcheck="false" placeholder="${role.provider && !role.model ? 'As each agent names it' : ''}"${modelHeld || locked ? ' disabled' : ''}>`)}
${role.from_environment.length ? `<p class="v-note held">${esc(fromWhere(role.from_environment))}</p>${saved}` : ''}
<p class="say" data-say role="status"></p>
</form>
<ul class="turns">${ownFeatures.map((item) => `<li>${item.on ? treeHtml(mark('pass', `${item.label}: on`)) : treeHtml(h('span', { class: 'off' }, `${item.label}: off`))}<p class="v-note">${esc(item.why)}</p></li>`).join('')}</ul>
</li>`;
}

function modelsBody(view) {
  const providers = view.providers;
  return `<h1>Models</h1>
<p class="v-lead">Add a provider, test it, then say what each of its models is for. What a model makes possible turns on.</p>
${view.saving ? '' : '<p class="notice">This server has no store, so nothing here is saved. Models come from where it starts: <code>OPENAI_BASE_URL</code>, <code>OPENAI_API_KEY</code> and the model flags. To set them here, start it with <code>--data-dir</code> and a folder, or deploy it with a store.</p>'}
${view.saving && !view.keeps_keys ? '<p class="notice">Keys can’t be saved on this server. Set <code>VIABLE_ENGINE_SECRET</code> where it runs and start it again. A provider that needs no key can still be added.</p>' : ''}
<section class="block" aria-labelledby="providers-title">
<h2 id="providers-title">Providers</h2>
${providers.length ? `<div class="cards">${providers.map((provider) => providerCard(provider, view)).join('')}</div>` : '<p class="v-empty">No provider yet. Add one to start.</p>'}
${view.saving ? addProvider(view) : ''}
</section>
<section class="block" aria-labelledby="roles-title">
<h2 id="roles-title">What each model is for</h2>
<p class="v-note">${providers.length ? 'Choose a provider, then a model. A change applies to the next message.' : 'Add a provider first.'}</p>
<ul class="roles">${Object.keys(ROLES).map((name) => roleRow(name, view.roles[name], view)).join('')}</ul>
${providers.map((provider) => `<datalist id="models-${esc(provider.id)}">${provider.models.map((model) => `<option value="${esc(model.id)}"></option>`).join('')}</datalist>`).join('')}
</section>`;
}

const MODELS_CSS = `.page .v-lead{max-width:60ch;margin:10px 0 0}
.block{margin-top:clamp(28px,4vw,44px)}
.block>h2+*{margin-top:12px}
.cards{display:grid;gap:16px}
.provider h3,.add h3{font-size:1rem;font-weight:600;letter-spacing:0}
.provider>form+h3,.provider>.say+h3{margin-top:18px}
.fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:12px 16px}
.fields .v-form{align-content:start}
.fields>:last-child{grid-column:1/-1}
.v-note{margin:0}
small.v-note{font-size:.8125rem}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.say{color:var(--muted);font-size:.9375rem;overflow-wrap:anywhere}
p.say{margin:10px 0 0}
p.say:empty,span.say:empty{display:none}
.say.bad{color:var(--pencil-red)}
.say.good{color:var(--pass-green)}
.facts{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px;margin:12px 0 0}
.facts dt{color:var(--muted);font-size:.9375rem}
.facts dd{margin:0;overflow-wrap:anywhere}
.models{display:grid;max-height:22rem;margin:10px 0 0;padding:0;overflow:auto;list-style:none;border-top:1px solid var(--public-rule)}
.models li{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;padding:9px 2px;border-bottom:1px solid var(--public-rule)}
.models code{flex:1 1 200px;min-width:0;color:var(--public-ink);overflow-wrap:anywhere}
.models .say{flex-basis:100%}
.switch{display:inline-flex;align-items:center;gap:6px;font-size:.9375rem;white-space:nowrap;cursor:pointer}
.switch input{width:18px;height:18px;margin:0;accent-color:var(--ink-blue)}
.add-model{display:flex;gap:8px;margin-top:10px}
.add-model .v-input{max-width:340px;min-height:34px;padding:4px 12px;font-size:.9375rem}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.add{margin-top:20px}
.presets{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.new-provider{margin-top:14px}
.roles{margin:14px 0 0;padding:0;list-style:none;border-top:1px solid var(--public-rule)}
.role{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.3fr) minmax(0,1.3fr);gap:12px clamp(16px,3vw,32px);padding:18px 0;border-bottom:1px solid var(--public-rule)}
.role h3{font-size:1rem;font-weight:600;letter-spacing:0;line-height:1.4}
.role form{display:grid;gap:10px;align-content:start}
.held{font-size:.875rem}
.turns{display:grid;gap:10px;margin:0;padding:0;list-style:none;align-content:start}
.turns .v-mark{color:var(--pass-green);font-size:1rem}
.off{color:var(--public-ink);font-weight:600}
.turns .v-note{margin-top:2px;font-size:.875rem}
@media (max-width:820px){.role{grid-template-columns:minmax(0,1fr)}.fields{grid-template-columns:minmax(0,1fr)}}`;

// One change at a time, then the server's page again; what a provider said is set as text.
const MODELS_SCRIPT = String.raw`(() => {
  let line = Promise.resolve();
  const inLine = (work) => { line = line.then(work, work); return line; };
  const call = async (method, path, body) => {
    const response = await fetch('/console/api/' + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.reload(); throw new Error('Sign in again.'); }
    if (!response.ok) throw new Error((data.error && data.error.message) || 'That didn’t work. Try again.');
    return data;
  };
  const refresh = async () => {
    const response = await fetch(location.pathname, { headers: { accept: 'text/html' } });
    const next = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('main');
    if (!next) { location.reload(); return; }
    const focused = document.activeElement && document.activeElement.id;
    const scrolled = [...document.querySelectorAll('.models')].map((list) => [list.closest('[data-id]').dataset.id, list.scrollTop]);
    document.querySelector('main').replaceWith(next);
    for (const [id, top] of scrolled) { const list = next.querySelector('[data-id="' + id + '"] .models'); if (list) list.scrollTop = top; }
    const again = focused && document.getElementById(focused);
    if (again) again.focus({ preventScroll: true });
  };
  const say = (where, text, kind) => {
    const place = where && where.querySelector('[data-say]');
    if (!place) return;
    place.textContent = text;
    place.className = 'say' + (kind ? ' ' + kind : '');
  };
  const near = (id, selector) => { const box = document.getElementById(id); return box && selector ? box.querySelector(selector) : box; };
  const idOf = (node) => node.closest('[data-id]').dataset.id;
  const tested = (result) => (result.ok
    ? ['It answered, and offers ' + result.count + (result.count === 1 ? ' model.' : ' models.') + (result.kept ? '' : ' This server has no store, so the list isn’t kept.'), 'good']
    : [result.message, 'bad']);
  const test = async (id) => {
    const result = await call('POST', 'providers/' + encodeURIComponent(id) + '/test');
    await refresh();
    say(near('provider-' + id), ...tested(result));
  };
  const valuesOf = (form) => {
    const body = { name: form.elements.name.value, base_url: form.elements.base_url.value };
    if (form.elements.key.value) body.key = form.elements.key.value;
    return body;
  };
  const changed = (form) => [...form.elements].some((item) => item.name && item.value !== item.defaultValue);
  const save = async (form) => {
    const id = form.dataset.provider;
    const saved = await call('PUT', 'providers/' + encodeURIComponent(id), valuesOf(form));
    await refresh();
    say(near('provider-' + id), saved.key_dropped ? 'Saved. The address changed, so its key was removed. Enter it again.' : 'Saved.', saved.key_dropped ? 'bad' : 'good');
  };
  const failing = (where, work) => inLine(work).catch((error) => say(where, error.message, 'bad'));

  document.addEventListener('submit', (event) => {
    const form = event.target;
    event.preventDefault();
    if (form.id === 'new-provider') {
      failing(form, async () => {
        const made = await call('POST', 'providers', valuesOf(form));
        await test(made.id);
      });
    } else if (form.dataset.provider) failing(form, () => save(form));
    else if (form.dataset.role) failing(form, () => saveRole(form));
  });

  const saveRole = async (form) => {
    const role = form.dataset.role;
    const provider = form.elements.provider.value;
    const model = form.elements.model.value.trim();
    // Where the environment holds the provider, an empty model goes back to each agent's own.
    if (provider && !model && !form.elements.provider.disabled) { say(form, 'Choose a model too.'); return; }
    await call('PUT', 'roles/' + role, provider && model ? { provider, model } : {});
    await refresh();
    say(near('role-' + role), provider && model ? 'Saved. It applies to the next message.' : 'Cleared.', 'good');
  };
  document.addEventListener('change', (event) => {
    const item = event.target;
    if (item.dataset && item.dataset.read) {
      const card = item.closest('[data-id]');
      failing(card, async () => {
        await call('PUT', 'providers/' + encodeURIComponent(card.dataset.id) + '/model', { model: item.dataset.model, [item.dataset.read]: item.checked });
        await refresh();
      });
      return;
    }
    const form = item.closest && item.closest('form[data-role]');
    if (!form) return;
    if (item.name === 'provider') form.elements.model.setAttribute('list', item.value ? 'models-' + item.value : '');
    failing(form, () => saveRole(form));
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('button');
    if (!button) return;
    if ('preset' in button.dataset) {
      const form = document.getElementById('new-provider');
      form.hidden = false;
      say(form, '');
      form.elements.name.value = button.dataset.name;
      form.elements.base_url.value = button.dataset.address;
      form.elements.key.value = '';
      (!button.dataset.name ? form.elements.name : 'keyless' in button.dataset || form.elements.key.disabled ? document.getElementById('new-go') : form.elements.key).focus();
      return;
    }
    const does = button.dataset.do;
    if (!does) return;
    if (does === 'cancel') { const form = document.getElementById('new-provider'); form.reset(); form.hidden = true; return; }
    const card = button.closest('[data-id]');
    const id = idOf(button);
    const path = 'providers/' + encodeURIComponent(id);
    if (does === 'test') {
      const form = card.querySelector('form[data-provider]');
      say(card, 'Asking it…');
      failing(card, async () => {
        if (form && changed(form)) await call('PUT', path, valuesOf(form));
        await test(id);
      });
    } else if (does === 'remove') {
      if (window.confirm('Remove ' + button.dataset.name + '? Any role on it is cleared, and its key is gone.')) failing(card, async () => { await call('DELETE', path); await refresh(); });
    } else if (does === 'forget-key') {
      failing(card, async () => { await call('PUT', path, { clear_key: true }); await refresh(); say(near('provider-' + id), 'Its key is gone.', 'good'); });
    } else if (does === 'add-model') {
      const name = card.querySelector('[data-new-model]');
      failing(card, async () => { await call('PUT', path + '/model', { model: name.value }); await refresh(); });
    } else if (does === 'try') {
      const row = button.closest('li');
      say(row, 'Asking it…');
      failing(row, async () => {
        const result = await call('POST', path + '/try', { model: button.dataset.model });
        say(row, result.ok ? 'It answered in ' + (result.ms / 1000).toFixed(1) + ' s' + (result.reply ? ': ' + result.reply : '.') : result.message, result.ok ? 'good' : 'bad');
      });
    }
  });
})();`;

const NEW_MODEL_ENTER = String.raw`document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.matches && event.target.matches('[data-new-model]')) { event.preventDefault(); event.target.closest('[data-id]').querySelector('[data-do="add-model"]').click(); }
});`;

export const modelsPage = {
  id: 'models',
  title: 'Models',
  render: async ({ settings }) => ({ body: modelsBody(await settings.view()), css: MODELS_CSS, script: `${MODELS_SCRIPT}\n${NEW_MODEL_ENTER}` }),
  api: [
    ['GET', /^models$/, ({ settings }) => settings.view()],
    ['POST', /^providers$/, ({ settings }, _match, body) => settings.addProvider(body)],
    ['PUT', /^providers\/([\w-]+)$/, ({ settings }, match, body) => settings.updateProvider(match[1], body)],
    ['DELETE', /^providers\/([\w-]+)$/, ({ settings }, match) => settings.removeProvider(match[1])],
    ['POST', /^providers\/([\w-]+)\/test$/, (tools, match) => listModels(tools, match[1])],
    ['POST', /^providers\/([\w-]+)\/try$/, (tools, match, body) => tryModel(tools, match[1], body?.model)],
    ['PUT', /^providers\/([\w-]+)\/model$/, ({ settings }, match, body) => settings.setModel(match[1], body)],
    ['PUT', /^roles\/(\w+)$/, ({ settings }, match, body) => settings.setRole(match[1], body?.provider ? { provider: body.provider, model: body.model } : null)]
  ]
};

