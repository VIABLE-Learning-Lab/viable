/**
 * The date and time picker every VIABLE screen uses: the console on the Engine and the teacher's door, and the
 * VIABLE Developer Platform, which gets this file's script and look as a generated module (npm run docs:open).
 * It dresses an <input type="date"> or <input type="datetime-local">: the input stays, hidden, and holds the
 * value in the browser's own format, so forms, frameworks and refreshes read it as before. Beside it, a field
 * shows the value in words, and opens a calendar with, for a time, a column of times.
 *
 * Plain functions on the DOM and Intl, no dependency. The pure ones are exported for tests; DATE_PICKER_SCRIPT
 * is all of them as source, for a page's own script (see asSource in harness/src/ui/parts.js).
 */
import { asSource } from '../../../harness/src/ui/parts.js';

const CALENDAR_ICON = '<svg class="vd-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 3.5v3M16.5 3.5v3M4.5 9.5h15M6 5.5h12a1.5 1.5 0 0 1 1.5 1.5v11.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 6 5.5z"/></svg>';
const CHEVRON_LEFT = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6.5L9 12l5.5 5.5"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5L15 12l-5.5 5.5"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';

// --- Pure: days, times and words ---------------------------------------------------------------------

export function pad(n) { return String(n).padStart(2, '0'); }
/** A local day as the date input keeps it: 2026-11-09. */
export function dayKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
/** A day key as local midnight, or null. */
export function dayOf(key) {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!found) return null;
  const date = new Date(Number(found[1]), Number(found[2]) - 1, Number(found[3]));
  return dayKey(date) === key ? date : null;
}
/** What an input holds, read: { day, time } (time null for a date), or null when it holds nothing whole. */
export function readValue(value, kind) {
  const [day, time = null] = String(value || '').split('T');
  if (!dayOf(day)) return null;
  if (kind === 'date') return { day, time: null };
  return /^\d{2}:\d{2}/.test(time || '') ? { day, time: time.slice(0, 5) } : null;
}
/** The value an input takes for a day and a time. */
export function valueOf({ day, time }, kind) { return kind === 'date' ? day : `${day}T${time || '09:00'}`; }
/** Six weeks from the week holding the 1st, starting on firstDay (0 Sunday … 6 Saturday): [{ key, date, inMonth }]. */
export function monthCells(year, month, firstDay = 0) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() - firstDay + 7) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: dayKey(date), date, inMonth: date.getMonth() === month };
  });
}
/** The times a day offers: every quarter hour, and 11:59 PM, the end of a day a deadline often means. */
export function timeSlots(also = null) {
  const slots = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) slots.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  slots.push('23:59');
  if (also && /^\d{2}:\d{2}$/.test(also) && !slots.includes(also)) slots.push(also);
  return slots.sort();
}
/** A day before min or after max (either a day key or a datetime value, read by its day) can't be chosen. */
export function outOfRange(key, min, max) {
  const low = String(min || '').slice(0, 10);
  const high = String(max || '').slice(0, 10);
  return Boolean((low && key < low) || (high && key > high));
}
/** The first day of the week where the reader is: 0 Sunday … 6 Saturday. */
export function weekStart(locale) {
  try {
    const found = new Intl.Locale(locale || 'en-US');
    const info = (typeof found.getWeekInfo === 'function' && found.getWeekInfo()) || found.weekInfo;
    return info && info.firstDay ? info.firstDay % 7 : 0;
  } catch {
    return 0;
  }
}
/** A value in words, in the reader's own way of writing dates: "Wed, Nov 11, 5:00 PM", with the year when it isn't this one. */
export function valueWords(parts, kind, now = new Date()) {
  const date = dayOf(parts.day);
  const [hours, minutes] = (parts.time || '00:00').split(':').map(Number);
  if (kind !== 'date') date.setHours(hours, minutes);
  const year = date.getFullYear() === now.getFullYear() ? undefined : 'numeric';
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year, ...(kind === 'date' ? {} : { hour: 'numeric', minute: '2-digit' }) });
}
/** How far a day is from today, in words: "today", "tomorrow", "in 3 days", "2 weeks ago". */
export function dayDistance(key, now = new Date()) {
  const days = Math.round((dayOf(key) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const words = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  return Math.abs(days) >= 14 && days % 7 === 0 ? words.format(days / 7, 'week') : words.format(days, 'day');
}
/** A time in words: "5:00 PM" or "17:00", as the reader writes times. */
export function timeWords(time) { const [hours, minutes] = time.split(':').map(Number); return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }

// --- The picker --------------------------------------------------------------------------------------

/** Takes away a picker's field once its input has left the page, as a framework's page does without telling it. */
export function tidyDates() {
  const held = dressDate.held;
  if (held) for (const entry of held.fields) if (!entry.input.isConnected) { entry.field.remove(); held.fields.delete(entry); }
}

/**
 * Dresses one date or datetime-local input. The input keeps the value; setting it from code repaints the field, and
 * a choice made here is set on it with input and change events, as typing would. Its label opens the picker. data-empty
 * is what the field says with nothing chosen; data-default-time the time a chosen day takes until a time is (09:00).
 */
export function dressDate(input) {
  if (!input || input.dataset.dateDressed || !['date', 'datetime-local'].includes(input.type)) return;
  input.dataset.dateDressed = '1';
  // The page it is on when it opens: a field dressed in a page drawn again after a Save (client.js refresh) was dressed
  // in the parsed copy, and a calendar made there would never show.
  let doc = input.ownerDocument;
  const kind = input.type;
  // What every picker on the page shares, kept on the function so the page's script needs nothing else.
  const held = dressDate.held || (dressDate.held = { count: 0, fields: new Set() });
  const id = `vd-${held.count += 1}`;
  const make = (tag, className, html) => { const element = doc.createElement(tag); if (className) element.className = className; if (html) element.innerHTML = html; return element; };

  const field = make('span', 'vd-field');
  const face = make('button', `${input.className.replace(/\bvd-native\b/g, '')} vd-face`.trim(), `${CALENDAR_ICON}<span class="vd-words" id="${id}-words"></span>`);
  face.type = 'button';
  face.setAttribute('aria-haspopup', 'dialog');
  face.setAttribute('aria-expanded', 'false');
  const words = face.querySelector('.vd-words');
  const clear = make('button', 'vd-clear', CROSS);
  clear.type = 'button';
  clear.setAttribute('aria-label', 'Clear');
  field.append(face, clear);
  // As wide as the input was: the whole line for a form's field, its own width for one in a row of filters.
  const room = input.parentElement ? input.parentElement.clientWidth : 0;
  const wide = !input.offsetWidth || !room || input.offsetWidth >= room - 2;
  field.classList.add(wide ? 'is-wide' : 'is-inline');
  if (!wide) field.style.minWidth = `${input.offsetWidth}px`;
  input.after(field);
  input.classList.add('vd-native');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  held.fields.add({ input, field });

  // Named by its label, then by what it holds.
  const labels = [...(input.labels || [])];
  for (const [i, label] of labels.entries()) {
    if (!label.id) label.id = `${id}-label-${i}`;
    label.addEventListener('click', (event) => { if (!field.contains(event.target)) { event.preventDefault(); face.focus(); } });
  }
  const named = labels.map((label) => label.id).join(' ');
  if (named) face.setAttribute('aria-labelledby', `${named} ${id}-words`);
  else face.setAttribute('aria-label', input.getAttribute('aria-label') || (kind === 'date' ? 'Date' : 'Date and time'));

  const own = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
  const paint = () => {
    const parts = readValue(own.get.call(input), kind);
    words.textContent = parts ? valueWords(parts, kind) : input.dataset.empty || input.getAttribute('placeholder') || (kind === 'date' ? 'Choose a date' : 'Choose a date and time');
    face.classList.toggle('is-empty', !parts);
    face.disabled = input.disabled;
    clear.hidden = !parts || input.required || input.disabled;
  };
  Object.defineProperty(input, 'value', { configurable: true, get() { return own.get.call(input); }, set(next) { own.set.call(input, next); paint(); } });
  new MutationObserver(paint).observe(input, { attributes: true, attributeFilter: ['disabled', 'required', 'min', 'max', 'placeholder', 'data-empty'] });
  const choose = (next) => {
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  clear.addEventListener('click', () => { choose(''); face.focus(); });
  paint();

  let pop = null;
  let shown = null;
  let reposition = null;
  const close = (refocus = true) => {
    if (!pop) return;
    const leaving = pop;
    pop = null;
    face.setAttribute('aria-expanded', 'false');
    removeEventListener('scroll', reposition, true);
    removeEventListener('resize', reposition);
    if (typeof leaving.hidePopover === 'function' && leaving.matches(':popover-open')) leaving.hidePopover();
    leaving.remove();
    if (refocus) face.focus();
  };

  const open = () => {
    if (pop || input.disabled) return;
    doc = input.ownerDocument;
    const now = new Date();
    const held = readValue(input.value, kind);
    const firstDay = weekStart(Intl.DateTimeFormat().resolvedOptions().locale);
    let chosenDay = held ? held.day : null;
    let chosenTime = held ? held.time : null;
    shown = dayOf(chosenDay) || new Date(now.getFullYear(), now.getMonth(), 1);
    let focusDay = chosenDay || dayKey(now);

    pop = make('div', `vd-pop${kind === 'date' ? '' : ' has-times'}`);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', kind === 'date' ? 'Choose a date' : 'Choose a date and time');
    pop.innerHTML = `<div class="vd-head"><button type="button" class="vd-nav" data-by="-1" aria-label="Previous month">${CHEVRON_LEFT}</button><strong class="vd-month" id="${id}-month" aria-live="polite"></strong><button type="button" class="vd-nav" data-by="1" aria-label="Next month">${CHEVRON_RIGHT}</button></div>
<div class="vd-body"><table class="vd-grid" role="grid" aria-labelledby="${id}-month"><thead><tr></tr></thead><tbody></tbody></table>${kind === 'date' ? '' : '<div class="vd-time-col"><span class="vd-times-head" aria-hidden="true">Time</span><div class="vd-times" role="group" aria-label="Time"></div></div>'}</div>
<div class="vd-foot"><button type="button" class="vd-link vd-today">Today</button><span class="vd-chosen" aria-live="polite"></span><button type="button" class="vd-link vd-remove">Clear</button><button type="button" class="vd-done">Done</button></div>`;
    const head = pop.querySelector('thead tr');
    for (const cell of monthCells(2026, 10, firstDay).slice(0, 7)) {
      const th = make('th');
      th.scope = 'col';
      th.abbr = cell.date.toLocaleDateString(undefined, { weekday: 'long' });
      th.textContent = cell.date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
      head.append(th);
    }
    const body = pop.querySelector('tbody');
    const times = pop.querySelector('.vd-times');
    const chosenWords = pop.querySelector('.vd-chosen');
    pop.querySelector('.vd-remove').hidden = input.required;

    const say = () => {
      const parts = readValue(input.value, kind);
      chosenWords.textContent = parts ? `${valueWords(parts, kind)}, ${dayDistance(parts.day)}` : '';
    };
    const drawMonth = () => {
      pop.querySelector('.vd-month').textContent = shown.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      body.textContent = '';
      const cells = monthCells(shown.getFullYear(), shown.getMonth(), firstDay);
      if (!cells.some((cell) => cell.key === focusDay)) focusDay = (cells.find((cell) => cell.inMonth && !outOfRange(cell.key, input.min, input.max)) || cells.find((cell) => cell.inMonth)).key;
      for (let week = 0; week < 6; week += 1) {
        const row = make('tr');
        for (const cell of cells.slice(week * 7, week * 7 + 7)) {
          const td = make('td');
          td.setAttribute('role', 'gridcell');
          const day = make('button', `vd-day${cell.inMonth ? '' : ' is-other'}`);
          day.type = 'button';
          day.dataset.day = cell.key;
          day.textContent = String(cell.date.getDate());
          day.tabIndex = cell.key === focusDay ? 0 : -1;
          day.setAttribute('aria-label', cell.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
          if (cell.key === dayKey(now)) day.setAttribute('aria-current', 'date');
          if (cell.key === chosenDay) day.setAttribute('aria-pressed', 'true');
          if (outOfRange(cell.key, input.min, input.max)) day.setAttribute('aria-disabled', 'true');
          td.append(day);
          row.append(td);
        }
        body.append(row);
      }
    };
    const drawTimes = () => {
      if (!times) return;
      times.textContent = '';
      for (const slot of timeSlots(chosenTime)) {
        const item = make('button', 'vd-time');
        item.type = 'button';
        item.dataset.time = slot;
        item.textContent = timeWords(slot);
        item.tabIndex = -1;
        if (slot === chosenTime) item.setAttribute('aria-pressed', 'true');
        times.append(item);
      }
      const target = times.querySelector('[aria-pressed=true]') || times.querySelector(`[data-time="${input.dataset.defaultTime || '09:00'}"]`);
      if (target) target.tabIndex = 0;
    };
    // The chosen time, or the one a day would take, in the middle of the column once it has a size.
    const centreTime = () => {
      const target = times && times.querySelector('[tabindex="0"]');
      if (!target) return;
      // A column beside the calendar, or a row under it on a phone.
      if (times.scrollWidth > times.clientWidth) times.scrollLeft = target.offsetLeft - times.offsetLeft - times.clientWidth / 2 + target.offsetWidth / 2;
      else times.scrollTop = target.offsetTop - times.offsetTop - times.clientHeight / 2 + target.offsetHeight / 2;
    };
    const focusOn = (key) => {
      const date = dayOf(key);
      if (date.getMonth() !== shown.getMonth() || date.getFullYear() !== shown.getFullYear()) { shown = new Date(date.getFullYear(), date.getMonth(), 1); focusDay = key; drawMonth(); }
      focusDay = key;
      for (const day of body.querySelectorAll('.vd-day')) day.tabIndex = day.dataset.day === key ? 0 : -1;
      body.querySelector(`[data-day="${key}"]`)?.focus();
    };
    const pickDay = (key) => {
      if (outOfRange(key, input.min, input.max)) return;
      chosenDay = key;
      focusDay = key;
      if (kind === 'date') { choose(valueOf({ day: key }, kind)); close(); return; }
      chosenTime = chosenTime || input.dataset.defaultTime || '09:00';
      choose(valueOf({ day: key, time: chosenTime }, kind));
      drawMonth();
      drawTimes();
      centreTime();
      say();
      (times.querySelector('[aria-pressed=true]') || times.querySelector('.vd-time')).focus();
    };
    const pickTime = (time) => {
      chosenTime = time;
      chosenDay = chosenDay || dayKey(now);
      choose(valueOf({ day: chosenDay, time }, kind));
      close();
    };

    pop.addEventListener('click', (event) => {
      const target = event.target.closest('button');
      if (!target || !pop.contains(target)) return;
      if (target.classList.contains('vd-nav')) { shown = new Date(shown.getFullYear(), shown.getMonth() + Number(target.dataset.by), 1); drawMonth(); }
      else if (target.classList.contains('vd-day')) pickDay(target.dataset.day);
      else if (target.classList.contains('vd-time')) pickTime(target.dataset.time);
      else if (target.classList.contains('vd-today')) pickDay(dayKey(now));
      else if (target.classList.contains('vd-remove')) { choose(''); close(); }
      else if (target.classList.contains('vd-done')) close();
    });
    pop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      const day = event.target.closest && event.target.closest('.vd-day');
      if (day) {
        const date = dayOf(day.dataset.day);
        const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        let next = null;
        if (by) next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + by);
        else if (event.key === 'Home') next = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() - firstDay + 7) % 7));
        else if (event.key === 'End') next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 6 - ((date.getDay() - firstDay + 7) % 7));
        else if (event.key === 'PageUp' || event.key === 'PageDown') next = new Date(date.getFullYear() + (event.shiftKey ? (event.key === 'PageUp' ? -1 : 1) : 0), date.getMonth() + (event.shiftKey ? 0 : event.key === 'PageUp' ? -1 : 1), Math.min(date.getDate(), 28));
        if (next) { event.preventDefault(); focusOn(dayKey(next)); }
        return;
      }
      const time = event.target.closest && event.target.closest('.vd-time');
      if (time && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const next = event.key === 'ArrowUp' ? time.previousElementSibling : time.nextElementSibling;
        if (next) { time.tabIndex = -1; next.tabIndex = 0; next.focus(); }
      }
    });

    // Tabbing away from it closes it, as clicking away does.
    pop.addEventListener('focusout', (event) => { if (pop && event.relatedTarget && !pop.contains(event.relatedTarget) && !field.contains(event.relatedTarget)) close(false); });

    drawMonth();
    drawTimes();
    say();
    doc.body.append(pop);
    const place = () => {
      if (!pop) return;
      const near = face.getBoundingClientRect();
      const wide = doc.documentElement.clientWidth;
      const high = doc.documentElement.clientHeight;
      pop.classList.toggle('is-sheet', wide < 520);
      if (wide < 520) return;
      let top = near.bottom + 6;
      if (top + pop.offsetHeight > high - 8 && near.top - pop.offsetHeight - 6 > 8) top = near.top - pop.offsetHeight - 6;
      pop.style.top = `${Math.max(8, Math.min(top, high - pop.offsetHeight - 8))}px`;
      pop.style.left = `${Math.max(8, Math.min(near.left, wide - pop.offsetWidth - 8))}px`;
    };
    reposition = () => requestAnimationFrame(place);
    if (typeof pop.showPopover === 'function') {
      pop.popover = 'auto';
      pop.addEventListener('toggle', (event) => { if (event.newState === 'closed' && pop) close(false); });
      pop.showPopover();
    } else {
      pop.classList.add('is-open');
      const outside = (event) => { if (pop && !pop.contains(event.target) && !field.contains(event.target)) { doc.removeEventListener('pointerdown', outside, true); close(false); } };
      doc.addEventListener('pointerdown', outside, true);
    }
    place();
    centreTime();
    addEventListener('scroll', reposition, true);
    addEventListener('resize', reposition);
    face.setAttribute('aria-expanded', 'true');
    (body.querySelector('.vd-day[tabindex="0"]') || body.querySelector('.vd-day')).focus();
  };

  face.addEventListener('click', () => (pop ? close() : open()));
  face.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown' || (event.key === 'ArrowUp' && event.altKey)) { event.preventDefault(); open(); } });
}

