/**
 * Who holds this server's token, for the pages behind it (the teacher's page, the console): the token
 * itself, or a session a browser got by giving it once. A session's value is its expiry and a signature
 * over it, so the server decides when it ends. The token is never taken from an address. No Node built-ins.
 */
import { markSvg, themeCss } from '../../../harness/src/ui/theme.js';
import { escapeHtml } from '../learner/shell.js';

export const COOKIE = 'viable_teacher';
// How long a session lasts, whatever a browser keeps: the server checks the time in its value.
const SESSION_MS = 8 * 3600000;

const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const sameValue = (a, b) => a.length === b.length && [...a].reduce((difference, ch, i) => difference | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

/** secret: () => the token, or null. paths: where a browser sends the session: the pages behind the token and a course's, to try what isn't open yet; a panel may need more. */
export function teacherSession({ secret, now = () => Date.now(), paths = ['/teacher', '/console', '/course'] }) {
  const sign = async (exp) => hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(`viable-teacher:${exp}`)));
  const tokenIs = async (given) => sameValue(await sha256(given), await sha256(secret()));
  const validSession = async (request) => {
    const found = new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d{1,16})\\.([a-f0-9]{64})`).exec(request.headers.get('cookie') || '');
    return Boolean(found) && Number(found[1]) > now() && sameValue(found[2], await sign(found[1]));
  };
  return {
    tokenIs,
    newSession: async () => { const exp = now() + SESSION_MS; return `${exp}.${await sign(exp)}`; },
    async holdsToken(request) {
      if (!secret()) return false;
      const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
      return bearer ? tokenIs(bearer) : validSession(request);
    },
    /** The cookies that set a session, or end one with extra of '; Max-Age=0'. */
    cookies: (value, url, extra = '') => [...new Set(extra ? [...paths, '/teacher', '/console', '/course', '/'] : paths)].map((path) => `${COOKIE}=${value}; Path=${path}; HttpOnly; SameSite=Strict${extra}${url.protocol === 'https:' ? '; Secure' : ''}`)
  };
}

/** A redirect that sets or ends a session. */
export const withCookies = (location, cookies) => new Response(null, { status: 303, headers: [['location', location], ['cache-control', 'no-store'], ...cookies.map((cookie) => ['set-cookie', cookie])] });

// same-origin, not no-referrer: a form's post from a page that sends no referrer says its origin is null, and is refused.
export const signInHeaders = (nonce) => ({ 'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; font-src data:; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`, 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });

/** The form that asks for the token. It posts to the teacher's page, which goes back where next says. */
export const signInPage = ({ title, text, message = null, next = null }, nonce) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style nonce="${nonce}">${themeCss()}
body{min-height:100vh;display:grid;place-items:center;padding:24px}
form{width:100%;max-width:400px;display:grid;gap:14px;padding:clamp(22px,4vw,30px);border-radius:var(--radius);background:var(--surface);box-shadow:var(--public-shadow)}
.brand{display:flex;align-items:center;gap:10px;color:var(--public-ink);font-weight:600}
h1{font-size:1.5rem;font-weight:400;letter-spacing:-.02em}
p{margin:0;color:var(--public-text);font-size:.9375rem;line-height:1.5}
code{font-size:.875em;overflow-wrap:anywhere}
.err{color:var(--pencil-red)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}</style></head><body><form method="post" action="/teacher${next ? `?next=${encodeURIComponent(next)}` : ''}"><div class="brand">${markSvg({ size: 26 })}<span>VIABLE Engine</span></div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><label class="sr" for="token">Token</label><input class="v-input" id="token" name="token" type="password" autocomplete="current-password" required autofocus>${message ? `<p class="err" role="alert">${escapeHtml(message)}</p>` : ''}<p class="hint">It’s in <code>.console-token</code> in the folder of a server made with <code>viable-engine start</code>, and it’s <code>VIABLE_ENGINE_TOKEN</code> on one you deployed.</p><button class="v-btn is-primary" type="submit">Continue</button></form></body></html>`;
