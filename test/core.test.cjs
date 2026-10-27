const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const enc = text => new TextEncoder().encode(text);
const xml = (id = 'IPGK 9659131A') => `<?xml version="1.0" encoding="UTF-8"?>\r\n<codelist><name>테스트</name><game><name>소울실버 &amp; 테스트</name><gameid> ${id} </gameid><folder><name>도구</name><cheat><name>예제</name><note><![CDATA[<gameid>FAKE FFFFFFFF</gameid>]]></note><codes>02000000 00000001</codes></cheat></folder></game></codelist>`;
function romHeader(code = 'IPGK') {
  const bytes = new Uint8Array(512); bytes.set(enc('POKEMON SS')); bytes.set(enc(code), 12);
  return bytes;
}
function utf16(text, little = true, bom = true) {
  const result = new Uint8Array(text.length * 2 + (bom ? 2 : 0)), view = new DataView(result.buffer);
  if (bom) { result[0] = little ? 255 : 254; result[1] = little ? 254 : 255; }
  for (let i = 0; i < text.length; i++) view.setUint16((bom ? 2 : 0) + i * 2, text.charCodeAt(i), little);
  return result;
}
function dat(entries) {
  const records = entries.map((e, index) => {
    const title = enc(e.name || `Game ${index}`), meta = (title.length + 4) & ~3;
    const bytes = new Uint8Array(meta + 36 + 16); bytes.set(title); bytes.fill(0xA0 + index, meta + 36);
    new DataView(bytes.buffer).setUint32(meta, 0, true); return bytes;
  });
  const base = 256 + (entries.length + 1) * 16;
  const bytes = new Uint8Array(base + records.reduce((total, b) => total + b.length, 0));
  bytes.set(enc('R4 CheatCode')); let cursor = base;
  const view = new DataView(bytes.buffer);
  entries.forEach((e, i) => {
    const offset = 256 + i * 16; bytes.set(enc(e.code), offset); view.setUint32(offset + 4, e.crc, true);
    view.setUint32(offset + 8, cursor, true); bytes.set(records[i], cursor); cursor += records[i].length;
  });
  return bytes;
}
test('JAMCRC published test vector and empty input', () => {
  assert.equal(C.hex(C.jamcrc(enc('123456789'))), '340BC6D9');
  assert.equal(C.hex(C.jamcrc(new Uint8Array())), 'FFFFFFFF');
});
test('ROM identity uses only the first 512 bytes', () => {
  const header = romHeader(), full = new Uint8Array(4096); full.set(header); full.fill(0xFF, 512);
  assert.deepEqual(C.readRom(header), C.readRom(full));
  assert.equal(C.readRom(header).code, 'IPGK');
  assert.throws(() => C.readRom(new Uint8Array(511)), /512/);
  assert.throws(() => C.readRom(new Uint8Array(512)), /게임 코드/);
});
test('XML changes only selected gameid and preserves codes, comments and CRLF', () => {
  const input = xml(), bytes = enc(input), db = C.parseDatabase(bytes, 'CHEATS.XML');
  const rom = C.readRom(romHeader()), result = C.retarget(db, 0, rom);
  assert.equal(db.entries[0].name, '소울실버 & 테스트');
  assert.equal(db.entries[0].cheatCount, 1);
  assert.equal(new TextDecoder().decode(result.bytes), input.replace(' IPGK 9659131A ', ` ${rom.id} `));
  assert.deepEqual(bytes, enc(input));
});
test('XML automatic matching and ambiguous variants', () => {
  const single = C.parseDatabase(enc(xml())); const rom = C.readRom(romHeader());
  assert.equal(C.chooseEntry(single, rom), 0);
  const second = '<game><name>다른 판본</name><gameid>IPGK 11111111</gameid></game>';
  const multiple = C.parseDatabase(enc(xml().replace('</codelist>', second + '</codelist>')));
  assert.equal(C.chooseEntry(multiple, rom), null);
  assert.equal(C.chooseEntry(multiple, { code: 'IPGK', id: 'IPGK 11111111' }), 1);
});
test('exact identities do not rewrite any XML bytes', () => {
  const bytes = enc(xml('ipgk 0000abcd')), db = C.parseDatabase(bytes);
  const result = C.retarget(db, 0, { code: 'IPGK', crc: 0xABCD, id: 'IPGK 0000ABCD' });
  assert.equal(result.changed, false); assert.deepEqual(result.bytes, bytes);
});
test('UTF-8 BOM and UTF-16 LE/BE, with and without BOM', () => {
  const rom = C.readRom(romHeader());
  for (const little of [true, false]) for (const bom of [true, false]) {
    const original = xml().replace('UTF-8', 'UTF-16');
    const bytes = utf16(original, little, bom), db = C.parseDatabase(bytes);
    const patched = C.retarget(db, 0, rom).bytes;
    assert.deepEqual(patched, utf16(original.replace(' IPGK 9659131A ', ` ${rom.id} `), little, bom));
  }
  const utf8 = enc(xml()), bytes = new Uint8Array(utf8.length + 3); bytes.set([239, 187, 191]); bytes.set(utf8, 3);
  const result = C.retarget(C.parseDatabase(bytes), 0, rom).bytes;
  assert.deepEqual(Array.from(result.slice(0, 3)), [239, 187, 191]);
});
test('XML ignores fake game tags in comments and CDATA', () => {
  const input = xml().replace('<codelist>', '<codelist><!-- <game><gameid>FAKE 12345678</gameid></game> -->');
  const db = C.parseDatabase(enc(input)); assert.equal(db.entries.length, 1);
  assert.equal(db.entries[0].id, 'IPGK 9659131A');
});
test('XML handles angle brackets inside attribute values', () => {
  assert.equal(C.parseDatabase(enc(xml().replace('<codelist>', '<codelist description="a > b">'))).entries.length, 1);
});
test('XML missing identity, malformed tags, DTDs and unsupported encodings reject', () => {
  assert.throws(() => C.parseDatabase(enc(xml().replace('<gameid> IPGK 9659131A </gameid>', ''))), /gameid/);
  assert.throws(() => C.parseDatabase(enc(xml().replace('</folder>', '</other>'))), /태그/);
  assert.throws(() => C.parseDatabase(enc('<!DOCTYPE codelist []>' + xml())), /DTD/);
  assert.throws(() => C.parseDatabase(enc(xml().replace('UTF-8', 'EUC-KR'))), /UTF-8/);
  assert.throws(() => C.parseDatabase(enc('<html></html>')), /codelist/);
});
test('DAT patches only eight selected index bytes; all payloads and offsets stay intact', () => {
  const bytes = dat([{ code: 'IPGK', crc: 0x9659131A }, { code: 'IREK', crc: 0x12345678 }]);
  const original = bytes.slice(), db = C.parseDatabase(bytes, 'usrcheat.dat'), rom = C.readRom(romHeader());
  const result = C.retarget(db, 0, rom);
  assert.equal(result.bytes.length, original.length);
  for (let i = 0; i < original.length; i++) if (i < 256 || i >= 264) assert.equal(result.bytes[i], original[i]);
  const reparsed = C.parseDatabase(result.bytes, 'usrcheat.dat');
  assert.equal(reparsed.entries[0].id, rom.id); assert.deepEqual(reparsed.entries[1], db.entries[1]);
  assert.deepEqual(bytes, original);
});
test('DAT different code retarget is explicit and writes four ASCII code bytes', () => {
  const bytes = dat([{ code: 'IREK', crc: 10 }]), db = C.parseDatabase(bytes, 'usrcheat.dat'), rom = C.readRom(romHeader());
  assert.equal(C.chooseEntry(db, rom), null);
  const result = C.retarget(db, 0, rom);
  assert.equal(new TextDecoder().decode(result.bytes.subarray(256, 260)), 'IPGK');
  assert.equal(C.parseDatabase(result.bytes, 'a.dat').entries[0].id, rom.id);
});
test('Node Buffer input is never mutated by DAT retarget', () => {
  const input = Buffer.from(dat([{ code: 'IPGK', crc: 1 }])), before = Buffer.from(input);
  const rom = C.readRom(romHeader());
  const result = C.retarget(C.parseDatabase(input, 'a.dat'), 0, rom);
  assert.deepEqual(input, before); assert.notDeepEqual(Buffer.from(result.bytes), before);
});
test('DAT zero, out-of-bounds, unsorted and overlapping indices reject', () => {
  assert.throws(() => C.parseDatabase(new Uint8Array(512), 'a.dat'), /DAT/);
  const base = dat([{ code: 'IPGK', crc: 1 }, { code: 'IREK', crc: 2 }]);
  for (const value of [1, base.length + 5, 0xFFFFFFFF]) {
    const bad = base.slice(); new DataView(bad.buffer).setUint32(264, value, true);
    assert.throws(() => C.parseDatabase(bad, 'a.dat'), /DAT/);
  }
  const reversed = base.slice(); new DataView(reversed.buffer).setUint32(280, 280, true);
  assert.throws(() => C.parseDatabase(reversed, 'a.dat'), /DAT/);
});
test('destination duplicate collision is rejected', () => {
  const rom = C.readRom(romHeader());
  const bytes = dat([{ code: 'IPGK', crc: 1 }, { code: rom.code, crc: rom.crc }]);
  assert.throws(() => C.retarget(C.parseDatabase(bytes), 0, rom), /이미/);
});
test('invalid extensions, empty data and filename sanitization', () => {
  assert.throws(() => C.parseDatabase(enc(xml()), 'a.zip'), /dat/);
  assert.throws(() => C.parseDatabase(new Uint8Array()), /빈/);
  const rom = C.readRom(romHeader()); assert.equal(C.outputName('usrcheat.xml', rom, 'xml'), `usrcheat_IPGK_${rom.crcHex}.xml`);
  assert(!C.outputName('../bad:name.dat', rom, 'dat').includes('/'));
});
