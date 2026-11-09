/**
 * What the console's pages share in the browser. A page is rendered by the server; this posts a change and
 * takes the new page's main from the server, so there is one renderer and whatever anyone wrote stays
 * text. Marked up, not programmed: a form or button says what it calls.
 *
 *   data-api="PUT courses/x"     a form sends its named fields as JSON, a button its data-body
 *   data-confirm, data-type      asks first; with data-type, the person types that word
 *   data-confirm on a plain form asks, then the form goes the browser's way (signing out)
 *   data-upload="POST ..."       a file input sends its files' bytes, one after another
 *   data-drop                    what a file can be dropped on, for the file input inside it
 *   select.v-input               dressed as the console's own menu; the select stays, and holds the value
 *   select[data-api="PUT ..."]   a select sends { its name: its value } when it changes
 *   data-search="courses/x/find" a form's fields as a query, the answer's html put in data-into
 *   data-run="POST agents/x/test" a form's fields as JSON, the answer's html put in data-into, for what takes a while
 *   data-preview="POST ..."      a form's fields sent as they change, the answer's html put in data-into, to show what it would do;
 *                                the answer's button and ready set its submit button's words and whether it can be pressed
 *   data-read-into="name"        a file input whose file's words go in that field of its form, read here and never sent as a file
 *   data-busy                     what a form or button says while its data-api is working
 *   data-copy, data-print        copies that text; prints the page
 *   data-guard                   a form that warns before leaving with what isn't saved
 *   data-together, data-save-bar forms that one Save saves, whichever of them changed; the bar it sits in shows there is something to save
 *   data-say-in="id"             where a form says how it went, when that is outside it
 *   data-iso                     a datetime-local input showing, and sending, an instant
 *   input.v-input[type=date|datetime-local]  dressed as the date and time picker every screen shares (datePicker.js);
 *                                data-empty says what it shows with nothing chosen, data-default-time the time a day takes
 *   data-local                   a time element shown in the reader's own time
 *   data-min-from="name"         a date field whose earliest day is that field's, as a range's end is its start's
 *   data-arrange="PUT …"         a board whose items and blocks drag into a new order (dragOrder.js marks); the whole order is sent
 *   data-show-when="name=value"  shown while that field of its form says so (a|b for either, != for anything else, ; between rules for any)
 *
 * An answer's go goes there; its said is said where the form or button's [data-say] is, kept by id across
 * the refresh. What someone has typed in any other form stays through a refresh.
 */
import { icon } from './icons.js';
import { DATE_PICKER_SCRIPT } from './datePicker.js';
import { SHEETS_SCRIPT } from './sheets.js';
import { DRAG_ORDER_SCRIPT } from './dragOrder.js';

