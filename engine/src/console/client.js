/**
 * What the console's pages share in the browser. A page is rendered by the server; this posts a change and
 * takes the new page's main from the server, so there is one renderer and whatever anyone wrote stays
 * text. Marked up, not programmed: a form or button says what it calls.
 *
 *   data-api="PUT courses/x"     a form sends its named fields as JSON, a button its data-body
 *   data-confirm, data-type      asks first; with data-type, the person types that word
 *   data-upload="POST ..."       a file input sends its files' bytes, one after another
 *   select[data-api="PUT ..."]   a select sends { its name: its value } when it changes
 *   data-search="courses/x/find" a form's fields as a query, the answer's html put in data-into
 *   data-run="POST agents/x/test" a form's fields as JSON, the answer's html put in data-into, for what takes a while
 *   data-busy                     what a form or button says while its data-api is working
 *   data-copy, data-print        copies that text; prints the page
 *   data-guard                   a form that warns before leaving with what isn't saved
 *   data-say-in="id"             where a form says how it went, when that is outside it
 *   data-iso                     a datetime-local input showing, and sending, an instant
 *   data-local                   a time element shown in the reader's own time
 *   data-show-when="name=value"  shown while that field of its form says so
 *
 * An answer's go goes there; its said is said where the form or button's [data-say] is, kept by id across
 * the refresh. What someone has typed in any other form stays through a refresh.
 */
