/**
 * The page a learner or visitor talks to an agent on: an agent's chat page, the chat button's panel, and
 * a course activity with its panels beside the AI, as one page of HTML (renderChatPage), and the script
 * a website includes for the chat button (embedScript). Pure functions: what serves them and answers
 * their endpoints is the host's (server/learner.js here).
 */
import { BASE_CSS, escapeHtml, palette, scriptJson } from './shell.js';
import { SPEAK_UP } from '../../../harness/src/speakUp.js';
import { CHAT_PAGE_LIMITS } from './settings.js';
import { themeOf } from './themes.js';
import { publicWorkspace } from './workspace.js';

// The page's renderer, highlighting, math and diagram files, with content-hashed names
// (scripts/build-learner-assets.mjs): a host passes the names as assets.
export const ASSET_PATH = '/v1/agents/chat-assets/';

const ICON = {
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  pen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  chats: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>',
  down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  talk: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/></svg>',
  mic: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  // Stop and write it down: a square in the round button.
  done: '<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor"/></svg>',
  hand: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>'
};

const avatarHtml = (settings, size) => settings.avatar_url
  ? `<span class="avatar av-${size}"><img src="${escapeHtml(settings.avatar_url)}" alt=""></span>`
  : `<span class="avatar av-${size} mono" aria-hidden="true">${escapeHtml((settings.title || 'A').trim().charAt(0).toUpperCase())}</span>`;

// How long a visitor's silence ends their turn in a hands-free conversation. Learners pause mid-sentence.
const VOICE_PAUSE_MS = { short: 800, normal: 1300, long: 2000 };

/**
 * A learner's page. workspace: a course activity's panels (none on a chat page). course: { title, url,
 * done, shared, identify, asks, varies, alsoSeen, query, visitorKey } for an activity's way back to its
 * course, its "I'm done", and whether the page waits to hear from its host before letting the learner in.
 *
 * host says what this host provides, and the page shows only that: voice (the microphone), speech
 * (replies read aloud), attachments ({ images, files }), ratings, signals (recording how messages are
 * written), asks (a chat page waits to hear from the host first), assets (the browser files' names),
 * codes ({ asks, waits }: its own error codes meaning "the host asks first" and "not open yet"),
 * links ({ poweredBy: { label, href } }) and slots: { beforeConversation, sheet, beside }, each { css,
 * html, script } of the host's own, trusted, whose script may set window.VIABLE_SLOTS; beside stands
 * next to the whole page, and hears run.trace events as viable:trace. Nothing here names a feature the
 * core doesn't ship.
 */
