import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { ATTRIBUTES, MARKS, OUTCOMES, PARTS_CSS, PARTS_SCRIPT, TAGS, VERDICTS, h, suggestion, testCase, treeDom, treeHtml, vettingRound, vettingRounds } from '../src/ui/parts.js';

const ATTACK = '<img src="https://evil.example/x.png" onerror="alert(1)"><script>alert(2)</script>"\'&';
const parts = [
  vettingRounds([{ attempt: 1, verdict: 'fail', reply: ATTACK, feedback: `FAILED: ${ATTACK}` }, { attempt: 2, verdict: ATTACK, reply: ATTACK }, { attempt: 3, verdict: 'pass', reply: 'ok' }]),
  testCase({ name: ATTACK, verdict: ATTACK, reason: ATTACK, reply: ['script', null, ATTACK] }, { message: ATTACK, rubric: ATTACK }),
  suggestion({ id: ATTACK, change: ATTACK, why: ATTACK, evidence: [ATTACK, { quote: ATTACK }], patch: { sections: { [ATTACK]: { help: 'hint' } } } })
];

test('a round: a failed draft is struck, the reason loses the verdict the mark gives, and what isn’t a verdict can’t pose as one', () => {
  const failed = vettingRound({ attempt: 1, verdict: 'fail', reply: 'It is 5/6.', feedback: 'FAILED: It states the sum.' });
  assert.equal(treeHtml(failed), '<li class="round fail"><p class="round-name">Round 1, the draft<span class="v-mark fail">Did not pass</span></p><div class="round-body"><div class="draft"><del>It is 5/6.</del></div><p class="pencil"><span class="pencil-who">The reviewer’s reason: </span>It states the sum.</p></div></li>');
  assert.match(treeHtml(vettingRound({ verdict: 'pass', reply: 'Hm?' }, 1)), /Round 2, a rewrite<span class="v-mark pass">Passed.*<blockquote>Hm\?<\/blockquote>/);
  assert.match(treeHtml(vettingRound({ source: 'draft', verdict: 'error', reply: 'x', feedback: 'timeout' })), /the reply as given<span class="v-mark unverified">The review couldn’t run.*What went wrong: <\/span>timeout/);
  assert.match(treeHtml(vettingRound({ verdict: 'pass', reply: null })), /No reply: it couldn’t be written\./);
  assert.match(treeHtml(vettingRound({ verdict: 'hacked', reply: 'x' })), /class="round error"/);
  for (const key of [...Object.keys(OUTCOMES), ...Object.keys(VERDICTS)]) assert.ok(MARKS[key], key);
});

test('HTML and elements hold the same parts, and the data never becomes markup in either', () => {
  for (const part of parts) {
    const html = treeHtml(part);
    assert.ok(!/<(?:img|script|a)\b/i.test(html), 'no element from the data');
    assert.ok(!/<[^>]*\s(?:on\w+|src|href)=/i.test(html), 'no attribute from the data');
    assert.match(html, /&lt;img src=&quot;https:\/\/evil\.example/);
  }
  assert.throws(() => treeHtml(['img', { src: 'x' }]), /no img element/);
  assert.equal(treeHtml(h('p', { class: 'a', onclick: 'x', href: 'y', open: false }, 'b')), '<p class="a">b</p>', 'only the listed attributes');
  assert.ok(ATTRIBUTES.every((name) => !/^on|href|src/.test(name)) && !TAGS.some((tag) => ['a', 'img', 'script', 'style', 'iframe', 'form'].includes(tag)));
});

// A stand-in DOM, the page's view of treeDom.
const dom = () => {
  const element = (tag) => ({ tag, attributes: {}, children: [], setAttribute(name, value) { this.attributes[name] = value; }, append(child) { this.children.push(child); } });
  return { createElement: element, createTextNode: (data) => ({ data }) };
};
const serialize = (node) => ('data' in node ? treeHtml(node.data) : treeHtml([node.tag, node.attributes]).replace(/<\/\w+>$/, '').replace(' open=""', ' open') + node.children.map(serialize).join('') + `</${node.tag}>`);

test('a page’s script gets the same functions from PARTS_SCRIPT, and builds what the server would write', () => {
  const sandbox = { document: dom(), input: JSON.stringify([{ attempt: 1, verdict: 'fail', reply: ATTACK, feedback: ATTACK }]) };
  vm.runInNewContext(`${PARTS_SCRIPT}\nresult = treeDom(vettingRounds(JSON.parse(input), { watch: true }));`, sandbox);
  globalThis.document = dom();
  try {
    assert.equal(serialize(sandbox.result), treeHtml(vettingRounds([{ attempt: 1, verdict: 'fail', reply: ATTACK, feedback: ATTACK }], { watch: true })));
    assert.equal(serialize(treeDom(parts[1])), treeHtml(parts[1]));
  } finally {
    delete globalThis.document;
  }
  assert.ok(!/<\/script/i.test(PARTS_SCRIPT), 'it can sit in a script element');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(PARTS_SCRIPT));
});

test('nothing moves unless motion is welcome, and a watched round ends as a plain one', () => {
  assert.ok(!PARTS_CSS.split('@media (prefers-reduced-motion:no-preference)')[0].includes('.watch'));
  assert.match(treeHtml(vettingRounds([], { watch: true })), /class="rounds watch"/);
  assert.match(treeHtml(vettingRounds([])), /class="rounds"/);
  assert.ok(!/https?:|url\(|@import/.test(PARTS_CSS), 'it loads nothing');
});