export const CONSOLE_SCRIPT = String.raw`(() => {
  let line = Promise.resolve();
  const inLine = (work) => { line = line.then(work, work); return line; };
  const call = async (spec, body, file) => {
    const [method, path] = spec.split(' ');
    // A name from a package can't climb out of the address it is part of.
    if (path.split('?')[0].split('/').some((part) => ['.', '..', '%2e', '%2e%2e', '.%2e', '%2e.'].includes(part.toLowerCase()))) throw new Error('That address isn’t right.');
    const init = file
      ? { method, headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file }
      : { method, headers: { 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) };
    const response = await fetch('/console/api/' + path, init);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.reload(); throw new Error('Sign in again.'); }
    if (!response.ok) throw new Error((data.error && data.error.message) || 'That didn’t work. Try again.');
    return data;
  };

  const localInput = (iso) => { if (!iso) return ''; const at = new Date(iso); return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const dress = (root) => {
    for (const item of root.querySelectorAll('[data-iso]')) { item.value = localInput(item.dataset.iso); item.defaultValue = item.value; }
    for (const item of root.querySelectorAll('time[data-local]')) item.textContent = new Date(item.dateTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    showing(root);
  };
  const showing = (root) => {
    for (const part of root.querySelectorAll('[data-show-when]')) {
      const form = part.dataset.form ? (root.getElementById ? root : root.ownerDocument).getElementById(part.dataset.form) || root.querySelector('#' + CSS.escape(part.dataset.form)) : part.closest('form');
      if (!form) continue;
      const [name, wanted] = part.dataset.showWhen.split('=');
      const field = form.elements[name];
      const value = !field ? '' : field.type === 'checkbox' ? String(field.checked) : field.value;
      part.hidden = !wanted.split('|').includes(value);
    }
  };
  const isChanged = (item) => (['checkbox', 'radio'].includes(item.type) ? item.checked !== item.defaultChecked : item.tagName === 'SELECT' ? [...item.options].some((option) => option.selected !== option.defaultSelected) : item.type !== 'hidden' && item.type !== 'file' && item.value !== item.defaultValue);
  const fieldsOf = (form) => [...form.elements].filter((item) => item.name);
  const dirty = (form) => fieldsOf(form).some(isChanged);

  const setPath = (target, path, value) => {
    const steps = path.split('.');
    let at = target;
    for (const step of steps.slice(0, -1)) at = at[step] ??= {};
    at[steps.at(-1)] = value;
  };
  const valuesOf = (form) => {
    const body = {};
    const lists = new Set();
    for (const item of fieldsOf(form)) {
      if (item.disabled || item.type === 'file' || item.closest('[hidden]')) continue;
      if (item.type === 'checkbox' && item.dataset.many != null) {
        const steps = item.name;
        if (!lists.has(steps)) { lists.add(steps); setPath(body, steps, []); }
        if (item.checked) steps.split('.').reduce((at, step) => at[step], body).push(item.value);
      } else if (item.type === 'checkbox') setPath(body, item.name, item.checked);
      else if (item.type === 'radio') { if (item.checked) setPath(body, item.name, item.value); }
      else if (item.dataset.iso != null) setPath(body, item.name, item.value ? new Date(item.value).toISOString() : null);
      else if (item.type === 'number') setPath(body, item.name, item.value === '' ? null : Number(item.value));
      else setPath(body, item.name, item.value);
    }
    return body;
  };

  const refresh = async (saved) => {
    const response = await fetch(location.pathname + location.search, { headers: { accept: 'text/html' } });
    const next = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('main');
    if (!next) { location.reload(); return; }
    const focused = document.activeElement && document.activeElement.id;
    // What is typed and not saved goes across.
    for (const form of document.querySelectorAll('main form[id]')) {
      if (form === saved || !dirty(form)) continue;
      const fresh = next.querySelector('#' + CSS.escape(form.id));
      if (!fresh) continue;
      for (const item of fieldsOf(form)) {
        if (!isChanged(item)) continue;
        const other = [...fresh.elements].find((candidate) => candidate.name === item.name && (!['checkbox', 'radio'].includes(item.type) || candidate.value === item.value));
        if (!other) continue;
        if (['checkbox', 'radio'].includes(item.type)) other.checked = item.checked;
        else if (item.tagName === 'SELECT') other.value = item.value;
        else { other.value = item.value; other.dataset.typed = '1'; }
      }
    }
    // What someone has opened stays open.
    for (const open of document.querySelectorAll('main details[id][open]')) next.querySelector('#' + CSS.escape(open.id))?.setAttribute('open', '');
    dress(next);
    document.querySelector('main').replaceWith(next);
    for (const item of next.querySelectorAll('[data-typed]')) item.removeAttribute('data-typed');
    const again = focused && document.getElementById(focused);
    if (again) again.focus({ preventScroll: true });
  };
  const say = (where, text, kind) => {
    const named = where && where.dataset && where.dataset.sayIn && document.getElementById(where.dataset.sayIn);
    const box = named ? named.querySelector('[data-say]') : where && (where.matches('[data-say]') ? where : where.querySelector('[data-say]') || (where.closest('[data-say-box]') || document).querySelector('[data-say]'));
    if (!box) return;
    box.textContent = text;
    box.className = 'say' + (kind ? ' ' + kind : '');
    return box;
  };
  // Something found again once the page is replaced: by its own id, or by the id of what says how it went.
  const placeOf = (element) => (element && (element.id || (element.closest('[data-say-box][id]') || {}).id)) || null;
  const again = (element, place = placeOf(element)) => (place && document.getElementById(place)) || element;
  // A browser has the clipboard only on https and this computer's own address, and a class on this network is neither.
  const copyText = (text) => {
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    const area = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done ? Promise.resolve() : Promise.reject(new Error('Not copied'));
  };
  const after = async (element, data, fallback) => {
    if (data.go) { guarded = false; location.assign(data.go); return; }
    const place = placeOf(element);
    await refresh(element && element.tagName === 'FORM' ? element : null);
    const box = say(again(element, place), data.said || fallback || 'Saved.', 'good');
    // What was focused may have gone with the old page: someone on a keyboard or a screen reader carries on from what it says.
    if (box && document.activeElement === document.body) { box.tabIndex = -1; box.focus({ preventScroll: true }); }
  };

  // A dialog in place of the browser's own, on the page's look.
  const ask = (text, { word = null, yes = 'Continue' } = {}) => new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ask';
    const words = document.createElement('p');
    words.textContent = text;
    dialog.append(words);
    let typed = null;
    if (word) {
      const label = document.createElement('label');
      label.className = 'v-label';
      label.textContent = 'Type ' + word + ' to go on';
      typed = document.createElement('input');
      typed.className = 'v-input';
      typed.autocomplete = 'off';
      label.append(typed);
      dialog.append(label);
    }
    const row = document.createElement('div');
    row.className = 'actions';
    const no = Object.assign(document.createElement('button'), { type: 'button', className: 'v-btn', textContent: 'Cancel' });
    const go = Object.assign(document.createElement('button'), { type: 'button', className: 'v-btn is-primary', textContent: yes, disabled: Boolean(word) });
    row.append(go, no);
    dialog.append(row);
    if (typed) typed.addEventListener('input', () => { go.disabled = typed.value.trim() !== word; });
    const end = (answer) => { dialog.close(); dialog.remove(); resolve(answer); };
    no.addEventListener('click', () => end(false));
    go.addEventListener('click', () => end(true));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); end(false); });
    document.body.append(dialog);
    dialog.showModal();
  });
  const agreed = (element) => (element.dataset.confirm ? ask(element.dataset.confirm, { word: element.dataset.type || null, yes: element.dataset.yes || 'Continue' }) : Promise.resolve(true));

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.dataset.run) {
      event.preventDefault();
      const into = document.getElementById(form.dataset.into);
      into.textContent = 'Working…';
      inLine(async () => { const data = await call(form.dataset.run, valuesOf(form)); into.innerHTML = data.html; }).catch((error) => { into.textContent = error.message; });
      return;
    }
    if (form.dataset.search) {
      event.preventDefault();
      const query = new URLSearchParams(Object.entries(valuesOf(form)).filter(([, value]) => value != null && value !== '')).toString();
      const into = document.getElementById(form.dataset.into);
      inLine(async () => { const data = await call('GET ' + form.dataset.search + (query ? '?' + query : '')); into.innerHTML = data.html; }).catch((error) => { into.textContent = error.message; });
      return;
    }
    if (!form.dataset.api) return;
    event.preventDefault();
    agreed(form).then((yes) => { if (yes) return inLine(async () => { say(form, form.dataset.busy || 'Saving…'); const data = await call(form.dataset.api, valuesOf(form)); guardedOff(form); await after(form, data); }).catch((error) => say(again(form), error.message, 'bad')); });
  });
  const guardedOff = (form) => { for (const item of fieldsOf(form)) { if (['checkbox', 'radio'].includes(item.type)) item.defaultChecked = item.checked; else if (item.type !== 'file' && item.tagName !== 'SELECT') item.defaultValue = item.value; } };

  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('button,a');
    if (!button) return;
    if (button.dataset.copy != null) {
      const was = button.textContent;
      copyText(button.dataset.copy).then(() => 'Copied', () => 'Couldn’t copy').then((word) => { button.textContent = word; setTimeout(() => { button.textContent = was; }, 1400); });
      return;
    }
    if (button.dataset.print != null) { window.print(); return; }
    if (!button.dataset.api) return;
    event.preventDefault();
    const body = button.dataset.body ? JSON.parse(button.dataset.body) : {};
    agreed(button).then((yes) => { if (yes) return inLine(async () => { if (button.dataset.busy) say(button, button.dataset.busy); const data = await call(button.dataset.api, body); await after(button, data, button.dataset.said); }).catch((error) => say(button, error.message, 'bad')); });
  });
  document.addEventListener('change', (event) => {
    const item = event.target;
    if (item.form) showing(document);
    if (item.tagName === 'SELECT' && item.dataset.api) {
      inLine(async () => { const data = await call(item.dataset.api, { [item.name]: item.value }); await after(item, data); }).catch((error) => say(again(item), error.message, 'bad'));
      return;
    }
    if (item.dataset && item.dataset.upload && item.files && item.files[0]) {
      const files = [...item.files];
      inLine(async () => {
        let data;
        for (const file of files) { say(item, 'Sending ' + file.name + '…'); data = await call(item.dataset.upload, null, file); }
        item.value = '';
        await after(item, data);
        if (files.length > 1) say(again(item), 'Added ' + files.length + ' files.', 'good');
      }).catch((error) => { item.value = ''; refresh().then(() => say(again(item), error.message, 'bad')); });
    }
  });
  let guarded = true;
  window.addEventListener('beforeunload', (event) => {
    if (guarded && [...document.querySelectorAll('form[data-guard]')].some(dirty)) event.preventDefault();
  });
  dress(document);
})();`;
