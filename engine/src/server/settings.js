/**
 * Which model does what: the providers a person adds in the console and the roles they fill, kept in
 * the store under one key. resolve() says what a run uses, read on each turn, so a change applies to the
 * next one. The environment (OPENAI_BASE_URL, OPENAI_API_KEY, the model flags, a models file) wins over
 * what is saved, and with no store there is only the environment. A provider's key is encrypted at rest
 * with AES-GCM and goes only to that provider: nothing here hands one to a browser. No Node built-ins.
 */
const STORE_KEY = 'engine/settings';
const LIMITS = { providers: 12, models: 500, name: 80, address: 500, key: 4000, model: 200 };
export const FROM_FLAGS = 'a flag or a models file';
const DEFAULT_ADDRESS = 'https://api.openai.com/v1';
export const ENVIRONMENT = 'environment';

// Each role, in the words the console uses, and its name in a models file.
export const ROLES = Object.freeze({
  reply: { label: 'Writes replies', file: 'reply' },
  reviewer: { label: 'Reviews replies', file: 'reviewer' },
  picker: { label: 'Reads the moment (optional)', file: 'picker' },
  assistant: { label: 'Works with you in Ask (optional)', file: 'assistant' },
  hearing: { label: 'Hears learners', file: 'transcribe' },
  speaking: { label: 'Reads aloud', file: 'speech' },
  drawing: { label: 'Draws pictures', file: 'image' },
  meaning: { label: 'Searches by meaning', file: 'meaning' }
});
// Every chat model has always gone to the environment's address, so these two still do, whatever is saved.
const HELD_BY_ADDRESS = new Set(['reply', 'reviewer']);

const refused = (message, status = 400, code = 'invalid_settings') => Object.assign(new Error(message), { status, code });
const NO_STORE = 'This server has no store, so nothing can be saved here. Start it with a data folder (--data-dir), or set OPENAI_BASE_URL, OPENAI_API_KEY and the model flags where it starts.';
const NO_SECRET = 'This server has nowhere safe to keep a key. Set VIABLE_ENGINE_SECRET where it runs and start it again, or give the key as OPENAI_API_KEY.';

const encoder = new TextEncoder();
const toBase64 = (bytes) => { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); };
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const randomId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

// Bound to the provider and its address: a key moved in the file to another address doesn't open.
const boundOf = (provider) => `${provider.id}\n${provider.base_url}`;

function keySealer(material) {
  let key = null;
  const keyOf = () => (key ??= (async () => {
    const raw = await material();
    if (!raw?.length) return null;
    const base = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode('viable-engine/provider-keys'), iterations: 100000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  })().catch(() => null));
  return {
    ready: async () => Boolean(await keyOf()),
    async seal(text, bound) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(bound) }, await keyOf(), encoder.encode(text));
      return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
    },
    // null when it can't be opened: the secret changed, or the file was edited.
    async open(sealed, bound) {
      try {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.iv), additionalData: encoder.encode(bound) }, await keyOf(), fromBase64(sealed.data));
        return new TextDecoder().decode(plain);
      } catch { return null; }
    }
  };
}

