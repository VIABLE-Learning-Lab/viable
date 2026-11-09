/**
 * Dragging things into a new order by a handle, the same on every VIABLE screen: the console's course page (the Engine
 * and the teacher's door) and the VIABLE Developer Platform's, which gets this file's script and look as a generated
 * module (npm run ui:build). It works from marks on the page, so any page can use it:
 *
 *   data-drag-block="<id>"   a block that moves whole (a unit, with its list of activities)
 *   data-drop-group="<id>"   a list items can be dropped in ('' for none: not in a unit)
 *   data-drag-item="<key>"   an item of a list (an activity)
 *   data-drag                its handle, inside the item or the block
 *
 * While dragging nothing on the page moves: a line shows where it would land and a copy follows the pointer, so a page
 * that draws its list from data (Vue) keeps drawing it. Letting go calls onDrop once with the whole new order,
 * { blocks: [block ids], items: [{ key, group }] }, and only when it changed. Escape or a lost pointer cancels. The
 * keyboard keeps a page's own arrows and menus: the handle is for the pointer.
 *
 * Exported for tests; DRAG_ORDER_SCRIPT is the same as source for a page's own script (see asSource).
 */
import { asSource } from '../../../harness/src/ui/parts.js';

/** The order the page shows now. */
export function shownOrder(board) {
  return {
    blocks: [...board.querySelectorAll('[data-drag-block]')].map((block) => block.dataset.dragBlock),
    items: [...board.querySelectorAll('[data-drop-group]')].flatMap((group) => [...group.querySelectorAll('[data-drag-item]')].filter((item) => item.closest('[data-drop-group]') === group).map((item) => ({ key: item.dataset.dragItem, group: group.dataset.dropGroup || null })))
  };
}

/**
 * The order after a drop. order: shownOrder's; groups: the lists' ids in the page's order; moving: { kind: 'item'|'block',
 * key }; target: { group, before } for an item (before: the key it lands before, or null for its group's end), { before }
 * for a block.
 */
export function droppedOrder(order, groups, moving, target) {
  if (moving.kind === 'block') {
    const rest = order.blocks.filter((id) => id !== moving.key);
    const at = target.before == null ? rest.length : Math.max(0, rest.indexOf(target.before));
    return { blocks: [...rest.slice(0, at), moving.key, ...rest.slice(at)], items: order.items };
  }
  const rest = order.items.filter((entry) => entry.key !== moving.key);
  const group = target.group || null;
  let at = target.before == null ? -1 : rest.findIndex((entry) => entry.key === target.before);
  if (at < 0) {
    // Its group's end: after the last item of any list up to and including it.
    const place = groups.indexOf(group);
    at = rest.reduce((last, entry, index) => (groups.indexOf(entry.group) <= place ? index + 1 : last), 0);
  }
  return { blocks: order.blocks, items: [...rest.slice(0, at), { key: moving.key, group }, ...rest.slice(at)] };
}