export function renderChatPage({ slug, mode, settings, workspace: panels = null, opening = null, course = null, how = null, sets = new Map(), speaksUp = null, host = {} }, nonce) {
  const { voice: hears = false, speech: speaks = false, attachments: attaches = null, assets = {}, codes = {}, links = {}, slots = {} } = host;
  const before = slots.beforeConversation || {};
  const sheet = slots.sheet || {};
  const beside = slots.beside || {};
  // A workspace (panels beside the AI, or instead of it) on the page itself and in an inline embed;
  // the chat button's widget stays a chat.
  const workspace = mode !== 'widget' ? publicWorkspace(panels, sets, { waiting: Boolean(course?.waiting) }) : null;
  const reading = (workspace?.panels || []).some((panel) => panel.type === 'reading');
  const config = {
    slug, mode, title: settings.title, greeting: settings.greeting, starters: settings.starters || [], avatar: settings.avatar_url || null, opening: mode === 'widget' ? null : opening,
    // The moments the activity's teacher chose for the AI to write first (speakUp.js), and nothing else of their settings; and how the page says why it began.
    speaksUp: mode === 'widget' || !course ? null : speaksUp, firstWords: Object.fromEntries(Object.entries(SPEAK_UP).map(([kind, moment]) => [kind, moment.says])),
    maxChars: settings.limits?.message_chars || 4000, showProgress: settings.show_progress !== false, streamReplies: settings.stream_replies !== false, linksInPlace: settings.links_in_place === true, pageContext: settings.page_context === true,
    // The microphone, when the agent can hear visitors (loadChatPage), and when replies read aloud play.
    voice: Boolean(hears), voiceSeconds: settings.voice?.max_seconds || CHAT_PAGE_LIMITS.voiceSeconds, autoplay: settings.voice?.autoplay || 'spoken',
    // Hands-free conversation, and how long a pause ends the visitor's turn.
    handsFree: Boolean(hears) && settings.voice?.hands_free !== false, handsFreeAllowed: settings.voice?.hands_free !== false, pauseMs: VOICE_PAUSE_MS[settings.voice?.pause] || VOICE_PAUSE_MS.normal,
    interrupt: settings.voice?.interrupt !== false, noisy: settings.voice?.noisy_room === true,
    // Answers can be read aloud (a Speech step): the page readies its audio on the visitor's first tap.
    speaks: Boolean(speaks),
    // Photos and PDFs a visitor may attach, where the host says the agent can read them.
    attach: { images: Boolean(attaches?.images), files: Boolean(attaches?.files) },
    // Whether the page records how messages are written, and whether visitors may rate replies.
    signals: Boolean(host.signals) && settings.learners?.signals !== false, ratings: Boolean(host.ratings) && settings.ratings !== false,
    // Whether the host has something to say about this visitor before they start (the page asks it).
    asks: Boolean(host.asks), askCodes: codes.asks || [], waitCodes: codes.waits || [],
    // A course activity: its endpoints carry what its address carried, a preview has its own browser
    // id, and "I'm done" is posted to …/done. Who the learner is was settled on the course home; the
    // page sends them there when it wasn't (or the host still has something to ask).
    query: course?.query || host.query || '', visitorKey: course?.visitorKey || null,
    course: course ? { ...(course.waiting ? { waiting: true } : {}), version: Number.isInteger(course.version) ? course.version : null, title: course.title, url: course.url, done: course.done, shared: Boolean(course.shared), identify: course.identify || how?.identify || 'browser', asks: Boolean(course.asks), alsoSeen: course.alsoSeen || null, varies: Boolean(course.varies), preview: Boolean(course.preview) } : null
  };
  return `<!doctype html>
<html lang="en" data-theme="${['light', 'dark'].includes(settings.theme) ? settings.theme : 'auto'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapeHtml(course ? `${course.activity} · ${course.title}` : settings.title)}</title>
<style nonce="${nonce}">
${palette(settings.color, settings.course_theme)}
:root{--hl-keyword:#cf222e;--hl-string:#0a3069;--hl-number:#0550ae;--hl-comment:#6e7781;--hl-title:#8250df;--hl-type:#953800;--hl-tag:#116329;--hl-attr:#0550ae;--hl-meta:#57606a;--hl-add:#116329;--hl-add-bg:#dafbe1;--hl-del:#82071e;--hl-del-bg:#ffebe9}
:root[data-theme=dark]{--hl-keyword:#ff7b72;--hl-string:#a5d6ff;--hl-number:#79c0ff;--hl-comment:#8b949e;--hl-title:#d2a8ff;--hl-type:#ffa657;--hl-tag:#7ee787;--hl-attr:#79c0ff;--hl-meta:#8b949e;--hl-add:#aff5b4;--hl-add-bg:#033a16;--hl-del:#ffdcd7;--hl-del-bg:#67060c}
@media (prefers-color-scheme:dark){:root[data-theme=auto]{--hl-keyword:#ff7b72;--hl-string:#a5d6ff;--hl-number:#79c0ff;--hl-comment:#8b949e;--hl-title:#d2a8ff;--hl-type:#ffa657;--hl-tag:#7ee787;--hl-attr:#79c0ff;--hl-meta:#8b949e;--hl-add:#aff5b4;--hl-add-bg:#033a16;--hl-del:#ffdcd7;--hl-del-bg:#67060c}}
${BASE_CSS}${before.css || ''}${sheet.css || ''}${beside.css || ''}
*{box-sizing:border-box}html,body{height:100%}[hidden]{display:none!important}
body{margin:0;background:var(--panel);color:var(--ink);font:var(--size)/1.6 var(--font);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
button{font:inherit;color:inherit}
.app{height:100%;display:flex;min-height:0;position:relative;overflow:hidden}
.main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
.chats{position:absolute;inset:0 auto 0 0;z-index:5;width:min(300px,86vw);display:flex;flex-direction:column;background:var(--panel);border-right:1px solid var(--line);box-shadow:0 24px 60px -24px rgba(15,23,42,.45);transform:translateX(-104%);transition:transform .28s cubic-bezier(.2,.8,.2,1)}
.chats.open{transform:none}
.scrim{position:absolute;inset:0;z-index:4;background:rgba(15,23,42,.32);opacity:0;pointer-events:none;transition:opacity .22s}
.scrim.open{opacity:1;pointer-events:auto}
@media (min-width:960px){body.mode-page .chats{position:relative;inset:auto;flex:none;width:0;transform:none;box-shadow:none;border-right-color:transparent;overflow:hidden;transition:width .28s cubic-bezier(.2,.8,.2,1),border-color .28s}body.mode-page .chats.open{width:280px;border-right-color:var(--line-2);background:color-mix(in srgb,var(--panel) 96%,var(--ink))}body.mode-page .chats>*{min-width:280px}body.mode-page .chats>.chats-new,body.mode-page .chats>.chats-toast{min-width:260px}body.mode-page .scrim{display:none}}
.chats-head{display:flex;align-items:center;justify-content:space-between;padding:10px 8px 4px 16px;font-size:.92rem}
.chats-new{display:flex;align-items:center;gap:9px;margin:6px 10px 6px;padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink);font-size:.88rem;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s}
.chats-new:hover{border-color:var(--accent-line);background:var(--accent-soft)}
.chats-new svg{color:var(--accent-text)}
.chats-list{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:2px 8px 10px;overscroll-behavior:contain}
.chats-group{margin:14px 10px 4px;font-size:.74rem;font-weight:620;color:var(--muted)}
.chats-group:first-child{margin-top:6px}
.chats-empty{display:grid;justify-items:center;gap:6px;margin:18px 10px 14px;color:var(--muted);font-size:.84rem;line-height:1.5;text-align:center}
.chats-empty svg{width:22px;height:22px;color:var(--line);stroke:var(--muted);opacity:.6}
.chat{position:relative;display:flex;align-items:center;border-radius:11px;transition:background .15s}
.chat:hover{background:var(--line-2)}.chat.active{background:var(--accent-soft)}
.chat.active::before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--accent)}
.chat-open{flex:1;min-width:0;display:grid;gap:1px;padding:8px 10px 8px 12px;border:0;border-radius:11px;background:transparent;color:var(--ink-2);font:inherit;text-align:left;cursor:pointer}
.chat-title{overflow:hidden;font-size:.86rem;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.chat-sub{overflow:hidden;color:var(--muted);font-size:.74rem;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
.chat.active .chat-title{color:var(--ink);font-weight:600}
.chat-open.working .chat-title::after{content:"";display:inline-block;width:6px;height:6px;margin-left:7px;border-radius:50%;background:var(--accent);vertical-align:2px;animation:pulse 1.2s ease-in-out infinite}
.chat-tools{display:flex;gap:1px;padding-right:4px;opacity:0;transition:opacity .15s}
.chat:hover .chat-tools,.chat:focus-within .chat-tools{opacity:1}
@media (hover:none){.chat-tools{opacity:1}}
.chat-tools button{width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--muted);cursor:pointer}
.chat-tools button:hover{background:var(--panel);color:var(--ink)}
.chat input{flex:1;min-width:0;margin:3px;padding:5px 8px;border:1px solid var(--accent-line);border-radius:8px;background:var(--panel);color:var(--ink);font:inherit;font-size:.86rem;outline:0;box-shadow:0 0 0 3px var(--accent-soft)}
.chats-toast{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 10px 8px;padding:8px 12px;border-radius:10px;background:var(--ink);color:var(--panel);font-size:.82rem;animation:rise .2s cubic-bezier(.2,.8,.2,1)}
.chats-toast button{border:0;background:transparent;color:inherit;font-weight:650;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.chats-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 10px;margin:0;padding:10px 16px 14px;border-top:1px solid var(--line-2);font-size:.74rem;color:var(--muted)}
.chats-foot button{border:0;padding:0;background:transparent;color:var(--muted);font-size:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.chats-foot button.danger{color:#dc2626;font-weight:600}
.jump{position:absolute;top:-44px;left:50%;z-index:2;width:34px;height:34px;margin-left:-17px;display:grid;place-items:center;border:1px solid var(--line);border-radius:50%;background:var(--panel);color:var(--ink-2);box-shadow:var(--shadow);cursor:pointer;animation:rise .2s cubic-bezier(.2,.8,.2,1)}
.jump:hover{color:var(--ink);border-color:var(--accent-line)}
.caret{display:inline-block;width:.45em;height:1.05em;margin-left:2px;border-radius:2px;background:var(--accent);vertical-align:-.18em;animation:pulse 1s ease-in-out infinite}
.stopped{margin:6px 0 0;font-size:.76rem;color:var(--muted)}
.send.stop{background:var(--ink);color:var(--panel)}
@keyframes pulse{50%{opacity:.25}}
.top{display:flex;align-items:center;gap:12px;padding:12px 14px 12px 16px;border-bottom:1px solid var(--line-2);background:color-mix(in srgb,var(--panel) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);position:relative;z-index:1}
.who{flex:1;min-width:0}.who h1{margin:0;font-family:var(--font-head);font-size:.98rem;font-weight:var(--head-weight);letter-spacing:var(--head-track);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.who p{margin:0;font-size:.78rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.who p::before{content:"";display:inline-block;width:6px;height:6px;margin:0 8px 0 2px;vertical-align:1px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px color-mix(in srgb,#22c55e 18%,transparent)}
.avatar{flex:none;display:grid;place-items:center;border-radius:50%;overflow:hidden;background:#fff;color:var(--on-accent);font-weight:650}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
.avatar.mono{background:var(--accent)}
.avatar.av-md{width:36px;height:36px;font-size:.95rem}.avatar.av-sm{width:28px;height:28px;font-size:.8rem}.avatar.av-xl{width:64px;height:64px;font-size:1.6rem;box-shadow:var(--shadow)}
.icon-btn{width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.icon-btn:hover{background:var(--line-2);color:var(--ink)}
:focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
.log{flex:1;min-height:0;overflow-y:auto;scroll-behavior:smooth;overscroll-behavior:contain}
.inner{max-width:740px;margin:0 auto;padding:22px 18px 12px;display:flex;flex-direction:column;gap:22px;min-height:100%}
.hero{margin:auto 0;padding:24px 4px 8px;display:grid;justify-items:center;text-align:center;gap:10px;animation:rise .4s cubic-bezier(.2,.8,.2,1)}
.hero h2{margin:6px 0 0;font:var(--head-weight) 1.4rem/1.25 var(--font-head);letter-spacing:var(--head-track)}
.hero .lead{max-width:460px;margin:0;color:var(--ink-2);font-size:.95rem}
.hero .lead p{margin:0 0 .5em}.hero .lead p:last-child{margin:0}
.starters{width:100%;max-width:560px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:14px}
.starters button{display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--panel);cursor:pointer;font-size:.88rem;line-height:1.4;color:var(--ink-2);transition:border-color .15s,background .15s,transform .15s}
.starters button:hover{border-color:var(--accent-line);background:var(--accent-soft);color:var(--ink)}
.starters button svg{flex:none;color:var(--muted)}
.turn{display:flex;gap:10px;animation:rise .32s cubic-bezier(.2,.8,.2,1)}
.turn.user{justify-content:flex-end;animation-name:send}
.bubble{max-width:82%;padding:10px 14px;border-radius:18px 18px 6px 18px;background:var(--accent-soft);color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.turn.bot .body{flex:1;min-width:0;padding-top:3px}
.md{overflow-wrap:anywhere;color:var(--ink)}
.md p{margin:0 0 .7em}.md>:last-child{margin-bottom:0}.md ul,.md ol{margin:.2em 0 .8em;padding-left:1.25em}.md li{margin:.15em 0}
.md a{color:var(--accent-text);text-decoration:underline;text-decoration-color:var(--accent-line);text-underline-offset:2px}
.md code{font:.86em/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:2px 5px;border-radius:6px}
.md h1,.md h2,.md h3,.md h4,.md h5,.md h6{margin:1em 0 .4em;font-weight:650;line-height:1.3;letter-spacing:-.01em}.md>:first-child{margin-top:0}
.md h1{font-size:1.25rem}.md h2{font-size:1.14rem}.md h3{font-size:1.04rem}.md h4,.md h5,.md h6{font-size:.98rem}.md strong{font-weight:640}
.md blockquote{margin:.4em 0 .9em;padding:.1em 0 .1em 14px;border-left:3px solid var(--accent-line);color:var(--ink-2)}
.md del{color:var(--muted)}.md mark{background:color-mix(in srgb,#facc15 35%,transparent);color:inherit;border-radius:3px;padding:0 2px}
.md kbd{font:.8em ui-monospace,SFMono-Regular,Menlo,monospace;padding:1px 6px;border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;background:var(--panel)}
.md li>input[type=checkbox]{margin:0 .45em 0 -1.25em;vertical-align:-1px;accent-color:var(--accent)}.md li:has(>input[type=checkbox]){list-style:none}
.md details{margin:.4em 0 .9em;padding:8px 12px;border:1px solid var(--line);border-radius:12px}.md summary{cursor:pointer;font-weight:600}
.md dl{margin:.2em 0 .8em}.md dt{font-weight:640}.md dd{margin:0 0 .5em 1.1em}
.md .code{margin:.5em 0 .9em;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--code)}
.md .code-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 6px 5px 14px;border-bottom:1px solid var(--line);font:.72rem ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);text-transform:lowercase}
.md .code-head .copy{border:0;background:transparent;color:var(--muted);font:600 .74rem ui-sans-serif,system-ui,sans-serif;text-transform:none;padding:4px 9px;border-radius:7px;cursor:pointer}
.md .code-head .copy:hover{background:var(--line-2);color:var(--ink)}
.md pre{margin:0;padding:12px 14px;overflow-x:auto;font:.82rem/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:4;color:var(--ink)}
.md pre code{display:block;background:none;padding:0;border-radius:0;font:inherit;white-space:pre;overflow-wrap:normal}
.hljs-keyword,.hljs-doctag,.hljs-template-tag,.hljs-variable.language_{color:var(--hl-keyword)}
.hljs-string,.hljs-regexp,.hljs-meta .hljs-string{color:var(--hl-string)}
.hljs-number,.hljs-literal,.hljs-symbol,.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id{color:var(--hl-number)}
.hljs-comment,.hljs-quote{color:var(--hl-comment);font-style:italic}
.hljs-title,.hljs-title.function_,.hljs-title.class_,.hljs-section{color:var(--hl-title)}
.hljs-built_in,.hljs-type,.hljs-params .hljs-type{color:var(--hl-type)}
.hljs-name,.hljs-tag,.hljs-selector-tag,.hljs-bullet{color:var(--hl-tag)}
.hljs-meta,.hljs-meta .hljs-keyword{color:var(--hl-meta)}
.hljs-addition{color:var(--hl-add);background:var(--hl-add-bg)}.hljs-deletion{color:var(--hl-del);background:var(--hl-del-bg)}
.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:650}
.md .diagram .tools{display:flex;gap:2px}
.md .diagram-view{display:grid;place-items:center;padding:16px;background:var(--panel);overflow-x:auto}
.md .diagram-view img{display:block;max-width:100%;height:auto;margin:0;border:0;border-radius:0}
.md .diagram-wait{margin:0;padding:18px 0;font-size:.85rem;background:linear-gradient(90deg,var(--muted) 0%,var(--ink) 45%,var(--muted) 90%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shine 1.8s linear infinite}
.md .diagram-note{margin:0;padding:8px 14px 0;font-size:.78rem;color:var(--muted)}
.md .math:not(.ready){font:.85em ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.md div.math{margin:.5em 0 .9em;overflow-x:auto;overflow-y:hidden;text-align:center}.md div.math math{display:block math;font-size:1.12em}
.md span.math math{font-size:1.05em}
a.cite{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin:0 1px;border-radius:6px;background:var(--accent-soft);color:var(--accent-text);font-size:.7rem;font-weight:650;text-decoration:none;vertical-align:2px;line-height:1}
a.cite:hover{background:var(--accent);color:var(--on-accent)}
.images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px;max-width:560px}
.images.single{grid-template-columns:minmax(0,1fr);max-width:min(100%,460px)}
.images a{display:block;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--code)}
.images img{display:block;width:100%;height:auto}
.images:not(.single) img{aspect-ratio:1/1;object-fit:cover}
.clip{display:flex;align-items:center;gap:10px;width:100%;max-width:420px;margin-top:12px;padding:8px 8px 8px 9px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:0 1px 2px rgba(15,23,42,.04);transition:border-color .15s}
.clip:hover,.clip.playing{border-color:var(--accent-line)}
.clip audio{display:none}
.clip-play{flex:none;width:34px;height:34px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:var(--accent);color:var(--on-accent);cursor:pointer;transition:transform .12s,filter .15s}
.clip-play:hover:not(:disabled){filter:brightness(.92)}
.clip-play:active:not(:disabled){transform:scale(.94)}
.clip-play:disabled{background:var(--line);color:var(--muted);cursor:not-allowed}
.clip.idle .clip-play svg,.clip.error .clip-play svg{margin-left:2px}
.clip-play .spin{animation:spin .8s linear infinite}
.clip-play:focus-visible,.clip-seek:focus-visible,.clip-open:focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
.clip-body{flex:1;min-width:0;display:grid;gap:7px}
.clip-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:.78rem;line-height:1.2}
.clip-label{overflow:hidden;color:var(--ink-2);font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.clip.error .clip-label{color:var(--muted);font-weight:500}
.clip-time{flex:none;color:var(--muted);font-variant-numeric:tabular-nums}
.clip-seek{--p:0%;width:100%;height:4px;margin:0;border-radius:99px;background:linear-gradient(to right,var(--accent) var(--p),var(--line) var(--p));-webkit-appearance:none;appearance:none;cursor:pointer}
.clip-seek:disabled{cursor:default}
.clip-seek::-moz-range-track{background:transparent}
.clip-seek::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;border:2px solid var(--panel);border-radius:50%;background:var(--accent);box-shadow:0 0 0 1px var(--accent-line);opacity:0;transition:opacity .15s}
.clip-seek::-moz-range-thumb{width:10px;height:10px;border:2px solid var(--panel);border-radius:50%;background:var(--accent);opacity:0;transition:opacity .15s}
.clip:hover .clip-seek:not(:disabled)::-webkit-slider-thumb,.clip.playing .clip-seek::-webkit-slider-thumb,.clip-seek:focus-visible::-webkit-slider-thumb{opacity:1}
.clip:hover .clip-seek:not(:disabled)::-moz-range-thumb,.clip.playing .clip-seek::-moz-range-thumb,.clip-seek:focus-visible::-moz-range-thumb{opacity:1}
.clip-open{flex:none;width:28px;height:28px;display:grid;place-items:center;border-radius:8px;color:var(--muted);transition:background .15s,color .15s}
.clip-open:hover{background:var(--accent-soft);color:var(--ink)}
.clip.nudge{border-color:var(--accent-line)}.clip.nudge .clip-play{box-shadow:0 0 0 4px var(--accent-soft)}
@keyframes spin{to{transform:rotate(360deg)}}
/* Checking who the visitor is (most are let straight in): a spinner, not the chat on its own. */
body.checking:not(.gated) .ws,body.checking:not(.gated) .app,body.checking:not(.gated) .ws-ai,body.checking:not(.gated) .crs-strip{visibility:hidden}
body.checking:not(.gated)::before{content:"";position:fixed;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@media (prefers-reduced-motion:reduce){body.checking:not(.gated)::before{animation:none}}
.md hr{border:0;border-top:1px solid var(--line);margin:1.1em 0}
.md img{display:block;max-width:min(100%,460px);height:auto;margin:.5em 0 .8em;border-radius:14px;border:1px solid var(--line)}
.md .table{overflow-x:auto;margin:.3em 0 .9em;border:1px solid var(--line);border-radius:12px}
.md table{border-collapse:collapse;width:100%;font-size:.88rem;line-height:1.45}
.md th,.md td{padding:8px 12px;border-bottom:1px solid var(--line-2);text-align:left;vertical-align:top}
.md th{font-weight:640;background:var(--code);white-space:nowrap}
.md tr:last-child td{border-bottom:0}
.md th[align=center],.md td[align=center]{text-align:center}.md th[align=right],.md td[align=right]{text-align:right}
.sources{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.sources a,.sources span{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:5px 10px 5px 6px;border:1px solid var(--line);border-radius:999px;font-size:.78rem;color:var(--ink-2);text-decoration:none;background:var(--panel)}
.sources a:hover{border-color:var(--accent-line);color:var(--ink)}
.sources b{display:grid;place-items:center;min-width:18px;height:18px;border-radius:50%;background:var(--accent-soft);color:var(--accent-text);font-size:.68rem}
.sources i{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}
.actions{display:flex;gap:4px;margin-top:6px;opacity:0;transition:opacity .15s}
.turn.bot:hover .actions,.turn.bot:focus-within .actions{opacity:1}
@media (hover:none){.actions{opacity:1}}
.actions button{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--muted);font-size:.75rem;padding:4px 7px;border-radius:7px;cursor:pointer}
.actions button:hover{background:var(--line-2);color:var(--ink)}
.md.live{white-space:pre-wrap}
.steps{list-style:none;margin:0 0 4px;padding:0;display:grid;gap:3px;font-size:.84rem;color:var(--muted)}
.steps li::before{content:'✓';display:inline-block;width:1.2em;color:var(--accent-text)}
.thinking .secs{color:var(--muted);font-size:.8rem;font-variant-numeric:tabular-nums}
.thinking{display:flex;flex-direction:column;align-items:flex-start;gap:2px;color:var(--muted);font-size:.9rem;padding-top:4px}
.shimmer{background:linear-gradient(90deg,var(--muted) 0%,var(--ink) 45%,var(--muted) 90%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shine 1.8s linear infinite}
.err{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border:1px solid color-mix(in srgb,#ef4444 35%,transparent);background:color-mix(in srgb,#ef4444 7%,transparent);border-radius:12px;color:var(--ink);font-size:.88rem}
.err.quiet{border-color:var(--line);background:var(--line-2);color:var(--ink-2)}
.err button{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:4px 10px;cursor:pointer;font-size:.8rem}
.composer{position:relative;padding:8px 14px calc(10px + env(safe-area-inset-bottom));background:var(--panel)}
.box{max-width:740px;margin:0 auto;display:flex;align-items:flex-end;gap:8px;padding:7px 7px 7px 16px;border:1px solid var(--line);border-radius:22px;background:var(--panel);box-shadow:var(--shadow);transition:border-color .15s,box-shadow .15s}
.box:focus-within{border-color:var(--accent-line);box-shadow:0 0 0 4px var(--accent-soft),var(--shadow)}
.box textarea{flex:1;resize:none;border:0;outline:0;background:transparent;color:var(--ink);font:inherit;line-height:1.5;padding:7px 0;max-height:180px;min-height:24px}
.box textarea::placeholder{color:var(--muted)}
.box{flex-wrap:wrap}.box.can-attach{padding-left:7px}.box.dropping{border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-soft),var(--shadow)}
.attach{flex:none;width:36px;height:36px;border:0;border-radius:50%;display:grid;place-items:center;background:transparent;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.attach:hover:not(:disabled){background:var(--accent-soft);color:var(--accent-text)}.attach:disabled{opacity:.35;cursor:default}
.attached{flex:0 0 100%;display:flex;flex-wrap:wrap;gap:8px;padding:3px 2px 4px 2px}
.recording .attach,.talking .attach,.recording .attached,.talking .attached{display:none}
.file{position:relative;flex:none;display:flex;align-items:center;gap:9px;height:56px;max-width:240px;padding:0 30px 0 9px;border:1px solid var(--line);border-radius:14px;background:var(--panel);animation:rise .22s cubic-bezier(.2,.8,.2,1)}
.file.image{width:56px;padding:0;overflow:hidden}.file img{display:block;width:100%;height:100%;object-fit:cover}
.file .doc{flex:none;width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:var(--accent-soft);color:var(--accent-text)}
.file .meta{min-width:0;display:grid;line-height:1.3}.file .meta b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem;font-weight:600;color:var(--ink)}.file .meta small{font-size:.72rem;color:var(--muted)}
.file .drop{position:absolute;top:4px;right:4px;width:20px;height:20px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--ink) 78%,transparent);color:var(--panel);cursor:pointer}
.file .drop:hover{background:var(--ink)}
.bubble .files{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:flex-end;gap:6px;margin:2px 0 6px}
.bubble .files img{width:112px;height:112px;object-fit:cover;border-radius:12px;background:var(--line-2)}
.bubble .files .doc-chip{display:inline-flex;align-items:center;gap:6px;max-width:220px;padding:6px 10px;border-radius:10px;background:var(--panel);font-size:.8rem;font-weight:600;white-space:nowrap}
.bubble .files .doc-chip span{overflow:hidden;text-overflow:ellipsis}.bubble .files .doc-chip svg{flex:none;color:var(--accent-text)}
.send{flex:none;width:36px;height:36px;border:0;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:var(--on-accent);cursor:pointer;transition:transform .15s,opacity .15s}
.send:hover{transform:translateY(-1px)}.send:disabled{opacity:.35;cursor:default;transform:none}
.mic{flex:none;width:36px;height:36px;border:0;border-radius:50%;display:grid;place-items:center;background:transparent;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.mic:hover:not(:disabled){background:var(--accent-soft);color:var(--accent-text)}.mic:disabled{opacity:.35;cursor:default}
.send.swap svg{animation:swap .22s cubic-bezier(.2,.8,.2,1)}
@keyframes swap{from{opacity:0;transform:scale(.55) rotate(-25deg)}to{opacity:1;transform:none}}
.icon-btn,.mic,.attach,.send,.rec-cancel,.rec-text,.barge,.clip-open,.chat-tools button{position:relative}
[data-tip]::after{content:attr(data-tip);position:absolute;z-index:30;bottom:calc(100% + 8px);left:50%;padding:5px 9px;border-radius:8px;background:var(--ink);color:var(--panel);font:500 .72rem/1.3 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;letter-spacing:0;text-transform:none;white-space:nowrap;pointer-events:none;opacity:0;transform:translate(-50%,3px);transition:opacity .12s,transform .12s;box-shadow:0 8px 20px -10px rgba(15,23,42,.5)}
[data-tip]:hover::after,[data-tip]:focus-visible::after{opacity:1;transform:translate(-50%,0);transition-delay:.25s}
[data-tip-at=below]::after{bottom:auto;top:calc(100% + 8px);transform:translate(-50%,-3px)}
.send[data-tip]::after,.barge[data-tip]::after,.clip-open[data-tip]::after,.top [data-tip-at=below]::after{left:auto;right:0;transform:translateY(3px)}
#menu[data-tip]::after{left:0;right:auto}.chats-head [data-tip]::after{left:auto;right:0;transform:translateY(-3px)}.chats-head [data-tip]:hover::after,.chats-head [data-tip]:focus-visible::after{transform:none}
.chat-tools [data-tip]::after{bottom:auto;top:50%;left:auto;right:calc(100% + 6px);transform:translate(3px,-50%)}.chat-tools [data-tip]:hover::after,.chat-tools [data-tip]:focus-visible::after{transform:translate(0,-50%)}
.send[data-tip]:hover::after,.send[data-tip]:focus-visible::after,.barge[data-tip]:hover::after,.barge[data-tip]:focus-visible::after,.clip-open[data-tip]:hover::after,.clip-open[data-tip]:focus-visible::after,.top [data-tip-at=below]:hover::after,.top [data-tip-at=below]:focus-visible::after{transform:none}
[data-tip]:disabled::after{display:none}
@media (hover:none){[data-tip]::after{display:none}}
.box.recording{padding-left:7px;border-color:var(--accent-line)}.box.recording textarea{display:none}
.box.talking{padding-left:7px;border-color:var(--accent-line)}.box.talking textarea{display:none}
.rec-say{flex:none;min-width:0;font-size:.84rem;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rec-say[hidden],.rec-time[hidden],.rec-level[hidden]{display:none}
.talk-thinking .rec-say,.talk-speaking .rec-say,.talk-paused .rec-say,.talk-starting .rec-say{flex:1}
.talk-paused .rec-say{white-space:normal;line-height:1.35}
.talk-thinking .rec-dot,.talk-starting .rec-dot{background:var(--muted)}
.talk-speaking .rec-dot{background:var(--accent)}
.talk-paused .rec-dot{display:none}
.rec{flex:1;min-width:0;min-height:36px;display:flex;align-items:center;gap:10px}
.rec-cancel{flex:none;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:var(--muted);cursor:pointer}
.rec-cancel:hover{background:var(--line-2);color:var(--ink)}
.rec-text{flex:none;width:36px;height:36px;display:grid;place-items:center;border:1.5px solid var(--line);border-radius:50%;background:var(--panel);color:var(--ink);cursor:pointer;transition:border-color .15s,background .15s,color .15s}
.rec-text:hover{border-color:var(--accent-line);background:var(--accent-soft);color:var(--accent-text)}
.talking .rec-text{display:none}
.box.dictating{padding-left:16px}.box.dictating textarea,.dictating .rec-cancel,.dictating .rec-text,.dictating .attach,.dictating .attached{display:none}
.dictating .rec-dot{background:var(--muted)}.dictating .rec-say{flex:1}
.barge{flex:none;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.barge:hover{background:var(--line-2);color:var(--ink)}.barge[aria-pressed=true]{background:var(--accent-soft);color:var(--accent-text)}
.rec-dot{flex:none;width:9px;height:9px;border-radius:50%;background:#ef4444;animation:pulse 1.2s ease-in-out infinite}
.rec-time{flex:none;font-size:.84rem;color:var(--ink-2);font-variant-numeric:tabular-nums}
.rec-level{flex:1;min-width:0;height:24px;display:flex;align-items:center;justify-content:flex-end;gap:3px;overflow:hidden}
.rec-level i{flex:none;width:3px;height:3px;border-radius:2px;background:var(--accent);opacity:.7}
.voice-note{max-width:740px;margin:0 auto 8px;padding:8px 12px;border-radius:12px;background:var(--line-2);color:var(--ink-2);font-size:.82rem;line-height:1.45}
.bubble .voice{display:flex;align-items:center;gap:6px;font-size:.74rem;font-weight:600;color:var(--muted);white-space:nowrap}
.bubble .voice svg{color:var(--accent-text)}
.bubble .said{display:block;margin-top:2px}.bubble .said.wait{color:var(--muted)}
.whoami{max-width:740px;margin:8px auto 0;font-size:.76rem;color:var(--ink-2);text-align:center}
.whoami button{border:0;padding:0 2px;background:transparent;color:var(--muted);font-size:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.whoami button.danger{color:#dc2626;font-weight:600}
.rate{display:inline-flex;gap:2px;margin-left:2px}
.actions button.on{background:var(--accent-soft);color:var(--accent-text)}
body.has-course{display:flex;flex-direction:column}body.has-course>.app{flex:1;height:auto;min-height:0}
.crs-gate{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:20px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(6px)}
.crs-gate>div{max-width:380px;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--panel);text-align:center;box-shadow:0 20px 50px -30px rgba(15,23,42,.45)}
.crs-gate h2{margin:0 0 6px;font-size:1.1rem}.crs-gate p{margin:0 0 14px;color:var(--muted)}
.crs-gate a{display:inline-block;padding:10px 18px;border-radius:12px;background:var(--accent);color:var(--on-accent);font-weight:600;text-decoration:none}
.crs-strip{display:flex;align-items:center;gap:12px;min-height:54px;padding:8px 16px;border-bottom:1px solid var(--line-2);background:var(--panel)}
.crs-back{display:inline-flex;align-items:center;gap:4px;padding:5px 8px 5px 4px;border-radius:9px;color:var(--muted);font-size:.86rem;font-weight:560;text-decoration:none;white-space:nowrap}
.crs-back:hover{background:var(--line-2);color:var(--ink)}
.crs-strip strong{flex:1;min-width:0;font-size:.96rem;font-weight:660;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.crs-done,.ws-done{padding:8px 15px;border:1px solid var(--accent);border-radius:var(--r-sm);background:var(--accent);color:var(--on-accent);font:inherit;font-size:.86rem;font-weight:620;cursor:pointer;white-space:nowrap}
.crs-done.is-done,.ws-done.is-done{background:transparent;color:var(--ink);border-color:var(--line)}
.ws-next{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:12px;background:var(--accent);color:var(--on-accent);font-weight:600;text-decoration:none}
.ws-out{padding:6px 10px;border:0;border-radius:9px;background:none;color:var(--muted);font:inherit;font-size:.82rem;text-decoration:underline;text-underline-offset:2px;cursor:pointer}.ws-out:hover{color:var(--ink)}
.crs-stale{position:fixed;left:50%;bottom:16px;z-index:60;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);padding:10px 10px 10px 16px;border-radius:14px;background:var(--ink);color:var(--bg);box-shadow:0 12px 32px rgb(0 0 0 / .22);font-size:.88rem;transform:translateX(-50%)}
.crs-stale button{flex:none;padding:6px 12px;border:0;border-radius:9px;background:var(--bg);color:var(--ink);font:inherit;font-weight:650;cursor:pointer}
.crs-preview,.ws-preview{padding:3px 10px;border-radius:999px;background:color-mix(in srgb,#f59e0b 18%,transparent);color:var(--ink);font-size:.74rem;font-weight:600;white-space:nowrap}
.notice{max-width:740px;margin:8px auto 0;font-size:.72rem;line-height:1.45;color:var(--muted);text-align:center}
.notice a{color:inherit;text-underline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
body.mode-widget .inner,body.mode-inline .inner{padding:18px 14px 10px;gap:18px}
body.mode-widget .composer,body.mode-inline .composer{padding:6px 10px calc(8px + env(safe-area-inset-bottom))}
body.mode-widget .hero h2,body.mode-inline .hero h2{font-size:1.15rem}
body.mode-widget .starters,body.mode-inline .starters{grid-template-columns:1fr}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes send{from{opacity:0;transform:translateY(8px) scale(.97);transform-origin:right bottom}to{opacity:1;transform:none}}
@keyframes shine{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.log{scroll-behavior:auto}}
${workspace ? WORKSPACE_CSS : ''}
${course ? themeOf(settings.course_theme).page : ''}
</style>
</head>
<body class="mode-${mode}${workspace ? ` has-workspace ai-${workspace.ai}${workspace.layout?.corner === 'left' ? ' corner-left' : ''}` : ''}${course && !workspace ? ' has-course' : ''}${(course ? course.identify !== 'browser' || course.asks : Boolean(host.asks)) ? ' checking' : ''}">
${course && !workspace ? `<header class="crs-strip"><a class="crs-back" href="${escapeHtml(course.url)}">${ICON.back}<span>${escapeHtml(course.title)}</span></a><strong>${escapeHtml(course.activity || '')}</strong>${course.done === 'button' ? '<button class="crs-done" type="button" data-done>I’m done</button>' : ''}${course.preview ? '<span class="crs-preview">Preview: what you do here isn’t counted</span>' : ''}</header>` : ''}
${workspace ? '<div class="ws-shell">\n<section id="ws" class="ws" aria-label="Activity"></section>\n' : ''}<div class="app">
  <nav id="chats" class="chats" aria-label="Chats" inert>
    <div class="chats-head"><strong>Chats</strong><button id="chats-close" class="icon-btn" type="button" data-tip="Close" data-tip-at="below" aria-label="Close chats">${ICON.close}</button></div>
    <button id="chats-new" class="chats-new" type="button">${ICON.pen}<span>New chat</span></button>
    <div id="chats-list" class="chats-list"></div>
    <div id="chats-toast" class="chats-toast" role="status" hidden></div>
    <p id="chats-foot" class="chats-foot"><span>This list is kept in this browser.</span><button id="chats-clear" type="button">Clear all</button></p>
  </nav>
  <div id="scrim" class="scrim"></div>
  <div class="main">
  <header class="top">
    <button id="menu" class="icon-btn" type="button" data-tip="Chats" data-tip-at="below" aria-label="Chats" aria-controls="chats" aria-expanded="false">${ICON.chats}</button>
    ${avatarHtml(settings, 'md')}
    <div class="who"><h1>${escapeHtml(settings.title)}</h1><p title="${escapeHtml(settings.tagline || 'AI assistant')}">${escapeHtml(settings.tagline || 'AI assistant')}</p></div>
    <button id="new" class="icon-btn" type="button" data-tip="New chat" data-tip-at="below" aria-label="New chat">${ICON.pen}</button>
    <button id="close" class="icon-btn" type="button" data-tip="Close" data-tip-at="below" aria-label="Close chat" hidden>${ICON.close}</button>
  </header>
  ${before.html || ''}
  <main id="log" class="log" aria-label="Conversation"><div id="inner" class="inner"></div></main>
  <p id="said-aloud" class="sr" aria-live="polite"></p>
  <form id="form" class="composer">
    <button id="jump" class="jump" type="button" data-tip="Latest message" aria-label="Jump to the latest message" hidden>${ICON.down}</button>
    <p id="voice-note" class="voice-note" role="status" hidden></p>
    <div id="box" class="box">
      <div id="attached" class="attached" role="list" aria-label="Attached to your message" hidden></div>
      <button id="attach" class="attach" type="button" data-tip="Add photos and files" aria-label="Add photos and files" hidden>${ICON.plus}</button>
      <input id="files" type="file" multiple hidden>
      <label class="sr" for="input">Message</label>
      <textarea id="input" rows="1" maxlength="${config.maxChars}" placeholder="${escapeHtml(settings.placeholder || 'Ask a question…')}" autocomplete="off"></textarea>
      <div id="rec" class="rec" hidden><button id="rec-cancel" class="rec-cancel" type="button" data-tip="Cancel" aria-label="Cancel the recording">${ICON.close}</button><span class="rec-dot" aria-hidden="true"></span><span id="rec-say" class="rec-say" role="status" hidden></span><span id="rec-time" class="rec-time" role="timer" aria-label="Recording time">0:00</span><span id="rec-level" class="rec-level" aria-hidden="true">${'<i></i>'.repeat(28)}</span><button id="barge" class="barge" type="button" aria-pressed="false" hidden>${ICON.hand}</button><button id="rec-text" class="rec-text" type="button" data-tip="Stop and edit" aria-label="Stop, and put the words in the message box to check before sending">${ICON.done}</button></div>
      <button id="mic" class="mic" type="button" data-tip="Speak" aria-label="Speak your message" hidden>${ICON.mic}</button>
      <button id="send" class="send" type="submit" aria-label="Send" data-tip="Send" disabled>${ICON.send}</button>
    </div>
    <p id="whoami" class="whoami" hidden></p>
    <p class="notice">${noticeOf(settings, course, workspace, links)}</p>
  </form>
  </div>
</div>
${workspace ? `</div>\n<button id="ws-ai" class="ws-ai" type="button" aria-expanded="false" hidden>${ICON.chats}<span>Ask ${escapeHtml(settings.title)}</span></button>\n<script type="application/json" id="ws-config">${scriptJson({ ...workspace, workspace_title: workspace.title, title: settings.title, course, speaks_up: Boolean(course && speaksUp), ...(reading ? { pdf: { worker: `${ASSET_PATH}${assets.pdfWorker}`, data: `${ASSET_PATH}${assets.pdfData}` } } : {}) })}</script>` : ''}
<template id="avatar">${avatarHtml(settings, 'sm')}</template>
<template id="hero-avatar">${avatarHtml(settings, 'xl')}</template>
${assets.render ? `<script src="${ASSET_PATH}${assets.render}" nonce="${nonce}" data-code="${ASSET_PATH}${assets.code}" data-math="${ASSET_PATH}${assets.math}" data-diagram="${ASSET_PATH}${assets.diagram}"></script>` : ''}
${before.script || sheet.script ? `<script nonce="${nonce}">${sheet.script || ''}
${before.script || ''}</script>` : ''}
<script nonce="${nonce}">
const CONFIG = ${scriptJson(config)};
${CHAT_SCRIPT}
</script>
${reading && assets.pdf ? `<script src="${ASSET_PATH}${assets.pdf}" nonce="${nonce}"></script>` : ''}
${workspace && assets.workspace ? `<script src="${ASSET_PATH}${assets.workspace}" nonce="${nonce}"></script>` : ''}
${sheet.html || ''}
${beside.html || ''}
${beside.script ? `<script nonce="${nonce}">${beside.script}</script>` : ''}
</body>
</html>`;
}

// Under the message box: who sees the messages in a course, the page's notice about the AI, and the
// host's own line, each only where there is one.
function noticeOf(settings, course, workspace, links) {
  const parts = [];
  if (course && !workspace) parts.push(`<span>Your teacher can see your messages here.${course.alsoSeen ? ` ${escapeHtml(course.alsoSeen)}` : ''}</span>`);
  parts.push(`<span id="notice-text">${escapeHtml(settings.notice || '')}</span>`);
  if (links.poweredBy) parts.push(`Powered by <a href="${escapeHtml(links.poweredBy.href)}" target="_blank" rel="noopener">${escapeHtml(links.poweredBy.label)}</a>`);
  return parts.filter((part, i) => i !== parts.length - 1 || part).join(settings.notice || parts.length > 1 ? ' · ' : '');
}

