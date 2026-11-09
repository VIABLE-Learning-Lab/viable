import test from 'node:test';
import assert from 'node:assert/strict';
import { DATE_PICKER_CSS, DATE_PICKER_SCRIPT, dayOf, monthCells, outOfRange, readValue, timeSlots, valueOf } from '../src/console/datePicker.js';
import { CONSOLE_SCRIPT } from '../src/console/client.js';

test('a month is six weeks from the week holding the 1st, on the reader’s first day', () => {
  const sunday = monthCells(2026, 10, 0);
  assert.equal(sunday.length, 42);
  assert.equal(sunday[0].key, '2026-11-01', 'November 2026 begins on a Sunday');
  assert.equal(sunday.filter((cell) => cell.inMonth).length, 30);
  assert.equal(monthCells(2026, 10, 1)[0].key, '2026-10-26', 'a week starting on Monday begins in October');
  assert.equal(monthCells(2027, 1, 0).at(-1).key, '2027-03-13', 'across a month end and a year');
});

test('what an input holds is read whole or not at all, and written back in its own format', () => {
  assert.deepEqual(readValue('2026-11-20T17:00', 'datetime-local'), { day: '2026-11-20', time: '17:00' });
  assert.deepEqual(readValue('2026-11-20', 'date'), { day: '2026-11-20', time: null });
  assert.equal(readValue('2026-02-30', 'date'), null, 'no such day');
  assert.equal(readValue('2026-11-20', 'datetime-local'), null, 'a day with no time isn’t a time');
  assert.equal(readValue('', 'date'), null);
  assert.equal(dayOf('2026-13-01'), null);
  assert.equal(valueOf({ day: '2026-11-20', time: '23:59' }, 'datetime-local'), '2026-11-20T23:59');
  assert.equal(valueOf({ day: '2026-11-20', time: null }, 'datetime-local'), '2026-11-20T09:00', 'a day alone takes nine in the morning');
  assert.equal(valueOf({ day: '2026-11-20' }, 'date'), '2026-11-20');
});

test('times come every quarter hour, with the end of the day, and one already chosen keeps its place', () => {
  const slots = timeSlots();
  assert.equal(slots.length, 97);
  assert.deepEqual([slots[0], slots[1], slots.at(-1)], ['00:00', '00:15', '23:59']);
  const kept = timeSlots('10:07');
  assert.equal(kept.length, 98);
  assert.ok(kept.indexOf('10:07') === kept.indexOf('10:00') + 1);
});

test('a day outside min and max can’t be chosen, whether they are days or times', () => {
  assert.equal(outOfRange('2026-11-08', '2026-11-09', ''), true);
  assert.equal(outOfRange('2026-11-09', '2026-11-09T10:00', ''), false, 'the day of a minimum time is still open');
  assert.equal(outOfRange('2026-12-01', '', '2026-11-30'), true);
  assert.equal(outOfRange('2026-11-15', '', ''), false);
});

test('the picker ships as one script, and the console dresses its date fields with it', () => {
  assert.equal(new Function(`${DATE_PICKER_SCRIPT}; return [typeof dressDate, typeof tidyDates];`)().join(), 'function,function');
  assert.ok(!/<\/script/i.test(DATE_PICKER_SCRIPT));
  assert.match(CONSOLE_SCRIPT, /function dressDate\(input\)/);
  assert.match(CONSOLE_SCRIPT, /input\.v-input\[type=date\],input\.v-input\[type=datetime-local\]'\)\) dressDate\(input\)/);
  assert.match(DATE_PICKER_CSS, /var\(--ink-blue,var\(--accent-strong/, 'the console’s tokens, or the VIABLE Developer Platform’s');
});
