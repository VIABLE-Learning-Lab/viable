/**
 * The console's colour picker, as its dates have theirs (datePicker.js). It dresses an <input type="color">: the input
 * stays, hidden, and holds the value, so a form sends and saves it as before. Beside it, a button shows the colour and
 * its name or hex, and opens a small panel of swatches, each chosen to read on a light page and a dark one, with a
 * field for any other colour as a hex code.
 *
 * Plain functions on the DOM, no dependency. The pure ones are exported for tests; COLOR_PICKER_SCRIPT is all of them
 * as source, for a page's own script (see asSource in harness/src/ui/parts.js).
 */
import { asSource } from '../../../harness/src/ui/parts.js';

/** The swatches, by hue. Each is 4.5:1 or more against white and 3:1 or more against a chat page's dark background; the first is an agent's own default. */
export const COLOR_SWATCHES = [['#3b5bdb', 'Indigo'], ['#2563eb', 'Blue'], ['#0e7490', 'Cyan'], ['#0f766e', 'Teal'], ['#15803d', 'Green'], ['#a16207', 'Gold'], ['#c2410c', 'Orange'], ['#dc2626', 'Red'], ['#db2777', 'Pink'], ['#c026d3', 'Magenta'], ['#7c3aed', 'Violet'], ['#64748b', 'Slate']];

/** What a hex field holds, as a colour input keeps it (#rrggbb), or null: with or without its #, in three digits or six. */
export function colorHex(text) {
  const found = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(text ?? '').trim());
  if (!found) return null;
  return `#${(found[1].length === 3 ? found[1].replace(/./g, '$&$&') : found[1]).toLowerCase()}`;
}
/** A colour's name, when it is one of the swatches. */
export function colorName(hex) {
  const found = COLOR_SWATCHES.find(([value]) => value === colorHex(hex));
  return found ? found[1] : null;
}

/**
 * Dresses one colour input. The input keeps the value; setting it from code repaints the button, and a choice made here is set
 * on it with input and change events, as the browser's own picker does. Its label names the button. Where a browser has no
 * popover, the input is left as the browser draws it.
 */
