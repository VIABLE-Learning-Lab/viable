/**
 * What a page learners meet is set up with: an agent's profile (how it presents itself, and how what a
 * learner has open reaches it) and its chat page's settings (voice, attachments, the chat button,
 * allowed sites, limits). Every field bounded, unknown fields dropped; settings saved before a field
 * existed read back with its default. A host stores them; a package carries them.
 */
const agentError = (message, status = 400, code = 'agent_error') => Object.assign(new Error(message), { status, code });

export const PROFILE_LIMITS = Object.freeze({ title: 80, tagline: 120, greeting: 600, starters: 4, starter: 120, notice: 400, placeholder: 80 });
export const OPEN_REACHES = ['reply', 'every'];
export const OPEN_PLACES = ['message', 'system', 'variables'];
export const LOOK = ['title', 'tagline', 'avatar_url', 'color', 'theme', 'greeting', 'starters', 'placeholder', 'notice'];
const DEFAULT_NOTICE = 'Answers come from an AI assistant and can be wrong. Don’t share passwords or private details.';
const DEFAULT_COLOR = '#3b5bdb';

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
export const CHAT_PAGE_LIMITS = Object.freeze({
  title: 80, tagline: 120, greeting: 600, starters: 4, starter: 120, notice: 400, placeholder: 80, launcherLabel: 40, sites: 20,
  dailyMin: 10, dailyMax: 5000, dailyDefault: 300,
  visitorMinuteMin: 1, visitorMinuteMax: 30, visitorMinuteDefault: 8,
  visitorDayMax: 1000,
  messageMin: 200, message: 4000,
  avatarBytes: 1024 * 1024,
  // A spoken message: the page stops recording at voiceSeconds; voiceBytes bounds what it may send
  // (about three minutes at the page's bitrate).
  voiceSeconds: 90, voiceBytes: 2 * 1024 * 1024, voiceSecondsMin: 15,
  // A page's own daily spending cap in US dollars (0: none).
  dailyCostMax: 1000,
  // Images and PDFs attached to one message. 10 MB of attachments is 13.4 MB as base64, which messageBytes holds.
  attachments: 4, attachmentBytes: 8 * 1024 * 1024, attachmentsBytes: 10 * 1024 * 1024, messageBytes: 14 * 1024 * 1024
});

/**
 * How an agent looks, every field bounded. When saving, avatar is the only address an avatar may
 * start with (one uploaded for this agent); code is the error code a bad one is reported with.
 */
export function profileLook(input = {}, agentName = 'Assistant', { avatar = null, code = 'invalid_agent_profile' } = {}) {
  const avatarUrl = input.avatar_url ? String(input.avatar_url) : null;
  if (avatarUrl && avatar !== null && !(avatarUrl.startsWith(avatar) && /^[a-f0-9]{24}\.(png|jpg|webp|gif)$/.test(avatarUrl.slice(avatar.length)))) {
    throw agentError('Upload the avatar here; other image addresses are not used.', 400, code);
  }
  return {
    title: text(input.title, PROFILE_LIMITS.title) || text(agentName, PROFILE_LIMITS.title) || 'Assistant',
    tagline: text(input.tagline, PROFILE_LIMITS.tagline),
    avatar_url: avatarUrl,
    color: /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color).toLowerCase() : DEFAULT_COLOR,
    theme: pick(input.theme, ['auto', 'light', 'dark'], 'auto'),
    greeting: String(input.greeting ?? '').trim().slice(0, PROFILE_LIMITS.greeting),
    starters: (Array.isArray(input.starters) ? input.starters : []).map((item) => text(item, PROFILE_LIMITS.starter)).filter(Boolean).slice(0, PROFILE_LIMITS.starters),
    placeholder: text(input.placeholder, PROFILE_LIMITS.placeholder) || 'Ask a question…',
    notice: input.notice === undefined || input.notice === null ? DEFAULT_NOTICE : text(input.notice, PROFILE_LIMITS.notice)
  };
}