// A page with a workspace: the panels beside the chat (ai-right, ai-left), the chat as a corner panel
// opened from a button (ai-corner, and on narrow screens), or no chat at all (ai-off, a page
// without AI). While the host has something to ask first (gated), the chat column shows that alone.
// The panels' own parts are drawn by browser/workspace.browser.js.
const WORKSPACE_CSS = `
.ws-shell{height:100%;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 0 var(--ai-w,clamp(320px,36vw,640px))}
body.ai-left .ws-shell{grid-template-columns:var(--ai-w,clamp(320px,36vw,640px)) 0 minmax(0,1fr)}
body.ai-left .ws{order:3}body.ai-left .ws-split{order:2}body.ai-left .app,body.ai-left .ws-rail{order:1}
body.ai-collapsed .ws-shell{grid-template-columns:minmax(0,1fr) 60px}
body.ai-left.ai-collapsed .ws-shell{grid-template-columns:60px minmax(0,1fr)}
body.ai-collapsed .app{display:none}
body.ai-off .ws-shell,body.ai-corner .ws-shell{grid-template-columns:minmax(0,1fr)}
body.ai-off .app{display:none}
.ws{position:relative;contain:layout;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg)}
body.has-workspace .app{min-width:0;background:var(--panel)}
body.ai-right .app{border-left:1px solid var(--line)}body.ai-left .app{border-right:1px solid var(--line)}
body.has-workspace .inner{padding:16px 16px 8px;gap:18px}
body.has-workspace .composer{padding:6px 12px calc(10px + env(safe-area-inset-bottom))}
/* Docked beside the panels, the AI is part of the page: flat, with a border, not a floating card. */
body.has-workspace:not(.ai-corner) .box{box-shadow:none}body.has-workspace:not(.ai-corner) .box:focus-within{box-shadow:0 0 0 3px var(--accent-soft)}
body.has-workspace .top{padding:10px 10px 10px 14px;gap:10px}
body.has-workspace .who{position:relative}
body.ws-ready .who>p{display:none}
/* Beside a workspace the chat list is a menu under its button, closed until asked for: the panels
   are the page, so nothing slides over them or dims them. */
body.has-workspace .chats{position:absolute;inset:54px 10px auto 10px;z-index:8;width:auto;max-height:min(460px,calc(100% - 140px));border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 22px 50px -24px rgba(15,23,42,.42);transform:none;opacity:0;visibility:hidden;transition:opacity .16s,visibility .16s;overflow:hidden}
body.has-workspace .chats.open{opacity:1;visibility:visible;width:auto}
body.has-workspace .chats .chats-head{padding:10px 10px 6px 14px}
body.has-workspace .scrim,body.has-workspace .scrim.open{background:transparent;backdrop-filter:none}
.ws-split{position:relative;z-index:6;width:0;outline:none}
.ws-split::before{content:"";position:absolute;inset:0 -6px;cursor:col-resize}
.ws-split.fixed::before{cursor:default}
.ws-grip{position:absolute;top:50%;left:-3px;width:6px;height:44px;margin-top:-22px;border-radius:99px;background:var(--accent);opacity:0;transition:opacity .15s}
.ws-split:not(.fixed):hover .ws-grip,.ws-split:focus-visible .ws-grip,body.ws-dragging .ws-grip{opacity:.55}
.ws-split:focus-visible .ws-grip{opacity:1;box-shadow:0 0 0 3px var(--accent-soft)}
body.ws-dragging{cursor:col-resize;user-select:none}body.ws-dragging iframe{pointer-events:none}
body.ai-collapsed .ws-split{display:none}
.ws-rail{display:none}
body.ai-collapsed .ws-rail{display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 0;border:0;border-left:1px solid var(--line);background:var(--panel);color:var(--ink-2);cursor:pointer}
body.ai-left.ai-collapsed .ws-rail{border-left:0;border-right:1px solid var(--line)}
.ws-rail:hover{background:var(--accent-soft);color:var(--ink)}
.ws-rail-label{writing-mode:vertical-rl;transform:rotate(180deg);font-size:.82rem;font-weight:620;letter-spacing:.01em}
.ws-ai{position:fixed;right:18px;bottom:18px;z-index:21;display:inline-flex;align-items:center;gap:9px;padding:7px 16px 7px 7px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--ink);font:inherit;font-weight:620;box-shadow:0 12px 32px -12px rgba(15,23,42,.35);cursor:pointer;transition:transform .15s,box-shadow .15s}
.ws-ai:hover{transform:translateY(-1px);box-shadow:0 16px 40px -14px rgba(15,23,42,.45)}
/* A message the AI wrote first while it was out of sight: a dot on the way to it. */
.ai-new .ws-ai,.ai-new .ws-rail{position:relative}
.ai-new .ws-ai::after,.ai-new .ws-rail::after{content:"";position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px var(--panel)}
body.ai-corner .app{position:fixed;right:18px;bottom:80px;z-index:20;width:min(420px,calc(100vw - 36px));height:min(680px,calc(100vh - 104px));border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 30px 70px -28px rgba(15,23,42,.55)}
body.ai-corner:not(.ai-open) .app{display:none}
body.corner-left.ai-corner .app,body.corner-left .ws-ai{right:auto;left:18px}
@media (max-width:860px){
  .ws-shell{grid-template-columns:minmax(0,1fr)!important}
  .ws-split,.ws-rail,.ws-hide{display:none!important}
  .ws-ai{bottom:calc(88px + env(safe-area-inset-bottom));right:14px;padding:6px}.ws-ai>span:last-child{display:none}
  body.has-workspace:not(.ai-off) .app{display:flex;position:fixed;inset:auto 0 0 0;z-index:20;width:auto;height:min(82vh,720px);border:1px solid var(--line);border-bottom:0;border-radius:20px 20px 0 0;box-shadow:0 -18px 50px -24px rgba(15,23,42,.5)}
  body.has-workspace:not(.ai-off):not(.ai-open) .app{display:none}
}
body.gated .ws,body.gated .ws-ai,body.gated .ws-split,body.gated .ws-rail{display:none!important}
body.gated .ws-shell{grid-template-columns:minmax(0,1fr)!important}
body.gated .app{display:flex!important;position:static!important;width:auto!important;height:100%!important;border:0!important;box-shadow:none!important;border-radius:0!important}
.ws-i{display:inline-grid;place-items:center;flex:none}.ws-i svg{display:block}
.ws-steps{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding:8px 20px;border-bottom:1px solid var(--line-2);background:var(--panel);font-size:.84rem}
.ws-steps-where{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-width:0}
.ws-steps-n{color:var(--muted);font-weight:620}
.ws-steps-dots{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.ws-steps-dots li{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--line-2);color:var(--muted);font-size:.78rem;font-weight:600}
.ws-steps-dots li.on{background:var(--accent-soft);color:var(--accent-text)}
.ws-steps-dots li.done{color:var(--ink-2)}.ws-steps-dots li.done::before{content:"✓";font-size:.72rem}
.ws-steps-next{display:flex;align-items:center;gap:10px}
.ws-steps-note{color:var(--muted);font-size:.8rem}
.ws-steps-go{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:0;border-radius:var(--r-sm);background:var(--accent);color:var(--on-accent);font:inherit;font-weight:650;cursor:pointer}
.ws-steps-go:disabled{opacity:.45;cursor:default}
.ws-steps-sure{display:flex;flex-wrap:wrap;align-items:center;gap:10px;color:var(--ink);font-weight:560}
.ws-steps-no{padding:7px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);font:inherit;font-weight:600;cursor:pointer}
@media (max-width:640px){.ws-steps{padding:8px 14px}}
.ws-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;min-height:60px;padding:10px 20px;border-bottom:1px solid var(--line-2);background:color-mix(in srgb,var(--panel) 90%,transparent);backdrop-filter:saturate(1.4) blur(10px);position:relative;z-index:3}
.ws-lead{display:flex;align-items:center;gap:12px;min-width:0;flex:1 1 200px}
.ws-back{display:inline-flex;flex:0 1 auto;align-items:center;gap:4px;min-width:0;max-width:min(320px,45%);padding:5px 8px 5px 4px;border-radius:9px;color:var(--muted);font-size:.84rem;font-weight:560;text-decoration:none;white-space:nowrap}.ws-back>span{min-width:0;overflow:hidden;text-overflow:ellipsis}.ws-back>svg{flex:none}
.ws-back:hover{background:var(--line-2);color:var(--ink)}
.ws-name{margin:0;font-family:var(--font-head);font-size:1.04rem;font-weight:var(--head-weight);letter-spacing:var(--head-track);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ws-end{display:flex;flex:none;align-items:center;gap:8px;margin-left:auto}
.ws-tabs{display:flex;gap:2px;padding:3px;border-radius:13px;background:var(--line-2);max-width:100%;overflow-x:auto;scrollbar-width:none}
.ws-tabs::-webkit-scrollbar{display:none}
.ws-tab{flex:none;display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border:0;border-radius:10px;background:none;color:var(--muted);font:inherit;font-size:.86rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,box-shadow .15s}
.ws-tab:hover{color:var(--ink)}
.ws-tab[aria-selected=true]{background:var(--panel);color:var(--ink);box-shadow:0 1px 2px rgba(15,23,42,.08),0 1px 1px rgba(15,23,42,.04)}
.ws-tab:focus-visible{outline:2px solid var(--accent-text);outline-offset:1px}
.ws-badge{padding:1px 7px;border-radius:999px;background:var(--accent-soft);color:var(--ink-2);font-size:.7rem;font-weight:650;font-variant-numeric:tabular-nums}
.ws-badge.done{background:color-mix(in srgb,#16a34a 16%,transparent);color:color-mix(in srgb,#15803d 80%,var(--ink))}
.ws-body{flex:1;min-height:0;overflow:auto;position:relative;overscroll-behavior:contain}
.ws-page{max-width:820px;margin:0 auto;padding:34px 36px 0;display:grid;gap:18px;align-content:start;animation:rise .3s cubic-bezier(.2,.8,.2,1)}
.ws-page.writing.has-plan{max-width:1200px}
.ws-page.sheet{max-width:720px;padding-bottom:40px}
.ws-sheet{font-size:1.0625rem;line-height:1.65;color:var(--ink)}
.ws-sheet h1,.ws-sheet h2,.ws-sheet h3{margin:1.2em 0 .4em;color:var(--ink);line-height:1.25}
.ws-sheet>:first-child{margin-top:0}
.ws-sheet blockquote{margin:1em 0;padding:.7em 1em;border-left:3px solid var(--accent-line);background:var(--accent-soft);border-radius:0 var(--r-sm,10px) var(--r-sm,10px) 0}
.starters.said-first{margin:2px 0 8px}
.first-why{margin:0 0 3px;color:var(--muted);font-size:.8125rem;font-weight:600;letter-spacing:.01em}
.ws-sheet-end{display:flex;justify-content:flex-end;padding-top:6px}
.ws-ph{display:grid;gap:6px}
.ws-eyebrow{margin:0;color:var(--accent-text);font-size:.84rem;font-weight:650}
.ws-h{margin:0;font:var(--head-weight) 1.6rem/1.2 var(--font-head);letter-spacing:var(--head-track)}
.ws-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.ws-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:var(--line-2);color:var(--ink-2);font-size:.78rem;font-weight:560}
.ws-chip.ok{background:color-mix(in srgb,#16a34a 14%,transparent);color:color-mix(in srgb,#15803d 85%,var(--ink))}
.ws-card{padding:20px 22px;border:var(--bw) solid var(--line);border-radius:var(--r);background:var(--panel);box-shadow:0 1px 2px rgba(15,23,42,.04)}
.ws-task p{margin:0 0 10px;color:var(--ink-2);font-size:.98rem;line-height:1.7}.ws-task p:last-child{margin:0}
.ws-label{display:block;margin:0 0 8px;color:var(--muted);font-size:.84rem;font-weight:650}
.ws-muted{margin:0;color:var(--muted);font-size:.84rem}
.ws-note-line{display:flex;align-items:flex-start;gap:7px;margin:4px 0 28px;color:var(--muted);font-size:.8rem;line-height:1.5}
.ws-note-line .ws-i{margin-top:3px}
.ws-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:8px 15px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--panel);color:var(--ink);font:inherit;font-size:.88rem;font-weight:620;cursor:pointer;white-space:nowrap;transition:border-color .15s,background .15s,transform .15s,opacity .15s}
.ws-btn:hover:not(:disabled){border-color:var(--accent-line)}
.ws-btn:active:not(:disabled){transform:scale(.98)}
.ws-btn.primary{border-color:var(--accent);background:var(--accent);color:var(--on-accent)}
.ws-btn.primary:hover:not(:disabled){filter:brightness(1.06)}
.ws-btn.ghost{border-color:transparent;background:transparent;color:var(--ink-2)}
.ws-btn.ghost:hover:not(:disabled){background:var(--line-2);color:var(--ink)}
.ws-btn:disabled{opacity:.45;cursor:default}
.ws-btn:focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
.ws-grow{flex:1}
.ws-foot{position:sticky;bottom:0;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:2px -36px 0;padding:12px 36px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line-2);background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:saturate(1.4) blur(12px)}
.ws-count{display:inline-flex;align-items:center;gap:10px;color:var(--ink-2);font-size:.86rem;font-weight:600;font-variant-numeric:tabular-nums}
.ws-meter{width:96px;height:6px;border-radius:99px;background:var(--line);overflow:hidden}
.ws-meter i{display:block;height:100%;width:0;border-radius:inherit;background:var(--accent);transition:width .3s}
.ws-count.short .ws-meter i{background:#d97706}.ws-count.long{color:#dc2626}.ws-count.long .ws-meter i{background:#dc2626}.ws-count.ok .ws-meter i{background:#16a34a}
.ws-save{display:inline-flex;align-items:center;gap:5px;color:var(--muted);font-size:.8rem}
.ws-save.saved .ws-i{color:#16a34a}.ws-save.error{color:#b45309}
.ws-retry{margin-left:4px;padding:2px 9px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);font:inherit;font-size:.78rem;font-weight:620;cursor:pointer}.ws-retry:hover{border-color:var(--accent-line)}
.ws-write{display:grid;gap:14px}
.ws-page.writing{container-type:inline-size}
.ws-seg{display:inline-flex;justify-self:start;gap:2px;padding:3px;border-radius:12px;background:var(--line-2)}
.ws-seg-btn{padding:6px 14px;border:0;border-radius:9px;background:none;color:var(--muted);font:inherit;font-size:.84rem;font-weight:620;cursor:pointer}
.ws-seg-btn[aria-selected=true]{background:var(--panel);color:var(--ink);box-shadow:0 1px 2px rgba(15,23,42,.08)}
.ws-write.has-plan[data-show=draft] .ws-col.plan,.ws-write.has-plan[data-show=plan] .ws-col.draft{display:none}
.ws-write.has-plan .ws-col>.ws-label{display:none}
@container (min-width:760px){.ws-seg{display:none}.ws-write.has-plan .ws-col>.ws-label{display:block}.ws-write.has-plan{grid-template-columns:minmax(260px,.75fr) minmax(0,1.5fr);align-items:start}.ws-write.has-plan .ws-col{display:block!important}.ws-col.plan{position:sticky;top:12px}}
.ws-paper{display:block;width:100%;min-height:52vh;resize:none;overflow:hidden;padding:28px 32px;border:1px solid var(--line);border-radius:var(--r);background:var(--panel);color:var(--ink);font:inherit;font-size:17px;line-height:1.8;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:border-color .15s,box-shadow .15s}
.ws-paper.plan{min-height:34vh;padding:20px 22px;font-size:15px;line-height:1.7;background:color-mix(in srgb,var(--panel) 94%,var(--accent))}
.ws-paper:focus{outline:none;border-color:var(--accent-line);box-shadow:0 0 0 4px var(--accent-soft)}
.ws-paper::placeholder{color:var(--muted)}
.ws-paper[readonly]{background:var(--line-2)}
.ws-drawer{position:fixed;top:72px;right:16px;bottom:84px;z-index:8;width:min(380px,calc(100% - 32px));overflow:auto;padding:18px 20px;border:1px solid var(--line);border-radius:20px;background:var(--panel);box-shadow:0 30px 70px -30px rgba(15,23,42,.5);animation:rise .2s cubic-bezier(.2,.8,.2,1)}
.ws-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.ws-criteria{display:grid;gap:10px;margin:0 0 12px;padding:0;list-style:none}
.ws-criterion{padding:12px 14px;border:1px solid var(--line);border-radius:14px}
.ws-criterion b{font-size:.92rem}.ws-criterion p{margin:4px 0 0;color:var(--ink-2);font-size:.86rem;line-height:1.55}
.ws-check{display:flex;gap:10px;align-items:flex-start;cursor:pointer}
.ws-check input{margin-top:3px;width:17px;height:17px;accent-color:var(--accent)}
.ws-criterion:has(input:checked){border-color:color-mix(in srgb,#16a34a 45%,var(--line));background:color-mix(in srgb,#16a34a 6%,var(--panel))}
.ws-q-where{display:flex;flex-wrap:wrap;align-items:center;gap:8px;color:var(--ink-2);font-size:.9rem;font-weight:620}
.ws-progress{display:flex;gap:5px;margin-top:4px}
.ws-step{flex:1 1 0;min-width:12px;height:22px;padding:8px 0;border:0;background:none;cursor:pointer}
.ws-step::before{content:"";display:block;height:6px;border-radius:99px;background:var(--line);transition:background .2s,height .2s}
.ws-step.did::before{background:var(--accent-line)}.ws-step.ok::before{background:#16a34a}.ws-step.no::before{background:#ef4444}
.ws-step.on::before{height:6px;box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--accent)}
.ws-step:focus-visible{outline:none}.ws-step:focus-visible::before{box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--accent)}
.ws-qcard{display:grid;gap:18px;padding:26px 28px}
.md-inline{display:inline}.md-inline .math{display:inline}
.ws-q-prompt{font-size:1.07rem;line-height:1.7;color:var(--ink)}.ws-q-prompt>.md>p,.ws-q-prompt>.md-inline{font-weight:540}.ws-q-prompt .md p{margin:0 0 .65em}.ws-q-prompt .md .code,.ws-q-prompt .md .table,.ws-q-prompt .md .diagram{font-weight:400}
.ws-q-prompt .md pre{font-size:.86rem}
.ws-q-prompt.cloze{font-size:1.06rem;line-height:2.3}
.ws-blank{width:9em;margin:0 4px;padding:3px 9px;border:0;border-bottom:2px solid var(--accent-line);border-radius:7px 7px 0 0;background:var(--accent-soft);color:var(--ink);font:inherit;font-weight:600}
.ws-blank:focus{outline:none;border-bottom-color:var(--accent)}
.ws-q-answer{display:grid;gap:9px}
.ws-option{position:relative;display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;align-items:center;padding:13px 16px;border:1.5px solid var(--line);border-radius:var(--r-sm);background:var(--panel);cursor:pointer;transition:border-color .15s,background .15s}
.ws-option:hover{border-color:var(--accent-line)}
.ws-option input{position:absolute;opacity:0;pointer-events:none}
.ws-key{display:grid;place-items:center;width:28px;height:28px;border:1.5px solid var(--line);border-radius:9px;color:var(--muted);font-size:.8rem;font-weight:700;transition:background .15s,color .15s,border-color .15s}
.ws-option-text{min-width:0;font-size:.97rem;line-height:1.5}.ws-option-text p{margin:0 0 .4em}.ws-option-text .code{margin:.35em 0 0}.ws-option-text pre{font-size:.8rem}
.md code .ws-blank,pre .ws-blank{width:6.5em;margin:0 2px;padding:0 6px;border-radius:5px 5px 0 0;background:var(--panel);font:inherit;font-weight:600}
.ws-explain{display:block;margin-top:4px;color:var(--ink-2);font-size:.92rem;line-height:1.55}.ws-explain p{margin:0 0 .5em}
.ws-hint-text{flex:1 1 100%}.ws-hint-text p{margin:0 0 .4em}
.ws-criterion-text{display:block;margin-top:4px;color:var(--ink-2);font-size:.86rem;line-height:1.55}
.ws-option:has(input:checked){border-color:var(--accent);background:var(--accent-soft)}
.ws-option:has(input:checked) .ws-key{border-color:var(--accent);background:var(--accent);color:var(--on-accent)}
.ws-option:has(input:focus-visible){outline:2px solid var(--accent-text);outline-offset:2px}
@media (forced-colors:active){.ws-option input{position:static;opacity:1;pointer-events:auto}.ws-option{grid-template-columns:auto 28px minmax(0,1fr)}}
.ws-option:has(input:disabled){cursor:default}
.ws-option.is-right:has(input:checked){border-color:#16a34a;background:color-mix(in srgb,#16a34a 9%,var(--panel))}.ws-option.is-right:has(input:checked) .ws-key{border-color:#16a34a;background:#16a34a;color:#fff}
.ws-option.is-wrong:has(input:checked){border-color:#ef4444;background:color-mix(in srgb,#ef4444 8%,var(--panel))}.ws-option.is-wrong:has(input:checked) .ws-key{border-color:#ef4444;background:#ef4444;color:#fff}
.ws-option-text code{font-size:.92em}
.ws-order{display:grid;gap:7px;margin:0;padding:0;list-style:none}
.ws-order-item{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 12px;border:1.5px solid var(--line);border-radius:13px;background:var(--panel);cursor:grab;transition:border-color .15s,opacity .15s}
.ws-order-item>.ws-i{color:var(--muted)}
.ws-order-item.dragging{opacity:.45}.ws-order-item.over{border-color:var(--accent)}
.ws-order-n{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:var(--line-2);color:var(--ink-2);font-size:.76rem;font-weight:700}
.ws-order-text{flex:1;min-width:0;font-size:.95rem}
.ws-move{display:grid;place-items:center;width:30px;height:30px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink-2);cursor:pointer}
.ws-move.up .ws-i{transform:rotate(90deg)}.ws-move.down .ws-i{transform:rotate(90deg)}
.ws-move:disabled{opacity:.3;cursor:default}
.ws-q-text{width:100%;padding:13px 15px;border:1.5px solid var(--line);border-radius:14px;background:var(--panel);color:var(--ink);font:inherit;font-size:16px}
.ws-q-text:focus{outline:none;border-color:var(--accent-line);box-shadow:0 0 0 4px var(--accent-soft)}
textarea.ws-q-text{min-height:120px;resize:vertical;line-height:1.65}textarea.ws-q-text.long{min-height:240px}
.ws-q-text.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;min-height:240px;tab-size:4;background:var(--code)}
.ws-hints{display:grid;gap:8px}.ws-hints:empty{display:none}
.ws-hint{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;padding:11px 14px;border-radius:13px;background:color-mix(in srgb,#f59e0b 13%,var(--panel));color:var(--ink);font-size:.92rem;line-height:1.55}
.ws-hint .ws-i{color:#d97706;align-self:center}
.ws-feedback{display:flex;gap:10px;align-items:flex-start;border-radius:14px}
.ws-feedback:empty{display:none}
.ws-feedback.ok,.ws-feedback.no,.ws-feedback.part,.ws-feedback.saved{padding:13px 15px}
.ws-feedback p{margin:4px 0 0;color:var(--ink-2);font-size:.92rem;line-height:1.55}
.ws-feedback .ws-i{margin-top:2px}
.ws-feedback.ok{background:color-mix(in srgb,#16a34a 13%,var(--panel))}.ws-feedback.ok .ws-i{color:#16a34a}
.ws-feedback.no{background:color-mix(in srgb,#ef4444 11%,var(--panel))}.ws-feedback.no .ws-i{color:#dc2626}
.ws-feedback.part{background:color-mix(in srgb,#f59e0b 13%,var(--panel))}.ws-feedback.part .ws-i{color:#d97706}
.ws-feedback.saved{background:var(--line-2)}
.ws-model{display:grid;gap:4px;padding:13px 15px;border:1px dashed var(--accent-line);border-radius:14px;background:color-mix(in srgb,var(--accent) 5%,var(--panel))}
.ws-model p{margin:0 0 6px;color:var(--ink-2);font-size:.92rem;line-height:1.6}.ws-model p:last-child{margin:0}
.ws-rec{display:grid;gap:12px;padding:16px 18px;border:1.5px dashed var(--line);border-radius:16px;background:color-mix(in srgb,var(--panel) 96%,var(--ink))}
.ws-rec-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.ws-rec-time{color:var(--ink-2);font-size:.88rem;font-weight:600;font-variant-numeric:tabular-nums}
.ws-rec-audio{width:100%;height:40px}
.ws-results{display:grid;gap:10px}.ws-results h3{margin:0;font-size:1.1rem}
.ws-score{display:flex;align-items:baseline;gap:8px}.ws-score strong{font-size:2rem;font-weight:720;letter-spacing:-.03em}.ws-score span{color:var(--muted)}
.ws-result{padding:11px 14px;border:1px solid var(--line);border-radius:13px}.ws-result p{margin:4px 0 0;color:var(--ink-2);font-size:.9rem}
.ws-result.ok{border-color:color-mix(in srgb,#16a34a 40%,var(--line))}.ws-result.no{border-color:color-mix(in srgb,#ef4444 35%,var(--line))}
.ws-page.embed{position:absolute;inset:0;display:flex;flex-direction:column;max-width:none;padding:0;gap:0;animation:none}
.ws-strip{display:flex;align-items:center;gap:7px;padding:8px 20px;border-bottom:1px solid var(--line-2);background:var(--panel);color:var(--muted);font-size:.78rem}
.ws-frame{flex:1;display:block;width:100%;border:0;background:#fff}
.ws-sees{margin-top:1px}
.ws-sees summary{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:2px 9px 2px 7px;border-radius:999px;background:var(--line-2);color:var(--muted);font-size:.74rem;font-weight:560;cursor:pointer;list-style:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws-sees summary::-webkit-details-marker{display:none}
.ws-sees summary:hover,.ws-sees[open] summary{background:var(--accent-soft);color:var(--ink)}
.ws-sees-pop{position:absolute;left:0;top:calc(100% + 8px);z-index:30;width:min(320px,80vw);padding:13px 15px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:0 20px 50px -20px rgba(15,23,42,.45);font-size:.84rem;line-height:1.5}
.ws-sees-pop p{display:block;margin:6px 0 0;color:var(--ink-2);font-size:.84rem;white-space:normal;overflow:visible}.ws-sees-pop p::before{display:none}.ws-sees-pop .ws-muted{font-size:.78rem}
.hero.docked{margin:auto 0 4px;padding:6px 2px;justify-items:start;text-align:left;gap:8px}
.hero.docked .av{width:36px;height:36px}
.hero.docked h2{margin:2px 0 0;font-size:1.05rem}
.hero.docked .lead{color:var(--muted);font-size:.86rem;max-width:none}
.hero.docked .starters{display:flex;flex-wrap:wrap;gap:7px;margin-top:6px;max-width:none}
.hero.docked .starters button{padding:8px 12px;border-radius:999px;font-size:.84rem}
.hero.docked .starters button svg{display:none}
/* Reading */
.ws-page.reading{position:absolute;inset:0;display:flex;flex-direction:column;max-width:none;padding:0;gap:0;animation:none}
.rd-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 14px;border-bottom:1px solid var(--line-2);background:var(--panel)}
.rd-group{display:inline-flex;align-items:center;gap:4px}
.rd-sep{width:1px;height:20px;margin:0 4px;background:var(--line)}
.rd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:32px;height:32px;padding:0 6px;border:0;border-radius:9px;background:none;color:var(--ink-2);cursor:pointer;font-size:.84rem;font-weight:600}
.rd-btn:hover:not(:disabled){background:var(--line-2);color:var(--ink)}.rd-btn:disabled{opacity:.35;cursor:default}
.rd-btn.wide{padding:0 10px}.rd-btn[aria-expanded=true]{background:var(--accent-soft);color:var(--ink)}
.rd-page{width:44px;height:30px;padding:0 6px;border:1px solid var(--line);border-radius:8px;background:var(--panel);text-align:center;font-variant-numeric:tabular-nums}
.rd-of{color:var(--muted);font-size:.84rem;white-space:nowrap}
.rd-zoom{min-width:54px;height:30px;border:0;border-radius:8px;background:none;color:var(--ink-2);font-size:.82rem;font-weight:600;font-variant-numeric:tabular-nums;cursor:pointer}.rd-zoom:hover{background:var(--line-2)}
.rd-find{width:min(220px,40vw);height:32px;padding:0 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel)}
.rd-find:focus,.rd-page:focus{outline:none;border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}
.rd-found{color:var(--muted);font-size:.8rem;white-space:nowrap}
.rd-scroll{flex:1;min-height:0;overflow:auto;background:color-mix(in srgb,var(--bg) 70%,var(--line));overscroll-behavior:contain}
.rd-scroll:focus-visible{outline:2px solid var(--accent-text);outline-offset:-2px}
.rd-pages{display:grid;justify-items:center;gap:16px;padding:18px 24px 40px}
.rd-status{margin:60px 0;color:var(--muted)}
.rd-sheet{position:relative;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.12),0 8px 24px -12px rgba(15,23,42,.25);border-radius:3px}
.rd-canvas{position:absolute;inset:0;display:block}
.rd-marks{position:absolute;inset:0;pointer-events:none}
.rd-num{position:absolute;right:-30px;bottom:4px;color:var(--muted);font-size:.72rem;font-variant-numeric:tabular-nums}
.rd-mark{position:absolute;padding:0;border:0;border-radius:2px;mix-blend-mode:multiply;pointer-events:auto;cursor:pointer;opacity:.45;z-index:3}
.rd-mark.yellow{background:#facc15}.rd-mark.green{background:#4ade80}.rd-mark.blue{background:#60a5fa}.rd-mark.pink{background:#f472b6}
.rd-mark:hover,.rd-mark:focus-visible{opacity:.65}
.rd-mark.has-note::after{content:"";position:absolute;top:-4px;right:-4px;width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px #fff}
.rd-hit{position:absolute;background:rgba(249,115,22,.35);border-radius:2px}
.textLayer{position:absolute;inset:0;overflow:clip;opacity:1;line-height:1;text-align:initial;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;z-index:2;caret-color:CanvasText;--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size));--min-font-size-inv:calc(1 / var(--min-font-size))}
.textLayer span,.textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%;user-select:text}
.textLayer>:not(.markedContent),.textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;font-size:calc(var(--text-scale-factor) * var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.textLayer .markedContent{display:contents}
.textLayer ::selection{background:color-mix(in srgb,var(--accent) 30%,transparent)}
.textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:0;cursor:default;user-select:none}
.textLayer.selecting .endOfContent{top:0}
.rd-tools{position:absolute;z-index:12;display:flex;align-items:center;gap:4px;padding:5px;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:0 14px 34px -14px rgba(15,23,42,.5)}
.rd-swatch{width:24px;height:24px;padding:0;border:2px solid var(--panel);border-radius:50%;background:var(--swatch);box-shadow:0 0 0 1px var(--line);cursor:pointer}
.rd-swatch:hover,.rd-swatch.on{box-shadow:0 0 0 2px var(--ink-2)}
.rd-tool{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border:0;border-radius:8px;background:none;color:var(--ink-2);font-size:.8rem;font-weight:600;cursor:pointer}
.rd-tool:hover{background:var(--line-2);color:var(--ink)}.rd-tool.danger{color:var(--danger)}
.rd-card{position:absolute;z-index:13;width:min(320px,calc(100% - 16px));display:grid;gap:10px;padding:13px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:0 20px 50px -20px rgba(15,23,42,.5)}
.rd-quote{margin:0;padding:2px 0 2px 10px;border-left:3px solid var(--accent-line);color:var(--ink-2);font-size:.84rem;line-height:1.5;max-height:6.5em;overflow:auto}
.rd-colors{display:flex;gap:6px}
.rd-note{width:100%;min-height:80px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--panel);font-size:.88rem;line-height:1.5;resize:vertical}
.rd-note:focus{outline:none;border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}
.rd-row{display:flex;align-items:center;gap:6px}
.rd-list{position:absolute;top:49px;right:0;bottom:0;z-index:11;width:min(320px,90%);overflow:auto;padding:14px;border-left:1px solid var(--line);background:var(--panel);box-shadow:-18px 0 40px -28px rgba(15,23,42,.4)}
.rd-list h3{margin:0 0 10px;font-size:.92rem}
.rd-item{display:grid;gap:4px;width:100%;margin:0 0 8px;padding:10px 11px;border:1px solid var(--line);border-radius:12px;background:var(--panel);text-align:left;cursor:pointer}
.rd-item:hover{border-color:var(--accent-line)}
.rd-item-page{color:var(--muted);font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.rd-item-quote{padding-left:8px;border-left:3px solid;font-size:.84rem;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rd-item-quote.yellow{border-color:#facc15}.rd-item-quote.green{border-color:#4ade80}.rd-item-quote.blue{border-color:#60a5fa}.rd-item-quote.pink{border-color:#f472b6}
.rd-item-note{color:var(--ink-2);font-size:.82rem}
.rd-sees{margin:0;padding:6px 14px;border-top:1px solid var(--line-2);background:var(--panel)}
.rd-toast{position:absolute;left:50%;bottom:16px;z-index:14;transform:translateX(-50%);margin:0;padding:8px 14px;border-radius:10px;background:var(--ink);color:var(--panel);font-size:.84rem}
@media (max-width:640px){.rd-find{width:120px}.rd-pages{padding:12px 8px 30px}.rd-num{display:none}}
@media (max-width:640px){.ws-qbar{flex-wrap:nowrap;gap:4px}.ws-qbar .ws-btn:not(.primary){padding-left:10px;padding-right:10px}.ws-qbar .ws-btn:not(.primary)>span:not(.ws-i){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}body:has(#ws-ai:not([hidden])) .ws-foot.ws-qbar{padding-right:68px}}
@media (max-width:640px){.ws-bar{padding:8px 14px}.ws-page{padding:22px 16px 0}.ws-foot{margin:2px -16px 0;padding:10px 16px calc(10px + env(safe-area-inset-bottom))}.ws-qcard{padding:20px 18px}.ws-paper{padding:20px 18px}.ws-h{font-size:1.28rem}.ws-tab-label{max-width:9em;overflow:hidden;text-overflow:ellipsis}}
`;