export function dressColor(input) {
  if (!input || input.dataset.colorDressed || input.type !== 'color' || typeof input.showPopover !== 'function') return;
  input.dataset.colorDressed = '1';
  const id = `vc-${dressColor.count = (dressColor.count || 0) + 1}`;
  const make = (tag, className, text) => { const element = input.ownerDocument.createElement(tag); if (className) element.className = className; if (text) element.textContent = text; return element; };

  const face = make('button', `${input.className} vc-face`.trim());
  face.type = 'button';
  face.setAttribute('aria-haspopup', 'dialog');
  face.setAttribute('aria-expanded', 'false');
  const dot = make('span', 'vc-dot');
  const words = make('span', 'vc-words');
  words.id = `${id}-words`;
  // A swatch's hex is for the eye: a screen reader hears its name.
  const hexWords = make('span', 'vc-hex');
  hexWords.setAttribute('aria-hidden', 'true');
  face.append(dot, words, hexWords);
  input.after(face);
  input.classList.add('vc-native');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');

  // Named by its label, then by the colour. The label would open the browser's own picker: it moves to the button instead.
  const labels = [...(input.labels || [])];
  for (const [i, label] of labels.entries()) {
    if (!label.id) label.id = `${id}-label-${i}`;
    label.addEventListener('click', (event) => { event.preventDefault(); face.focus(); });
  }
  const named = labels.map((label) => label.id).join(' ');
  if (named) face.setAttribute('aria-labelledby', `${named} ${words.id}`);
  else face.setAttribute('aria-label', input.getAttribute('aria-label') || 'Colour');

  const own = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
  const paint = () => {
    const hex = own.get.call(input);
    const name = colorName(hex);
    dot.style.setProperty('--vc', hex);
    words.textContent = name || hex;
    hexWords.textContent = name ? hex : '';
    face.disabled = input.disabled;
  };
  Object.defineProperty(input, 'value', { configurable: true, get() { return own.get.call(input); }, set(next) { own.set.call(input, next); paint(); } });
  const choose = (hex) => {
    if (hex === input.value) return;
    input.value = hex;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  paint();

  let pop = null;
  let reposition = null;
  const close = (refocus = true) => {
    if (!pop) return;
    const leaving = pop;
    pop = null;
    face.setAttribute('aria-expanded', 'false');
    removeEventListener('scroll', reposition, true);
    removeEventListener('resize', reposition);
    if (leaving.matches(':popover-open')) leaving.hidePopover();
    leaving.remove();
    if (refocus) face.focus();
  };

  const open = () => {
    if (pop || input.disabled) return;
    const doc = input.ownerDocument;
    pop = make('div', 'v-pop vc-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choose a colour');
    const grid = make('div', 'vc-swatches');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Colours');
    const caption = make('p', 'vc-caption');
    caption.setAttribute('aria-hidden', 'true');
    const other = make('div', 'vc-other');
    const label = make('label', null, 'Another colour, as a hex code');
    label.htmlFor = `${id}-hex`;
    const field = make('span', 'vc-field');
    const sample = make('span', 'vc-dot');
    const hexField = make('input');
    Object.assign(hexField, { id: `${id}-hex`, type: 'text', maxLength: 7, spellcheck: false, autocomplete: 'off', value: input.value });
    hexField.setAttribute('autocapitalize', 'off');
    const hint = make('p', 'vc-hint');
    hint.id = `${id}-hint`;
    hint.setAttribute('aria-live', 'polite');
    hexField.setAttribute('aria-describedby', hint.id);
    const done = make('button', 'vc-done', 'Done');
    done.type = 'button';
    field.append(sample, hexField);
    other.append(label, field, done, hint);

    const swatches = COLOR_SWATCHES.map(([hex, name]) => {
      const swatch = make('button', 'vc-swatch');
      swatch.type = 'button';
      swatch.dataset.hex = hex;
      swatch.style.setProperty('--vc', hex);
      swatch.setAttribute('aria-label', name);
      grid.append(swatch);
      return swatch;
    });
    // Under the swatches, the one the pointer or focus is on, else the one chosen.
    const say = (hex) => { caption.textContent = colorName(hex) ? `${colorName(hex)}, ${hex}` : hex; };
    // The chosen one is pressed, and is where the arrow keys start; with none of them chosen, the first.
    const mark = () => {
      const chosen = swatches.find((swatch) => swatch.dataset.hex === input.value);
      for (const swatch of swatches) {
        swatch.setAttribute('aria-pressed', String(swatch === chosen));
        swatch.tabIndex = swatch === (chosen || swatches[0]) ? 0 : -1;
      }
      sample.style.setProperty('--vc', input.value);
      say(input.value);
      return chosen;
    };
    const wrong = (text) => { hint.textContent = text; hexField.setAttribute('aria-invalid', String(Boolean(text))); };
    const apply = (hex) => { wrong(''); choose(hex); mark(); };
    // Six digits are the colour at once; three wait for Enter or Done, as they may be the start of six.
    const finish = () => {
      const text = hexField.value.trim();
      if (text && !colorHex(text)) { wrong('Use a hex code, such as #3b5bdb.'); hexField.focus(); return; }
      if (text) apply(colorHex(text));
      close();
    };

    grid.addEventListener('click', (event) => {
      const swatch = event.target.closest('.vc-swatch');
      if (!swatch) return;
      choose(swatch.dataset.hex);
      close();
    });
    grid.addEventListener('pointerover', (event) => { const swatch = event.target.closest('.vc-swatch'); if (swatch) say(swatch.dataset.hex); });
    grid.addEventListener('pointerleave', () => say(input.value));
    grid.addEventListener('focusin', (event) => { const swatch = event.target.closest('.vc-swatch'); if (swatch) say(swatch.dataset.hex); });
    grid.addEventListener('focusout', () => say(input.value));
    // Six to a row: the arrows move along and between rows, Home and End to either end.
    grid.addEventListener('keydown', (event) => {
      const at = swatches.indexOf(event.target);
      const to = { ArrowLeft: at - 1, ArrowRight: at + 1, ArrowUp: at - 6, ArrowDown: at + 6, Home: 0, End: swatches.length - 1 }[event.key];
      if (at < 0 || to === undefined) return;
      event.preventDefault();
      const next = swatches[Math.max(0, Math.min(swatches.length - 1, to))];
      for (const swatch of swatches) swatch.tabIndex = swatch === next ? 0 : -1;
      next.focus();
    });
    hexField.addEventListener('input', () => { wrong(''); if (/^#?[0-9a-f]{6}$/i.test(hexField.value.trim())) apply(colorHex(hexField.value)); });
    hexField.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); finish(); } });
    done.addEventListener('click', finish);
    pop.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } });
    // Tabbing away from it closes it, as clicking away does.
    pop.addEventListener('focusout', (event) => { if (pop && event.relatedTarget && !pop.contains(event.relatedTarget) && event.relatedTarget !== face) close(false); });

    pop.append(grid, caption, other);
    const chosen = mark();
    doc.body.append(pop);
    const place = () => {
      if (!pop) return;
      const near = face.getBoundingClientRect();
      const wide = doc.documentElement.clientWidth;
      const high = doc.documentElement.clientHeight;
      let top = near.bottom + 6;
      if (top + pop.offsetHeight > high - 8 && near.top - pop.offsetHeight - 6 > 8) top = near.top - pop.offsetHeight - 6;
      pop.style.top = `${Math.max(8, Math.min(top, high - pop.offsetHeight - 8))}px`;
      pop.style.left = `${Math.max(8, Math.min(near.left, wide - pop.offsetWidth - 8))}px`;
    };
    reposition = () => requestAnimationFrame(place);
    pop.popover = 'auto';
    pop.addEventListener('toggle', (event) => { if (event.newState === 'closed' && pop) close(false); });
    pop.showPopover();
    place();
    addEventListener('scroll', reposition, true);
    addEventListener('resize', reposition);
    face.setAttribute('aria-expanded', 'true');
    // On the chosen swatch; for a colour of one's own, in its hex code.
    if (chosen) chosen.focus();
    else { hexField.focus(); hexField.select(); }
  };

  face.addEventListener('click', () => (pop ? close() : open()));
  face.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown' || (event.key === 'ArrowUp' && event.altKey)) { event.preventDefault(); open(); } });
}