export const CONSOLE_SCRIPT = String.raw`(() => {
  const ICON = ${JSON.stringify({ check: icon('check', 16), chevron: icon('chevron', 16) })};
  // The date and time picker every VIABLE screen shares (datePicker.js): dressDate(input) and tidyDates().
  ${DATE_PICKER_SCRIPT}
  // An Excel file's sheets, read here (sheets.js): sheetRows(bytes, which) and rowsText(rows).
  ${SHEETS_SCRIPT}
  // Dragging into order by a handle, as every VIABLE screen does it (dragOrder.js): arrangeable(board, onDrop).
  ${DRAG_ORDER_SCRIPT}
  let line = Promise.resolve();
  const inLine = (work) => { line = line.then(work, work); return line; };
  // Tooltips are the console's own, never the browser's: data-tip on a control, shown after a beat on hover and at once on keyboard
  // focus. Its words are already the control's name for a screen reader, so the tip itself is hidden from one.
  const tip = Object.assign(document.createElement('div'), { className: 'v-tip', hidden: true });
  tip.setAttribute('aria-hidden', 'true');
  document.body.append(tip);
  let tipOn = null;
  let tipWait = 0;
  const hideTip = () => { clearTimeout(tipWait); tipOn = null; tip.classList.remove('is-on'); tip.hidden = true; };
  const showTip = (target, now) => {
    clearTimeout(tipWait);
    tipOn = target;
    const show = () => {
      if (tipOn !== target || !target.isConnected || !target.dataset.tip) return;
      tip.textContent = target.dataset.tip;
      tip.hidden = false;
      const at = target.getBoundingClientRect();
      const size = tip.getBoundingClientRect();
      const top = at.top - size.height - 8 >= 8 ? at.top - size.height - 8 : at.bottom + 8;
      const left = Math.max(8, Math.min(at.left + at.width / 2 - size.width / 2, innerWidth - size.width - 8));
      tip.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
      tip.classList.add('is-on');
    };
    if (now) show(); else tipWait = setTimeout(show, 450);
  };
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const target = event.target.closest && event.target.closest('[data-tip]');
    if (target && target !== tipOn) showTip(target, tip.classList.contains('is-on'));
    else if (!target && tipOn) hideTip();
  });
  document.addEventListener('focusin', (event) => { const target = event.target.closest && event.target.closest('[data-tip]'); if (target && target.matches(':focus-visible')) showTip(target, true); });
  // A menu that is a details element closes when a click lands elsewhere, or on Escape, back on its button.
  // A click in a date picker opened from a menu (it floats above the page) belongs to that menu.
  document.addEventListener('click', (event) => { for (const menu of document.querySelectorAll('details[data-close-outside][open]')) if (!menu.contains(event.target) && !(event.target.closest && event.target.closest('.vd-pop'))) menu.open = false; });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = event.target.closest && event.target.closest('details[data-close-outside][open]');
    if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('pointerdown', hideTip);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && tipOn) hideTip(); });
  addEventListener('scroll', hideTip, true);
  // A click answers at once: a line across the top until the next page or the answer comes.
  let working = 0;
  const busy = (by) => { working = Math.max(0, working + by); document.documentElement.classList.toggle('is-working', working > 0); };
  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0 || link.target || link.hasAttribute('download') || link.origin !== location.origin || link.pathname === location.pathname) return;
    document.documentElement.classList.add('is-going');
  });
  addEventListener('pageshow', () => document.documentElement.classList.remove('is-going'));
  // What a page shows that needn't hold it up, such as what is left of a budget, comes in after it.
  // A long part a person may never open comes when they open it.
  const loadOpened = (details) => { const place = details.querySelector('[data-loaded]'); if (!place || place.dataset.has) return; place.dataset.has = '1'; call('GET ' + details.dataset.load).then((data) => { place.innerHTML = data.html || ''; dress(place); }).catch(() => { delete place.dataset.has; }); };
  document.addEventListener('toggle', (event) => { if (event.target.matches && event.target.matches('details[data-load]') && event.target.open) loadOpened(event.target); }, true);
  const fill = () => {
    for (const details of document.querySelectorAll('details[data-load][open]')) loadOpened(details);
    const parts = [...document.querySelectorAll('[data-fill]')];
    for (const path of new Set(parts.map((part) => part.dataset.fill))) {
      call('GET ' + path).then((data) => {
        for (const part of parts) {
          if (part.dataset.fill !== path) continue;
          // A meter's width, a mark that something needs a look, or words.
          if (part.dataset.fillAs === 'html') part.innerHTML = data.html || '';
          else if (part.dataset.fillAs === 'meter') { part.style.width = data.share == null ? '0' : Math.round(data.share * 100) + '%'; part.parentElement.hidden = data.share == null; part.parentElement.classList.toggle('is-low', Boolean(data.low)); }
          else if (part.dataset.fillAs === 'low') part.hidden = !data.low;
          else if (data.words) part.textContent = data.words;
        }
      }).catch(() => {});
    }
  };
  const call = async (spec, body, file, quiet = false) => {
    const [method, path] = spec.split(' ');
    // A name from a package can't climb out of the address it is part of.
    if (path.split('?')[0].split('/').some((part) => ['.', '..', '%2e', '%2e%2e', '.%2e', '%2e.'].includes(part.toLowerCase()))) throw new Error('That address isn’t right.');
    const init = file
      ? { method, headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file }
      : { method, headers: { 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) };
    const shows = method !== 'GET' && !quiet;
    if (shows) busy(1);
    const response = await fetch('/console/api/' + path, init).finally(() => { if (shows) busy(-1); });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.reload(); throw new Error('Sign in again.'); }
    if (!response.ok) throw new Error((data.error && data.error.message) || 'That didn’t work. Try again.');
    return data;
  };

  const localInput = (iso) => { if (!iso) return ''; const at = new Date(iso); return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const dress = (root) => {
    for (const item of root.querySelectorAll('[data-iso]')) { item.value = localInput(item.dataset.iso); item.defaultValue = item.value; }
    for (const item of root.querySelectorAll('time[data-local]')) item.textContent = new Date(item.dateTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    for (const select of root.querySelectorAll('select.v-input')) dressSelect(select);
    for (const input of root.querySelectorAll('input[data-list]')) dressSuggest(input);
    for (const input of root.querySelectorAll('input.v-input[type=date],input.v-input[type=datetime-local]')) dressDate(input);
    // A board's new order goes in one request (data-arrange), and the page is drawn again from what was kept.
    for (const board of root.querySelectorAll('[data-arrange]')) arrangeable(board, (order) => inLine(async () => {
      await call(board.dataset.arrange, { units: order.blocks, activities: order.items.map((entry) => ({ key: entry.key, unit_ref: entry.group })) });
      await refresh();
    }).catch((error) => refresh().then(() => say(document.querySelector('[data-arrange]'), error.message, 'bad'))));
    showing(root);
  };

  // A floating list that escapes whatever it sits in, placed by what opened it: below, or above where there's more room.
  const canFloat = typeof HTMLElement.prototype.showPopover === 'function';
  const place = (pop, anchor, wide = null) => {
    const box = anchor.getBoundingClientRect();
    const below = innerHeight - box.bottom - 16;
    const above = box.top - 16;
    pop.style.minWidth = Math.min(wide ?? box.width, innerWidth - 24) + 'px';
    pop.style.maxWidth = 'min(520px, calc(100vw - 24px))';
    const up = pop.scrollHeight > below && above > below;
    pop.style.maxHeight = Math.max(140, Math.min(380, up ? above : below)) + 'px';
    pop.style.top = (up ? box.top - 4 - pop.offsetHeight : box.bottom + 4) + 'px';
    pop.style.left = Math.max(12, Math.min(box.left, innerWidth - pop.offsetWidth - 12)) + 'px';
  };
  let shown = null;
  const closePop = (refocus = true) => {
    if (!shown) return;
    const { pop, anchor } = shown;
    shown = null;
    anchor.setAttribute('aria-expanded', 'false');
    try { pop.hidePopover(); } catch { /* already gone */ }
    pop.remove();
    if (refocus) anchor.focus({ preventScroll: true });
  };
  // manual: a list under a field being typed in, which a click in that field mustn't close.
  const float = (pop, anchor, wide = null, mode = 'auto') => {
    closePop(false);
    pop.classList.add('v-pop');
    pop.popover = mode;
    // The browser closes it for Escape or a click elsewhere: focus goes back unless it has already gone somewhere else.
    pop.addEventListener('toggle', (event) => { if (event.newState === 'closed' && shown && shown.pop === pop) closePop(document.activeElement === document.body || pop.contains(document.activeElement)); });
    document.body.append(pop);
    pop.showPopover();
    place(pop, anchor, wide);
    anchor.setAttribute('aria-expanded', 'true');
    shown = { pop, anchor };
  };
  window.addEventListener('resize', () => closePop(false));
  document.addEventListener('scroll', (event) => { if (shown && !shown.pop.contains(event.target)) closePop(false); }, true);

  let menuIds = 0;
  function openSelect(select, button) {
    const pop = document.createElement('div');
    pop.tabIndex = 0;
    pop.setAttribute('role', 'listbox');
    pop.setAttribute('aria-labelledby', button.getAttribute('aria-labelledby') || button.id);
    const rows = [...select.options].map((option, index) => {
      const row = document.createElement('div');
      row.className = 'v-option';
      row.id = button.id + '-option-' + index;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.selected));
      row.append(Object.assign(document.createElement('strong'), { textContent: option.textContent }));
      if (option.selected) row.insertAdjacentHTML('beforeend', ICON.check);
      if (option.dataset.hint) row.append(Object.assign(document.createElement('small'), { textContent: option.dataset.hint }));
      pop.append(row);
      return row;
    });
    let active = Math.max(0, select.selectedIndex);
    const activate = (index) => {
      rows[active]?.classList.remove('is-active');
      active = Math.max(0, Math.min(rows.length - 1, index));
      rows[active].classList.add('is-active');
      pop.setAttribute('aria-activedescendant', rows[active].id);
      rows[active].scrollIntoView({ block: 'nearest' });
    };
    const choose = (index) => {
      closePop();
      if (select.selectedIndex === index) return;
      select.selectedIndex = index;
      button.querySelector('.v-menu-value').textContent = select.options[index].textContent;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    rows.forEach((row, index) => {
      row.addEventListener('mousemove', () => { if (active !== index) activate(index); });
      row.addEventListener('click', () => choose(index));
    });
    let typed = '';
    let typedAt = 0;
    pop.addEventListener('keydown', (event) => {
      const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: rows.length - 1, PageDown: active + 6, PageUp: active - 6 };
      if (event.key in moves) { event.preventDefault(); activate(moves[event.key]); return; }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); return; }
      if (event.key === 'Escape') { event.preventDefault(); closePop(); return; }
      if (event.key === 'Tab') { closePop(); return; }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        typed = (Date.now() - typedAt < 600 ? typed : '') + event.key.toLowerCase();
        typedAt = Date.now();
        const found = rows.findIndex((row) => row.textContent.toLowerCase().startsWith(typed));
        if (found >= 0) activate(found);
      }
    });
    float(pop, button);
    activate(active);
    pop.focus({ preventScroll: true });
  }
  function dressSelect(select) {
    if (!canFloat || select.dataset.dressed) return;
    select.dataset.dressed = '1';
    const id = 'menu-' + (select.id || (menuIds += 1));
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = select.className + ' v-menu-button';
    button.disabled = select.disabled;
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const value = Object.assign(document.createElement('span'), { className: 'v-menu-value', id: id + '-value', textContent: select.selectedOptions[0]?.textContent || '' });
    button.append(value);
    button.insertAdjacentHTML('beforeend', ICON.chevron);
    // The label names the button now, and the select stays for the form.
    const label = select.id && (select.ownerDocument.querySelector('label[for="' + CSS.escape(select.id) + '"]') || select.closest('main')?.querySelector('label[for="' + CSS.escape(select.id) + '"]'));
    if (label) {
      label.id ||= id + '-label';
      label.htmlFor = id;
      button.setAttribute('aria-labelledby', label.id + ' ' + value.id);
    } else if (select.getAttribute('aria-label')) button.setAttribute('aria-label', select.getAttribute('aria-label'));
    select.classList.remove('v-input');
    select.classList.add('v-menu-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.after(button);
    button.addEventListener('click', () => (shown && shown.anchor === button ? closePop() : openSelect(select, button)));
    button.addEventListener('keydown', (event) => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openSelect(select, button); } });
  }

  // A field with suggestions (data-list names a <datalist>, read when it opens): the console's own list under it, of those
  // that hold what is typed, never the browser's. Anything else can still be typed.
  function dressSuggest(input) {
    if (input.dataset.dressed) return;
    input.dataset.dressed = '1';
    if (!canFloat) { input.setAttribute('list', input.dataset.list); return; }
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    let rows = [];
    let active = -1;
    const isOpen = () => Boolean(shown && shown.anchor === input);
    const close = () => { if (isOpen()) closePop(false); input.removeAttribute('aria-activedescendant'); };
    const activate = (index) => {
      rows[active]?.classList.remove('is-active');
      active = (index + rows.length) % rows.length;
      rows[active].classList.add('is-active');
      input.setAttribute('aria-activedescendant', rows[active].id);
      rows[active].scrollIntoView({ block: 'nearest' });
    };
    const pick = (value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    };
    // Opened, it lists them all with the one chosen marked; typing narrows it to those that hold what is typed.
    const open = (narrow = false) => {
      const typed = narrow ? input.value.trim().toLowerCase() : '';
      const found = [...(document.getElementById(input.dataset.list)?.options || [])].map((option) => option.value).filter((value) => !typed || value.toLowerCase().includes(typed)).slice(0, 60);
      if (!found.length) { close(); return; }
      const pop = document.createElement('div');
      pop.id = (input.id || 'suggest') + '-list';
      pop.setAttribute('role', 'listbox');
      rows = found.map((value, index) => {
        const row = document.createElement('div');
        row.className = 'v-option';
        row.id = pop.id + '-' + index;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(value === input.value));
        row.append(Object.assign(document.createElement('strong'), { textContent: value }));
        if (value === input.value) row.insertAdjacentHTML('beforeend', ICON.check);
        // Chosen on mousedown, before the field loses focus and closes the list.
        row.addEventListener('mousedown', (event) => { event.preventDefault(); pick(value); });
        row.addEventListener('mousemove', () => { if (active !== index) activate(index); });
        pop.append(row);
        return row;
      });
      active = -1;
      float(pop, input, null, 'manual');
      input.setAttribute('aria-controls', pop.id);
    };
    input.addEventListener('focus', () => open());
    input.addEventListener('click', () => { if (!isOpen()) open(); });
    input.addEventListener('input', (event) => { if (event.isTrusted) open(true); });
    input.addEventListener('blur', close);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!isOpen()) open(); if (rows.length && isOpen()) activate(active + (event.key === 'ArrowDown' ? 1 : -1)); return; }
      if (event.key === 'Enter' && isOpen() && active >= 0) { event.preventDefault(); pick(rows[active].querySelector('strong').textContent); return; }
      if (event.key === 'Escape' && isOpen()) { event.preventDefault(); event.stopPropagation(); close(); }
    });
  }

  const showing = (root) => {
    for (const part of root.querySelectorAll('[data-show-when]')) {
      const form = part.dataset.form ? (root.getElementById ? root : root.ownerDocument).getElementById(part.dataset.form) || root.querySelector('#' + CSS.escape(part.dataset.form)) : part.closest('form');
      if (!form) continue;
      // name=a|b, or name!=a for anything else; several, split by ;, show it when any holds.
      const holds = (rule) => {
        const not = rule.includes('!=');
        const [name, wanted] = rule.split(not ? '!=' : '=');
        const field = form.elements[name];
        const value = !field ? '' : field.type === 'checkbox' ? String(field.checked) : field.value;
        return wanted.split('|').includes(value) !== not;
      };
      part.hidden = !part.dataset.showWhen.split(';').some(holds);
    }
  };
  const isChanged = (item) => (['checkbox', 'radio'].includes(item.type) ? item.checked !== item.defaultChecked : item.tagName === 'SELECT' ? [...item.options].some((option) => option.selected !== option.defaultSelected) : item.type !== 'hidden' && item.type !== 'file' && item.value !== item.defaultValue);
  const fieldsOf = (form) => [...form.elements].filter((item) => item.name);
  const dirty = (form) => fieldsOf(form).some(isChanged);
  const together = () => [...document.querySelectorAll('form[data-together]')];
  const saveBar = () => {
    const bar = document.querySelector('[data-save-bar]');
    if (!bar) return;
    const changed = together().some(dirty);
    bar.classList.toggle('is-changed', changed);
    const button = bar.querySelector('button');
    button.disabled = !changed || button.dataset.locked != null;
  };

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
      // A part hidden because it doesn't apply sends nothing; a tab that isn't showing still holds the form.
      if (item.disabled || item.type === 'file' || item.closest('[hidden]:not([role=tabpanel])')) continue;
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
    // What someone has opened stays open, and so does the tab they are on.
    for (const open of document.querySelectorAll('main details[id][open]')) next.querySelector('#' + CSS.escape(open.id))?.setAttribute('open', '');
    for (const panel of document.querySelectorAll('main [role=tabpanel][id]')) { const twin = next.querySelector('#' + CSS.escape(panel.id)); if (twin) twin.hidden = panel.hidden; }
    for (const tab of document.querySelectorAll('main [role=tab][id]')) { const twin = next.querySelector('#' + CSS.escape(tab.id)); if (twin) { twin.setAttribute('aria-selected', tab.getAttribute('aria-selected')); twin.tabIndex = tab.tabIndex; } }
    dress(next);
    // A date picker open on the page that goes would be left floating, its field gone.
    for (const pop of document.querySelectorAll('.vd-pop')) { if (pop.matches && typeof pop.hidePopover === 'function' && pop.matches(':popover-open')) pop.hidePopover(); pop.remove(); }
    document.querySelector('main').replaceWith(next);
    tidyDates();
    for (const item of next.querySelectorAll('[data-typed]')) item.removeAttribute('data-typed');
    const again = focused && document.getElementById(focused);
    if (again) again.focus({ preventScroll: true });
    fill();
    document.dispatchEvent(new Event('viable:refreshed'));
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
  const ask = (text, { word = null, yes = 'Continue', no: noWords = 'Cancel', danger = false, list = null } = {}) => new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'v-dialog';
    const words = document.createElement('p');
    words.textContent = text;
    dialog.append(words);
    // What is left to do, each with the way to it.
    if (list?.length) {
      const items = document.createElement('ul');
      items.className = 'v-dialog-list';
      for (const item of list) {
        const row = document.createElement('li');
        row.append(Object.assign(document.createElement('span'), { textContent: item.words }));
        if (item.href) row.append(Object.assign(document.createElement('a'), { href: item.href, textContent: item.label || 'Fix it', ...(item.href.includes('/try') ? { target: '_blank', rel: 'noopener' } : {}) }));
        items.append(row);
      }
      dialog.append(items);
    }
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
    const no = Object.assign(document.createElement('button'), { type: 'button', className: 'v-btn', textContent: noWords });
    const go = Object.assign(document.createElement('button'), { type: 'button', className: 'v-btn ' + (danger ? 'is-danger' : 'is-primary'), textContent: yes, disabled: Boolean(word) });
    row.append(go, no);
    dialog.append(row);
    if (typed) typed.addEventListener('input', () => { go.disabled = typed.value.trim() !== word; });
    const end = (answer) => { dialog.close(); dialog.remove(); resolve(answer); };
    no.addEventListener('click', () => end(false));
    go.addEventListener('click', () => end(true));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); end(false); });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) end(false); });
    document.body.append(dialog);
    dialog.showModal();
    (typed || (danger ? no : go)).focus();
  });
  // Opening something asks first what would stop it working for learners (data-checks: where to read that), only when
  // something would: each with the way to fix it, and Open anyway.
  const checked = async (element) => {
    if (!element.dataset.checks) return true;
    let unmet = [];
    try { unmet = (await call('GET ' + element.dataset.checks)).unmet || []; } catch { return true; }
    if (!unmet.length) return true;
    return ask(unmet.length === 1 ? 'Before learners come, one thing to look at:' : 'Before learners come, ' + unmet.length + ' things to look at:', { yes: element.dataset.anyway || 'Open anyway', no: 'Not yet', list: unmet });
  };
  const agreed = async (element) => (await checked(element)) && (element.dataset.confirm ? ask(element.dataset.confirm, { word: element.dataset.type || null, yes: element.dataset.yes || 'Continue', danger: element.dataset.danger != null || element.classList.contains('danger') }) : Promise.resolve(true));

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
      // A named button that sent it says which, as a field of its own.
      const query = new URLSearchParams(Object.entries({ ...valuesOf(form), ...(event.submitter?.name ? { [event.submitter.name]: event.submitter.value } : {}) }).filter(([, value]) => value != null && value !== '')).toString();
      const into = document.getElementById(form.dataset.into);
      inLine(async () => { const data = await call('GET ' + form.dataset.search + (query ? '?' + query : '')); into.innerHTML = data.html; }).catch((error) => { into.textContent = error.message; });
      return;
    }
    if (form.dataset.together != null) {
      event.preventDefault();
      inLine(async () => {
        const bar = document.querySelector('[data-save-bar]');
        say(bar, 'Saving…');
        // One at a time: each save moves the activity's version, and the refresh carries what is left across.
        for (let left = together().length; left > 0; left -= 1) {
          const next = together().find(dirty);
          if (!next) break;
          try {
            await call(next.dataset.api, valuesOf(next));
          } catch (error) {
            const details = next.closest('details');
            if (details) details.open = true;
            say(next, error.message, 'bad');
            if (next.dataset.sayIn !== 'save-bar') say(document.querySelector('[data-save-bar]'), 'Not everything is saved. See what it says above.', 'bad');
            next.closest('[data-say-box]')?.scrollIntoView({ block: 'nearest' });
            return;
          }
          guardedOff(next);
          await refresh(next);
        }
        saveBar();
        const done = document.querySelector('[data-save-bar]');
        done.classList.add('is-saved');
        say(done, 'Saved.', 'good');
        setTimeout(() => { done.classList.remove('is-saved'); }, 2600);
      }).catch((error) => say(document.querySelector('[data-save-bar]'), error.message, 'bad'));
      return;
    }
    if (!form.dataset.api) {
      if (!form.dataset.confirm) return;
      event.preventDefault();
      agreed(form).then((yes) => { if (yes) form.submit(); });
      return;
    }
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
  // A button that opens a form with one field already chosen (data-prefill: the form; data-prefill-field and -value), such
  // as Add an activity here under a unit: the form opens where it is, the choice made, the first field ready to type in.
  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('[data-prefill]');
    if (!button) return;
    const form = document.getElementById(button.dataset.prefill);
    if (!form) return;
    const field = button.dataset.prefillField && form.elements[button.dataset.prefillField];
    if (field) {
      field.value = button.dataset.prefillValue || '';
      const dressed = field.id && document.getElementById('menu-' + field.id);
      if (dressed && field.selectedOptions && field.selectedOptions[0]) dressed.querySelector('.v-menu-value').textContent = field.selectedOptions[0].textContent;
    }
    const holder = form.closest('details');
    if (holder) holder.open = true;
    form.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const first = form.querySelector('input:not([type=hidden]):not([type=radio]), textarea');
    if (first) first.focus({ preventScroll: true });
  });
  // A form that shows what it would do as it is filled in (data-preview): a beat after typing stops, and only the latest answer is shown.
  // By the form's id, so a choice made in the preview itself (a column's menu) is sent again after a refresh draws it empty.
  const previews = new Map();
  const preview = (form) => {
    const key = form.id || form;
    const held = previews.get(key) || { turn: 0, kept: null };
    clearTimeout(held.wait);
    const turn = held.turn + 1;
    held.turn = turn;
    held.wait = setTimeout(() => {
      const into = document.getElementById(form.dataset.into);
      const go = form.querySelector('[type=submit]');
      const body = valuesOf(form);
      const inside = [...new Set([...into.querySelectorAll('[name]')].map((item) => item.name.split('.')[0]))];
      if (inside.length) held.kept = Object.fromEntries(inside.map((name) => [name, body[name]]));
      else if (held.kept) Object.assign(body, held.kept);
      call(form.dataset.preview, body, null, true).then((data) => {
        if (held.turn !== turn || !form.isConnected) return;
        into.innerHTML = data.html || '';
        dress(into);
        if (go) { if (data.button) go.textContent = data.button; go.disabled = !data.ready; }
      }).catch((error) => { if (held.turn === turn) say(form, error.message, 'bad'); });
    }, 260);
    previews.set(key, held);
  };
  const previewed = (event) => {
    const form = event.target && event.target.form;
    if (!form || !form.dataset.preview || event.target.type === 'file') return;
    // What the last add said is about the last list, not this one.
    if (event.type === 'input') say(form, '');
    preview(form);
  };
  document.addEventListener('input', previewed);
  document.addEventListener('change', previewed);
  document.addEventListener('viable:refreshed', () => { for (const form of document.querySelectorAll('form[data-preview]')) if (dirty(form)) preview(form); });
  // Sent, the list is done with: its choices don't carry to the next one.
  document.addEventListener('submit', (event) => { const held = event.target.dataset && event.target.dataset.preview && previews.get(event.target.id || event.target); if (held) held.kept = null; }, true);
  // A spreadsheet's sheets, to read another (data-sheets-in names where they show): the file stays in this page, read again.
  const showSheets = (input, field, view, sheet) => {
    const place = input.dataset.sheetsIn && document.getElementById(input.dataset.sheetsIn);
    if (!place) return;
    place.textContent = '';
    if (!sheet || sheet.sheets.length < 2) return;
    place.append(Object.assign(document.createElement('span'), { className: 'v-note', textContent: 'Sheet' }));
    sheet.sheets.forEach((name, index) => {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'v-btn is-small', textContent: name });
      button.setAttribute('aria-pressed', String(index === sheet.index));
      button.addEventListener('click', () => sheetRows(view, index).then((next) => {
        field.value = rowsText(next.rows);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        showSheets(input, field, view, next);
      }).catch((error) => say(input.form, error.message, 'bad')));
      place.append(button);
    });
  };
  // A file read into a field (data-read-into): a school's export may be UTF-16 or an older Windows encoding, not only UTF-8.
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!input.dataset || !input.dataset.readInto || !input.files || !input.files[0]) return;
    const field = input.form && input.form.elements[input.dataset.readInto];
    const file = input.files[0];
    input.value = '';
    if (!field) return;
    if (file.size > 2000000) { say(input.form, 'That file is too big for a class list.', 'bad'); return; }
    file.arrayBuffer().then(async (bytes) => {
      const view = new Uint8Array(bytes);
      let words;
      let note = '';
      // An Excel file (a zip, PK at its start) or an older one (D0 CF): its first sheet's cells, as a spreadsheet copies them.
      if (/\.xlsx?$/i.test(file.name) || (view[0] === 0x50 && view[1] === 0x4b) || (view[0] === 0xd0 && view[1] === 0xcf)) {
        const sheet = await sheetRows(view);
        words = rowsText(sheet.rows);
        note = sheet.sheets.length > 1 ? '' : 'Read the sheet “' + sheet.sheet + '”.';
        showSheets(input, field, view, sheet);
      } else {
        showSheets(input, field, view, null);
        const encoding = view[0] === 0xff && view[1] === 0xfe ? 'utf-16le' : view[0] === 0xfe && view[1] === 0xff ? 'utf-16be' : 'utf-8';
        try { words = new TextDecoder(encoding, { fatal: true }).decode(view); } catch { words = new TextDecoder('windows-1252').decode(view); }
      }
      field.value = words;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      if (note) say(input.form, note);
      field.focus({ preventScroll: true });
    }).catch((error) => say(input.form, error.message, 'bad'));
  });
  // An end that can't come before its start (data-min-from="starts_on"): the start's day is its earliest.
  document.addEventListener('change', (event) => {
    const form = event.target.form;
    if (!form || !event.target.name) return;
    for (const end of form.querySelectorAll('[data-min-from="' + event.target.name + '"]')) end.min = event.target.value || '';
  });
  document.addEventListener('input', saveBar);
  document.addEventListener('viable:refreshed', saveBar);
  document.addEventListener('change', (event) => {
    const item = event.target;
    saveBar();
    if (item.form) showing(document);
    if (item.tagName === 'SELECT' && item.dataset.api) {
      inLine(async () => { const data = await call(item.dataset.api, { [item.name]: item.value }); await after(item, data); }).catch((error) => say(again(item), error.message, 'bad'));
      return;
    }
    if (item.dataset && item.dataset.upload && item.files && item.files[0]) {
      const files = [...item.files];
      const zone = item.closest('[data-drop]');
      const words = zone && zone.querySelector('[data-drop-words]');
      const was = words && words.innerHTML;
      if (zone) zone.classList.add('is-busy');
      const done = () => { if (zone) zone.classList.remove('is-busy'); if (words) words.innerHTML = was; };
      inLine(async () => {
        let data;
        for (const file of files) { if (words) words.textContent = 'Sending ' + file.name + '…'; else say(item, 'Sending ' + file.name + '…'); data = await call(item.dataset.upload, null, file); }
        done();
        item.value = '';
        await after(item, data);
        if (files.length > 1) say(again(item), 'Added ' + files.length + ' files.', 'good');
      }).catch((error) => { done(); item.value = ''; refresh().then(() => say(again(item), error.message, 'bad')); });
    }
  });

  // A file dropped where it can go is sent as if chosen; anywhere else it does nothing, and never replaces the page.
  const holdsFiles = (event) => event.dataTransfer && [...event.dataTransfer.types].includes('Files');
  const zoneOf = (event) => event.target.closest && event.target.closest('[data-drop]');
  const fits = (input, file) => {
    const wanted = (input.accept || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    const name = file.name.toLowerCase();
    return !wanted.length || wanted.some((item) => (item.startsWith('.') ? name.endsWith(item) : item.endsWith('/*') ? file.type.startsWith(item.slice(0, -1)) : file.type === item));
  };
  document.addEventListener('dragover', (event) => {
    if (!holdsFiles(event)) return;
    event.preventDefault();
    const zone = zoneOf(event);
    event.dataTransfer.dropEffect = zone ? 'copy' : 'none';
    for (const other of document.querySelectorAll('[data-drop].is-over')) if (other !== zone) other.classList.remove('is-over');
    if (zone) zone.classList.add('is-over');
  });
  document.addEventListener('dragleave', (event) => { if (!event.relatedTarget) for (const zone of document.querySelectorAll('[data-drop].is-over')) zone.classList.remove('is-over'); });
  document.addEventListener('drop', (event) => {
    if (!holdsFiles(event)) return;
    event.preventDefault();
    const zone = zoneOf(event);
    if (!zone) return;
    zone.classList.remove('is-over');
    const input = zone.querySelector('input[type=file]');
    if (!input || input.disabled) return;
    const files = [...event.dataTransfer.files].filter((file) => fits(input, file));
    if (!files.length) { say(input, 'That kind of file can’t go here.', 'bad'); return; }
    const chosen = new DataTransfer();
    for (const file of input.multiple ? files : files.slice(0, 1)) chosen.items.add(file);
    input.files = chosen.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  let guarded = true;
  window.addEventListener('beforeunload', (event) => {
    if (guarded && [...document.querySelectorAll('form[data-guard]')].some(dirty)) event.preventDefault();
  });
  dress(document);
  fill();
  saveBar();
  window.viableConsole = { ask, call, closePop, dress, float, refresh, say };
})();`;
