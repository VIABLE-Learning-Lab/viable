/**
 * The editor for what learners read on a page step: the text as it will look, with a small toolbar, instead of Markdown
 * to type. It dresses a textarea[data-rich] (activity.js): the textarea stays the form's field, out of sight, and holds
 * the Markdown after every change (richText.js), so saving, the warning about what isn't saved, a refresh that keeps
 * what was typed, and Ask's writes all read it as before. A text holding what the editor can't show (a table, math,
 * code, a picture, HTML) stays in the textarea as it is, with a line saying why.
 *
 * Plain functions on the DOM and the browser's own editing (execCommand, so undo works as everywhere); no dependency.
 * RICH_EDITOR_SCRIPT is them, with richText.js's, as source for the console's script (client.js), in a scope of their
 * own that gives the page only dressRich(textarea). RICH_EDITOR_CSS is its look, in the console's tokens.
 */
import { asSource } from '../../../harness/src/ui/parts.js';
import { icon } from './icons.js';
import { RICH_TEXT_SCRIPT, cleanHref, escapeHtml, linked, readDom, readMarkdown, tidyRuns, toHtml, toMarkdown } from './richText.js';

// The toolbar, in the order a teacher reaches for it; keys: the letter with ⌘ or Ctrl.
const RICH_TOOLS = [
  { id: 'bold', label: 'Bold', keys: 'B', icon: icon('bold') },
  { id: 'italic', label: 'Italic', keys: 'I', icon: icon('italic') },
  { id: 'h2', label: 'Heading', icon: icon('heading'), gap: true },
  { id: 'h3', label: 'Subheading', icon: icon('subheading') },
  { id: 'ul', label: 'Bulleted list', icon: icon('list'), gap: true },
  { id: 'ol', label: 'Numbered list', icon: icon('numbered') },
  { id: 'quote', label: 'Quote', icon: icon('quote') },
  { id: 'link', label: 'Link', keys: 'K', icon: icon('link'), gap: true }
];
// Why a text stays in Markdown, for readMarkdown's why.
const RICH_WHY = { table: 'a table', math: 'math', code: 'code', picture: 'a picture', html: 'HTML', other: 'formatting this editor doesn’t show' };