/** Lets a board's items and blocks be dragged into order by their handles. onDrop(order) once per changed drop. */
export function arrangeable(board, onDrop) {
  if (!board || board.dataset.arrangeable) return;
  board.dataset.arrangeable = '1';
  // Read when needed: a board made in one document (a page fetched and parsed) is used in another once shown.
  const page = () => board.ownerDocument;
  let drag = null;
  const middle = (element) => { const box = element.getBoundingClientRect(); return box.top + box.height / 2; };
  const shown = (element) => element.getClientRects().length > 0;

  const stop = (dropped) => {
    const done = drag;
    drag = null;
    page().removeEventListener('pointermove', move);
    page().removeEventListener('pointerup', up);
    page().removeEventListener('pointercancel', cancel);
    page().removeEventListener('keydown', escape, true);
    if (!done || !done.moved) return;
    done.ghost.remove();
    done.line.remove();
    done.item.classList.remove('is-dragging');
    for (const group of board.querySelectorAll('[data-drop-group].is-target')) group.classList.remove('is-target');
    board.classList.remove('is-arranging');
    page().documentElement.classList.remove('is-dragging-now');
    if (!dropped || !done.target) return;
    const before = shownOrder(board);
    const groups = [...board.querySelectorAll('[data-drop-group]')].map((group) => group.dataset.dropGroup || null);
    const after = droppedOrder(before, groups, { kind: done.kind, key: done.key }, done.target);
    if (JSON.stringify(after) !== JSON.stringify(before)) onDrop(after);
  };
  const up = (event) => { if (drag && event.pointerId === drag.pointer) stop(true); };
  const cancel = (event) => { if (drag && event.pointerId === drag.pointer) stop(false); };
  const escape = (event) => { if (drag && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stop(false); } };

  const begin = (event) => {
    const box = drag.item.getBoundingClientRect();
    drag.moved = true;
    drag.offset = event.clientY - box.top;
    drag.ghost = drag.item.cloneNode(true);
    drag.ghost.removeAttribute('id');
    for (const named of drag.ghost.querySelectorAll('[id]')) named.removeAttribute('id');
    drag.ghost.classList.add('drag-ghost');
    drag.ghost.setAttribute('aria-hidden', 'true');
    drag.ghost.style.width = `${box.width}px`;
    drag.ghost.style.left = `${box.left}px`;
    drag.line = Object.assign(page().createElement('div'), { className: 'drag-line' });
    drag.line.setAttribute('aria-hidden', 'true');
    page().body.append(drag.ghost, drag.line);
    drag.item.classList.add('is-dragging');
    board.classList.add('is-arranging');
    page().documentElement.classList.add('is-dragging-now');
  };
  const lineAt = (top, left, width) => { drag.line.style.cssText = `top:${Math.round(top) - 1}px;left:${Math.round(left)}px;width:${Math.round(width)}px`; };

  function move(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      begin(event);
    }
    const y = event.clientY;
    drag.ghost.style.top = `${y - drag.offset}px`;
    for (const group of board.querySelectorAll('[data-drop-group].is-target')) group.classList.remove('is-target');
    if (drag.kind === 'item') {
      const lists = [...board.querySelectorAll('[data-drop-group]')].filter(shown);
      if (!lists.length) return;
      const list = lists.find((each) => { const box = each.getBoundingClientRect(); return y >= box.top - 14 && y <= box.bottom + 14; })
        || lists.reduce((best, each) => (Math.abs(middle(each) - y) < Math.abs(middle(best) - y) ? each : best), lists[0]);
      const items = [...list.querySelectorAll('[data-drag-item]')].filter((item) => item !== drag.item && item.closest('[data-drop-group]') === list && shown(item));
      const before = items.find((item) => y < middle(item)) || null;
      drag.target = { group: list.dataset.dropGroup || null, before: before ? before.dataset.dragItem : null };
      const box = list.getBoundingClientRect();
      if (before) lineAt(before.getBoundingClientRect().top, box.left, box.width);
      else if (items.length) lineAt(items.at(-1).getBoundingClientRect().bottom, box.left, box.width);
      else { list.classList.add('is-target'); lineAt(box.top, box.left, box.width); }
    } else {
      const blocks = [...board.querySelectorAll('[data-drag-block]')].filter((block) => block !== drag.item && shown(block));
      const before = blocks.find((block) => y < middle(block)) || null;
      drag.target = { before: before ? before.dataset.dragBlock : null };
      const edge = before ? before.getBoundingClientRect().top : (blocks.at(-1) || drag.item).getBoundingClientRect().bottom;
      const box = board.getBoundingClientRect();
      lineAt(edge, box.left, box.width);
    }
    const win = page().defaultView || globalThis;
    if (y < 64) win.scrollBy(0, -14);
    else if (y > win.innerHeight - 64) win.scrollBy(0, 14);
  }

  board.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest && event.target.closest('[data-drag]');
    if (!handle || !board.contains(handle) || event.button !== 0 || drag) return;
    const item = handle.closest('[data-drag-item], [data-drag-block]');
    if (!item || !board.contains(item)) return;
    event.preventDefault();
    const kind = item.hasAttribute('data-drag-item') ? 'item' : 'block';
    drag = { kind, item, key: kind === 'item' ? item.dataset.dragItem : item.dataset.dragBlock, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, target: null };
    try { handle.setPointerCapture(event.pointerId); } catch {}
    page().addEventListener('pointermove', move);
    page().addEventListener('pointerup', up);
    page().addEventListener('pointercancel', cancel);
    page().addEventListener('keydown', escape, true);
  });
}

/** The module as source for a page's own script: arrangeable(board, onDrop) is then in scope. */
export const DRAG_ORDER_SCRIPT = asSource({}, [shownOrder, droppedOrder, arrangeable]).replace(/^export /gm, '').replace(/<\//g, '<\\/');

/** Its look, in the page's own tokens: the console's, or the VIABLE Developer Platform's where those aren't set. */
export const DRAG_ORDER_CSS = `[data-drag]{cursor:grab;touch-action:none;user-select:none}
.drag-line{position:fixed;z-index:72;height:3px;border-radius:2px;background:var(--ink-blue,var(--accent-strong,#1f47a8));box-shadow:0 0 0 2px var(--surface,#fff);pointer-events:none}
.drag-ghost{position:fixed;z-index:71;margin:0;border:1px solid var(--public-rule-strong,var(--line,#cdd5e3));border-radius:10px;background:var(--surface,#fff);box-shadow:0 22px 48px -20px rgb(10 16 28/.45);list-style:none;opacity:.96;pointer-events:none;transform:rotate(-.6deg)}
.is-arranging .is-dragging{opacity:.4}
[data-drop-group].is-target{outline:2px dashed var(--ink-blue,var(--accent-strong,#1f47a8));outline-offset:3px;border-radius:8px}
html.is-dragging-now,html.is-dragging-now *{cursor:grabbing!important;user-select:none}
@media (prefers-reduced-motion:reduce){.drag-ghost{transform:none}}`;
