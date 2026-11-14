import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_HEAD_SCRIPT, THEME_SWITCH_CSS, THEME_SWITCH_SCRIPT, themeSwitchHtml } from '../src/console/theme.js';
import { consoleAsset, consolePage } from '../src/console/layout.js';

// A browser's cookies for a few addresses, enough to run the theme's scripts: a Domain the browser refuses (a public
// suffix) is dropped, as a browser drops it.
function browser(host, jar, refused = []) {
  const handlers = [];
  const visible = () => [...jar].filter(([key]) => { const domain = key.split('@')[1]; return host === domain || host.endsWith(`.${domain}`); });
  const document = {
    documentElement: { dataset: {} }, readyState: 'complete', querySelectorAll: () => [],
    addEventListener: (type, handler) => { if (type === 'change') handlers.push(handler); },
    get cookie() { return visible().map(([key, value]) => `${key.split('@')[0]}=${value}`).join('; '); },
    set cookie(text) {
      const [pair, ...attributes] = text.split('; ');
      const [name, value] = pair.split('=');
      const domain = attributes.find((part) => part.startsWith('Domain='))?.slice(7) || host;
      if (refused.includes(domain)) return;
      if (attributes.includes('Max-Age=0')) jar.delete(`${name}@${domain}`); else jar.set(`${name}@${domain}`, value);
    }
  };
  const window = { document, location: { hostname: host, protocol: 'https:' } };
  return {
    document,
    load: () => new Function('document', 'location', THEME_HEAD_SCRIPT)(document, window.location),
    start: () => new Function('document', 'location', THEME_SWITCH_SCRIPT)(document, window.location),
    pick: (value) => handlers.forEach((handler) => handler({ target: { value, matches: () => true } }))
  };
}

test('a picked theme is kept for the whole site, applied before paint, and System forgets it', () => {
  const jar = new Map();
  const teach = browser('teach.example.org', jar);
  teach.start();
  teach.pick('dark');
  assert.equal(teach.document.documentElement.dataset.theme, 'dark');
  assert.deepEqual([...jar.keys()], ['viable-theme@example.org'], 'one cookie, for the site');
  const www = browser('www.example.org', jar);
  www.load();
  assert.equal(www.document.documentElement.dataset.theme, 'dark', 'the other address of the site reads it');
  www.start();
  www.pick('light');
  teach.document.documentElement.dataset = {};
  teach.load();
  assert.equal(teach.document.documentElement.dataset.theme, 'light');
  teach.pick('system');
  assert.equal(teach.document.documentElement.dataset.theme, undefined);
  assert.equal(jar.size, 0);
});

test('where the browser refuses the site’s domain, the choice stays with this address', () => {
  const jar = new Map();
  const page = browser('someone.github.io', jar, ['github.io']);
  page.start();
  page.pick('dark');
  assert.deepEqual([...jar.keys()], ['viable-theme@someone.github.io']);
  const local = browser('localhost', jar);
  local.start();
  local.pick('light');
  assert.ok(jar.has('viable-theme@localhost'));
});

test('the head script takes only light or dark', () => {
  for (const [cookie, theme] of [['viable-theme=dark', 'dark'], ['a=1; viable-theme=light', 'light'], ['viable-theme=blue', undefined], ['other-viable-theme=dark', undefined], ['', undefined]]) {
    const document = { cookie, documentElement: { dataset: {} } };
    new Function('document', THEME_HEAD_SCRIPT)(document);
    assert.equal(document.documentElement.dataset.theme, theme, cookie);
  }
});

test('the switch is one named radio group, System first and chosen until the page says otherwise', () => {
  const html = themeSwitchHtml({ name: 'theme-a' });
  assert.match(html, /^<fieldset class="v-theme"><legend>Theme<\/legend>/);
  assert.deepEqual([...html.matchAll(/aria-label="(\w+)"/g)].map((match) => match[1]), ['System', 'Light', 'Dark']);
  assert.equal((html.match(/name="theme-a"/g) || []).length, 3);
  assert.equal((html.match(/ checked/g) || []).length, 1);
});

test('every console page applies the kept theme before it paints, and the account menu has the switch', async () => {
  const page = consolePage({ title: 'Ask', pages: [{ id: 'ask', title: 'Ask' }], current: 'ask', body: '<p>hi</p>', who: 'teacher@example.org' }, 'n0nce');
  const head = page.slice(0, page.indexOf('</head>'));
  assert.ok(head.indexOf(`<script nonce="n0nce">${THEME_HEAD_SCRIPT}</script>`) < head.indexOf('rel="stylesheet"'), 'before the stylesheet');
  assert.match(page, /<div class="side-theme"><span>Theme<\/span><fieldset class="v-theme">/);
  const css = await consoleAsset(page.match(/assets\/(base-[\w]+\.css)/)[1]).text();
  const js = await consoleAsset(page.match(/assets\/(base-[\w]+\.js)/)[1]).text();
  assert.ok(css.includes(THEME_SWITCH_CSS));
  assert.ok(js.includes(THEME_SWITCH_SCRIPT));
});