function addressOf(value) {
  let url;
  try { url = new URL(String(value ?? '').trim()); } catch { throw refused('Give the address whole, such as https://api.openai.com/v1.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw refused('An address starts with http or https, and has no name, password or query in it.');
  const address = url.href.replace(/\/+$/, '');
  if (address.length > LIMITS.address) throw refused('That address is too long.');
  return address;
}
const nameOf = (value) => {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
  if (!name) throw refused('Give it a name.');
  return name;
};
const modelOf = (value) => {
  const model = String(value ?? '').trim();
  if (!model || model.length > LIMITS.model || /\p{Cc}/u.test(model)) throw refused('Give the model’s name as the provider writes it.');
  return model;
};
const keyText = (value) => {
  const key = String(value).trim();
  if (!key || key.length > LIMITS.key || /[\s\p{Cc}]/u.test(key)) throw refused('That doesn’t look like a key.');
  return key;
};

/** What a role makes possible, on or off and why: for the console, inspect and verify. using: resolve()'s. */
export function featuresOf({ roles, reads }) {
  const reply = roles.reply;
  const read = reply?.model ? reads(reply.model) : {};
  const row = (id, role, label, on, yes, no) => ({ id, role, label, on: Boolean(on), why: on ? yes : no, models_file: ROLES[role].file });
  const where = (role) => (role?.model ? `${role.model}, on ${role.provider.name}.` : '');
  return [
    row('replies', 'reply', 'Replies', reply, where(reply) || 'Each agent’s own models, at the environment’s address.', 'No model writes replies yet.'),
    row('photos', 'reply', 'Photos from learners', read.images, 'The reply model reads images.', reply?.model ? 'Switch on “Reads images” for the reply model.' : 'Needs a reply model that reads images.'),
    row('pdfs', 'reply', 'PDFs from learners', read.files, 'The reply model reads PDFs.', reply?.model ? 'Switch on “Reads PDFs” for the reply model.' : 'Needs a reply model that reads PDFs.'),
    row('review', 'reviewer', 'A second model checks replies', roles.reviewer?.model, `${where(roles.reviewer)} It applies where an agent has a check step, and a learner waits for each review, so a small, fast model here answers sooner.`, 'A check step uses the model it names, or the reply model.'),
    row('moment', 'picker', 'A model reads the moment', roles.picker, 'A small model picks what each moment needs. Rules take over if it fails.', 'Rules read the moment from what the learner wrote.'),
    row('voice', 'hearing', 'Voice in activities', roles.hearing, 'Learners can dictate and talk, where an activity or chat page allows it.', 'The microphone isn’t offered.'),
    row('read_aloud', 'speaking', 'Reading aloud', roles.speaking, 'A Speech step reads aloud, and a reply to a spoken message is read aloud.', 'Nothing is read aloud on a page.'),
    row('pictures', 'drawing', 'Pictures in replies', roles.drawing, 'An Image step draws with this model, and the page shows the picture.', 'An Image step asks for the model it names.'),
    row('search', 'meaning', 'Search by meaning', roles.meaning, 'Knowledge search uses keywords and meaning together.', 'Knowledge search uses keywords only.')
  ];
}

/**
 * The server's model settings. store (store.js), or null for the environment alone; secret
 * (VIABLE_ENGINE_SECRET) encrypts saved keys, else a key the store keeps itself (fileStore's ownKey), and
 * with neither a key can't be saved. baseUrl, apiKey: the environment's; plan (modelPlan), model,
 * speechModel, imageModel: the flags'.
 */
export function modelSettings({ store = null, secret = null, baseUrl = null, apiKey = null, plan = null, model = null, speechModel = null, imageModel = null } = {}) {
  const seal = keySealer(async () => (secret ? encoder.encode(secret) : store?.ownKey ? store.ownKey() : null));
  const addressSet = Boolean(baseUrl || apiKey);
  const addressNames = [...(baseUrl ? ['OPENAI_BASE_URL'] : []), ...(apiKey ? ['OPENAI_API_KEY'] : [])];
  const named = { reply: plan?.reply ?? model, reviewer: plan?.reviewer, picker: plan?.picker, hearing: plan?.transcribe, speaking: plan?.speech ?? speechModel, drawing: plan?.image ?? imageModel, meaning: plan?.meaning };
  const fromEnvironment = { provider: { id: ENVIRONMENT, name: 'the environment’s address' }, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined, saved: false };
  const hasEnvironment = addressSet || Object.values(named).some(Boolean);

  const read = async () => {
    const held = store ? await store.get(STORE_KEY) : null;
    return { providers: Array.isArray(held?.providers) ? held.providers : [], roles: held?.roles && typeof held.roles === 'object' ? held.roles : {} };
  };
  const placeOf = async (saved, id) => {
    if (id === ENVIRONMENT) return hasEnvironment ? fromEnvironment : null;
    const found = saved.providers.find((provider) => provider.id === id);
    return found ? { provider: { id, name: found.name }, baseUrl: found.base_url, apiKey: found.key ? await seal.open(found.key, boundOf(found)) : null, saved: true } : null;
  };

  /** { roles: { reply: { provider, baseUrl, apiKey, saved, model, from }, ... }, plan, routes, fallback, reads(model), saved }: what a run uses, with its keys. Never for a browser. */
  async function resolve() {
    const saved = await read();
    const roles = {};
    for (const role of Object.keys(ROLES)) {
      const chosen = saved.roles[role] ?? null;
      const flagged = named[role] || null;
      const held = HELD_BY_ADDRESS.has(role) && addressSet;
      const place = held ? fromEnvironment : (chosen && await placeOf(saved, chosen.provider)) || (flagged ? fromEnvironment : null);
      const name = flagged || (place && chosen && (!held || chosen.provider === ENVIRONMENT) ? chosen.model : null);
      roles[role] = place && (name || held) ? { ...place, model: name, from: [...(place === fromEnvironment ? addressNames : []), ...(flagged ? [FROM_FLAGS] : [])] } : null;
    }
    // A chat model is routed by its name; the same name on two providers gets a name of its own.
    const routes = new Map();
    const routeName = (role) => {
      if (!role?.model) return null;
      const taken = routes.get(role.model);
      const name = taken && taken.provider.id !== role.provider.id ? `${role.provider.id}/${role.model}` : role.model;
      routes.set(name, role);
      return name;
    };
    const chat = { reply: routeName(roles.reply), reviewer: routeName(roles.reviewer), picker: routeName(roles.picker) };
    const any = Object.values(roles).some((role) => role?.model) || Object.keys(plan?.map || {}).length;
    const fallback = roles.reply ?? fromEnvironment;
    const listed = (id, name) => saved.providers.find((provider) => provider.id === id)?.models?.find((entry) => entry.id === name);
    const reads = (name) => {
      const route = routes.get(name) ?? fallback;
      const real = routes.get(name)?.model ?? name;
      const entry = listed(route.provider.id, real);
      return { images: Boolean(entry?.images || plan?.reads?.[real]?.includes('images')), files: Boolean(entry?.files || plan?.reads?.[real]?.includes('files')) };
    };
    return {
      roles, routes, fallback, reads, saved,
      plan: any ? { ...plan, ...chat, speech: roles.speaking?.model ?? null, image: roles.drawing?.model ?? null, transcribe: roles.hearing?.model ?? null, meaning: roles.meaning?.model ?? null, map: plan?.map ?? {} } : null
    };
  }

  /** What the console shows and its API says: never a key, only has_key. */
  async function view() {
    const using = await resolve();
    const { saved, roles } = using;
    const own = saved.providers.filter((provider) => provider.id !== ENVIRONMENT);
    const shown = await Promise.all(own.map(async (provider) => ({
      id: provider.id, name: provider.name, base_url: provider.base_url, has_key: Boolean(provider.key),
      key_unreadable: Boolean(provider.key) && await seal.open(provider.key, boundOf(provider)) === null,
      models: provider.models || [], from_environment: false
    })));
    const environment = hasEnvironment
      ? [{ id: ENVIRONMENT, name: 'From the environment', base_url: baseUrl || DEFAULT_ADDRESS, has_key: Boolean(apiKey), key_unreadable: false, models: saved.providers.find((provider) => provider.id === ENVIRONMENT)?.models || [], from_environment: true }]
      : [];
    return {
      object: 'console.models', saving: Boolean(store), keeps_keys: await seal.ready(),
      providers: [...environment, ...shown],
      roles: Object.fromEntries(Object.entries(ROLES).map(([role, { label }]) => [role, { label, provider: roles[role]?.provider.id ?? null, model: roles[role]?.model ?? null, from_environment: roles[role]?.from ?? [], saved: saved.roles[role] ?? null }])),
      features: featuresOf(using)
    };
  }

  // One change at a time here, so two at once don't lose one. Per process: two instances of one server can still race.
  let line = Promise.resolve();
  const change = (work) => {
    const turn = line.then(async () => {
      if (!store) throw refused(NO_STORE, 409, 'no_store');
      const saved = await read();
      const answer = await work(saved);
      await store.put(STORE_KEY, saved);
      return answer;
    });
    line = turn.catch(() => {});
    return turn;
  };
  const own = (saved, id) => {
    const found = id === ENVIRONMENT ? null : saved.providers.find((provider) => provider.id === id);
    if (!found) throw refused('That provider isn’t here anymore.', 404, 'provider_not_found');
    return found;
  };
  // The environment's address keeps only which of its models read what.
  const listOf = (saved, id) => {
    if (id !== ENVIRONMENT) return own(saved, id);
    if (!hasEnvironment) throw refused('That provider isn’t here anymore.', 404, 'provider_not_found');
    let found = saved.providers.find((provider) => provider.id === ENVIRONMENT);
    if (!found) saved.providers.push(found = { id: ENVIRONMENT, models: [] });
    return found;
  };
  const sealedKey = async (key, provider) => {
    if (!await seal.ready()) throw refused(NO_SECRET, 409, 'key_not_kept');
    return seal.seal(keyText(key), boundOf(provider));
  };

  return {
    resolve, view,
    /** Where a provider answers, for the console's test: never for a browser. */
    async endpointOf(id) {
      const place = await placeOf(await read(), id);
      if (!place) throw refused('That provider isn’t here anymore.', 404, 'provider_not_found');
      return { baseUrl: place.baseUrl || DEFAULT_ADDRESS, apiKey: place.apiKey ?? null, saved: place.saved };
    },
    addProvider: (input) => change(async (saved) => {
      if (saved.providers.filter((provider) => provider.id !== ENVIRONMENT).length >= LIMITS.providers) throw refused(`A server keeps at most ${LIMITS.providers} providers. Remove one first.`, 409, 'too_many_providers');
      const provider = { id: `prv_${randomId()}`, name: nameOf(input?.name), base_url: addressOf(input?.base_url), key: null, models: [] };
      if (input?.key) provider.key = await sealedKey(input.key, provider);
      saved.providers.push(provider);
      return { id: provider.id };
    }),
    updateProvider: (id, input) => change(async (saved) => {
      const provider = own(saved, id);
      if (input?.name !== undefined) provider.name = nameOf(input.name);
      let dropped = false;
      if (input?.base_url !== undefined) {
        const address = addressOf(input.base_url);
        // Someone holding a session can't point a saved key at their own server.
        dropped = address !== provider.base_url && Boolean(provider.key) && !input.key;
        if (address !== provider.base_url) provider.key = null;
        provider.base_url = address;
      }
      if (input?.key) provider.key = await sealedKey(input.key, provider);
      else if (input?.clear_key === true) provider.key = null;
      return { id, key_dropped: dropped };
    }),
    removeProvider: (id) => change(async (saved) => {
      own(saved, id);
      saved.providers = saved.providers.filter((provider) => provider.id !== id);
      for (const [role, value] of Object.entries(saved.roles)) if (value?.provider === id) delete saved.roles[role];
      return { id };
    }),
    /** After a test: what it offers now, keeping its switches, and any it no longer lists that are switched on or in use. */
    listModels: (id, names) => change(async (saved) => {
      const provider = listOf(saved, id);
      const held = new Map((provider.models || []).map((entry) => [entry.id, entry]));
      const inUse = new Set(Object.values(saved.roles).filter((value) => value?.provider === id).map((value) => value.model));
      const kept = [...held.values()].filter((entry) => !names.includes(entry.id) && (entry.images || entry.files || inUse.has(entry.id)));
      provider.models = [...names.map((name) => held.get(name) ?? { id: name, images: false, files: false }), ...kept].slice(0, LIMITS.models);
      return provider.models;
    }),
    /** A model by name, with what the operator says it reads. */
    setModel: (id, input) => change(async (saved) => {
      const provider = listOf(saved, id);
      const name = modelOf(input?.model);
      provider.models ||= [];
      const entry = provider.models.find((item) => item.id === name);
      if (!entry && provider.models.length >= LIMITS.models) throw refused('That’s as many models as a provider keeps.', 409, 'too_many_models');
      const next = { id: name, images: input?.images === undefined ? Boolean(entry?.images) : input.images === true, files: input?.files === undefined ? Boolean(entry?.files) : input.files === true };
      if (entry) Object.assign(entry, next); else provider.models.push(next);
      return next;
    }),
    /** A role's provider and model, or null to clear it. */
    setRole: (role, value) => change(async (saved) => {
      if (!Object.hasOwn(ROLES, role)) throw refused('There is no such role.', 404, 'role_not_found');
      if (value == null) { delete saved.roles[role]; return null; }
      const provider = listOf(saved, String(value.provider ?? ''));
      const name = modelOf(value.model);
      saved.roles[role] = { provider: provider.id, model: name };
      provider.models ||= [];
      if (!provider.models.some((entry) => entry.id === name) && provider.models.length < LIMITS.models) provider.models.push({ id: name, images: false, files: false });
      return saved.roles[role];
    })
  };
}
