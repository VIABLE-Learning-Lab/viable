/**
 * The console's theme switch: System (the default, the device's setting), Light or Dark, on the theme's tokens
 * (harness/src/ui/theme.js, where <html data-theme="light|dark"> overrides the device). THEME_HEAD_SCRIPT goes in
 * <head> and applies a kept choice before the first paint; themeSwitchHtml() is the control and THEME_SWITCH_SCRIPT
 * makes it work. The choice is a cookie on the site's own domain, so a site's addresses share it (a host's front
 * page and its teacher's door), and none means System. No Node built-ins.
 */

export const THEME_SWITCH_CSS = `.v-theme{display:inline-flex;gap:2px;margin:0;padding:2px;border:1px solid var(--public-rule);border-radius:var(--radius-pill)}
.v-theme legend{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.v-theme label{position:relative;display:grid;place-items:center;width:28px;height:26px;border-radius:var(--radius-pill);color:var(--muted);cursor:pointer;transition:background .16s ease,color .16s ease}
.v-theme label:hover{color:var(--public-ink)}
.v-theme label:has(:checked){background:color-mix(in srgb,var(--public-ink) 10%,transparent);color:var(--public-ink)}
.v-theme label:has(:focus-visible){outline:2px solid var(--ink-blue);outline-offset:1px}
.v-theme input{position:absolute;width:1px;height:1px;margin:0;opacity:0;pointer-events:none}
.v-theme svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
@media (prefers-reduced-motion:reduce){.v-theme label{transition:none}}`;

/** The name a person's choice is kept under: "light" or "dark", and none for System. */
export const THEME_COOKIE = 'viable-theme';

/** For <head>, before any stylesheet paints: a kept Light or Dark wins over the device's setting. */
export const THEME_HEAD_SCRIPT = `(function(){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)(?=;|$)/);if(m)document.documentElement.dataset.theme=m[1]})()`;

const THEME_CHOICES = [
  ['system', 'System', 'M4 5h16v11H4zM8.5 20h7M12 16v4'],
  ['light', 'Light', 'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4'],
  ['dark', 'Dark', 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z']
];

/** System, Light and Dark as one radio group: one Tab stop, arrow keys move, the choice is announced. `name` keeps two apart on one page. */
export function themeSwitchHtml({ name = 'v-theme' } = {}) {
  const choice = ([value, label, path]) => `<label data-tip="${label}"><input type="radio" name="${name}" value="${value}" aria-label="${label}"${value === 'system' ? ' checked' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></label>`;
  return `<fieldset class="v-theme"><legend>Theme</legend>${THEME_CHOICES.map(choice).join('')}</fieldset>`;
}

/**
 * Makes every .v-theme work: it shows the kept choice, and a new one applies at once and is kept for a year as a
 * cookie on the site's own domain (teach.example.org keeps it for example.org), or on this address alone where
 * the browser refuses that.
 */
export const THEME_SWITCH_SCRIPT = `(function(){
  var root = document.documentElement, NAME = '${THEME_COOKIE}';
  function write(value, domain) {
    document.cookie = NAME + '=' + value + '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '') + (value ? '; Max-Age=31536000' : '; Max-Age=0') + (domain ? '; Domain=' + domain : '');
  }
  function keep(value) {
    var host = location.hostname, labels = host.split('.');
    var shared = labels.length > 2 && !/^[\d.]+$/.test(host) ? labels.slice(-2).join('.') : '';
    write('', '');
    if (shared) { write('', shared); if (value) write(value, shared); }
    if (value && document.cookie.indexOf(NAME + '=' + value) < 0) write(value, '');
  }
  function show() {
    var picked = root.dataset.theme || 'system';
    document.querySelectorAll('.v-theme input').forEach(function (input) { input.checked = input.value === picked; });
  }
  document.addEventListener('change', function (event) {
    var input = event.target;
    if (!input || !input.matches || !input.matches('.v-theme input')) return;
    if (input.value === 'system') delete root.dataset.theme; else root.dataset.theme = input.value;
    keep(input.value === 'system' ? '' : input.value);
    show();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();`;
