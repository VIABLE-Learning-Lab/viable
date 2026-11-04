import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeCitations, renderSources, stripModelSourceList } from '../src/agents/citations.js';

const registry = new Map([
  ['c1', { index: 1, document_id: 'd1', title: 'Hours', url: 'https://lib.example.edu/hours', link: 'https://lib.example.edu/hours', text: 'Open 9–5.', heading: 'Hours › Weekdays' }],
  ['c4', { index: 4, document_id: 'd2', title: 'Loans', url: 'https://lib.example.edu/loans', link: 'https://lib.example.edu/loans', text: 'Books for 4 weeks.' }],
  ['c6', { index: 6, document_id: 'd2', title: 'Loans', url: 'https://lib.example.edu/loans', link: 'https://lib.example.edu/loans', text: 'Renew online.' }],
  ['c7', { index: 7, document_id: 'd3', title: 'Syllabus.pdf', kind: 'file', link: null, text: 'Week 1.' }]
]);

test('a reply renumbers its sources in order of mention, one per page', () => {
  const { text, citations } = finalizeCitations('Books go out for 4 weeks [6] and renew online [4]. Open 9–5 [1, 4]. See the syllabus [7]. Not ours [9].', registry);
  assert.equal(text, 'Books go out for 4 weeks [1] and renew online [1]. Open 9–5 [1, 2]. See the syllabus [3]. Not ours [9].');
  assert.deepEqual(citations.map((item) => [item.index, item.title, item.link]), [[1, 'Loans', 'https://lib.example.edu/loans'], [2, 'Hours', 'https://lib.example.edu/hours'], [3, 'Syllabus.pdf', null]]);
  assert.equal(citations[0].snippet, 'Renew online.');
  assert.deepEqual(finalizeCitations('No citations here.', registry), { text: 'No citations here.', citations: [] });
});

test('marks written as [n6] count; the same page twice side by side shows once; code is left alone', () => {
  // Two passages of one page ([6] and [4] are both Loans) side by side are one [1], not [1][1].
  assert.equal(finalizeCitations('Renew online [6] [4]. Open 9–5 [n1]. Both [N6][1].', registry).text, 'Renew online [1]. Open 9–5 [2]. Both [1][2].');
  assert.equal(finalizeCitations('Use `grid[1][6]` here [6].\n```\nm = a[4][6]\n```', registry).text, 'Use `grid[1][6]` here [1].\n```\nm = a[4][6]\n```');
});

test('a model-written source list of retrieved links goes; other endings stay', () => {
  const reply = 'Open 9–5 [1].\n\n**Sources**\n- [Hours](https://lib.example.edu/hours)\n- [Loans](https://lib.example.edu/loans).';
  assert.equal(stripModelSourceList(reply, registry), 'Open 9–5 [1].');
  assert.equal(stripModelSourceList('Open 9–5 [1].\n\nReferences:\n1. https://elsewhere.example.com/page', registry), 'Open 9–5 [1].\n\nReferences:\n1. https://elsewhere.example.com/page');
  assert.equal(stripModelSourceList('Sources say it is open.\nSee you soon.', registry), 'Sources say it is open.\nSee you soon.');
});

test('sources are listed per channel style', () => {
  const { text, citations } = finalizeCitations('Open 9–5 [1]. Renew online [6]. Syllabus [7].', registry);
  assert.equal(renderSources(text, citations, 'none'), text);
  assert.equal(renderSources(text, citations, 'text'), 'Open 9–5 [1]. Renew online [2]. Syllabus [3].\n\nSources:\n[1] Hours — https://lib.example.edu/hours\n[2] Loans — https://lib.example.edu/loans\n[3] Syllabus.pdf');
  assert.equal(renderSources(text, citations, 'markdown'), 'Open 9–5 [[1]](https://lib.example.edu/hours). Renew online [[2]](https://lib.example.edu/loans). Syllabus [3].\n\n**Sources**\n1. [Hours](https://lib.example.edu/hours)\n2. [Loans](https://lib.example.edu/loans)\n3. Syllabus.pdf');
});