/** A profile as stored: the look, and how what the learner has open reaches the agent. */
export function profileSettings(input = {}, agentName = 'Assistant', options = {}) {
  const open = input.open && typeof input.open === 'object' ? input.open : {};
  return { ...profileLook(input, agentName, options), open: { reaches: pick(open.reaches, OPEN_REACHES, 'reply'), place: pick(open.place, OPEN_PLACES, 'message') } };
}
export const lookOf = (profile) => Object.fromEntries(LOOK.map((key) => [key, profile[key]]));

// Dollars, to the cent, from 0 (none) to max.
function dollars(value, label, max) {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) throw agentError(`${label} must be from 0 (no cap) to ${max} dollars.`, 400, 'invalid_chat_page');
  return Math.round(number * 100) / 100;
}

function whole(value, label, min, max, fallback, { zero = false } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || ((number < min || number > max) && !(zero && number === 0))) {
    throw agentError(`${label} must be a whole number from ${min} to ${max}${zero ? ', or 0 for no limit' : ''}.`, 400, 'invalid_chat_page');
  }
  return number;
}

/**
 * How a page lets learners speak, the same on a chat page and in a course activity: visitors may speak
 * instead of typing when the published agent has a Transcribe step; a reply read aloud plays by itself
 * after they speak (spoken), after every message (always) or never.
 */
export function voiceSettings(input = {}) {
  const voice = input && typeof input === 'object' ? input : {};
  return {
    input: voice.input !== false,
    autoplay: pick(voice.autoplay, ['spoken', 'always', 'off'], 'spoken'),
    // A voice conversation without tapping: the page listens, sends when the visitor pauses for
    // `pause` (short, normal or long), reads the answer aloud and listens again. On by default.
    hands_free: voice.hands_free !== false,
    pause: pick(voice.pause, ['short', 'normal', 'long'], 'normal'),
    // Keep each recording with the run (on by default; a course's keep_recordings decides it for an
    // activity). Off, only what the agent heard is kept.
    archive: voice.archive !== false,
    // In a hands-free conversation, visitors may let themselves interrupt answers by talking (their
    // choice, off until they turn it on; offered by default).
    interrupt: voice.interrupt !== false,
    // A noisy room (a classroom, outdoors): speech has to stand further above the room's sound.
    noisy_room: voice.noisy_room === true,
    // The longest recording a visitor may send, in seconds.
    max_seconds: whole(voice.max_seconds, 'voice.max_seconds', CHAT_PAGE_LIMITS.voiceSecondsMin, CHAT_PAGE_LIMITS.voiceSeconds, CHAT_PAGE_LIMITS.voiceSeconds)
  };
}

/**
 * Whether learners may attach images and PDFs to a message, the same on a chat page and in a course
 * activity: on by default, offered only where the host says the agent can read them.
 */
export function attachmentSettings(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  return { images: value.images !== false, files: value.files !== false };
}

// What a page offers: what its settings allow of what its agent can read.
export const attachable = (settings, media) => ({ images: Boolean(settings?.images && media?.images), files: Boolean(settings?.files && media?.files) });

/**
 * The steps of a graph that receive what is attached: an llm step that takes its media, an agent or
 * vetting step without an input of its own. A model among them that can't read it would fail the run.
 */
export const mediaReaders = (graph) => (Array.isArray(graph?.nodes) ? graph.nodes : []).filter((node) => (node?.type === 'llm' && node.config?.includeInputMedia !== false) || (['agent', 'vetting'].includes(node?.type) && node.config?.input == null));

/**
 * A page's settings as stored: every field bounded, unknown fields dropped. Settings saved before a
 * field existed read back with its default. When saving, `avatar` is the only address an avatar may
 * start with (one uploaded for this agent).
 */