// The page's behavior: anonymous visitor ID, this browser's copy of the conversation, a safe
// Markdown subset with [n] citations, and a working indicator while the agent researches.
const CHAT_SCRIPT = String.raw`(() => {
  const $ = (id) => document.getElementById(id);
  const log = $('log'), inner = $('inner'), form = $('form'), input = $('input'), send = $('send');
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
  // A course preview uses its own browser id, so the teacher's work there stays apart.
  const VISITOR_KEY = CONFIG.visitorKey || 'viable-chat:visitor';
  let visitor = read(VISITOR_KEY);
  if (!visitor) { visitor = newId(); write(VISITOR_KEY, visitor); }
  // The page's own endpoints (…/messages, …/learner): a course activity's carry what its address carried.
  const ENDPOINT = (path) => location.pathname.replace(/\/$/, '') + '/' + path + (CONFIG.query || '');
  // On a shared computer a course asks who is here on each visit and after 20 idle minutes, on its
  // home: an activity opened without that goes there first, and comes back.
  const COURSE = CONFIG.course || null;
  // The course home: who the learner is and whatever else the host asks are settled there; an
  // activity sends the learner there first (with a personal link's code), and the home sends them back.
  const KEY_HERE = location.pathname.split('/').filter(Boolean).pop();
  const toHome = (extra) => { const q = new URLSearchParams(location.search); q.set('open', KEY_HERE); for (const [k, v] of Object.entries(extra || {})) q.set(k, v); location.replace(COURSE.url.split('?')[0] + '?' + q); };
  if (COURSE) {
    const q = new URLSearchParams(location.search);
    if (q.get('join')) { toHome({ join: q.get('join') }); return; }
  }
  const hostAsks = (code) => code === 'join_required' || CONFIG.askCodes.includes(code);
  const HERE = 'viable-course:here';
  const confirmedHere = () => { try { return Date.now() - Number(sessionStorage.getItem(HERE) || 0) < 20 * 60 * 1000; } catch (e) { return true; } };
  if (COURSE && COURSE.shared && COURSE.identify !== 'browser') {
    if (!confirmedHere()) {
      const q = new URLSearchParams(location.search); q.set('open', location.pathname.split('/').filter(Boolean).pop());
      location.replace(COURSE.url.split('?')[0] + '?' + q);
      return;
    }
    // Back after 20 idle minutes, whoever is here says so on the home before anything they type or click counts.
    const stale = (event) => {
      if (confirmedHere()) { try { sessionStorage.setItem(HERE, String(Date.now())); } catch (e) { /* storage unavailable */ } return; }
      event.preventDefault(); event.stopImmediatePropagation(); toHome();
    };
    ['pointerdown', 'keydown', 'click', 'submit'].forEach((type) => document.addEventListener(type, stale, true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !confirmedHere()) toHome(); });
  }

  // Chats kept in this browser, newest first: each with its server conversation, a title (from the
  // platform, or the visitor's own name for it) and its messages. A new chat stays a draft until its
  // first message, so opening one costs nothing and nothing is lost. The single conversation kept
  // before chats existed becomes the first chat.
  // A preview's chats are its own (its own visitor), so a new preview link starts with none.
  const KEY = (CONFIG.visitorKey ? CONFIG.visitorKey + ':' : 'viable-chat:') + CONFIG.slug;
  const MAX_CHATS = 30, MAX_MESSAGES = 40;
  const draftTitle = (text) => {
    const line = String(text || '').replace(/[#*_\x60>\[\]]/g, '').replace(/\s+/g, ' ').trim();
    const wide = /[぀-鿿가-힯]/.test(line);
    const max = wide ? 20 : 46;
    if (line.length <= max) return line || 'New chat';
    const cut = line.slice(0, max); const space = cut.lastIndexOf(' ');
    return (!wide && space > max * 0.6 ? cut.slice(0, space) : cut) + '…';
  };
  function load() {
    const saved = read(KEY);
    if (saved && saved.v === 2 && Array.isArray(saved.chats)) return saved;
    const old = saved && Array.isArray(saved.messages) && saved.messages.length ? saved : null;
    const chats = old ? [{ id: newId(), conversation_id: old.conversation_id || null, title: draftTitle((old.messages.find((m) => m.role === 'user') || {}).text), named: false, updated: Date.now(), messages: old.messages }] : [];
    return { v: 2, current: chats.length ? chats[0].id : null, chats };
  }
  const saved = load();
  let active = saved.chats.find((chat) => chat.id === saved.current) || null;
  function save() {
    saved.current = active && saved.chats.includes(active) ? active.id : null;
    saved.chats.sort((a, b) => b.updated - a.updated);
    saved.chats.splice(MAX_CHATS);
    for (const chat of saved.chats) chat.messages = chat.messages.slice(-MAX_MESSAGES);
    // When the browser's storage is full, the oldest chats go first.
    while (!write(KEY, saved) && saved.chats.length > 1) saved.chats.pop();
  }

  let pending = null; // { chat, controller } while a reply is on its way
  let files = []; // photos and PDFs attached to the next message
  const closeWidget = () => parent.postMessage({ type: 'viable-chat:close' }, '*');
  if (CONFIG.mode === 'widget') { $('close').hidden = false; $('close').onclick = closeWidget; }
  // A question the page around the widget sends for the visitor (its search box's "Ask AI"), sent as
  // if they picked it. Only from that page: the chat page's sites decide where it can be framed.
  if (CONFIG.mode === 'widget') window.addEventListener('message', (e) => {
    if (e.source === parent && e.data && e.data.type === 'viable-chat:ask' && typeof e.data.text === 'string') ask(e.data.text.slice(0, CONFIG.maxChars), null, 'starter');
  });
  const svg = (d, size) => '<svg width="' + (size || 15) + '" height="' + (size || 15) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ARROW = svg('<path d="M5 12h14M13 6l6 6-6 6"/>');
  const COPY = svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
  const CHECK = svg('<path d="M20 6 9 17l-5-5"/>');
  const UP = svg('<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 17.5 21H7V10l4.4-7.4a1.7 1.7 0 0 1 3.1 1.2Z"/>');
  const DOWN = svg('<path d="M17 14V3"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-7A2 2 0 0 1 6.5 3H17v11l-4.4 7.4a1.7 1.7 0 0 1-3.1-1.2Z"/>');
  const PEN = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 14);
  const TRASH = svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', 14);
  const CHATS_ICON = svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 22);
  const SEND = svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 18);
  const STOP = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor"/></svg>';
  const TALK_ICON = svg('<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/>', 18);

  // Replies are rendered by the page's own renderer bundle (browser/render.browser.js). If it can't
  // load, they show as plain text rather than not at all.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeUrl = (u) => /^https?:\/\//i.test(String(u || '')) ? String(u) : null;
  const plain = (text) => { const p = document.createElement('p'); p.style.whiteSpace = 'pre-wrap'; p.textContent = String(text || ''); return p; };
  const renderText = (text, ctx) => window.ViableRender ? window.ViableRender.render(text, ctx) : plain(text);
  const avatar = () => $('avatar').content.firstElementChild.cloneNode(true);

  // The view follows new text only while the visitor is at the bottom; scrolled up to read, it stays
  // put and offers a way back down.
  let pinned = true;
  const jump = $('jump');
  log.addEventListener('scroll', () => { pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 80; if (pinned) jump.hidden = true; }, { passive: true });
  const scrollDown = (force) => {
    if (force) pinned = true;
    if (pinned) { log.scrollTo({ top: log.scrollHeight, behavior: force === 'smooth' ? 'smooth' : 'instant' }); jump.hidden = true; }
    else jump.hidden = false;
  };
  jump.onclick = () => scrollDown('smooth');

  // The answer read aloud, in a compact player: play, seek, time and
  // the file. One clip plays at a time. A reply arriving now loads its length; restored ones on play.
  const PLAY = '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.4-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6Z" fill="currentColor"/></svg>';
  const PAUSE = '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
  const SPIN = svg('<path d="M21 12a9 9 0 1 1-6.22-8.56"/>', 16).replace('<svg', '<svg class="spin"');
  const OPEN = svg('<path d="M7 17 17 7M8 7h9v9"/>', 15);
  const clock = (s) => { const t = Math.max(0, Math.floor(s || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  let nowPlaying = null;
  function audioClip(url, live) {
    const make = (tag, cls) => { const node = document.createElement(tag); if (cls) node.className = cls; return node; };
    const box = make('div'), audio = make('audio'), play = make('button', 'clip-play'), body = make('div', 'clip-body'), head = make('div', 'clip-head');
    const label = make('span', 'clip-label'), time = make('span', 'clip-time'), seek = make('input', 'clip-seek'), open = make('a', 'clip-open');
    audio.preload = live ? 'metadata' : 'none'; audio.src = url;
    play.type = 'button'; label.textContent = 'Listen';
    seek.type = 'range'; seek.min = '0'; seek.step = '0.01'; seek.setAttribute('aria-label', 'Seek');
    open.href = url; open.target = '_blank'; open.rel = 'noopener'; open.innerHTML = OPEN; open.dataset.tip = 'Open audio'; open.setAttribute('aria-label', 'Open the audio in a new tab');
    let state = 'idle';
    const set = (next) => {
      state = next; box.className = 'clip ' + next; play.disabled = next === 'error';
      play.innerHTML = next === 'loading' ? SPIN : next === 'playing' ? PAUSE : PLAY;
      play.setAttribute('aria-label', next === 'playing' ? 'Pause the answer' : 'Play the answer');
      if (next === 'error') label.textContent = 'Audio unavailable';
    };
    const length = () => (Number.isFinite(audio.duration) ? audio.duration : 0);
    const paint = () => {
      const d = length(), at = audio.currentTime || 0;
      seek.max = String(d); seek.value = String(at); seek.disabled = !d;
      seek.style.setProperty('--p', (d ? Math.min(100, (at / d) * 100) : 0) + '%');
      seek.setAttribute('aria-valuetext', clock(at) + ' of ' + clock(d));
      time.textContent = d ? clock(at) + ' / ' + clock(d) : clock(at);
    };
    audio.onloadedmetadata = audio.ondurationchange = audio.ontimeupdate = paint;
    audio.onplaying = () => set('playing');
    audio.onwaiting = () => set('loading');
    audio.onpause = () => { if (state !== 'error') set('idle'); };
    audio.onended = () => { set('idle'); audio.currentTime = 0; };
    audio.onerror = () => set('error');
    const start = () => {
      if (nowPlaying && nowPlaying !== audio) nowPlaying.pause();
      nowPlaying = audio; set('loading');
      // Starting another clip interrupts this one's pending play (AbortError); only real failures
      // count. A browser that won't play before a tap (NotAllowedError) gets one.
      audio.play().catch((error) => {
        if (error && error.name === 'NotAllowedError') { set('idle'); label.textContent = 'Tap to listen'; box.classList.add('nudge'); return; }
        set(error && error.name === 'AbortError' ? 'idle' : 'error');
      });
    };
    play.onclick = () => { if (!audio.paused) return audio.pause(); label.textContent = 'Listen'; start(); };
    seek.oninput = () => { if (length()) audio.currentTime = Number(seek.value); };
    head.append(label, time); body.append(head, seek); box.append(audio, play, body, open);
    set('idle'); paint();
    box.start = start;
    return box;
  }

  // A spoken message shows as a voice message with what the agent heard, once a Transcribe step has
  // heard it (this browser doesn't keep the recording).
  const MIC = svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>', 13);
  const DOC = svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>', 16);
  const REMOVE = svg('<path d="M18 6 6 18M6 6l12 12"/>', 12);
  function userTurn(m) {
    const el = document.createElement('div'); el.className = 'turn user';
    el.append(Object.assign(document.createElement('span'), { className: 'sr', textContent: 'You said:' }));
    const b = document.createElement('div'); b.className = 'bubble';
    if (m.files && m.files.length) {
      const row = document.createElement('div'); row.className = 'files';
      for (const f of m.files) {
        if (f.kind === 'image' && f.thumb) { const img = document.createElement('img'); img.src = f.thumb; img.alt = f.name || 'Image'; row.append(img); }
        else { const chip = document.createElement('span'); chip.className = 'doc-chip'; chip.innerHTML = DOC; const name = document.createElement('span'); name.textContent = f.name || (f.kind === 'image' ? 'Image' : 'Document'); chip.append(name); row.append(chip); }
      }
      b.append(row);
    }
    if (m.voice) {
      const tag = document.createElement('span'); tag.className = 'voice'; tag.innerHTML = MIC + '<span>Voice message · ' + clock(m.voice.seconds) + '</span>';
      const said = document.createElement('span'); said.className = 'said';
      b.append(tag, said); heard(b, m);
    } else if (m.text) b.append(document.createTextNode(m.text));
    el.appendChild(b); inner.appendChild(el);
    return b;
  }
  function heard(b, m, listening) {
    const said = b.querySelector('.said');
    if (!said) return;
    said.className = m.voice.heard || !listening ? 'said' : 'said wait';
    said.textContent = m.voice.heard ? (m.text || 'No words could be made out.') : listening ? 'Listening…' : '';
    said.hidden = !said.textContent;
  }
  // Pictures and audio from elsewhere only over https; from this server, however it is reached.
  const shownHere = (url) => /^https:\/\//i.test(String(url)) || String(url).startsWith(location.origin + '/');
  function botTurn(m, withActions, live) {
    const el = document.createElement('div'); el.className = 'turn bot';
    el.append(Object.assign(document.createElement('span'), { className: 'sr', textContent: (CONFIG.title || 'The assistant') + ' said:' }));
    const body = document.createElement('div'); body.className = 'body';
    // A message the AI wrote without being asked says so, and why.
    if (m.first && FIRST_WORDS[m.first]) { const why = document.createElement('p'); why.className = 'first-why'; why.textContent = FIRST_WORDS[m.first]; body.appendChild(why); }
    const images = m.images || [];
    const ctx = { origin: location.origin, images, used: new Set() };
    const md = document.createElement('div'); md.className = 'md'; md.appendChild(renderText(m.text, { ...ctx, cites: m.citations || [] }));
    md.querySelectorAll('img').forEach((img) => { img.onload = () => scrollDown(); });
    body.appendChild(md);
    const shown = images.filter((image) => shownHere(image && image.url) && !ctx.used.has(image.url));
    if (shown.length) {
      const box = document.createElement('div'); box.className = shown.length === 1 ? 'images single' : 'images';
      for (const image of shown) {
        const link = document.createElement('a'); link.href = image.url; link.target = '_blank'; link.rel = 'noopener';
        const img = document.createElement('img'); img.src = image.url; img.alt = 'Image from the assistant'; img.loading = 'lazy';
        img.onload = () => scrollDown();
        link.appendChild(img); box.appendChild(link);
      }
      body.appendChild(box);
    }
    for (const clip of (m.audio || []).filter((item) => shownHere(item && item.url))) {
      const player = audioClip(clip.url, live), audio = player.querySelector('audio');
      audio.addEventListener('play', () => { if (audio.currentTime < 0.5) noteAfter(m.run_id, 'played'); });
      body.appendChild(player);
    }
    if (m.citations && m.citations.length) {
      const src = document.createElement('div'); src.className = 'sources'; src.setAttribute('aria-label', 'Sources');
      for (const c of m.citations) {
        const url = safeUrl(c.url);
        const chip = document.createElement(url ? 'a' : 'span');
        if (url) { chip.href = url; chip.target = '_blank'; chip.rel = 'noopener'; }
        chip.innerHTML = '<b>' + c.index + '</b><i>' + esc((c.title || url || 'Source') + (c.page ? ' · p. ' + c.page : '')) + '</i>';
        src.appendChild(chip);
      }
      body.appendChild(src);
    }
    if (m.stopped) { const note = document.createElement('p'); note.className = 'stopped'; note.textContent = m.text ? 'Stopped' : 'Stopped before it replied'; body.appendChild(note); }
    if (withActions && m.text) {
      const actions = document.createElement('div'); actions.className = 'actions';
      const copy = document.createElement('button'); copy.type = 'button'; copy.innerHTML = COPY + '<span>Copy</span>';
      copy.onclick = async () => { noteAfter(m.run_id, 'copied'); try { await navigator.clipboard.writeText(m.text); copy.innerHTML = CHECK + '<span>Copied</span>'; setTimeout(() => { copy.innerHTML = COPY + '<span>Copy</span>'; }, 1600); } catch {} };
      actions.appendChild(copy);
      // Was it helpful? Kept with the turn; tapping again takes it back.
      if (CONFIG.ratings && m.run_id) {
        const rate = document.createElement('span'); rate.className = 'rate';
        const paint = () => rate.querySelectorAll('button').forEach((b) => { const on = Number(b.dataset.value) === m.rating; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        for (const [value, label, icon] of [[1, 'Helpful', UP], [-1, 'Not helpful', DOWN]]) {
          const b = document.createElement('button'); b.type = 'button'; b.dataset.value = String(value); b.innerHTML = icon; b.setAttribute('aria-label', label); b.dataset.tip = label;
          b.onclick = async () => {
            const before = m.rating || null; const next = before === value ? null : value;
            m.rating = next; paint(); save();
            try { const res = await fetch(ENDPOINT('rate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor, run_id: m.run_id, rating: next }) }); if (!res.ok) throw new Error('not saved'); }
            catch (e) { m.rating = before; paint(); save(); }
          };
          rate.appendChild(b);
        }
        paint(); actions.appendChild(rate);
      }
      body.appendChild(actions);
    }
    body.addEventListener('click', (e) => { const link = e.target.closest && e.target.closest('a[href]'); if (link && !link.closest('.clip')) noteAfter(m.run_id, 'links_opened'); });
    el.append(avatar(), body); inner.appendChild(el);
    return el;
  }
  // What the AI says first in this step or this activity: its first message, so a learner never meets an empty box. since: when the step began, so it comes after what was said before it.
  const FIRST_WORDS = CONFIG.firstWords || {};
  const saidFirst = () => (window.VIABLE_WS && window.VIABLE_WS.opening && window.VIABLE_WS.opening()) || CONFIG.opening;
  function hero() {
    // Beside a workspace, the empty chat is about the open panel (workspace.browser.js intro()).
    const intro = window.VIABLE_WS && window.VIABLE_WS.intro ? window.VIABLE_WS.intro() : null;
    const first = saidFirst();
    if (first && first.says) {
      botTurn({ text: first.says }, false);
      const offered = first.starters && first.starters.length ? first.starters : intro && intro.starters ? intro.starters.slice(0, 3) : CONFIG.starters;
      if (offered.length) {
        const row = document.createElement('div'); row.className = 'starters said-first';
        for (const s of offered) {
          const b = document.createElement('button'); b.type = 'button'; b.innerHTML = '<span>' + esc(s) + '</span>' + ARROW; b.onclick = () => ask(s, null, 'starter'); row.appendChild(b);
        }
        inner.appendChild(row);
      }
      return;
    }
    const el = document.createElement('section'); el.className = intro ? 'hero docked' : 'hero'; el.id = 'hero';
    el.appendChild($(intro ? 'avatar' : 'hero-avatar').content.firstElementChild.cloneNode(true));
    const h = document.createElement('h2'); h.textContent = intro ? intro.title : CONFIG.title; el.appendChild(h);
    const lead = document.createElement('div'); lead.className = 'lead';
    if (intro) lead.textContent = intro.lead;
    else if (CONFIG.greeting) lead.appendChild(renderText(CONFIG.greeting, { origin: location.origin, images: [] }));
    else lead.textContent = CONFIG.starters.length ? 'Pick a question below, or ask your own.' : CONFIG.handsFree ? 'Type a message, or tap the voice button to talk.' : CONFIG.voice ? 'Type a message, or tap the microphone and speak.' : 'Ask a question to get started.';
    el.appendChild(lead);
    const starters = intro ? intro.starters : CONFIG.starters;
    if (starters.length) {
      const list = document.createElement('div'); list.className = 'starters';
      for (const s of starters) {
        const b = document.createElement('button'); b.type = 'button'; b.innerHTML = '<span>' + esc(s) + '</span>' + ARROW; b.onclick = () => ask(s, null, 'starter'); list.appendChild(b);
      }
      el.appendChild(list);
    }
    inner.appendChild(el);
  }
  function render() {
    inner.replaceChildren();
    const messages = active ? active.messages : [];
    if (!messages.length) hero();
    else {
      const first = saidFirst();
      if (!(first && first.says) && CONFIG.greeting) botTurn({ text: CONFIG.greeting }, false);
      let said = !(first && first.says);
      const opener = () => { said = true; botTurn({ text: first.says }, false); };
      for (const m of messages) {
        if (!said && (m.at || 0) >= (first.since || 0)) opener();
        m.role === 'user' ? userTurn(m) : botTurn(m, true);
      }
      if (!said) opener();
    }
    if (pending && pending.chat === active) inner.appendChild(pending.wait);
    // The page closed before the last reply arrived: offer to ask again.
    else if (messages.length && messages[messages.length - 1].role === 'user') {
      const last = messages[messages.length - 1];
      const el = document.createElement('div'); el.className = 'err quiet';
      const msg = document.createElement('span'); msg.textContent = 'No reply arrived for this message.';
      el.appendChild(msg);
      // A voice message is asked again as the words it was heard as (this browser doesn't keep the recording).
      if (last.text) {
        const again = document.createElement('button'); again.type = 'button'; again.textContent = 'Ask again';
        again.onclick = () => { messages.pop(); save(); render(); ask(last.text, null, 'retry'); };
        el.appendChild(again);
      }
      inner.appendChild(el);
    }
    updateSend(); renderChats();
    scrollDown(true);
  }

  // The chat list: a drawer over the conversation, or a sidebar beside it on wide pages.
  const chats = $('chats'), list = $('chats-list'), scrim = $('scrim'), menu = $('menu');
  // Beside a workspace the list is a menu on any width (closed after choosing), never a sidebar.
  const wide = () => CONFIG.mode === 'page' && !document.body.classList.contains('has-workspace') && window.matchMedia('(min-width: 960px)').matches;
  function openChats(open, remember) {
    chats.classList.toggle('open', open); scrim.classList.toggle('open', open && !wide());
    chats.inert = !open; menu.setAttribute('aria-expanded', String(open));
    if (remember && wide()) write('viable-chat:sidebar', open);
    if (open && !wide()) $('chats-new').focus();
  }
  menu.onclick = () => openChats(!chats.classList.contains('open'), true);
  $('chats-close').onclick = () => { openChats(false, true); menu.focus(); };
  scrim.onclick = () => openChats(false);
  // A click on the panels beside it closes the menu too.
  document.addEventListener('pointerdown', (e) => { if (chats.classList.contains('open') && !wide() && !chats.contains(e.target) && !menu.contains(e.target)) openChats(false); });
  const groupOf = (time) => {
    const day = 86400000, start = new Date(); start.setHours(0, 0, 0, 0);
    if (time >= start.getTime()) return 'Today';
    if (time >= start.getTime() - day) return 'Yesterday';
    if (time >= start.getTime() - 7 * day) return 'Previous 7 days';
    return 'Older';
  };
  // A row's second line: when it was last used (the time today, else the day) and where it ended.
  const stamp = (time) => {
    if (!time) return '';
    const at = new Date(time), now = new Date();
    if (now - at < 60000) return 'Just now';
    if (at.toDateString() === now.toDateString()) return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (now - at < 6 * 86400000) return at.toLocaleDateString([], { weekday: 'short' });
    return at.toLocaleDateString([], { month: 'short', day: 'numeric', ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
  };
  const gist = (chat) => {
    const last = [...(chat.messages || [])].reverse().find((m) => m && m.text);
    if (!last) return '';
    return String(last.text).replace(/\x60{3}[\s\S]*?(\x60{3}|$)/g, ' code ').replace(/[*_\x60#>|~\[\]]+/g, '').replace(/\(https?:[^)]*\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
  };
  // A step of an activity that starts its chat afresh hides the chats begun before it (since).
  let since = 0;
  const shownChats = () => saved.chats.filter((chat) => (chat.created || chat.updated) >= since);
  function renderChats() {
    list.replaceChildren();
    if (!shownChats().length) { const p = document.createElement('p'); p.className = 'chats-empty'; p.innerHTML = CHATS_ICON; p.append('Your chats with ' + (CONFIG.title || 'the assistant') + ' will show here.'); list.appendChild(p); }
    let group = '';
    for (const chat of shownChats()) {
      const name = groupOf(chat.updated);
      if (name !== group) { group = name; const h = document.createElement('p'); h.className = 'chats-group'; h.textContent = name; list.appendChild(h); }
      const row = document.createElement('div'); row.className = 'chat' + (chat === active ? ' active' : '');
      const open = document.createElement('button'); open.type = 'button'; open.className = 'chat-open'; open.title = chat.title;
      const title = document.createElement('span'); title.className = 'chat-title'; title.textContent = chat.title;
      const sub = document.createElement('span'); sub.className = 'chat-sub'; sub.textContent = [stamp(chat.updated), gist(chat)].filter(Boolean).join(' · ');
      open.append(title, sub);
      if (chat === active) open.setAttribute('aria-current', 'true');
      if (pending && pending.chat === chat) open.classList.add('working');
      open.onclick = () => { hush(); if (active !== chat) { active = chat; save(); render(); } if (!wide()) openChats(false); input.focus(); };
      open.ondblclick = () => rename(row, chat);
      const tools = document.createElement('span'); tools.className = 'chat-tools';
      const edit = document.createElement('button'); edit.type = 'button'; edit.innerHTML = PEN; edit.setAttribute('aria-label', 'Rename “' + chat.title + '”'); edit.dataset.tip = 'Rename'; edit.onclick = () => rename(row, chat);
      const del = document.createElement('button'); del.type = 'button'; del.innerHTML = TRASH; del.setAttribute('aria-label', 'Delete “' + chat.title + '”'); del.dataset.tip = 'Delete'; del.onclick = () => remove(chat);
      tools.append(edit, del); row.append(open, tools); list.appendChild(row);
    }
  }
  function rename(row, chat) {
    const field = document.createElement('input'); field.value = chat.title; field.maxLength = 80; field.setAttribute('aria-label', 'Chat name');
    row.replaceChildren(field); field.focus(); field.select();
    let done = false;
    const finish = (keep) => { if (done) return; done = true; const value = field.value.trim(); if (keep && value && value !== chat.title) { chat.title = value; chat.named = true; save(); } renderChats(); };
    field.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    field.onblur = () => finish(true);
  }
  // A deleted chat can be brought back for a few seconds.
  let toastTimer = 0;
  function remove(chat) {
    const index = saved.chats.indexOf(chat);
    if (index < 0) return;
    saved.chats.splice(index, 1);
    if (active === chat) { active = null; render(); }
    save(); renderChats();
    const toast = $('chats-toast'); toast.hidden = false;
    toast.innerHTML = '<span>Chat deleted</span>';
    const undo = document.createElement('button'); undo.type = 'button'; undo.textContent = 'Undo';
    undo.onclick = () => { saved.chats.splice(Math.min(index, saved.chats.length), 0, chat); save(); renderChats(); toast.hidden = true; };
    toast.appendChild(undo);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
  }
  const foot = $('chats-foot');
  $('chats-clear').onclick = () => {
    const ask = document.createElement('span'); ask.textContent = 'Clear this list from this browser?';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'danger'; yes.textContent = 'Delete all';
    const no = document.createElement('button'); no.type = 'button'; no.textContent = 'Cancel';
    const keep = [...foot.childNodes];
    foot.replaceChildren(ask, yes, no); no.focus();
    no.onclick = () => foot.replaceChildren(...keep);
    yes.onclick = () => { saved.chats.length = 0; active = null; save(); foot.replaceChildren(...keep); render(); };
  };
  function newChat() {
    hush();
    if (active) { active = null; save(); render(); }
    if (!wide()) openChats(false);
    input.focus();
  }
  $('new').onclick = newChat;
  $('chats-new').onclick = newChat;

  // What the assistant is doing, as the stream reports it (never how the agent is built).
  const STAGES = { thinking: 'Thinking…', listening: 'Listening to the recording…', searching: 'Looking it up…', reading: 'Reading…', checking: 'Checking the answer…', creating: 'Creating an image…', writing: 'Writing the answer…', speaking: 'Recording the answer aloud…' };
  // Work already done, as visitors read it: what kind and how often, never which step or source.
  // Checks have no count, as retries would tell readers a draft was turned down.
  const DONE = {
    searching: (n) => n === 1 ? 'Searched' : 'Searched ' + n + ' times',
    reading: (n) => n === 1 ? 'Read a source' : 'Read ' + n + ' sources',
    checking: () => 'Checked the answer',
    creating: (n) => n === 1 ? 'Created an image' : 'Created ' + n + ' images',
    listening: () => 'Listened to the recording',
    speaking: () => 'Recorded the answer aloud'
  };
  // How each message came to be written, kept with its turn for the agent's owner: timings, pauses
  // and how much was typed, deleted or pasted, never keystrokes or drafts (with CONFIG.signals off,
  // only how it was sent). Active time adds the gaps between activity while the page is visible,
  // each capped at 30 s, 2 min and 5 min, since time-on-task estimates depend on the cap. And what
  // the visitor did with the latest answer, sent with their next message or as they leave. Every
  // field is defined in utils/researchMetrics.js.
  const CAPS = [30000, 120000, 300000], ACTIVE = ['active_30s_ms', 'active_2m_ms', 'active_5m_ms'];
  const activeMs = [0, 0, 0];
  let lastActive = document.hidden ? 0 : Date.now(), shownSince = lastActive, shownTotal = 0;
  const shown = () => shownTotal + (shownSince ? Date.now() - shownSince : 0);
  const touch = () => {
    const now = Date.now();
    if (lastActive) CAPS.forEach((cap, i) => { activeMs[i] += Math.min(now - lastActive, cap); });
    lastActive = document.hidden ? 0 : now;
  };
  let w = null, typed = '', composing = false, readyAt = Date.now(), after = null;
  // dictated_ms: recordings turned into text in the box (its words aren't counted as typed).
  const fresh = () => { touch(); w = { active: activeMs.slice(), shown: shown(), first: 0, last: 0, record: 0, keys: 0, deleted: 0, pasted: 0, pauses: 0, pause_ms: 0, longest_pause_ms: 0, restarts: 0, recordings_cancelled: 0, left_page: 0, interrupted: false, dictated_ms: 0 }; };
  fresh();
  const pause = (gap) => { if (gap >= 2000) { w.pauses += 1; w.pause_ms += gap; w.longest_pause_ms = Math.max(w.longest_pause_ms, gap); } };
  // The visitor starts on their next message: their time with the latest answer ends here.
  const begin = () => { if (after && after.read_ms == null) { touch(); after.read_ms = activeMs[1] - after.mark; } };
  const noteAfter = (runId, key) => { if (after && runId && after.run_id === runId) after[key] += 1; };
  // What changed in the box since the last look: the common start and end stay, the rest was removed
  // and added (typing over a selection, autocorrect, and an input method's result once it's chosen).
  const edit = (paste) => {
    const next = input.value;
    let a = 0; while (a < typed.length && a < next.length && typed[a] === next[a]) a += 1;
    let b = 0; while (b < typed.length - a && b < next.length - a && typed[typed.length - 1 - b] === next[next.length - 1 - b]) b += 1;
    w.deleted += typed.length - a - b;
    if (paste) w.pasted += next.length - a - b; else w.keys += next.length - a - b;
    if (typed && !next) { w.restarts += 1; w.dictated_ms = 0; }
    typed = next;
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; edit(false); });
  input.addEventListener('input', (e) => {
    const now = Date.now();
    if (w.first) pause(now - w.last); else w.first = now;
    w.last = now; begin();
    if (!composing && !e.isComposing) edit(/^insertFrom(Paste|Drop)/.test(e.inputType || ''));
  });
  for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) document.addEventListener(type, touch, { capture: true, passive: true });
  log.addEventListener('scroll', touch, { passive: true });
  // Recording, waiting for an answer and listening to one are activity too.
  setInterval(() => { if (recording || talk || pending || (nowPlaying && !nowPlaying.paused)) touch(); }, 5000);
  const afterNow = () => after && { run_id: after.run_id, read_ms: after.read_ms != null ? after.read_ms : (touch(), activeMs[1] - after.mark), played: after.played, copied: after.copied, links_opened: after.links_opened };
  const sendAfter = () => { const now = afterNow(); if (now && navigator.sendBeacon) navigator.sendBeacon(ENDPOINT('after'), new Blob([JSON.stringify({ visitor, run_id: now.run_id, after: now })], { type: 'application/json' })); };
  document.addEventListener('visibilitychange', () => {
    touch();
    if (document.hidden) { if (shownSince) shownTotal += Date.now() - shownSince; shownSince = 0; w.left_page += 1; sendAfter(); }
    else lastActive = shownSince = Date.now();
  });
  addEventListener('pagehide', sendAfter);
  // The signals for a message as it is sent; the next message starts fresh.
  function take(source, voice) {
    begin(); touch();
    const now = Date.now(), out = { source };
    if (CONFIG.signals) {
      // A dictated message was begun by typing or by speaking, whichever came first.
      const started = source === 'dictated' ? Math.min(...[w.first, w.record].filter(Boolean)) : 0;
      const first = source === 'typed' ? w.first : source === 'voice' ? w.record : source === 'dictated' ? started : source === 'starter' ? now : 0;
      if (first) out.think_ms = Math.max(0, first - readyAt);
      if ((source === 'typed' && w.first) || source === 'dictated') {
        if (w.first) pause(now - w.last);
        Object.assign(out, { compose_ms: now - (source === 'dictated' ? started : w.first), keys: w.keys, deleted: w.deleted, pasted: w.pasted, pauses: w.pauses, pause_ms: w.pause_ms, longest_pause_ms: w.longest_pause_ms, restarts: w.restarts });
      }
      if (voice && voice.ms) out.recording_ms = voice.ms;
      else if (source === 'dictated') out.recording_ms = w.dictated_ms;
      if (w.recordings_cancelled) out.recordings_cancelled = w.recordings_cancelled;
      ACTIVE.forEach((key, i) => { out[key] = activeMs[i] - w.active[i]; });
      out.visible_ms = shown() - w.shown; out.left_page = w.left_page;
      if (w.interrupted) out.interrupted = true;
    }
    fresh(); typed = '';
    return out;
  }
  // The website an embed is on, as the embed reports it.
  const SITE = new URLSearchParams(location.search).get('site') || null;
  // page_context: the page of that website the chat is open on, from the page that framed it, sent with
  // each message for the agent (the server checks it again).
  let PAGE = null;
  if (CONFIG.pageContext && CONFIG.mode !== 'page' && SITE) window.addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || e.data.type !== 'viable-chat:page') return;
    let url; try { url = new URL(String(e.data.url || '')); } catch { return; }
    if (url.origin === SITE) PAGE = { url: url.origin + url.pathname, title: String(e.data.title || '').slice(0, 200) };
  });
  // links_in_place: in the chat button's panel, a link to that website (a cited page of its own) goes
  // to the page around the panel, which opens it in place (the widget checks it is on its own site).
  if (CONFIG.linksInPlace && CONFIG.mode === 'widget' && SITE) document.addEventListener('click', (e) => {
    const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!link || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    let url; try { url = new URL(link.href); } catch { return; }
    if (url.origin !== SITE) return;
    e.preventDefault();
    parent.postMessage({ type: 'viable-chat:navigate', url: url.href }, '*');
  });

  // A course activity changed by the teacher since this page opened: what is sent here still counts
  // (as the version shown), and the learner is offered the new one. The workspace says so too.
  const showStale = () => {
    if (document.getElementById('crs-stale')) return;
    const bar = document.createElement('div'); bar.id = 'crs-stale'; bar.className = 'crs-stale'; bar.setAttribute('role', 'status');
    const say = document.createElement('span'); say.textContent = 'Your teacher changed this activity. Reload to get the new version.';
    const again = document.createElement('button'); again.type = 'button'; again.textContent = 'Reload';
    again.addEventListener('click', () => location.reload()); // leaving the page sends what is still queued
    bar.append(say, again); document.body.append(bar);
  };
  window.addEventListener('viable:stale', showStale);
  const VERSION = CONFIG.course && CONFIG.course.version ? { version: CONFIG.course.version } : {};

  // The reply, streamed: stages as they happen, then the reply. A server that answers with JSON
  // (or an error before streaming) is read the same way.
  async function post(chat, text, voice, signal, onStage, onDelta, onHeard, onAudio, extra) {
    const res = await fetch(ENDPOINT('messages'), { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ message: text, ...(voice ? { audio: voice.audio } : {}), conversation_id: chat.conversation_id, visitor, stream: true, ...VERSION, ...extra }) });
    const fail = (data) => { const error = new Error((data && data.error && data.error.message) || 'The assistant couldn’t answer just now. Try again in a moment.'); error.code = data && data.error && data.error.code; error.details = data && data.error && data.error.details; throw error; };
    if (!(res.headers.get('content-type') || '').includes('text/event-stream') || !res.body) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) fail(data);
      return data;
    }
    const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    // Stopping ends the read here at once, whatever the connection does.
    signal.addEventListener('abort', () => { reader.cancel().catch(() => {}); }, { once: true });
    for (;;) {
      const { value, done } = await reader.read();
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n'); buffer = blocks.pop();
      for (const block of blocks) {
        const name = (block.match(/^event: (.+)$/m) || [])[1];
        const raw = (block.match(/^data: (.+)$/m) || [])[1];
        if (!name || !raw) continue;
        let data = {}; try { data = JSON.parse(raw); } catch (e) { continue; }
        if (name === 'run.progress') onStage(data.stage);
        else if (name === 'run.transcript') onHeard(data);
        else if (name === 'run.audio') onAudio(data);
        else if (name === 'run.delta') onDelta(data.text || '');
        // Only a request the host granted it gets this; whatever joined through slots.beside listens.
        else if (name === 'run.trace') window.dispatchEvent(new CustomEvent('viable:trace', { detail: data }));
        else if (name === 'run.completed') return data;
        else if (name === 'run.failed') fail(data);
      }
    }
    fail(null);
  }
  // The round button. With text it sends; with an empty box it starts a voice conversation where
  // the agent can hear visitors (typing means they chose to type, so the two share one place); while
  // this chat's reply is on its way it stops it. In a conversation it sends now, stops the reading,
  // or picks a paused conversation up again. Its icon swaps with a short turn.
  let face = '';
  function setFace(icon, label, disabled) {
    if (face !== label) { send.innerHTML = icon; send.classList.remove('swap'); void send.offsetWidth; send.classList.add('swap'); face = label; }
    send.setAttribute('aria-label', label); send.dataset.tip = label; send.disabled = disabled;
  }
  function updateSend() {
    const mine = Boolean(pending && pending.chat === active);
    send.classList.toggle('stop', mine);
    mic.disabled = Boolean(pending) || dictating;
    const talking = Boolean(talk) && !mine;
    send.classList.toggle('talk', !talk && !mine && !recording && !dictating && CONFIG.handsFree && !input.value.trim() && !files.length && !pending);
    if (talking) {
      const state = talk.state;
      if (state === 'speaking') return setFace(STOP, 'Stop reading', false);
      if (state === 'paused') return setFace(TALK_ICON, 'Keep talking', false);
      return setFace(SEND, 'Send now', state !== 'listening' || !(recording && recording.heard));
    }
    if (mine) return setFace(STOP, 'Stop', false);
    if (reading && !reading.stopped) return setFace(STOP, 'Stop reading', false);
    if (recording) return setFace(SEND, 'Send voice message', false);
    if (send.classList.contains('talk')) return setFace(TALK_ICON, 'Voice conversation', false);
    setFace(SEND, 'Send', Boolean(pending) || dictating || (!input.value.trim() && !files.length));
  }
  // voice: { audio (a data URI), seconds, ms } for a spoken message. source: how it was sent
  // (typed, voice, talk, starter or retry). attached: the photos and PDFs going with it (by default
  // those in the message box, with a voice message too).
  async function ask(text, voice, source, attached) {
    text = String(text || '').trim();
    const sent = attached || files;
    if ((!text && !voice && !sent.length) || pending || recording || dictating) return;
    // A message of theirs goes first: the AI's own, on its way, is left.
    if (firstTurn) { firstTurn.controller.abort(); firstTurn = null; }
    askedAt = Date.now();
    say('');
    // What the visitor has open in the page's workspace (workspace.browser.js), for the agent to see.
    const open = window.VIABLE_WS && window.VIABLE_WS.state ? window.VIABLE_WS.state() : null;
    const extra = { signals: take(source || (voice ? (talk ? 'talk' : 'voice') : w.dictated_ms ? 'dictated' : 'typed'), voice), after: CONFIG.signals ? afterNow() : null, site: SITE, ...(PAGE ? { page: PAGE } : {}), ...(open ? { workspace: open } : {}), ...(sent.length ? { attachments: sent.map((f) => ({ data: f.data, name: f.name })) } : {}) };
    after = null;
    let chat = active;
    if (!chat) { chat = { id: newId(), conversation_id: null, title: voice ? 'Voice message' : text ? draftTitle(text) : sent[0].kind === 'image' ? 'Image' : sent[0].name, named: false, created: Date.now(), updated: Date.now(), messages: [] }; saved.chats.unshift(chat); active = chat; inner.replaceChildren(); const first = saidFirst(); if (first && first.says) botTurn({ text: first.says }, false); else if (CONFIG.greeting) botTurn({ text: CONFIG.greeting }, false); }
    const mine = { role: 'user', at: Date.now(), text: voice ? '' : text, ...(voice ? { voice: { seconds: voice.seconds } } : {}), ...(sent.length ? { files: sent.map((f) => ({ kind: f.kind, name: f.name, thumb: f.thumb || null })) } : {}) };
    chat.messages.push(mine); chat.updated = Date.now(); save();
    const bubble = userTurn(mine);
    if (!attached && files.length) { files = []; paintFiles(); }
    if (voice) heard(bubble, mine, true);
    else { input.value = ''; grow(); }
    // What the agent heard replaces "Listening…" as soon as it is known, and names a new chat.
    const hear = (transcript) => {
      if (!voice || !transcript || mine.voice.heard) return;
      mine.text = String(transcript.text || '').trim(); mine.voice.heard = true;
      if (!chat.named && chat.messages[0] === mine && mine.text) chat.title = draftTitle(mine.text);
      save(); heard(bubble, mine); renderChats();
    };
    const wait = document.createElement('div'); wait.className = 'turn bot';
    const label = document.createElement('div'); label.className = 'thinking';
    const done = document.createElement('ul'); done.className = 'steps';
    const now = document.createElement('span'); now.className = 'now'; now.innerHTML = '<span class="shimmer">' + STAGES.thinking + '</span><span class="secs" aria-hidden="true"></span>';
    label.append(done, now);
    wait.append(avatar(), label); inner.appendChild(wait);
    const controller = new AbortController();
    const turn = pending = { chat, controller, wait, barge: false };
    // The answer read aloud as it is written plays straight away in a conversation, and otherwise
    // when it would play by itself anyway (autoplay); a newer answer stops an older one.
    if (speaking) speaking.stop();
    const out = talk ? (talk.player ? liveVoice(talk.player, talk.out) : null) : speaker && (CONFIG.autoplay === 'always' || (CONFIG.autoplay === 'spoken' && voice)) ? liveVoice(speaker) : null;
    speaking = out;
    if (talk) talk.live = out;
    if (out) out.onstart = () => { turn.spoke = true; if (nowPlaying) nowPlaying.pause(); if (talk && talk.live === out && talk.state === 'thinking') speakingNow(); };
    updateSend(); renderChats(); scrollDown(true);
    // Progress: the work done so far, ticked, and what it is doing now with the seconds it has taken.
    const started = Date.now(); const counts = {}; let stage = 'thinking';
    const tick = setInterval(() => { const s = Math.round((Date.now() - started) / 1000); now.lastChild.textContent = s >= 4 ? ' ' + s + 's' : ''; }, 1000);
    const step = (next) => {
      if (!STAGES[next] || next === stage) return;
      if (chat === active) aloud(STAGES[next]);
      if (CONFIG.showProgress && DONE[stage]) {
        counts[stage] = (counts[stage] || 0) + 1;
        let item = done.querySelector('[data-stage="' + stage + '"]');
        if (!item) { item = document.createElement('li'); item.dataset.stage = stage; done.appendChild(item); }
        item.textContent = DONE[stage](counts[stage]);
      }
      stage = next;
      if (CONFIG.showProgress) now.firstChild.textContent = STAGES[next];
      if (chat === active) scrollDown();
    };
    // A reply that goes straight to the visitor shows as it is written, formatted as it grows (at
    // most once a frame, with diagrams and math left for the final reply), then is drawn again with
    // its sources.
    let live = null, written = '', drawing = 0;
    const caret = document.createElement('span'); caret.className = 'caret';
    const draw = () => {
      drawing = 0;
      if (window.ViableRender) live.replaceChildren(renderText(written, { origin: location.origin, images: [], used: new Set(), cites: [], live: true }));
      else live.textContent = written;
      let end = live; while (end.lastChild && end.lastChild.nodeType === 1 && !/^(PRE|TABLE|DIV|IMG|BR)$/.test(end.lastChild.tagName)) end = end.lastChild;
      end.appendChild(caret);
      if (chat === active) scrollDown();
    };
    const settle = (reply) => {
      clearInterval(tick); cancelAnimationFrame(drawing);
      readyAt = Date.now();
      if (voice && !mine.voice.heard) heard(bubble, mine);
      reply.at = Date.now(); chat.messages.push(reply); chat.updated = Date.now();
      pending = null; save();
      if (chat === active && reply.text) aloud((CONFIG.title || 'The assistant') + ' said: ' + reply.text);
      let el = null;
      if (chat === active && wait.isConnected) { el = botTurn(reply, true, true); wait.replaceWith(el); scrollDown(); }
      else if (chat === active) render();
      updateSend(); renderChats();
      return el;
    };
    try {
      const data = await post(chat, text, voice, controller.signal, step, (piece) => {
        if (!CONFIG.streamReplies) return;
        if (!live) { const body = document.createElement('div'); body.className = 'body'; live = document.createElement('div'); live.className = window.ViableRender ? 'md' : 'md live'; body.appendChild(live); label.replaceWith(body); wait.removeAttribute('role'); }
        written += piece;
        if (!drawing) drawing = requestAnimationFrame(draw);
      }, hear, (piece) => { if (out) out.add(piece); }, extra);
      chat.conversation_id = data.conversation_id || chat.conversation_id;
      if (data.stale) showStale();
      hear(data.transcript);
      if (data.title && !chat.named) chat.title = data.title;
      const el = settle({ role: 'bot', text: data.reply.text, citations: data.reply.citations || [], images: data.reply.images || [], audio: data.reply.audio || [], run_id: data.run_id || null });
      // The workspace knows the answers, to tell text pasted from them from the visitor's own.
      if (window.VIABLE_WS && window.VIABLE_WS.reply) window.VIABLE_WS.reply(data.reply.text || '');
      if (CONFIG.signals && data.run_id) { touch(); after = { run_id: data.run_id, mark: activeMs[1], read_ms: null, played: turn.spoke ? 1 : 0, copied: 0, links_opened: 0 }; }
      // A conversation by voice goes on by voice: the answer read aloud plays by itself (in a
      // hands-free conversation, through it, and then it listens again).
      const clip = el && el.querySelector('.clip');
      if (talk) { if (talk.live === out && (talk.state === 'thinking' || talk.state === 'speaking')) talkReply(data.reply.audio || [], out); }
      else if (out && out.received) { reading = out; updateSend(); out.done().then(() => { if (reading === out) { reading = null; updateSend(); } }); }
      else if (clip && (CONFIG.autoplay === 'always' || (CONFIG.autoplay === 'spoken' && voice))) clip.start();
    } catch (error) {
      if (out) out.stop();
      if (controller.signal.aborted) { settle({ role: 'bot', text: written, stopped: true }); w.interrupted = true; if (talk && !turn.barge) pauseTalk(); return; }
      clearInterval(tick); cancelAnimationFrame(drawing);
      pending = null; readyAt = Date.now();
      // Nothing could be made out in a voice message: no answer, no bubble; a conversation listens on.
      if (error.code === 'nothing_heard') {
        chat.messages.pop();
        if (!chat.messages.length) { saved.chats.splice(saved.chats.indexOf(chat), 1); if (active === chat) active = null; }
        save(); updateSend(); renderChats();
        wait.remove(); if (bubble.parentNode) bubble.parentNode.remove();
        if (talk) { talk.hint = 'Didn’t catch that. Go ahead.'; listen(); }
        else say('No words came through. Try again a little closer to the microphone.');
        return;
      }
      if (voice && !mine.voice.heard) heard(bubble, mine);
      chat.messages.pop();
      // The host now asks something first, or a course asks who this is: its home, or on a chat page
      // the host's own step.
      if (hostAsks(error.code)) {
        if (!chat.messages.length) { saved.chats.splice(saved.chats.indexOf(chat), 1); if (active === chat) active = null; }
        save(); updateSend(); render();
        if (COURSE) toHome(); else whoIs(null).then(joined).catch(() => {});
        return;
      }
      // A chat whose only message failed isn't kept; the retry starts it again.
      if (!chat.messages.length) { saved.chats.splice(saved.chats.indexOf(chat), 1); if (active === chat) active = null; }
      save(); updateSend(); renderChats();
      if (!wait.isConnected) return;
      wait.remove();
      const el = document.createElement('div'); el.className = 'err'; el.setAttribute('role', 'alert');
      const msg = document.createElement('span'); msg.textContent = error.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Try again';
      retry.onclick = () => { el.remove(); const last = inner.lastElementChild; if (last && last.classList.contains('user')) last.remove(); ask(text, voice, 'retry', sent); };
      el.append(msg, retry); inner.appendChild(el); scrollDown();
      if (talk) pauseTalk('The assistant couldn’t answer. Tap the microphone to keep talking.');
    } finally {
      const at = document.activeElement;
      if (chat === active && (!at || at === document.body || (at.closest && at.closest('.app')))) input.focus({ preventScroll: true });
    }
  }
  // Speaking instead of typing, when the agent can hear visitors. The microphone sends a voice
  // message: it records until the visitor sends or cancels, or CONFIG.voiceSeconds pass. The round
  // button starts a hands-free conversation while the message box is empty (see talk). Nothing is
  // recorded before the visitor taps, and this browser doesn't keep the recording.
  const mic = $('mic'), box = $('box'), rec = $('rec'), recTime = $('rec-time'), recSay = $('rec-say'), level = $('rec-level'), note = $('voice-note');
  let recording = null;
  // The recording's words going into the message box (the stop button), for the visitor to check
  // and change before they send them as text.
  let dictating = false;
  const say = (text) => { note.textContent = text || ''; note.hidden = !text; };
  const canRecord = () => Boolean(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  // Opus in WebM or Ogg where browsers make it, AAC in MP4 on Safari; all transcribe.
  const recorderType = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) || '';
  const newContext = () => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } };
  const micBlocked = (error) => error && error.name === 'NotFoundError' ? 'No microphone was found. Type your message instead.' : CONFIG.mode === 'page' ? 'The microphone is blocked. Allow it for this page in your browser, or type instead.' : 'The microphone is blocked. Allow it in your browser (the site showing this chat must allow it too), or type instead.';
  // The microphone and how loud it is. The level the voice detector reads comes from the speech band
  // (150 to 4000 Hz, so a fan's hum or a hiss counts less) and is measured on the audio thread, which
  // keeps running in a background tab (screen frames don't); the meter is drawn from it on screen.
  async function openMic(context) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const m = { stream, context: context || newContext(), level: 0, peak: 0, onlevel: null, nodes: [] };
    try {
      const ctx = m.context;
      const source = ctx.createMediaStreamSource(stream);
      const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 150;
      const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 4000;
      const probe = ctx.createScriptProcessor(2048, 1, 1);
      const mute = ctx.createGain(); mute.gain.value = 0;
      source.connect(high); high.connect(low); low.connect(probe); probe.connect(mute); mute.connect(ctx.destination);
      probe.onaudioprocess = (e) => {
        const samples = e.inputBuffer.getChannelData(0);
        let sum = 0, peak = 0;
        for (let i = 0; i < samples.length; i += 1) { const x = samples[i]; sum += x * x; if (x > peak) peak = x; else if (-x > peak) peak = -x; }
        m.level = Math.sqrt(sum / samples.length); m.peak = Math.max(m.peak * 0.8, peak);
        if (m.onlevel) m.onlevel(m.level, (samples.length / e.inputBuffer.sampleRate) * 1000);
      };
      m.nodes = [source, high, low, probe, mute];
    } catch (e) { /* No level: recording still works; a conversation can't tell when to send. */ }
    return m;
  }
  const releaseMic = (m) => {
    if (!m) return;
    m.onlevel = null;
    m.nodes.forEach((node) => { try { node.disconnect(); } catch (e) { /* already gone */ } });
    m.stream.getTracks().forEach((track) => track.stop());
  };
  // A recorder on the microphone; making a new one starts the recording over.
  function record(r) {
    let recorder;
    try { const type = recorderType(); recorder = new MediaRecorder(r.mic.stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 48000 }); }
    catch (e) { return false; }
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { if (r.recorder === recorder) finishRecording(r); };
    r.recorder = recorder; r.chunks = chunks; r.started = Date.now();
    recorder.start(1000);
    return true;
  }
  // The level meter, drawn while the page is on screen.
  function meter(r) {
    const bars = Array.from(level.children), levels = bars.map(() => 3);
    let last = 0;
    const paint = (now) => {
      r.frame = requestAnimationFrame(paint);
      if (now - last < 60) return;
      last = now;
      levels.shift(); levels.push(Math.max(3, Math.min(24, Math.round(r.mic.peak * 60))));
      bars.forEach((bar, i) => { bar.style.height = levels[i] + 'px'; });
    };
    r.frame = requestAnimationFrame(paint);
  }
  // auto: in a conversation, the visitor's pause ends the recording instead of a tap.
  async function startRecording(auto) {
    if (recording || (pending && !talk)) return;
    say('');
    if (!canRecord()) { say('This browser can’t record audio. Type your message instead.'); if (talk) endTalk(); return; }
    if (nowPlaying) nowPlaying.pause();
    const starting = recording = { starting: true };
    let m = talk && talk.mic;
    if (!m) {
      try { m = await openMic(); } catch (error) { recording = null; say(micBlocked(error)); return; }
      // Cancelled (another chat, Escape) while the browser asked for the microphone.
      if (recording !== starting) { releaseMic(m); if (m.context) m.context.close().catch(() => {}); return; }
    }
    if (!talk && !w.record) { w.record = Date.now(); begin(); }
    const r = recording = { mic: m, owned: !talk, auto: Boolean(auto), barge: false, seconds: 0, cancelled: false, done: false, heard: false, voiced: 0, lastVoice: 0, floor: 0.008, listening: Date.now() };
    if (!record(r)) {
      recording = null; if (r.owned) { releaseMic(m); if (m.context) m.context.close().catch(() => {}); }
      say('This browser can’t record audio. Type your message instead.'); if (talk) endTalk(); return;
    }
    meter(r);
    if (r.auto) m.onlevel = (rms, dt) => { if (recording === r) listenFor(r, rms, dt); };
    const tick = () => {
      r.seconds = (Date.now() - r.started) / 1000;
      recTime.textContent = clock(r.seconds) + ' / ' + clock(CONFIG.voiceSeconds);
      if (r.seconds >= CONFIG.voiceSeconds && !r.barge) stopRecording(false);
    };
    tick(); r.timer = setInterval(tick, 250);
    box.classList.add('recording'); rec.hidden = false; mic.hidden = true;
    if (talk) showTalk(); else { updateSend(); send.focus(); }
  }
  // When the visitor speaks, in a conversation. The room's level is learned from quiet moments, and
  // speech has to stand well above it (further in a noisy room, CONFIG.noisy). A pause of
  // CONFIG.pauseMs after speech sends the recording. Until the visitor speaks, the recording starts
  // over every few seconds, so silence isn't sent; a quiet minute pauses
  // the conversation. While an answer plays and the visitor lets themselves interrupt (r.barge), a
  // sound louder than the answer's own echo could be (browsers cancel most of that echo) pauses the
  // answer at once (hold). Speech that goes on stops it, and becomes the next message; a cough, a
  // door or a short "mm-hm" doesn't, and the answer goes on from where it paused (letGo).
  function listenFor(r, rms, dt) {
    const now = Date.now();
    const echo = r.barge && !r.held ? outputLevel() : 0;
    const threshold = Math.max(CONFIG.noisy ? 0.03 : 0.015, r.floor * (CONFIG.noisy ? 4.5 : 3), r.barge ? Math.max(0.035, echo * 0.5) : 0);
    if (rms > threshold) {
      r.voiced += dt; r.lastVoice = now;
      if (r.barge) {
        if (!r.held && r.voiced >= 150) hold(r);
        if (r.held && r.voiced >= 700) { r.barge = false; r.held = false; r.heard = true; interrupted(); if (talk) talk.hint = ''; showTalk(); }
        return;
      }
      if (!r.heard && r.voiced >= (CONFIG.noisy ? 300 : 180)) {
        r.heard = true;
        if (talk) talk.hint = '';
        showTalk();
      }
    } else {
      if (!r.barge) r.floor = Math.min(0.05, r.floor * 0.97 + rms * 0.03);
      if (!r.heard) r.voiced = Math.max(0, r.voiced - dt / 2);
      if (r.held && now - r.lastVoice >= 450) { letGo(r); return; }
    }
    if (r.heard && now - r.lastVoice >= CONFIG.pauseMs) { stopRecording(false); return; }
    if (r.heard || r.held) return;
    if (!r.barge && now - r.listening >= 60000) { pauseTalk('Paused after a quiet minute. Tap to keep talking.'); return; }
    if (now - r.started >= 4000 && r.voiced === 0) restartTake(r);
  }
  // The recording starts over: what came before (silence, a noise) isn't sent.
  function restartTake(r) {
    const old = r.recorder;
    if (record(r)) { old.ondataavailable = null; try { old.stop(); } catch (e) { /* already stopped */ } }
  }
  // A sound over the answer: it pauses where it is, until it's clear whether the visitor is speaking.
  function hold(r) {
    r.held = true;
    if (talk && talk.player && talk.player.state === 'running') talk.player.suspend().catch(() => {});
    showTalk();
  }
  // It wasn't the visitor: the answer goes on, and the noise isn't kept.
  function letGo(r) {
    r.held = false; r.voiced = 0;
    if (talk && talk.player) talk.player.resume().catch(() => {});
    restartTake(r);
    showTalk();
  }
  function stopRecording(cancel, toText) {
    const r = recording;
    if (!r) return;
    if (r.starting) { recording = null; return; }
    if (cancel && !talk) w.recordings_cancelled += 1;
    r.cancelled = cancel; r.toText = Boolean(toText) && !talk; r.seconds = (Date.now() - r.started) / 1000;
    clearInterval(r.timer); cancelAnimationFrame(r.frame);
    if (r.mic.onlevel && !r.owned) r.mic.onlevel = null;
    if (r.recorder.state !== 'inactive') r.recorder.stop(); else finishRecording(r);
  }
  function finishRecording(r) {
    if (r.done) return;
    r.done = true;
    if (r.owned) { releaseMic(r.mic); if (r.mic.context) r.mic.context.close().catch(() => {}); }
    if (recording === r) recording = null;
    Array.from(level.children).forEach((bar) => { bar.style.height = ''; });
    if (!talk) { box.classList.remove('recording'); rec.hidden = true; mic.hidden = false; }
    else box.classList.remove('recording');
    updateSend();
    if (r.cancelled) { if (!talk) mic.focus(); return; }
    const type = (r.recorder.mimeType || (r.chunks[0] && r.chunks[0].type) || 'audio/webm').split(';')[0];
    const blob = new Blob(r.chunks, { type });
    if (r.seconds < 0.8 || blob.size < 800) {
      if (talk) { listen(); return; }
      say('That was too short to hear. Tap the microphone, speak, then send.'); mic.focus(); return;
    }
    if (talk) { talk.state = 'thinking'; showTalk(); }
    const reader = new FileReader();
    reader.onload = () => {
      const message = { audio: String(reader.result || '').replace(/^data:[^,]*,/, 'data:' + type + ';base64,'), seconds: Math.round(r.seconds), ms: Math.round(r.seconds * 1000) };
      if (r.toText) { dictate(message); return; }
      // Spoken over an answer that was still being written: it goes once that answer has stopped.
      const go = () => { if (pending && talk) setTimeout(go, 120); else ask('', message); };
      go();
    };
    reader.onerror = () => { say('The recording couldn’t be read. Try again.'); if (talk) pauseTalk(); };
    reader.readAsDataURL(blob);
  }
  // The agent's Transcribe step hears it (…/transcribe) and the words go where the cursor was, for
  // the visitor to read, fix what was misheard, and send. They aren't counted as typed.
  async function dictate(message) {
    // The recording's row stays, saying what is happening, until the words are in the box.
    dictating = true; box.classList.add('dictating'); rec.hidden = false; mic.hidden = true;
    recSay.textContent = 'Writing down what you said…'; recSay.hidden = false; recTime.hidden = true; level.hidden = true;
    updateSend();
    try {
      const res = await fetch(ENDPOINT('transcribe'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor, audio: message.audio, ...VERSION }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const error = new Error((data.error && data.error.message) || 'That couldn’t be turned into text. Try again.'); error.code = data.error && data.error.code; throw error; }
      if (data.stale) showStale();
      const words = String(data.text || '').trim();
      if (!words) { say('No words came through. Try again a little closer to the microphone.'); return; }
      const before = input.value.slice(0, input.selectionStart), rest = input.value.slice(input.selectionEnd);
      const added = (before && !/\s$/.test(before) ? ' ' : '') + words + (rest && !/^\s/.test(rest) ? ' ' : '');
      input.value = (before + added + rest).slice(0, CONFIG.maxChars);
      typed = input.value; w.dictated_ms += message.ms;
      const caret = Math.min(input.value.length, (before + added).length);
      input.setSelectionRange(caret, caret);
    } catch (error) {
      if (hostAsks(error.code)) { if (COURSE) toHome(); else whoIs(null).then(joined).catch(() => {}); return; }
      say(error.message || 'That couldn’t be turned into text. Try again.');
    } finally {
      dictating = false; box.classList.remove('dictating'); rec.hidden = true; mic.hidden = !CONFIG.voice;
      recSay.hidden = true; recTime.hidden = false; level.hidden = false;
      grow(); input.focus();
    }
  }
  $('rec-text').onclick = () => stopRecording(false, true);

  // A voice conversation without tapping: one tap on the round button starts it, then the page
  // listens, sends when the visitor pauses, reads the answer aloud and listens again, until they end
  // it (×, Escape, another chat). It keeps going in a background tab. Answers play through the
  // conversation's own player (an audio context that tap unlocked, so browsers that block playing
  // without a tap, like Safari on iPhone, play them too; apart from the microphone's, so an answer
  // can pause while the microphone goes on listening). The round button sends now, stops the
  // reading, or picks a paused conversation up. By default an answer plays to the end before the
  // page listens: a noisy room would otherwise cut answers off. Where the page allows it
  // (CONFIG.interrupt), visitors in a quiet room or with headphones can let themselves interrupt by
  // talking (the hand button), and their choice is kept on this device.
  let talk = null;
  const barge = $('barge');
  let interrupting = false;
  try { interrupting = CONFIG.interrupt && localStorage.getItem('viable-chat::interrupt') === '1'; } catch (e) { /* not kept */ }
  function paintBarge() {
    barge.hidden = !(talk && CONFIG.interrupt);
    barge.setAttribute('aria-pressed', String(interrupting));
    const label = interrupting ? 'Interrupting by talking is on' : 'Let me interrupt by talking';
    barge.setAttribute('aria-label', label); barge.dataset.tip = label;
  }
  barge.onclick = () => {
    interrupting = !interrupting;
    try { localStorage.setItem('viable-chat::interrupt', interrupting ? '1' : '0'); } catch (e) { /* not kept */ }
    paintBarge();
    say(interrupting ? 'Talk over an answer to stop it. Best in a quiet room or with headphones.' : 'Answers play to the end, then it listens. Tap ■ to stop one sooner.');
    if (!talk || talk.state !== 'speaking') return;
    if (interrupting && !recording) { startRecording(true); if (recording && recording.auto) recording.barge = true; }
    else if (!interrupting && recording && recording.barge) { if (recording.held && talk.player) talk.player.resume().catch(() => {}); stopRecording(true); }
  };
  const TALK = { starting: 'Starting…', listening: 'Listening…', hearing: 'Hearing you…', held: 'Paused. Go ahead…', thinking: 'Thinking…', speaking: 'Speaking…' };
  const outData = new Float32Array(512);
  // How loud the answer being played is, to tell its echo from the visitor speaking over it.
  function outputLevel() {
    if (!talk || !talk.outProbe) return 0;
    talk.outProbe.getFloatTimeDomainData(outData);
    let sum = 0;
    for (let i = 0; i < outData.length; i += 1) sum += outData[i] * outData[i];
    return Math.sqrt(sum / outData.length);
  }
  function showTalk() {
    if (!talk) return;
    const hearing = talk.state === 'listening' && recording && recording.heard;
    const held = talk.state === 'speaking' && recording && recording.held;
    box.classList.remove('talk-starting', 'talk-listening', 'talk-thinking', 'talk-speaking', 'talk-paused');
    box.classList.add('talking', 'talk-' + (held ? 'listening' : talk.state));
    rec.hidden = false; mic.hidden = true;
    recSay.hidden = false; recTime.hidden = true; level.hidden = talk.state !== 'listening' && !held;
    recSay.textContent = talk.state === 'paused' ? talk.message : held ? TALK.held : hearing ? TALK.hearing : talk.state === 'listening' && talk.hint ? talk.hint : TALK[talk.state];
    paintBarge();
    $('rec-cancel').setAttribute('aria-label', 'End the conversation'); $('rec-cancel').dataset.tip = 'End conversation';
    updateSend();
  }
  async function startTalk() {
    if (talk || pending || recording) return;
    say('');
    if (!canRecord()) { say('This browser can’t record audio. Type your message instead.'); return; }
    if (nowPlaying) nowPlaying.pause();
    if (speaking) speaking.stop();
    // Made now, while the tap counts, so the browser lets them run later: one for the microphone,
    // one that plays the answers. Answers play through an analyser, so the detector knows how loud
    // they are.
    const context = newContext(), player = newContext();
    for (const ctx of [context, player]) if (ctx && ctx.resume) ctx.resume().catch(() => {});
    const t = talk = { state: 'starting', mic: null, context, player, out: null, outProbe: null, source: null, live: null, message: '', hint: '' };
    if (player) {
      try { t.out = player.createGain(); t.outProbe = player.createAnalyser(); t.outProbe.fftSize = 512; t.out.connect(t.outProbe); t.outProbe.connect(player.destination); }
      catch (e) { t.out = null; t.outProbe = null; }
    }
    showTalk();
    await openTalkMic(t);
  }
  async function openTalkMic(t) {
    try { t.mic = await openMic(t.context); } catch (error) { if (talk === t) endTalk(); say(micBlocked(error)); return; }
    if (talk !== t) { releaseMic(t.mic); return; }
    listen();
  }
  function listen() {
    if (!talk) return;
    talk.state = 'listening';
    const r = recording;
    // The recording kept while the answer played now listens for a new turn, from the start.
    if (r && r.auto && !r.done) {
      r.barge = false; r.held = false; r.heard = false; r.voiced = 0; r.listening = Date.now();
      restartTake(r);
      showTalk();
      return;
    }
    showTalk();
    startRecording(true);
  }
  // The answer has started playing: a visitor who lets themselves interrupt may speak over it.
  function speakingNow() {
    if (!talk) return;
    talk.state = 'speaking';
    showTalk();
    if (CONFIG.interrupt && interrupting && !recording) { startRecording(true); if (recording && recording.auto) recording.barge = true; }
  }
  // The visitor spoke over the answer: it stops (an answer still being written stops too), and what
  // they are saying becomes the next message.
  function interrupted() {
    if (!talk) return;
    stopSpeaking();
    if (pending && pending.chat === active) { pending.barge = true; pending.controller.abort(); }
    talk.state = 'listening';
  }
  // The answer, read aloud, then the page listens again. Without one, it listens straight away.
  async function talkReply(audio, out) {
    const t = talk;
    if (!t) return;
    // Heard as it was written: listen again once the last piece has played.
    if (out && out.received) {
      if (t.state !== 'speaking') speakingNow();
      await out.done();
      if (talk === t && t.state === 'speaking' && t.live === out && !out.stopped) listen();
      return;
    }
    const url = audio && audio[0] && audio[0].url;
    if (!url) { setTimeout(() => { if (talk === t && t.state === 'thinking') listen(); }, 400); return; }
    try {
      if (!t.player || new URL(url, location.href).origin !== location.origin) throw new Error('elsewhere');
      const res = await fetch(url);
      const buffer = await t.player.decodeAudioData(await res.arrayBuffer());
      if (talk !== t || t.state !== 'thinking') return;
      if (t.player.state === 'suspended') await t.player.resume();
      const source = t.player.createBufferSource(); source.buffer = buffer; source.connect(t.out || t.player.destination);
      t.source = source;
      source.onended = () => { if (talk === t && t.source === source) { t.source = null; listen(); } };
      source.start();
      speakingNow();
    } catch (e) {
      // An answer stored elsewhere (or one that won't decode) waits in its player for a tap.
      if (talk === t) pauseTalk('Tap the answer to hear it, then tap to keep talking.');
    }
  }
  function stopSpeaking() {
    if (!talk) return;
    if (talk.live) { talk.live.stop(); talk.live = null; }
    if (talk.source) { const source = talk.source; talk.source = null; try { source.stop(); } catch (e) { /* already ended */ } }
    // An answer paused for a sound is gone now: the player is ready for the next one.
    if (talk.player && talk.player.state === 'suspended') talk.player.resume().catch(() => {});
  }
  // Pieces of an answer read aloud as it is written: decoded in order and scheduled one after
  // another on the context, so they play without gaps. done() resolves once the last has played.
  function liveVoice(context, destination) {
    const sources = [];
    let order = Promise.resolve(), at = 0;
    const voice = {
      received: false, stopped: false, onstart: null,
      add(piece) {
        voice.received = true;
        order = order.then(async () => {
          const bytes = Uint8Array.from(atob(piece.audio || ''), (c) => c.charCodeAt(0));
          const buffer = await context.decodeAudioData(bytes.buffer);
          if (voice.stopped) return;
          // Not while an answer is paused for a sound (hold): the piece waits its turn.
          if (context.state === 'suspended' && !(recording && recording.held)) await context.resume().catch(() => {});
          const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination || context.destination);
          at = Math.max(context.currentTime + 0.05, at); source.start(at); at += buffer.duration;
          if (!sources.length && voice.onstart) voice.onstart();
          sources.push(source);
        }).catch(() => { /* A piece that won't decode is skipped. */ });
      },
      // The clock stops while the answer is paused, so the end is checked again until it's reached.
      done() {
        return order.then(() => new Promise((resolve) => {
          const check = () => { const left = at - context.currentTime; if (left <= 0 || context.state === 'closed') setTimeout(resolve, 60); else setTimeout(check, Math.max(60, left * 1000)); };
          check();
        }));
      },
      stop() { voice.stopped = true; sources.forEach((source) => { try { source.stop(); } catch (e) { /* already ended */ } }); }
    };
    return voice;
  }
  // Paused: the microphone is let go until the visitor taps to go on.
  function pauseTalk(message) {
    if (!talk) return;
    stopSpeaking();
    if (recording) stopRecording(true);
    releaseMic(talk.mic); talk.mic = null;
    talk.state = 'paused'; talk.message = message || 'Paused. Tap to keep talking.';
    showTalk();
  }
  function resumeTalk() {
    if (!talk || talk.state !== 'paused') return;
    for (const ctx of [talk.context, talk.player]) if (ctx && ctx.resume) ctx.resume().catch(() => {});
    talk.state = 'starting'; showTalk();
    openTalkMic(talk);
  }
  function endTalk() {
    const t = talk;
    if (!t) return;
    stopSpeaking();
    talk = null;
    if (recording) stopRecording(true);
    releaseMic(t.mic);
    for (const ctx of [t.context, t.player]) if (ctx) ctx.close().catch(() => {});
    box.classList.remove('talking', 'recording', 'talk-starting', 'talk-listening', 'talk-thinking', 'talk-speaking', 'talk-paused');
    rec.hidden = true; recSay.hidden = true; recTime.hidden = false; level.hidden = false;
    mic.hidden = !CONFIG.voice;
    $('rec-cancel').setAttribute('aria-label', 'Cancel the recording'); $('rec-cancel').dataset.tip = 'Cancel';
    paintBarge();
    updateSend();
  }
  // Leaving the conversation (another chat, a new one): stop listening and speaking.
  const hush = () => { endTalk(); stopRecording(true); };
  // The microphone shows where the agent can hear (the host may change that for this learner).
  mic.hidden = !CONFIG.voice; mic.onclick = () => { if (CONFIG.voice) startRecording(false); };
  $('rec-cancel').onclick = () => { if (talk) endTalk(); else stopRecording(true); };
  // One audio context for answers read aloud as they are written (outside a conversation, which has
  // its own), readied by the visitor's first tap or key so browsers let it play later.
  let speaker = null, speaking = null;
  // What is still being read aloud after its words are all there, for Stop reading and Escape.
  let reading = null;
  // A quiet line a screen reader hears: each stage once, and the finished reply once.
  const aloud = (words) => { const box = document.getElementById('said-aloud'); if (box) { box.textContent = ''; setTimeout(() => { box.textContent = words; }, 60); } };
  const ready = () => { if (!speaker) speaker = newContext(); if (speaker && speaker.state === 'suspended') speaker.resume().catch(() => {}); };
  if (CONFIG.speaks || CONFIG.handsFree) { document.addEventListener('pointerdown', ready, true); document.addEventListener('keydown', ready, true); }
  // A conversation goes on in a background tab. Coming back wakes audio a browser suspended meanwhile.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // An answer paused for a sound stays paused until that's settled.
    const held = recording && recording.held;
    for (const context of [talk && talk.context, talk && !held && talk.player, speaker]) if (context && context.state === 'suspended') context.resume().catch(() => {});
  });
  // Photos and PDFs for the next message, where the agent can read them (CONFIG.attach): from the
  // + button, pasted, or dropped on the message box. Photos go at most 2048 px on their long side as
  // JPEG (quicker to send, and what models read anyway); small PNG, JPEG, WebP and GIF go as they are.
  // A small thumbnail stays with the chat in this browser; the files themselves don't.
  const attachBtn = $('attach'), picker = $('files'), attachedEl = $('attached');
  const ATTACH = { max: 4, bytes: 8 * 1024 * 1024, total: 10 * 1024 * 1024 };
  const offers = () => Boolean(CONFIG.attach && (CONFIG.attach.images || CONFIG.attach.files));
  function paintAttach() {
    const a = CONFIG.attach || {};
    attachBtn.hidden = !offers(); box.classList.toggle('can-attach', offers());
    picker.accept = [a.images ? 'image/*' : '', a.files ? 'application/pdf,.pdf' : ''].filter(Boolean).join(',');
    const label = a.images && a.files ? 'Add photos and files' : a.images ? 'Add photos' : 'Add PDFs';
    attachBtn.dataset.tip = label; attachBtn.setAttribute('aria-label', label);
    if (!offers() && files.length) { files = []; paintFiles(); }
  }
  const sizeOf = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const bytesOf = (data) => Math.floor(((data.length - data.indexOf(',') - 1) * 3) / 4);
  const readData = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); });
  async function picture(file, edge, quality) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    } finally { URL.revokeObjectURL(url); }
  }
  async function addFiles(list) {
    say('');
    const a = CONFIG.attach || {};
    for (const file of Array.from(list || [])) {
      if (files.length >= ATTACH.max) { say('Attach up to ' + ATTACH.max + ' files to one message.'); break; }
      const image = /^image\//.test(file.type), pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      if (!(image && a.images) && !(pdf && a.files)) { say(a.images && a.files ? 'Attach photos or PDFs.' : a.images ? 'This assistant reads photos, not documents.' : 'This assistant reads PDFs, not photos.'); continue; }
      let item;
      try {
        if (image) {
          const asIs = file.type === 'image/gif' || (['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size <= 1024 * 1024);
          item = { kind: 'image', name: file.name || 'Image', data: asIs ? await readData(file) : await picture(file, 2048, 0.86), thumb: await picture(file, 160, 0.72) };
        } else item = { kind: 'file', name: file.name || 'Document.pdf', data: (await readData(file)).replace(/^data:[^,]*,/, 'data:application/pdf;base64,') };
      } catch (e) { say((file.name || 'That file') + ' couldn’t be opened here. Try a PNG or JPEG.'); continue; }
      item.bytes = bytesOf(item.data);
      if (item.bytes > ATTACH.bytes) { say(item.name + ' is larger than 8 MB.'); continue; }
      if (files.reduce((sum, f) => sum + f.bytes, 0) + item.bytes > ATTACH.total) { say('Attachments can be 10 MB in all.'); break; }
      files.push(item);
    }
    paintFiles();
  }
  function paintFiles() {
    attachedEl.replaceChildren(...files.map((f) => {
      const chip = document.createElement('div'); chip.className = 'file ' + f.kind; chip.title = f.name; chip.setAttribute('role', 'listitem');
      if (f.kind === 'image') { const img = document.createElement('img'); img.src = f.thumb; img.alt = f.name; chip.append(img); }
      else {
        const icon = document.createElement('span'); icon.className = 'doc'; icon.innerHTML = DOC;
        const meta = document.createElement('span'); meta.className = 'meta';
        const name = document.createElement('b'); name.textContent = f.name;
        const size = document.createElement('small'); size.textContent = 'PDF · ' + sizeOf(f.bytes);
        meta.append(name, size); chip.append(icon, meta);
      }
      const drop = document.createElement('button'); drop.type = 'button'; drop.className = 'drop'; drop.innerHTML = REMOVE; drop.setAttribute('aria-label', 'Remove ' + f.name);
      drop.onclick = () => { files = files.filter((other) => other !== f); paintFiles(); input.focus(); };
      chip.append(drop);
      return chip;
    }));
    attachedEl.hidden = !files.length;
    updateSend();
  }
  attachBtn.onclick = () => picker.click();
  picker.onchange = () => { addFiles(picker.files); picker.value = ''; };
  // A screenshot pasted into the box is attached; pasted text stays text.
  input.addEventListener('paste', (e) => {
    const list = e.clipboardData ? Array.from(e.clipboardData.files || []) : [];
    if (!offers() || !list.length || e.clipboardData.getData('text/plain')) return;
    e.preventDefault(); addFiles(list);
  });
  const dragsFiles = (e) => offers() && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  box.addEventListener('dragover', (e) => { if (!dragsFiles(e)) return; e.preventDefault(); box.classList.add('dropping'); });
  box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove('dropping'); });
  box.addEventListener('drop', (e) => { box.classList.remove('dropping'); if (!dragsFiles(e) || !e.dataTransfer.files.length) return; e.preventDefault(); addFiles(e.dataTransfer.files); });
  paintAttach();
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; updateSend(); }
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (dictating) return;
    // Stopping a reply in a conversation is speaking over it: the page listens for the next turn.
    if (pending && pending.chat === active) {
      if (talk) { pending.barge = true; stopSpeaking(); pending.controller.abort(); listen(); }
      else pending.controller.abort();
    }
    else if (talk) { if (talk.state === 'listening' && recording) stopRecording(false); else if (talk.state === 'speaking') { stopSpeaking(); listen(); } else if (talk.state === 'paused') resumeTalk(); }
    else if (reading && !reading.stopped) { reading.stop(); reading = null; updateSend(); }
    else if (recording) stopRecording(false);
    else if (CONFIG.handsFree && !input.value.trim() && !files.length) startTalk();
    else ask(input.value);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (talk) { e.preventDefault(); endTalk(); return; }
    if (recording) { e.preventDefault(); stopRecording(true); return; }
    if (reading && !reading.stopped) { e.preventDefault(); reading.stop(); reading = null; updateSend(); return; }
    if (chats.classList.contains('open') && !wide()) { openChats(false); menu.focus(); return; }
    if (CONFIG.mode === 'widget') closeWidget();
  });
  // Who the learner is, on a course activity: the line under the message box says who they are, with
  // a way to hand the computer on (a new visitor id; the course home asks who the next one is).
  const who = $('whoami'), LEARNER = KEY + ':learner';
  let learner = read(LEARNER);
  function showWho() {
    who.hidden = !learner;
    if (!learner) { who.replaceChildren(); return; }
    const name = document.createElement('span'); name.textContent = 'You’re ' + (learner.name || (/^[0-9A-Z]{8}$/.test(learner.code || '') ? learner.code.slice(0, 4) + '-' + learner.code.slice(4) : learner.code));
    const other = document.createElement('button'); other.type = 'button'; other.textContent = COURSE && COURSE.shared ? 'Sign out' : 'Not you?';
    other.onclick = () => {
      const q = document.createElement('span'); q.textContent = 'Switch to someone else? Chats in this browser will be cleared.';
      const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'danger'; yes.textContent = 'Switch';
      const no = document.createElement('button'); no.type = 'button'; no.textContent = 'Cancel';
      who.replaceChildren(q, ' ', yes, ' ', no); no.focus();
      no.onclick = showWho;
      yes.onclick = signOut;
    };
    who.replaceChildren(name, ' · ', other);
  }
  // Nothing of this learner stays: talking stops and the microphone is let go, the browser's chats and
  // voice choices go, and the course home asks who is next.
  function signOut() {
    hush();
    try { Object.keys(localStorage).filter((key) => key.startsWith('viable-chat:')).forEach((key) => localStorage.removeItem(key)); sessionStorage.removeItem(HERE); } catch (e) { /* storage unavailable */ }
    write(VISITOR_KEY, newId());
    if (COURSE) location.href = COURSE.url; else location.reload();
  }
  // A workspace waits until the visitor may use the page (gated while the host works out their page,
  // or asks them something first), then hears viable:ready.
  let readySent = false;
  function letIn() {
    document.body.classList.remove('gated', 'checking');
    // A flag too, for a workspace script that loads after this.
    if (!readySent) {
      readySent = true; window.VIABLE_READY = true; window.dispatchEvent(new CustomEvent('viable:ready'));
      // In a widget, the page it's on may now ask a question for the visitor (the widget's open({ ask })).
      if (CONFIG.mode === 'widget') parent.postMessage({ type: 'viable-chat:ready' }, '*');
      // A course activity counts as started once the learner is in it (and done, where opening is enough).
      // Not open for this learner (their section, or it closed meanwhile): say so, and the way back.
      if (CONFIG.course) fetch(ENDPOINT('open'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor }) }).then(async (res) => {
        if (res.ok || res.status !== 403) return;
        const data = await res.json().catch(() => ({}));
        const code = data.error && data.error.code;
        if (hostAsks(code)) { toHome(); return; }
        if (!['activity_not_open', 'activity_closed', ...CONFIG.waitCodes].includes(code)) return;
        closed(CONFIG.waitCodes.includes(code) ? 'Not open yet' : 'Not open for you', data.error.message);
      }).catch(() => {});
    }
  }
  function closed(title, message) {
    hush();
    const box = document.createElement('div'); box.className = 'crs-gate'; box.setAttribute('role', 'alertdialog');
    const card = document.createElement('div'); const h = document.createElement('h2'); h.textContent = title; const p = document.createElement('p');
    p.textContent = message;
    const back = document.createElement('a'); back.href = CONFIG.course.url; back.textContent = 'Back to ' + CONFIG.course.title;
    card.append(h, p, back); box.append(card); document.body.append(box); back.focus();
  }
  // The AI writes first at the moments the activity's teacher chose (CONFIG.speaksUp): quiet on a step, working a while without
  // writing to it, an answer checked wrong or right, a pause in writing after enough new words, writing handed in. The page asks
  // only when a moment comes, never on a clock of its own, and the server decides, holding to how often and how far apart. Never
  // while they are writing to it, talking or waiting for a reply; a message of theirs goes first; once the server says no here, the
  // page stops asking until the step changes.
  let firstTurn = null, firstOff = false, stirredAt = Date.now(), quietArmed = true, askedAt = 0, aloneSince = Date.now(), lastFirstAt = 0, rights = 0;
  const wrongSpoken = new Set(), lookedAt = new Map();
  async function speakFirst(kind, about) {
    const set = CONFIG.speaksUp;
    if (firstOff || !set || !set[kind] || pending || firstTurn || recording || dictating || talk || input.value.trim()) return;
    if (window.VIABLE_WS && window.VIABLE_WS.aiHere && !window.VIABLE_WS.aiHere()) return;
    // Not on top of their own conversation, nor of the AI's last note.
    if (Date.now() - askedAt < 60000 || (lastFirstAt && Date.now() - lastFirstAt < (set.gap || 3) * 60000)) return;
    if (kind === 'wrong') {
      const item = String((about && about.item) || '');
      if (((about && about.tries) || 0) < set.wrong.after || wrongSpoken.has(item)) return;
      wrongSpoken.add(item);
    }
    if (kind === 'right') { rights += 1; if (rights % (set.right.every || 1)) return; }
    if (kind === 'writing') {
      const panel = String((about && about.panel) || '');
      const from = lookedAt.has(panel) ? lookedAt.get(panel) : ((about && about.start) || 0);
      if (!lookedAt.has(panel)) lookedAt.set(panel, from);
      if (((about && about.words) || 0) - from < set.writing.words) return;
    }
    const open = window.VIABLE_WS && window.VIABLE_WS.state ? window.VIABLE_WS.state() : null;
    let chat = active;
    const controller = new AbortController();
    firstTurn = { controller };
    try {
      if (!chat) chat = { id: newId(), conversation_id: null, title: FIRST_WORDS[kind] || 'From the AI', named: false, created: Date.now(), updated: Date.now(), messages: [] };
      const data = await post(chat, '', null, controller.signal, () => {}, () => {}, () => {}, () => {}, { event: { kind: kind }, ...(open ? { workspace: open } : {}) });
      if (controller.signal.aborted || !data || !data.reply || !String(data.reply.text || '').trim()) return;
      lastFirstAt = Date.now();
      if (kind === 'writing') lookedAt.set(String(about.panel || ''), (about && about.words) || 0);
      if (!saved.chats.includes(chat)) { saved.chats.unshift(chat); if (!active) active = chat; }
      chat.conversation_id = data.conversation_id || chat.conversation_id;
      chat.messages.push({ role: 'bot', first: kind, text: data.reply.text, citations: data.reply.citations || [], images: data.reply.images || [], audio: data.reply.audio || [], run_id: data.run_id || null, at: Date.now() });
      chat.updated = Date.now(); save();
      if (chat === active) render(); else renderChats();
      if (window.VIABLE_WS && window.VIABLE_WS.reply) window.VIABLE_WS.reply(data.reply.text || '');
      if (window.VIABLE_WS && window.VIABLE_WS.nudge) window.VIABLE_WS.nudge();
    } catch (error) {
      // Not here, or not again in this step: the page stops asking until the step changes. Too soon only waits.
      if (error && (error.code === 'speaks_first_off' || error.code === 'speaks_first_limit')) firstOff = true;
      if (error && error.code === 'speaks_first_soon') lastFirstAt = Date.now();
    } finally { if (firstTurn && firstTurn.controller === controller) firstTurn = null; }
  }
  let watching = false;
  function watchTime() {
    if (watching || !CONFIG.speaksUp || !(CONFIG.speaksUp.quiet || CONFIG.speaksUp.alone)) return;
    watching = true;
    // Quiet: nothing typed, clicked or scrolled on the page while it is in view; once the AI has checked in, it waits for them to do
    // something first. Alone: busy on the page, without writing to the AI, for the minutes the teacher chose.
    const stirred = () => { stirredAt = Date.now(); quietArmed = true; };
    ['keydown', 'pointerdown', 'scroll', 'input'].forEach((type) => document.addEventListener(type, stirred, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) stirredAt = Date.now(); });
    setInterval(() => {
      const set = CONFIG.speaksUp;
      if (document.hidden || !set) return;
      if (set.quiet && quietArmed && Date.now() - stirredAt >= set.quiet.minutes * 60000) { quietArmed = false; speakFirst('quiet'); return; }
      if (set.alone && Date.now() - stirredAt < 60000 && Date.now() - Math.max(askedAt, aloneSince) >= set.alone.minutes * 60000) { aloneSince = Date.now(); speakFirst('alone'); }
    }, 15000);
  }
  watchTime();
  // A learner's section, or their condition in a study, may have moments of its own: the server says which, once it knows them.
  function speaksAs(set) { CONFIG.speaksUp = set || null; firstOff = false; watchTime(); }
  // An embedded activity (through the workspace) may put a question in the box for the visitor to send;
  // signing out from the workspace's bar stops talking first.
  window.VIABLE_CHAT = {
    // A moment the workspace saw (a wrong answer checked, writing handed in), for the AI to write first if the teacher chose it.
    speakFirst(kind, about) { speakFirst(kind, about); },
    // Who this browser is to the page, for the panel beside a preview to ask for its record.
    visitor() { return visitor; },
    // Whether the AI may write first here, for what the page tells the learner.
    writesFirst() { return Boolean(CONFIG.speaksUp); },
    prefill(text) { input.value = String(text || '').slice(0, CONFIG.maxChars); grow(); updateSend(); input.focus(); },
    // The workspace's open panel changed: an empty chat shows what the AI can help with there.
    refresh() { if (!active || !active.messages.length) render(); },
    hush() { hush(); },
    // A step that starts the chat afresh: chats begun before it (ms) are no longer shown here.
    since(ms) { since = Number(ms) || 0; if (active && (active.created || active.updated) < since) { active = null; save(); } render(); },
    // What the AI says first has changed with the step, and so may whether it writes first here.
    redraw() { firstOff = false; wrongSpoken.clear(); render(); }
  };
  // What the host makes of the page for this learner, where it varies: its AI or none, another agent's
  // look, typed only or not read aloud, what the AI is shown of the panels.
  function applyVariant(v) {
    if (!v) return;
    if (v.hidden) { closed('Not part of your course', 'This activity isn’t part of your course.'); return; }
    if (v.look) {
      Object.assign(CONFIG, { title: v.look.title, greeting: v.look.greeting || '', starters: v.look.starters || [], avatar: v.look.avatar_url || null });
      document.querySelectorAll('.who h1').forEach((h) => { h.textContent = v.look.title; });
      document.querySelectorAll('.who p').forEach((p) => { p.textContent = p.title = v.look.tagline || 'AI assistant'; });
      input.placeholder = v.look.placeholder || input.placeholder;
      const notice = $('notice-text'); if (notice) notice.textContent = v.look.notice || '';
      const face = (box) => { box.replaceChildren(); if (v.look.avatar_url) { box.classList.remove('mono'); const img = document.createElement('img'); img.src = v.look.avatar_url; img.alt = ''; box.append(img); } else { box.classList.add('mono'); box.textContent = (v.look.title || 'A').trim().charAt(0).toUpperCase(); } };
      document.querySelectorAll('.top .avatar').forEach(face);
      for (const id of ['avatar', 'hero-avatar']) face($(id).content.firstElementChild);
    }
    CONFIG.voice = Boolean(v.hears); CONFIG.handsFree = Boolean(v.hears) && CONFIG.handsFreeAllowed !== false; CONFIG.speaks = Boolean(v.speaks);
    mic.hidden = !CONFIG.voice;
    CONFIG.attach = v.attaches || { images: false, files: false }; paintAttach();
    if (Object.prototype.hasOwnProperty.call(v, 'speaks_up')) speaksAs(v.speaks_up);
    if (!v.ai) { document.body.classList.remove('ai-right', 'ai-left', 'ai-corner'); document.body.classList.add('ai-off'); }
    if (v.look) document.querySelectorAll('#ws-ai span').forEach((label) => { label.textContent = 'Ask ' + v.look.title; });
    // The workspace reads what its panels show the AI from here (workspace.browser.js).
    window.VIABLE_VARIANT = v;
    if (!active || !active.messages.length) render();
    updateSend();
  }
  function joined(data) {
    if (data && Object.prototype.hasOwnProperty.call(data, 'speaks_up')) speaksAs(data.speaks_up);
    learner = data && data.joined ? { code: data.code, name: data.name || null } : null;
    if (learner) write(LEARNER, learner); else try { localStorage.removeItem(LEARNER); } catch (e) { /* storage unavailable */ }
    if (COURSE) {
      // Not yet who the course needs, or the host still asks something: the course home first.
      if (data.needs || (COURSE.identify !== 'browser' && !learner)) { toHome(); return; }
      showWho();
      applyVariant(data.variant);
      if (data.variant && data.variant.hidden) return;
      letIn();
      return;
    }
    // A host's own step before the conversation; it lets the visitor in when it is done.
    if (window.VIABLE_SLOTS && window.VIABLE_SLOTS.beforeConversation) window.VIABLE_SLOTS.beforeConversation(data, { letIn, log, form, input, endpoint: ENDPOINT, visitor, mode: CONFIG.mode });
    else letIn();
  }
  const whoIs = async (said) => {
    const res = await fetch(ENDPOINT('learner'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor, ...(said || {}) }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error((data.error && data.error.message) || 'That couldn’t be checked. Try again.'), { code: data.error && data.error.code });
    return data;
  };
  // A course activity's "I'm done" (in its bar, or the workspace's).
  document.addEventListener('click', async (e) => {
    const done = e.target.closest && e.target.closest('[data-done]');
    if (!done || done.disabled) return;
    done.disabled = true;
    try {
      const res = await fetch(ENDPOINT('done'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor }) });
      if (!res.ok) throw new Error('not saved');
      done.textContent = 'Done ✓'; done.classList.add('is-done');
    } catch (err) { done.disabled = false; done.textContent = 'Couldn’t save that. Try again'; }
  });
  // A page with nothing more to ask lets the learner in at once; one that must know who they are, or
  // whose host has something to say first, asks first (gated meanwhile).
  const waits = COURSE ? COURSE.identify !== 'browser' || COURSE.asks : CONFIG.asks;
  if (COURSE && learner) showWho();
  // Meanwhile the page shows only that it is checking (the server marks it so from the first paint),
  // never the chat on its own: most learners are let straight in.
  if (waits) {
    document.body.classList.add('checking');
    whoIs(null).then(joined).catch((error) => { if (COURSE) toHome(); else { say(error.message); letIn(); } });
  } else letIn();
  // An avatar that fails to load falls back to the title's first letter (also in cloned copies).
  const initial = (CONFIG.title || 'A').trim().charAt(0).toUpperCase();
  const fallback = (img) => { const box = img.parentNode; if (!box) return; box.classList.add('mono'); box.textContent = initial; };
  document.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG' && e.target.parentNode && e.target.parentNode.classList.contains('avatar')) fallback(e.target); }, true);
  document.querySelectorAll('.avatar img').forEach((img) => { if (img.complete && !img.naturalWidth) fallback(img); });
  for (const id of ['avatar', 'hero-avatar']) { const img = $(id).content.querySelector('img'); if (img) { const probe = new Image(); probe.onerror = () => { const box = img.parentNode; box.classList.add('mono'); box.textContent = initial; }; probe.src = img.src; } }
  // On wide pages the list stays open beside the conversation once there are chats to list,
  // unless the visitor closed it.
  const remembered = read('viable-chat:sidebar');
  openChats(wide() && (remembered === null ? saved.chats.length > 0 : remembered === true));
  window.matchMedia('(min-width: 960px)').addEventListener('change', () => openChats(wide() && read('viable-chat:sidebar') !== false && saved.chats.length > 0));
  render();
  // With an activity on the page, it starts in the activity, not in the conversation beside it.
  if (CONFIG.mode !== 'inline' && !document.getElementById('ws')) input.focus();
})();`;

