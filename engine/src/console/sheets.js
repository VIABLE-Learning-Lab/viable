/**
 * A spreadsheet opened on a page, as the rows a class list reads: an Excel file's (.xlsx) first sheet, read in the
 * browser, so the file itself goes nowhere. An .xlsx is a zip of XML parts; this reads the zip's directory, inflates
 * the parts it needs with the platform's own DecompressionStream, and takes each cell's text. No dependency.
 *
 * Exported for tests; SHEETS_SCRIPT is the same functions as source for the console's script (see asSource).
 */
import { asSource } from '../../../harness/src/ui/parts.js';

/** The zip's directory: Map(name → { method, size, local }), read from its end record. */
export function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 4 && view.getUint32(0, true) === 0xe011cfd0) throw new Error('That’s an older Excel file (.xls). Save it as .xlsx or CSV, or copy its columns and paste them.');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('That file isn’t a spreadsheet this page can read. Save it as .xlsx or CSV, or copy its columns and paste them.');
  const entries = new Map();
  const words = new TextDecoder();
  let at = view.getUint32(end + 16, true);
  for (let n = view.getUint16(end + 10, true); n > 0 && view.getUint32(at, true) === 0x02014b50; n -= 1) {
    const nameLength = view.getUint16(at + 28, true);
    entries.set(words.decode(bytes.subarray(at + 46, at + 46 + nameLength)), { method: view.getUint16(at + 10, true), size: view.getUint32(at + 20, true), local: view.getUint32(at + 42, true) });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}

/** One part of the zip as text, inflated if it was compressed. */
export async function zipText(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
  const data = bytes.subarray(start, start + entry.size);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('That spreadsheet is packed in a way this page can’t read. Save it as CSV, or copy its columns and paste them.');
  return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
}

/** XML text with its entities read. */
export function xmlText(text) {
  return String(text).replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (_all, hex, dec, named) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named.toLowerCase()]));
}

/** An attribute of one XML tag, read. */
export function xmlAttribute(tag, name) {
  const found = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return found ? xmlText(found[1]) : null;
}

/** A cell's column from its reference: B7 is 1. */
export function columnOf(reference) {
  const letters = /^[A-Z]+/i.exec(reference || '');
  if (!letters) return -1;
  let index = 0;
  for (const letter of letters[0].toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** An .xlsx file's first sheet: { rows: [[cell text]], sheet: its name, sheets: every sheet's name }. */
export async function sheetRows(bytes) {
  const entries = zipEntries(bytes);
  const read = async (name) => (entries.has(name) ? zipText(bytes, entries.get(name)) : null);
  const book = await read('xl/workbook.xml');
  if (book == null) throw new Error('That zip holds no spreadsheet. Save it as .xlsx or CSV, or copy its columns and paste them.');
  const sheets = [...book.matchAll(/<sheet\b[^>]*>/g)].map((found) => ({ name: xmlAttribute(found[0], 'name') || 'Sheet', id: xmlAttribute(found[0], 'r:id') }));
  const links = new Map([...((await read('xl/_rels/workbook.xml.rels')) || '').matchAll(/<Relationship\b[^>]*>/g)].map((found) => [xmlAttribute(found[0], 'Id'), xmlAttribute(found[0], 'Target') || '']));
  const target = (sheets[0] && links.get(sheets[0].id)) || 'worksheets/sheet1.xml';
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheet = await read(path);
  if (sheet == null) throw new Error('That spreadsheet’s first sheet couldn’t be found. Save it as CSV, or copy its columns and paste them.');
  // Shared strings: a cell of text points into this list. Rich text runs are joined; phonetic hints are left out.
  const shared = [...((await read('xl/sharedStrings.xml')) || '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((found) => [...found[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => xmlText(part[1])).join(''));
  const rows = [];
  // A row may close itself, empty, as one only formatted does.
  for (const row of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = [];
    let next = 0;
    for (const cell of (row[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c ${cell[1]}>`;
      const at = columnOf(xmlAttribute(tag, 'r'));
      const column = at >= 0 ? at : next;
      next = column + 1;
      const kind = xmlAttribute(tag, 't');
      const inner = cell[2] || '';
      const value = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
      let text = '';
      if (kind === 's') text = shared[Number(value)] ?? '';
      else if (kind === 'inlineStr') text = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => xmlText(part[1])).join('');
      else if (kind === 'b') text = value === '1' ? 'TRUE' : 'FALSE';
      else if (value != null) text = xmlText(value);
      while (cells.length < column) cells.push('');
      cells[column] = text;
    }
    if (cells.some((text) => String(text).trim())) rows.push(cells);
  }
  return { rows, sheet: sheets[0]?.name || 'Sheet1', sheets: sheets.map((item) => item.name) };
}

/** Rows as a spreadsheet copies them: a tab between cells, a line for each row. */
export function rowsText(rows) {
  return rows.map((cells) => cells.map((text) => String(text ?? '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t').replace(/\t+$/, '')).join('\n');
}

export const SHEETS_SCRIPT = asSource({}, [zipEntries, zipText, xmlText, xmlAttribute, columnOf, sheetRows, rowsText]).replace(/^export /gm, '').replace(/<\//g, '<\\/');
