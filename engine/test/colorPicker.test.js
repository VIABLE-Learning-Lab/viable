import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_PICKER_CSS, COLOR_PICKER_SCRIPT, COLOR_SWATCHES, colorHex, colorName } from '../src/console/colorPicker.js';
import { CONSOLE_SCRIPT } from '../src/console/client.js';
import { consoleAsset, consolePage } from '../src/console/layout.js';
import { profileLook } from '../src/learner/settings.js';
import { THEMES } from '../src/learner/themes.js';

const luminance = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };

test('a hex code is read as a colour input keeps it, or not at all', () => {
  assert.equal(colorHex('#3B5BDB'), '#3b5bdb');
  assert.equal(colorHex('3b5bdb'), '#3b5bdb', 'without its #');
  assert.equal(colorHex(' #abc '), '#aabbcc', 'three digits are six');
  for (const wrong of ['', '#12345', '#1234567', '#ggg', 'blue', null, undefined]) assert.equal(colorHex(wrong), null, String(wrong));
  assert.equal(colorName('#3B5BDB'), 'Indigo');
  assert.equal(colorName('#123456'), null, 'a colour of one’s own has its hex, not a name');
});

test('the swatches are named, an agent’s default among them, and each reads on a light page and a dark one', () => {
  assert.equal(new Set(COLOR_SWATCHES.map(([hex]) => hex)).size, COLOR_SWATCHES.length);
  assert.equal(new Set(COLOR_SWATCHES.map(([, name]) => name)).size, COLOR_SWATCHES.length);
  assert.equal(COLOR_SWATCHES[0][0], profileLook({}).color, 'a new agent’s colour is the first');
  for (const [hex, name] of COLOR_SWATCHES) {
    assert.equal(colorHex(hex), hex, name);
    assert.ok(contrast(hex, '#ffffff') >= 4.5, `${name} on white`);
    assert.ok(contrast(hex, THEMES.clear.dark.bg) >= 3, `${name} on a chat page in dark mode`);
  }
});

test('the picker ships as one script, the console dresses its colour fields with it, and its look is in the console’s', async () => {
  assert.equal(new Function(`${COLOR_PICKER_SCRIPT}; return [typeof dressColor, colorHex('ABC')];`)().join(), 'function,#aabbcc');
  assert.ok(!/<\/script/i.test(COLOR_PICKER_SCRIPT));
  assert.match(CONSOLE_SCRIPT, /function dressColor\(input\)/);
  assert.match(CONSOLE_SCRIPT, /input\.v-input\[type=color\]'\)\) dressColor\(input\)/);
  const sheet = /href="\/console\/assets\/([^"]+\.css)"/.exec(consolePage({ title: 'x', pages: [], current: null, body: '' }, 'n'))[1];
  assert.ok((await consoleAsset(sheet).text()).includes(COLOR_PICKER_CSS));
});
