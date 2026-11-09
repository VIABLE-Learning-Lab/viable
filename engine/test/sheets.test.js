import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { SHEETS_SCRIPT, columnOf, rowsText, sheetRows, xmlText, zipEntries } from '../src/console/sheets.js';
import { readClassLines } from '../src/server/classList.js';

// A zip as a spreadsheet program writes one: each part deflated, then the directory, then its end record.
function zip(files) {
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const named = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(named.length, 26);
    parts.push(local, named, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(named.length, 28);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, named);
    offset += 30 + named.length + data.length;
  }
  const listed = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(listed.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, listed, end]));
}

const BOOK = {
  'xl/workbook.xml': '<workbook><sheets><sheet name="Period 2 &amp; 3" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Last Name</t></si><si><t>First Name</t></si><si><t>Period</t></si><si><t>Lovelace</t></si><si><r><t>A</t></r><r><t>da</t></r><rPh><t>ア</t></rPh></si><si><t>Turing</t></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row><row r="2" spans="1:4"/><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" t="s"><v>4</v></c><c r="C3" s="1"/><c r="D3"><v>2</v></c></row><row r="4"><c r="A4" t="s"><v>5</v></c><c r="B4" t="inlineStr"><is><t>Alan</t></is></c><c r="D4"><f>1+2</f><v>3</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData/></worksheet>'
};

test('an Excel file’s first sheet is read in the browser as a spreadsheet copies it, and the class list reads it', async () => {
  const read = await sheetRows(zip(BOOK));
  assert.equal(read.sheet, 'Period 2 & 3');
  assert.deepEqual(read.sheets, ['Period 2 & 3', 'Notes']);
  assert.deepEqual(read.rows, [['Last Name', 'First Name', '', 'Period'], ['Lovelace', 'Ada', '', '2'], ['Turing', 'Alan', '', '3']], 'shared and inline text, a formula’s value, gaps kept, an empty row left out, phonetic hints left out');
  assert.equal(rowsText(read.rows), 'Last Name\tFirst Name\t\tPeriod\nLovelace\tAda\t\t2\nTuring\tAlan\t\t3');
  assert.deepEqual(readClassLines(rowsText(read.rows), []).lines.map(({ name, section }) => [name, section]), [['Ada Lovelace', 'Period 2'], ['Alan Turing', 'Period 3']]);
  const other = await sheetRows(zip(BOOK), 1);
  assert.deepEqual([other.sheet, other.index, other.rows], ['Notes', 1, []], 'another sheet, by its place');
  assert.equal((await sheetRows(zip(BOOK), 7)).index, 0, 'a place past the last is the first');
});

test('what isn’t an .xlsx says what to do instead', async () => {
  const older = new Uint8Array(64);
  older.set([0xd0, 0xcf, 0x11, 0xe0]);
  assert.throws(() => zipEntries(older), /older Excel file \(\.xls\)/);
  assert.throws(() => zipEntries(new TextEncoder().encode('Name,Section\nAda,2')), /isn’t a spreadsheet this page can read/);
  await assert.rejects(sheetRows(zip({ 'word/document.xml': '<w/>' })), /holds no spreadsheet/);
});

test('cells and text, read', () => {
  assert.deepEqual(['A1', 'Z9', 'AA10', 'AB2'].map(columnOf), [0, 25, 26, 27]);
  assert.equal(xmlText('Ada &amp; Alan &lt;3 &#x4e2d;&#25991;'), 'Ada & Alan <3 中文');
  assert.equal(new Function(`${SHEETS_SCRIPT}; return typeof sheetRows;`)(), 'function');
  assert.ok(!/<\/script/i.test(SHEETS_SCRIPT));
});