export function chatPageSettings(input = {}, agentName = 'Assistant', { avatar = null } = {}) {
  const sites = [];
  for (const raw of Array.isArray(input.allowed_sites) ? input.allowed_sites : []) {
    let origin = null;
    try {
      const url = new URL(String(raw).trim().includes('://') ? String(raw).trim() : `https://${String(raw).trim()}`);
      if (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')) origin = url.origin;
    } catch { /* reported below */ }
    if (!origin) throw agentError(`"${raw}" is not a website address. Use addresses like https://guides.example.edu.`, 400, 'invalid_chat_page');
    if (!sites.includes(origin)) sites.push(origin);
  }
  if (sites.length > CHAT_PAGE_LIMITS.sites) throw agentError(`List at most ${CHAT_PAGE_LIMITS.sites} websites.`, 400, 'invalid_chat_page');
  const launcher = input.launcher && typeof input.launcher === 'object' ? input.launcher : {};
  const limits = input.limits && typeof input.limits === 'object' ? input.limits : {};
  const learners = input.learners && typeof input.learners === 'object' ? input.learners : {};
  return {
    // How the agent looks is its profile's (profileLook above), shared with the activities using it.
    ...profileLook(input, agentName, { avatar, code: 'invalid_chat_page' }),
    // While the agent works, visitors see what kind of work it is doing (never how it is built), and
    // a reply that goes straight to them as it is written. Both on unless the developer turns them off.
    show_progress: input.show_progress !== false,
    stream_replies: input.stream_replies !== false,
    // In the chat button's panel on a website, links to that website open there in place, instead of a
    // new tab (a docs site's assistant citing its own pages). Off unless the developer turns it on.
    links_in_place: input.links_in_place === true,
    voice: voiceSettings(input.voice),
    attachments: attachmentSettings(input.attachments),
    // A chat page recognizes nobody: each device is an anonymous visitor. signals: whether how messages
    // are written is kept (timings, pauses, edits; never the keystrokes themselves).
    learners: {
      signals: learners.signals !== false
    },
    launcher: {
      position: pick(launcher.position, ['right', 'left'], 'right'),
      label: text(launcher.label, CHAT_PAGE_LIMITS.launcherLabel) || 'Chat with us',
      teaser: launcher.teaser === true
    },
    allowed_sites: sites,
    daily_limit: whole(input.daily_limit, 'daily_limit', CHAT_PAGE_LIMITS.dailyMin, CHAT_PAGE_LIMITS.dailyMax, CHAT_PAGE_LIMITS.dailyDefault),
    limits: {
      visitor_per_minute: whole(limits.visitor_per_minute, 'limits.visitor_per_minute', CHAT_PAGE_LIMITS.visitorMinuteMin, CHAT_PAGE_LIMITS.visitorMinuteMax, CHAT_PAGE_LIMITS.visitorMinuteDefault),
      visitor_per_day: whole(limits.visitor_per_day, 'limits.visitor_per_day', 1, CHAT_PAGE_LIMITS.visitorDayMax, 0, { zero: true }),
      message_chars: whole(limits.message_chars, 'limits.message_chars', CHAT_PAGE_LIMITS.messageMin, CHAT_PAGE_LIMITS.message, CHAT_PAGE_LIMITS.message),
      // What the page may spend a day (UTC) on its key, model and voice calls together; 0 for no cap.
      daily_cost: dollars(limits.daily_cost, 'limits.daily_cost', CHAT_PAGE_LIMITS.dailyCostMax)
    }
  };
}

/**
 * What a published graph does with voice: `input` when a Transcribe step reads the recording sent
 * with the message (not an address of its own), so the page can offer a microphone; `replies` when
 * a Speech step reads answers aloud.
 */
export function chatPageVoice(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    input: nodes.some((node) => node?.type === 'transcribe' && !String(node.config?.audio ?? '').trim()),
    replies: nodes.some((node) => node?.type === 'speech')
  };
}
/** What the embed script needs to draw its button before anyone opens the chat. */
export function chatPageConfig(settings) {
  return {
    object: 'agent.chat_page_config',
    title: settings.title,
    tagline: settings.tagline,
    avatar_url: settings.avatar_url,
    color: settings.color,
    theme: settings.theme,
    greeting: settings.greeting,
    launcher: settings.launcher
  };
}