/** An address a teacher typed for a link, as a learner's page keeps one: the web or an email address. '' for none, null for neither. */
export function webAddress(value) {
  const typed = String(value || '').trim();
  if (!typed) return '';
  if (/^(?:https?:\/\/|mailto:)/i.test(typed)) return cleanHref(typed);
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(typed)) return cleanHref(`mailto:${typed}`);
  if (/^[^\s/:@]+\.[^\s/:@]{2,}(?::\d+)?(?:[/?#]\S*)?$/.test(typed)) return cleanHref(`https://${typed}`);
  return null;
}

/** Plain words as paragraphs: a blank line between two, each line its own. */
export function plainBlocks(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map((part) => ({ type: 'p', inline: tidyRuns(part.split('\n').flatMap((line, at) => [...(at ? [{ text: '\n' }] : []), { text: line }])) })).filter((block) => block.inline.length);
}

function dressRich(area) {
  if (area.dataset.dressed) return;
  area.dataset.dressed = '1';
  const page = area.ownerDocument;
  const read = readMarkdown(area.value);
  if (!read.blocks) {
    const why = page.createElement('small');
    why.className = 'v-note rt-why';
    why.textContent = `It has ${RICH_WHY[read.why] || RICH_WHY.other}, so it stays in Markdown here: nothing in it is lost.`;
    area.after(why);
    return;
  }
  const make = (tag, className, attributes = {}) => {
    const made = page.createElement(tag);
    if (className) made.className = className;
    for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, value);
    return made;
  };
  // Named by its form and field, so it is the same element after a refresh and keeps the focus.
  const id = `rich-${`${area.form?.id || 'page'}-${area.name}`.replace(/[^\w-]/g, '-')}`;
  const field = area.parentElement;
  const label = area.id ? field.querySelector(`label[for="${CSS.escape(area.id)}"]`) : null;
  const hint = field.querySelector('small.v-note');
  const max = Number(area.getAttribute('maxlength')) || Infinity;
  const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const run = (command, value = null) => document.execCommand(command, false, value);

  const box = make('div', 'rt');
  const tools = make('div', 'rt-tools', { role: 'toolbar', 'aria-label': 'Formatting', 'aria-controls': id });
  const buttons = RICH_TOOLS.map((tool, at) => {
    if (tool.gap) tools.append(make('span', 'rt-gap', { 'aria-hidden': 'true' }));
    const button = make('button', 'rt-tool', { type: 'button', 'data-tool': tool.id, 'aria-label': tool.label, 'data-tip': tool.keys ? `${tool.label} ${mac ? '⌘' : 'Ctrl+'}${tool.keys}` : tool.label, tabindex: at ? '-1' : '0' });
    if (tool.keys) button.setAttribute('aria-keyshortcuts', `${mac ? 'Meta' : 'Control'}+${tool.keys}`);
    if (tool.id !== 'link') button.setAttribute('aria-pressed', 'false');
    button.innerHTML = tool.icon;
    tools.append(button);
    return button;
  });
  const linkBar = make('div', 'rt-link');
  linkBar.hidden = true;
  const linkLabel = make('label', 'rt-link-label', { for: `${id}-link` });
  linkLabel.textContent = 'Link to';
  const linkInput = make('input', 'v-input', { id: `${id}-link`, type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://… or an email address' });
  const linkGo = make('button', 'v-btn is-small is-primary', { type: 'button' });
  const linkOff = make('button', 'v-btn is-small', { type: 'button' });
  linkOff.textContent = 'Remove link';
  const linkNo = make('button', 'v-btn is-small', { type: 'button' });
  linkNo.textContent = 'Cancel';
  linkBar.append(linkLabel, linkInput, linkGo, linkOff, linkNo);
  const editor = make('div', 'rt-area', { id, contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' });
  if (label) {
    label.id ||= `${id}-label`;
    editor.setAttribute('aria-labelledby', label.id);
    label.addEventListener('click', () => editor.focus());
  }
  if (hint) { hint.id ||= `${id}-hint`; editor.setAttribute('aria-describedby', hint.id); }
  if (area.placeholder) { editor.dataset.placeholder = area.placeholder; editor.setAttribute('aria-placeholder', area.placeholder); }
  const said = make('p', 'rt-say', { role: 'status' });
  const say = (words) => { said.textContent = words; };
  const draw = (blocks) => {
    editor.innerHTML = toHtml(blocks) || '<p><br></p>';
    editor.classList.toggle('is-empty', !blocks.length);
  };
  draw(read.blocks);
  box.append(tools, linkBar, editor, said);
  area.classList.add('rt-native');
  area.tabIndex = -1;
  area.after(box);

  // The Markdown, after every change. A text whose learners would see what was saved stays the saved text, as it was written.
  const saved = readMarkdown(area.defaultValue);
  const savedAs = saved.blocks ? toMarkdown(saved.blocks) : null;
  const sync = () => {
    const { blocks } = readDom(editor);
    const markdown = toMarkdown(blocks);
    area.value = markdown === savedAs ? area.defaultValue : markdown;
    editor.classList.toggle('is-empty', !blocks.length);
    say(markdown.length > max ? `A page holds ${max.toLocaleString()} characters, and this is ${(markdown.length - max).toLocaleString()} more: the end won’t be saved.` : '');
  };
  editor.addEventListener('input', sync);

  // Where the caret is, kept while the toolbar or the link field has the focus, and what is on there.
  let range = null;
  const remember = () => {
    const selection = getSelection();
    if (selection.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) range = selection.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    // The selection the editor holds now, if it holds one; else the one it held before the toolbar or the link field.
    const now = getSelection();
    if (document.activeElement === editor && now.rangeCount && editor.contains(now.getRangeAt(0).commonAncestorContainer)) { remember(); return; }
    editor.focus({ preventScroll: true });
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const here = () => {
    const selection = getSelection();
    const node = selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
    const at = node && (node.nodeType === 1 ? node : node.parentElement);
    const inside = (selector) => { const found = at && editor.contains(at) ? at.closest(selector) : null; return found && editor.contains(found) ? found : null; };
    const heading = inside('h1,h2,h3,h4,h5,h6');
    const list = inside('li')?.parentElement?.nodeName;
    return { bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), h2: /^H[12]$/.test(heading?.nodeName || ''), h3: /^H[3-6]$/.test(heading?.nodeName || ''), ul: list === 'UL', ol: list === 'OL', quote: inside('blockquote'), link: inside('a') };
  };
  const show = () => { const now = here(); for (const button of buttons) if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(Boolean(now[button.dataset.tool]))); };
  editor.rich = { remember, show };

  // What the toolbar does. A heading, a list and a quote are each a block of their own: becoming one, a line stops being the others.
  const unquote = () => { for (let tries = 0; here().quote && tries < 3; tries += 1) run('outdent'); };
  const unlist = () => { const now = here(); if (now.ul) run('insertUnorderedList'); else if (now.ol) run('insertOrderedList'); };
  const unhead = () => { const now = here(); if (now.h2 || now.h3) run('formatBlock', '<p>'); };
  // A browser moves the words into their new block and leaves the caret at its start: it goes back where it was.
  // Where a place is as the count of characters before it, which changing a block leaves as it is; at a block's end, it
  // stays at that end rather than the next block's start.
  const countOf = (node, offset) => { const before = document.createRange(); before.selectNodeContents(editor); before.setEnd(node, offset); return before.toString().length; };
  const placeOf = (count, atEnd) => {
    const walker = document.createTreeWalker(editor, 4);
    let seen = 0;
    let last = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.nodeValue.length;
      if (count < seen + length || (count === seen + length && (atEnd || !length))) return [node, count - seen];
      seen += length;
      last = node;
    }
    return last ? [last, last.nodeValue.length] : null;
  };
  const kept = (work) => {
    const selection = getSelection();
    const live = selection.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.getRangeAt(0) : null;
    const ends = (node, offset) => offset > 0 && offset === (node.nodeType === 3 ? node.nodeValue.length : node.childNodes.length);
    const at = live && [countOf(live.startContainer, live.startOffset), ends(live.startContainer, live.startOffset), countOf(live.endContainer, live.endOffset), ends(live.endContainer, live.endOffset)];
    work();
    const start = at && placeOf(at[0], at[1]);
    const end = at && placeOf(at[2], at[3]);
    if (!start || !end) return;
    const back = document.createRange();
    back.setStart(...start);
    back.setEnd(...end);
    selection.removeAllRanges();
    selection.addRange(back);
  };
  const act = (tool) => {
    restore();
    const now = here();
    if (tool === 'bold' || tool === 'italic') run(tool);
    else if (tool === 'h2' || tool === 'h3') kept(() => {
      if (now[tool]) run('formatBlock', '<p>');
      else { unlist(); unquote(); run('formatBlock', tool === 'h2' ? '<h2>' : '<h3>'); }
    });
    else if (tool === 'ul' || tool === 'ol') kept(() => {
      if (!now[tool]) { unquote(); unhead(); }
      run(tool === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
    });
    else if (tool === 'quote') kept(() => {
      if (now.quote) unquote();
      else { unlist(); unhead(); run('formatBlock', '<blockquote>'); }
    });
    else if (tool === 'link') { openLink(); return; }
    show();
  };
  tools.addEventListener('mousedown', (event) => { if (event.target.closest('.rt-tool')) event.preventDefault(); });
  tools.addEventListener('click', (event) => { const button = event.target.closest('.rt-tool'); if (button) act(button.dataset.tool); });
  // One stop for the keyboard, and the arrows along it.
  tools.addEventListener('keydown', (event) => {
    const at = buttons.indexOf(event.target);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: buttons.length - 1 }[event.key];
    if (at < 0 || to === undefined) return;
    event.preventDefault();
    const next = buttons[(to + buttons.length) % buttons.length];
    for (const button of buttons) button.tabIndex = button === next ? 0 : -1;
    next.focus();
  });

  // A link: the address in a field under the toolbar, for the words chosen, or as its own words where none are.
  let editing = null;
  const openLink = () => {
    remember();
    editing = here().link;
    linkInput.value = editing ? editing.getAttribute('href').replace(/^mailto:/, '') : '';
    linkGo.textContent = editing ? 'Save link' : 'Add link';
    linkOff.hidden = !editing;
    linkBar.hidden = false;
    say('');
    linkInput.focus();
    linkInput.select();
  };
  const closeLink = () => { linkBar.hidden = true; editing = null; restore(); };
  const around = (node) => { const selection = getSelection(); const whole = document.createRange(); whole.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(whole); };
  const addLink = () => {
    const typed = linkInput.value.trim();
    const href = webAddress(typed);
    if (href === null) { say('That isn’t a web address (https://…) or an email address.'); linkInput.focus(); return; }
    const link = editing;
    closeLink();
    if (!href) { if (link) { around(link); run('unlink'); } return; }
    if (link) { around(link); run('createLink', href); } else if (getSelection().isCollapsed) run('insertHTML', `<a href="${escapeHtml(href)}">${escapeHtml(typed)}</a>`);
    else run('createLink', href);
    show();
  };
  linkGo.addEventListener('click', addLink);
  linkNo.addEventListener('click', closeLink);
  linkOff.addEventListener('click', () => { const link = editing; closeLink(); if (link) { around(link); run('unlink'); show(); } });
  linkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addLink(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLink(); }
  });

  editor.addEventListener('focus', () => {
    // New lines are paragraphs, and bold is <b>, not a styled span.
    run('defaultParagraphSeparator', 'p');
    run('styleWithCSS', false);
    show();
  });
  editor.addEventListener('keydown', (event) => {
    const mod = mac ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && !event.altKey && !event.shiftKey && ['b', 'i', 'k'].includes(key)) { event.preventDefault(); act({ b: 'bold', i: 'italic', k: 'link' }[key]); return; }
    // Underlining isn't kept on a learner's page, so it isn't made here either.
    if (mod && key === 'u') { event.preventDefault(); return; }
    if (event.key !== 'Enter') return;
    const now = here();
    // A heading is one line; Enter on an empty line of a quote leaves the quote, as it leaves a list.
    if (event.shiftKey && (now.h2 || now.h3)) { event.preventDefault(); return; }
    const line = getSelection().anchorNode;
    const block = line && (line.nodeType === 1 ? line : line.parentElement).closest('p,blockquote');
    if (!event.shiftKey && now.quote && block && !block.textContent.trim()) { event.preventDefault(); unquote(); }
  });
  editor.addEventListener('beforeinput', (event) => {
    // Only the formatting a learner's page keeps: bold and italic, not a colour, a font, underlining or alignment.
    if (event.inputType.startsWith('format') && !['formatBold', 'formatItalic'].includes(event.inputType)) { event.preventDefault(); return; }
    // A page holds so many characters: typing stops a little before, as a field's limit does.
    if (/^insert(?:Text|Paragraph|LineBreak|ReplacementText)$/.test(event.inputType) && area.value.length + 2 * (event.data || '').length + 8 > max) {
      event.preventDefault();
      say(`A page holds ${max.toLocaleString()} characters, and this one is full.`);
    }
  });

  // Pasted or dropped from a document or a web page: its paragraphs, headings, lists, quotes, links, bold and italic,
  // without its styles. Plain text reads as Markdown where it is written so (from a chat, say).
  const insertFrom = (data) => {
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    let blocks = [];
    let dropped = [];
    if (html) ({ blocks, dropped } = readDom(new DOMParser().parseFromString(html.replace(/(<[^>]*?\s)style(\s*=)/gi, '$1data-rich-style$2'), 'text/html').body, { pasted: true }));
    if (!blocks.length && text) blocks = readMarkdown(text).blocks || plainBlocks(text);
    if (!blocks.length) return;
    if (area.value.length + toMarkdown(blocks).length > max) { say(`That would make the page longer than the ${max.toLocaleString()} characters it holds.`); return; }
    restore();
    // One paragraph goes into the line where the caret is; more come as blocks of their own.
    const made = toHtml(blocks);
    run('insertHTML', blocks.length === 1 && blocks[0].type === 'p' ? made.slice(3, -4) : made);
    const words = { picture: 'without the pictures', table: 'with each row of the table as a line' };
    say(dropped.length ? `Pasted, ${dropped.map((kind) => words[kind]).filter(Boolean).join(', and ')}.` : '');
  };
  editor.addEventListener('paste', (event) => {
    if (!event.clipboardData) return;
    event.preventDefault();
    remember();
    insertFrom(event.clipboardData);
  });
  let dragging = false;
  editor.addEventListener('dragstart', () => { dragging = true; });
  editor.addEventListener('dragend', () => { dragging = false; });
  editor.addEventListener('drop', (event) => {
    // A drag inside the editor moves its own words, as a browser does; a file isn't for here.
    if (dragging || !event.dataTransfer) return;
    event.preventDefault();
    if ([...event.dataTransfer.types].includes('Files')) return;
    const at = document.caretRangeFromPoint ? document.caretRangeFromPoint(event.clientX, event.clientY) : null;
    if (at) range = at;
    insertFrom(event.dataTransfer);
  });

  // Left, the editor shows exactly what learners will read: what a browser added while editing (a styled span, a list
  // inside a paragraph, an empty line) goes, and a web address typed in the words shows as the link it will be. Undo
  // then starts again from there.
  box.addEventListener('focusout', (event) => {
    if (box.contains(event.relatedTarget)) return;
    if (!linkBar.hidden) { linkBar.hidden = true; editing = null; }
    const blocks = readDom(editor).blocks.map(function linkedBlock(block) { return block.inline ? { ...block, inline: linked(block.inline) } : block.blocks ? { ...block, blocks: block.blocks.map(linkedBlock) } : { ...block, items: block.items.map((item) => ({ blocks: item.blocks.map(linkedBlock) })) }; });
    if (editor.innerHTML.replace(/<(\/?)b>/g, '<$1strong>').replace(/<(\/?)i>/g, '<$1em>') !== (toHtml(blocks) || '<p><br></p>')) draw(blocks);
  });
  if (!dressRich.watching) {
    dressRich.watching = true;
    document.addEventListener('selectionchange', () => {
      const node = getSelection().anchorNode;
      const editing = node && (node.nodeType === 1 ? node : node.parentElement)?.closest('.rt-area');
      if (editing?.rich) { editing.rich.remember(); editing.rich.show(); }
    });
  }
}

