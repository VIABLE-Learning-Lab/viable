import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAG_ORDER_CSS, DRAG_ORDER_SCRIPT, droppedOrder } from '../src/console/dragOrder.js';
import { CONSOLE_SCRIPT } from '../src/console/client.js';

// Two units and the activities not in one: what the page shows, in its order.
const order = {
  blocks: ['week-1', 'week-2'],
  items: [{ key: 'a', group: 'week-1' }, { key: 'b', group: 'week-1' }, { key: 'c', group: null }]
};
const groups = ['week-1', 'week-2', null];

test('an item lands before another, at a list’s end, or in an empty list, and the rest keep their places', () => {
  assert.deepEqual(droppedOrder(order, groups, { kind: 'item', key: 'b' }, { group: 'week-1', before: 'a' }).items.map((entry) => entry.key), ['b', 'a', 'c']);
  assert.deepEqual(droppedOrder(order, groups, { kind: 'item', key: 'a' }, { group: 'week-2', before: null }).items, [{ key: 'b', group: 'week-1' }, { key: 'a', group: 'week-2' }, { key: 'c', group: null }], 'into the empty unit, between the others');
  assert.deepEqual(droppedOrder(order, groups, { kind: 'item', key: 'a' }, { group: null, before: null }).items.map((entry) => [entry.key, entry.group]), [['b', 'week-1'], ['c', null], ['a', null]], 'out of its unit, at the end');
  assert.deepEqual(droppedOrder(order, groups, { kind: 'item', key: 'c' }, { group: 'week-1', before: null }).items.map((entry) => [entry.key, entry.group]), [['a', 'week-1'], ['b', 'week-1'], ['c', 'week-1']]);
});

test('a block moves whole, and nothing else changes', () => {
  const moved = droppedOrder(order, groups, { kind: 'block', key: 'week-2' }, { before: 'week-1' });
  assert.deepEqual(moved.blocks, ['week-2', 'week-1']);
  assert.deepEqual(moved.items, order.items);
  assert.deepEqual(droppedOrder(order, groups, { kind: 'block', key: 'week-1' }, { before: null }).blocks, ['week-2', 'week-1'], 'to the end');
});

test('the module ships as one script, and the console arranges its boards with it', () => {
  assert.equal(new Function(`${DRAG_ORDER_SCRIPT}; return typeof arrangeable;`)(), 'function');
  assert.match(CONSOLE_SCRIPT, /arrangeable\(board, \(order\) => inLine/);
  assert.match(DRAG_ORDER_CSS, /\.drag-line\{/);
});