// The widget: a chat button (with an optional greeting bubble) that opens the page in a panel, or
// (data-mode="inline") the page framed where the script tag sits. It reads the page's look first and
// draws nothing when the chat is paused, turned off, or not allowed on this site. Its styles live in a
// shadow root so the host page's CSS can't reach them.
const EMBED_SCRIPT = String.raw`(() => {
  const script = document.currentScript;
  if (!script || !script.dataset.agent) return;
  const base = PAGE_ORIGIN;
  const slug = script.dataset.agent;
  const src = base + '/chat/' + encodeURIComponent(slug);
  // window.__viableChat[slug].open({ ask }) opens the panel, sending a question for the visitor once the
  // chat is ready; a 'viable-chat:open' event ({ detail: { agent, ask } }) does the same.
  window.__viableChat = window.__viableChat || {};
  if (window.__viableChat[slug]) return;
  window.__viableChat[slug] = true;
  fetch(src + '/config', { credentials: 'omit' }).then((res) => res.ok ? res.json() : res.json().then((body) => { throw new Error(body && body.error && body.error.message || 'unavailable'); })).then(mount).catch((error) => {
    if (window.console) console.info('VIABLE chat: not shown (' + error.message + ')');
  });

  function mount(cfg) {
    const color = /^#[0-9a-f]{6}$/i.test(script.dataset.color || '') ? script.dataset.color : cfg.color;
    const side = (script.dataset.position || cfg.launcher.position) === 'left' ? 'left' : 'right';
    const label = script.dataset.label || cfg.launcher.label || 'Chat with us';
    const frame = (mode) => {
      const f = document.createElement('iframe');
      // The site it's on, for the owner's records.
      f.src = src + '?mode=' + mode + '&site=' + encodeURIComponent(location.origin);
      f.title = cfg.title || label;
      // The microphone, for agents that hear visitors, and playing answers read aloud.
      f.setAttribute('allow', 'clipboard-write; microphone; autoplay');
      f.style.cssText = 'border:0;width:100%;height:100%;display:block;color-scheme:normal';
      // page_context: the chat is told the page it is open on (its address without ? or #, and its
      // title) when it loads and whenever either changes, as a single-page site moves between pages.
      if (cfg.page_context) {
        let told = '';
        const tell = () => {
          const page = { type: 'viable-chat:page', url: location.origin + location.pathname, title: String(document.title || '').slice(0, 200) };
          if (!f.contentWindow || page.url + '\n' + page.title === told) return;
          told = page.url + '\n' + page.title;
          f.contentWindow.postMessage(page, base);
        };
        f.addEventListener('load', () => { told = ''; tell(); });
        const timer = setInterval(() => (f.isConnected ? tell() : clearInterval(timer)), 1000);
      }
      return f;
    };
    if (script.dataset.mode === 'inline') {
      const box = document.createElement('div');
      box.style.cssText = 'width:100%;border:1px solid rgba(15,23,42,.12);border-radius:16px;overflow:hidden;background:#fff';
      box.style.height = (parseInt(script.dataset.height, 10) || 620) + 'px';
      box.appendChild(frame('inline'));
      script.parentNode.insertBefore(box, script.nextSibling);
      return;
    }
    const host = document.createElement('div');
    host.setAttribute('data-viable-chat', slug);
    const root = host.attachShadow({ mode: 'open' });
    const css = ':host{all:initial}' +
      '*{box-sizing:border-box}' +
      '.launcher{position:fixed;bottom:20px;' + side + ':20px;width:58px;height:58px;border:0;border-radius:50%;padding:0;background:' + color + ';color:#fff;cursor:pointer;display:grid;place-items:center;box-shadow:0 10px 30px -8px rgba(15,23,42,.45),0 0 0 1px rgba(15,23,42,.06);z-index:2147483000;transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s;overflow:hidden}' +
      '.launcher:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 14px 34px -8px rgba(15,23,42,.5),0 0 0 1px rgba(15,23,42,.06)}' +
      '.launcher:focus-visible{outline:3px solid ' + color + ';outline-offset:3px}' +
      '.launcher .face,.launcher .x{position:absolute;inset:0;display:grid;place-items:center;transition:opacity .2s,transform .25s cubic-bezier(.2,.8,.2,1)}' +
      '.launcher img{width:100%;height:100%;object-fit:cover;display:block;background:#fff}' +
      '.launcher .x{opacity:0;transform:rotate(-90deg) scale(.6);background:' + color + '}' +
      '.launcher[aria-expanded=true] .face{opacity:0;transform:rotate(90deg) scale(.6)}.launcher[aria-expanded=true] .x{opacity:1;transform:none}' +
      '.panel{position:fixed;bottom:92px;' + side + ':20px;width:400px;height:min(680px,calc(100vh - 120px));border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 30px 70px -18px rgba(15,23,42,.45),0 0 0 1px rgba(15,23,42,.08);z-index:2147483000;opacity:0;visibility:hidden;transform:translateY(12px) scale(.97);transform-origin:bottom ' + side + ';transition:opacity .2s,transform .24s cubic-bezier(.2,.8,.2,1),visibility 0s .24s}' +
      '.panel.open{opacity:1;visibility:visible;transform:none;transition:opacity .2s,transform .24s cubic-bezier(.2,.8,.2,1)}' +
      '.teaser{position:fixed;bottom:90px;' + side + ':20px;max-width:300px;display:flex;gap:10px;align-items:flex-start;padding:12px 34px 12px 12px;border-radius:16px;background:#fff;color:#0f172a;font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 18px 40px -14px rgba(15,23,42,.35),0 0 0 1px rgba(15,23,42,.08);z-index:2147483000;cursor:pointer;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s cubic-bezier(.2,.8,.2,1)}' +
      '.teaser.show{opacity:1;transform:none}' +
      '.teaser .av{flex:none;width:28px;height:28px;border-radius:50%;overflow:hidden;background:' + color + ';color:#fff;display:grid;place-items:center;font-weight:650;font-size:13px}.teaser .av img{width:100%;height:100%;object-fit:cover;background:#fff}' +
      '.teaser b{display:block;font-weight:650;font-size:13px;margin-bottom:1px}.teaser span{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;color:#334155}' +
      '.teaser button{position:absolute;top:6px;right:6px;width:24px;height:24px;border:0;border-radius:8px;background:transparent;color:#64748b;cursor:pointer;font-size:16px;line-height:1}.teaser button:hover{background:#f1f5f9}' +
      '@media (max-width:480px){.panel{inset:0;width:100%;height:100%;bottom:0;border-radius:0}.panel.open~.launcher{display:none}}' +
      '@media (prefers-color-scheme:dark){.panel{background:#101318}.teaser{background:#161a22;color:#eef1f6}.teaser span{color:#cdd3dc}.teaser button:hover{background:#232833}}' +
      '@media (prefers-reduced-motion:reduce){.panel,.launcher,.teaser,.launcher .face,.launcher .x{transition:none}}';
    if ('adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function') { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); root.adoptedStyleSheets = [sheet]; }
    else { const style = document.createElement('style'); style.textContent = css; root.appendChild(style); }
    const initial = (cfg.title || 'A').trim().charAt(0).toUpperCase();
    const face = (el) => {
      if (cfg.avatar_url) {
        const img = document.createElement('img'); img.src = cfg.avatar_url; img.alt = '';
        img.onerror = () => { img.remove(); cfg.avatar_url = null; face(el); };
        el.appendChild(img);
      }
      else if (el.classList.contains('av')) el.textContent = initial;
      else el.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
    };
    const panel = document.createElement('div');
    panel.className = 'panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', cfg.title || label);
    const button = document.createElement('button');
    button.className = 'launcher'; button.type = 'button'; button.title = label;
    button.setAttribute('aria-label', label); button.setAttribute('aria-expanded', 'false');
    const faceEl = document.createElement('span'); faceEl.className = 'face'; face(faceEl);
    const x = document.createElement('span'); x.className = 'x';
    x.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    button.append(faceEl, x);
    // The framed chat, kept by reference: a browser extension that adds its own nodes to the page (and
    // to this panel) must not be mistaken for it.
    let open = false, teaser = null, chat = null;
    const toggle = (value) => {
      open = value;
      if (open && !chat) { chat = frame('widget'); panel.appendChild(chat); }
      panel.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      if (teaser) { teaser.remove(); teaser = null; }
      if (open) setTimeout(() => chat.focus(), 60); else button.focus();
    };
    button.addEventListener('click', () => toggle(!open));
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') toggle(false); });
    let ready = false, queued = '';
    const send = (text) => chat.contentWindow.postMessage({ type: 'viable-chat:ask', text }, base);
    window.addEventListener('message', (e) => {
      if (e.origin !== base || !e.data) return;
      // Closing is harmless, so the chat host's word is enough; the rest must come from this panel's chat.
      if (e.data.type === 'viable-chat:close') { if (open) toggle(false); return; }
      if (!chat || e.source !== chat.contentWindow) return;
      if (e.data.type === 'viable-chat:ready') { ready = true; if (queued) { send(queued); queued = ''; } }
      // A link to this site from the chat (links_in_place): a cancelable 'viable-chat:navigate' event first,
      // so a single-page site can route to it and keep the panel open; otherwise the page goes there.
      if (e.data.type === 'viable-chat:navigate' && typeof e.data.url === 'string') {
        let url; try { url = new URL(e.data.url); } catch { return; }
        if (url.origin !== location.origin) return;
        if (window.dispatchEvent(new CustomEvent('viable-chat:navigate', { detail: { agent: slug, url: url.href }, cancelable: true }))) location.assign(url.href);
      }
    });
    const openWith = (options) => {
      const text = String((options && options.ask) || '').trim().slice(0, 4000);
      if (!open) toggle(true);
      if (text) { if (ready) send(text); else queued = text; }
    };
    window.__viableChat[slug] = { open: openWith, close: () => toggle(false) };
    window.addEventListener('viable-chat:open', (e) => { if (!e.detail || !e.detail.agent || e.detail.agent === slug) openWith(e.detail); });
    root.append(panel, button);
    const seen = (() => { try { return sessionStorage.getItem('viable-chat-teaser:' + slug); } catch { return '1'; } })();
    if (cfg.launcher.teaser && cfg.greeting && !seen) {
      setTimeout(() => {
        if (open) return;
        teaser = document.createElement('div'); teaser.className = 'teaser'; teaser.setAttribute('role', 'status');
        const av = document.createElement('span'); av.className = 'av'; face(av);
        const copy = document.createElement('div');
        const name = document.createElement('b'); name.textContent = cfg.title;
        const text = document.createElement('span'); text.textContent = cfg.greeting.replace(/[*_\x60#>]/g, '').slice(0, 160);
        copy.append(name, text);
        const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Dismiss'); dismiss.textContent = '×';
        const forget = () => { try { sessionStorage.setItem('viable-chat-teaser:' + slug, '1'); } catch {} };
        dismiss.addEventListener('click', (e) => { e.stopPropagation(); forget(); teaser.remove(); teaser = null; });
        teaser.addEventListener('click', () => { forget(); toggle(true); });
        teaser.append(av, copy, dismiss);
        root.appendChild(teaser);
        requestAnimationFrame(() => teaser && teaser.classList.add('show'));
      }, 2500);
    }
    const attach = () => document.body.appendChild(host);
    document.body ? attach() : document.addEventListener('DOMContentLoaded', attach);
  }
})();`;

/** The widget's script, framing the page from origin (where visitors open it). */
export const embedScript = (origin) => EMBED_SCRIPT.replace('PAGE_ORIGIN', scriptJson(origin));
