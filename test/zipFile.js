// A zip as VIABLE's course page downloads a .viable.zip, for the tests: entries deflated, or stored
// with store: true.
import { crc32, deflateRawSync } from 'node:zlib';

export function zipFile(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data, store = false } of entries) {
    const bytes = Buffer.from(data);
    const packed = store ? bytes : deflateRawSync(bytes);
    const fileName = Buffer.from(name);
    const fields = (header, at) => {
      header.writeUInt16LE(store ? 0 : 8, at);
      header.writeUInt32LE(crc32(bytes), at + 6);
      header.writeUInt32LE(packed.length, at + 10);
      header.writeUInt32LE(bytes.length, at + 14);
      header.writeUInt16LE(fileName.length, at + 18);
    };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    fields(local, 8);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    fields(entry, 10);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, fileName, packed);
    central.push(entry, fileName);
    offset += local.length + fileName.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}