/** The picker as source for a page's own script: dressColor(input) is then in scope. */
export const COLOR_PICKER_SCRIPT = asSource({ COLOR_SWATCHES }, [colorHex, colorName, dressColor]).replace(/^export /gm, '').replace(/<\//g, '<\\/');

/** The picker's look, in the console's tokens (harness/src/ui/theme.js). Its panel is a .v-pop, the console's floating list. */
export const COLOR_PICKER_CSS = `.vc-native{position:absolute!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;border:0!important;opacity:0!important;pointer-events:none!important}
.vc-face{display:flex;align-items:center;gap:10px;width:100%;text-align:left;cursor:pointer}
.vc-face[aria-expanded=true]{border-color:var(--ink-blue)}
.vc-face:disabled{opacity:.55;cursor:not-allowed}
.vc-dot{flex:none;width:20px;height:20px;border-radius:50%;background:var(--vc);box-shadow:0 0 0 1px var(--public-rule-strong)}
.vc-words{min-width:0;overflow:hidden;color:var(--public-ink);text-overflow:ellipsis;white-space:nowrap}
.vc-hex{margin-left:auto;color:var(--muted);font:400 .875rem var(--font-public-mono);white-space:nowrap}
.vc-pop{width:min(280px,calc(100vw - 16px));padding:14px;overflow:visible}
.vc-swatches{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;justify-items:center}
.vc-swatch{width:32px;height:32px;padding:0;border:0;border-radius:50%;background:var(--vc);box-shadow:inset 0 0 0 1px rgb(0 0 0/.14);cursor:pointer;transition:transform .12s var(--ease-out)}
.vc-swatch:hover{transform:scale(1.08)}
.vc-swatch[aria-pressed=true]{box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--public-ink)}
.vc-swatch:focus-visible{outline:2px solid var(--ink-blue);outline-offset:4px}
.vc-caption{min-height:1.45em;margin:10px 0 0;color:var(--muted);font-size:.8125rem;line-height:1.45}
.vc-other{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;align-items:center;margin-top:10px;padding-top:12px;border-top:1px solid var(--public-rule)}
.vc-other label{grid-column:1/-1;color:var(--public-ink);font-size:.8125rem;font-weight:600}
.vc-field{display:flex;align-items:center;gap:8px;min-width:0;min-height:40px;padding:0 10px;border:1px solid var(--public-rule-strong);border-radius:var(--radius-sm);background:var(--surface)}
.vc-field:focus-within{border-color:var(--ink-blue);outline:2px solid var(--ink-blue);outline-offset:0}
.vc-field:has([aria-invalid=true]){border-color:var(--pencil-red)}
.vc-field input{flex:1;width:100%;min-width:0;padding:6px 0;border:0;background:transparent;color:var(--public-ink);font:400 1rem var(--font-public-mono);outline:none}
.vc-done{min-height:40px;padding:0 16px;border:1px solid var(--ink-blue);border-radius:var(--radius-pill);background:var(--ink-blue);color:var(--on-ink-blue);font:600 .875rem var(--font-public);cursor:pointer}
.vc-done:focus-visible{outline:2px solid var(--ink-blue);outline-offset:2px}
.vc-hint{grid-column:1/-1;margin:0;color:var(--pencil-red);font-size:.8125rem}
.vc-hint:empty{display:none}
@media (prefers-reduced-motion:reduce){.vc-swatch{transition:none}}
@media (forced-colors:active){.vc-dot,.vc-swatch{forced-color-adjust:none}}`;