/** The picker as source for a page's own script: dressDate(input) and tidyDates() are then in scope. */
export const DATE_PICKER_SCRIPT = asSource(
  { CALENDAR_ICON, CHEVRON_LEFT, CHEVRON_RIGHT, CROSS },
  [pad, dayKey, dayOf, readValue, valueOf, monthCells, timeSlots, outOfRange, weekStart, valueWords, dayDistance, timeWords, tidyDates, dressDate]
).replace(/^export /gm, '').replace(/<\//g, '<\\/');

/**
 * The picker's look. Its colours and corners are the page's own tokens: the console's (ink-blue, public-rule…) or,
 * where those aren't set, the VIABLE Developer Platform's (accent-strong, line…), so one stylesheet fits both.
 */
export const DATE_PICKER_CSS = `.vd-field,.vd-pop{--vd-accent:var(--ink-blue,var(--accent-strong,#1f47a8));--vd-on-accent:var(--on-ink-blue,#fff);--vd-ink:var(--public-ink,var(--ink,#0c1626));--vd-text:var(--public-text,var(--ink-soft,#2c3a52));--vd-muted:var(--muted,#54607a);--vd-rule:var(--public-rule,var(--line,#e5e9f1));--vd-rule-strong:var(--public-rule-strong,var(--line-strong,#cdd5e3));--vd-soft:var(--field-mist,var(--accent-tint,#eef2fb));--vd-surface:var(--surface,#fff);--vd-ease:var(--ease-out,cubic-bezier(.22,1,.36,1))}
.vd-native{position:absolute!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;border:0!important;opacity:0!important;pointer-events:none!important}
.vd-field{position:relative;display:block;min-width:0}
.vd-field.is-inline{display:inline-block;vertical-align:middle}
.vd-face{display:flex;align-items:center;gap:10px;width:100%;text-align:left;cursor:pointer}
.vd-face .vd-icon{flex:none;color:var(--vd-muted)}
.vd-words{flex:1;min-width:0;overflow:hidden;color:var(--vd-ink);text-overflow:ellipsis;white-space:nowrap}
.vd-face.is-empty .vd-words{color:var(--vd-muted)}
.vd-face[aria-expanded=true]{border-color:var(--vd-accent)}
.vd-face:disabled{opacity:.55;cursor:not-allowed}
.vd-field:has(.vd-clear:not([hidden])) .vd-face{padding-right:40px}
.vd-clear{position:absolute;top:50%;right:6px;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--vd-muted);transform:translateY(-50%);cursor:pointer}
.vd-clear:hover{background:var(--vd-soft);color:var(--vd-ink)}
.vd-clear[hidden]{display:none}
.vd-pop{position:fixed;inset:auto;z-index:60;width:auto;max-width:calc(100vw - 16px);margin:0;padding:12px;border:1px solid var(--vd-rule-strong);border-radius:var(--radius,12px);background:var(--vd-surface);color:var(--vd-text);box-shadow:0 22px 48px -20px rgb(10 16 28/.45);font-size:.9375rem}
.vd-pop.is-open{display:block}
.vd-pop:popover-open,.vd-pop.is-open{animation:vd-rise .16s var(--vd-ease)}
.vd-pop.is-sheet{top:auto!important;right:8px!important;bottom:8px!important;left:8px!important;max-width:none}
.vd-head{display:grid;grid-template-columns:36px minmax(0,1fr) 36px;align-items:center;gap:4px;margin-bottom:6px}
.vd-month{color:var(--vd-ink);font-weight:600;text-align:center}
.vd-nav,.vd-day,.vd-time,.vd-link,.vd-done{font:inherit;cursor:pointer}
.vd-nav{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--vd-text)}
.vd-nav:hover{background:var(--vd-soft);color:var(--vd-ink)}
.vd-body{display:flex;gap:12px;align-items:stretch}
/* A page's own table styles (widths, borders, capitals) stop at the calendar */
.vd-pop .vd-grid{width:auto;min-width:0;max-width:none;margin:0;border:0;border-collapse:collapse;border-spacing:0;background:none;table-layout:auto}
.vd-pop .vd-grid tr,.vd-pop .vd-grid thead,.vd-pop .vd-grid tbody{border:0;background:none}
.vd-pop .vd-grid th{width:40px;height:28px;padding:0;border:0;background:none;color:var(--vd-muted);font-size:.75rem;font-weight:600;letter-spacing:0;text-align:center;text-transform:none}
.vd-pop .vd-grid td{padding:1px;border:0;background:none;text-align:center}
.vd-day{position:relative;display:grid;place-items:center;width:38px;height:38px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--vd-ink);font-variant-numeric:tabular-nums;transition:background-color .12s ease}
.vd-day:hover{background:var(--vd-soft)}
.vd-day.is-other{color:var(--vd-muted)}
.vd-day[aria-current=date]{box-shadow:inset 0 0 0 1.5px var(--vd-accent);color:var(--vd-accent);font-weight:600}
.vd-day[aria-pressed=true]{background:var(--vd-accent);box-shadow:none;color:var(--vd-on-accent);font-weight:600}
.vd-day[aria-disabled=true]{color:var(--vd-muted);opacity:.38;text-decoration:line-through;cursor:not-allowed}
.vd-day[aria-disabled=true]:hover{background:transparent}
.vd-day:focus-visible,.vd-time:focus-visible,.vd-nav:focus-visible,.vd-link:focus-visible,.vd-done:focus-visible,.vd-clear:focus-visible{outline:2px solid var(--vd-accent);outline-offset:1px}
.vd-time-col{display:flex;flex-direction:column;gap:6px;padding-left:12px;border-left:1px solid var(--vd-rule)}
.vd-times-head{padding:6px 10px 0;color:var(--vd-muted);font-size:.75rem;font-weight:600}
.vd-times{display:flex;flex-direction:column;gap:2px;width:112px;height:228px;padding:0 2px 0 0;overflow-y:auto;scrollbar-width:thin}
.vd-time{flex:none;padding:7px 10px;border:0;border-radius:8px;background:transparent;color:var(--vd-text);font-variant-numeric:tabular-nums;text-align:left;white-space:nowrap}
.vd-time:hover{background:var(--vd-soft);color:var(--vd-ink)}
.vd-time[aria-pressed=true]{background:var(--vd-accent);color:var(--vd-on-accent);font-weight:600}
.vd-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--vd-rule)}
.vd-chosen{flex:1;min-width:0;color:var(--vd-muted);font-size:.8125rem}
.vd-link{padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--vd-accent);font-size:.875rem;font-weight:600}
.vd-link:hover{background:var(--vd-soft)}
.vd-link[hidden]{display:none}
.vd-done{min-height:34px;padding:0 16px;border:1px solid var(--vd-accent);border-radius:999px;background:var(--vd-accent);color:var(--vd-on-accent);font-size:.875rem;font-weight:600}
@media (max-width:519px){.vd-body{flex-direction:column}.vd-pop .vd-grid{margin:0 auto}.vd-time-col{padding:10px 0 0;border-top:1px solid var(--vd-rule);border-left:0}.vd-times-head{padding:0 2px}.vd-times{flex-direction:row;width:auto;height:auto;padding:0 0 2px;overflow-x:auto;overflow-y:hidden}.vd-day{width:calc((100vw - 60px) / 7);max-width:44px;height:40px}.vd-pop .vd-grid th{width:calc((100vw - 60px) / 7);max-width:44px}}
@keyframes vd-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.vd-pop:popover-open,.vd-pop.is-open{animation:none}.vd-day{transition:none}}`;