/** The editor as source for the console's script, in a scope of its own: the page gets dressRich(textarea). */
export const RICH_EDITOR_SCRIPT = `var dressRich = (function () {
${RICH_TEXT_SCRIPT}
${asSource({ RICH_TOOLS, RICH_WHY }, [webAddress, plainBlocks, dressRich]).replace(/<\//g, '<\\/')}
return dressRich;
})();`;

/** Its look: a field like the console's others, with the toolbar on top and the text as learners will see it. */
export const RICH_EDITOR_CSS = `.rt-native{display:none!important}
.rt{position:relative;min-width:0;border:1px solid var(--public-rule-strong);border-radius:var(--radius-sm);background:var(--surface);transition:border-color .16s ease}
.rt:hover{border-color:var(--muted)}
.rt:focus-within{border-color:var(--ink-blue)}
.rt:has(.rt-area:focus-visible){outline:2px solid var(--ink-blue);outline-offset:0}
.rt-tools{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px;border-bottom:1px solid var(--public-rule);border-radius:var(--radius-sm) var(--radius-sm) 0 0;background:var(--surface)}
.rt-tool{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--public-text);cursor:pointer;transition:background-color .12s ease,color .12s ease}
.rt-tool:hover{background:var(--field-mist);color:var(--public-ink)}
.rt-tool[aria-pressed=true]{background:var(--field-mist);color:var(--ink-blue)}
.rt-tool:focus-visible{outline:2px solid var(--ink-blue);outline-offset:-2px;border-radius:7px}
.rt-gap{width:1px;height:20px;margin:0 3px;background:var(--public-rule)}
.rt-link{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--public-rule);background:var(--field-mist)}
.rt-link[hidden]{display:none}
.rt-link-label{color:var(--public-ink);font-size:.875rem;font-weight:600}
.rt-link .v-input{flex:1 1 220px;min-width:0;min-height:36px;padding:6px 12px}
.rt-area{position:relative;min-height:11em;padding:12px 14px;color:var(--public-ink);font:400 1rem/1.6 var(--font-public);overflow-wrap:anywhere;outline:none;cursor:text}
.rt-area.is-empty::before{content:attr(data-placeholder);position:absolute;top:12px;right:14px;left:14px;color:var(--muted);pointer-events:none}
.rt-area>:first-child{margin-top:0}
.rt-area>:last-child{margin-bottom:0}
.rt-area p{margin:0 0 .7em}
.rt-area h1,.rt-area h2,.rt-area h3,.rt-area h4,.rt-area h5,.rt-area h6{margin:1.1em 0 .4em;color:var(--public-ink);font-weight:550;line-height:1.3;letter-spacing:-.01em}
.rt-area h1{font-size:1.4rem}.rt-area h2{font-size:1.25rem}.rt-area h3{font-size:1.1rem}.rt-area h4,.rt-area h5,.rt-area h6{font-size:1rem}
.rt-area strong,.rt-area b{font-weight:700}
.rt-area ul,.rt-area ol{margin:.2em 0 .8em;padding-left:1.5em}
/* As learners see them, though the editor sits in a list of steps */
.rt-area ul{list-style-type:disc}.rt-area ul ul{list-style-type:circle}.rt-area ul ul ul{list-style-type:square}.rt-area ol{list-style-type:decimal}
.rt-area li{margin:.15em 0}
.rt-area li>p{margin:0 0 .4em}
.rt-area li>ul,.rt-area li>ol{margin:.15em 0}
.rt-area blockquote{margin:.4em 0 .9em;padding:.1em 0 .1em 14px;border-left:3px solid var(--ink-blue-line);color:var(--public-text)}
.rt-area blockquote p{margin:0 0 .5em}
.rt-area a{color:var(--ink-blue);text-decoration:underline 1px var(--ink-blue-line);text-underline-offset:.2em}
.rt-say{margin:0;padding:0 14px 10px;color:var(--muted);font-size:.875rem}
.rt-say:empty{display:none}
.rt-why{color:var(--query-ochre)}
@media (max-width:760px){.rt-area{font-size:max(16px,1em)}}
@media (prefers-reduced-motion:reduce){.rt,.rt-tool{transition:none}}`;
