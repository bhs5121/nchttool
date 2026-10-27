/* NDS Cheat CRC — MIT License. See LICENSE. */
(function (root) {
  'use strict';
  const MAX_CHEAT_SIZE = 64 * 1024 * 1024;
  const MAGIC = 'R4 CheatCode';
  const table = Uint32Array.from({ length: 256 }, (_, i) => {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xEDB88320 : 0);
    return value >>> 0;
  });
  const hex = n => (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const bytesOf = value => value instanceof Uint8Array ? value : new Uint8Array(value);
  const ascii = bytes => Array.from(bytes, b => String.fromCharCode(b)).join('');
  const fail = message => { throw new Error(message); };
  function jamcrc(input) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytesOf(input)) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xFF];
    return crc >>> 0;
  }
  function readRom(input, fileSize) {
    const bytes = bytesOf(input);
    if (bytes.length < 512 || (fileSize !== undefined && fileSize < 512)) fail('NDS 헤더를 읽을 수 없습니다. 512바이트 이상의 .nds 파일을 선택하세요.');
    const code = ascii(bytes.subarray(12, 16));
    if (!/^[A-Z0-9]{4}$/.test(code)) fail('올바른 NDS 게임 코드를 찾지 못했습니다. 압축을 푼 .nds 파일인지 확인하세요.');
    const crc = jamcrc(bytes.subarray(0, 512));
    const title = ascii(bytes.subarray(0, 12)).replace(/\0.*$/, '').trim();
    return { code, crc, crcHex: hex(crc), id: `${code} ${hex(crc)}`, title };
  }
  function decodeXml(bytes) {
    let encoding = 'utf-8', bom = 0;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) bom = 3;
    else if (bytes[0] === 0xFF && bytes[1] === 0xFE) { encoding = 'utf-16le'; bom = 2; }
    else if (bytes[0] === 0xFE && bytes[1] === 0xFF) { encoding = 'utf-16be'; bom = 2; }
    else if (bytes[0] === 0x3C && bytes[1] === 0) encoding = 'utf-16le';
    else if (bytes[0] === 0 && bytes[1] === 0x3C) encoding = 'utf-16be';
    let text;
    try { text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(bom)); }
    catch (_) { fail('XML 문자 인코딩을 읽지 못했습니다. UTF-8 또는 UTF-16 XML 파일을 사용하세요.'); }
    const declaration = text.match(/^\s*<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)['"]/i);
    if (declaration) {
      const declared = declaration[1].toLowerCase();
      const allowed = encoding === 'utf-8' ? ['utf-8', 'utf8', 'us-ascii'] : ['utf-16', encoding];
      if (!allowed.includes(declared)) fail('UTF-8·UTF-16 XML만 지원합니다. XML을 UTF-8로 저장한 뒤 다시 선택하세요.');
    }
    return { text, encoding, bom };
  }
  function encodeXml(text, encoding, bom) {
    let body;
    if (encoding === 'utf-8') body = new TextEncoder().encode(text);
    else {
      body = new Uint8Array(text.length * 2);
      const view = new DataView(body.buffer);
      for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), encoding === 'utf-16le');
    }
    if (!bom) return body;
    const prefix = encoding === 'utf-8' ? [0xEF, 0xBB, 0xBF] : encoding === 'utf-16le' ? [0xFF, 0xFE] : [0xFE, 0xFF];
    const output = new Uint8Array(prefix.length + body.length);
    output.set(prefix); output.set(body, prefix.length);
    return output;
  }
  function unescapeXml(text) {
    return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity) => {
      if (entity[0] === '#') {
        const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        if (!Number.isFinite(point) || point > 0x10FFFF || point === 0) fail('XML의 문자 참조가 올바르지 않습니다.');
        return String.fromCodePoint(point);
      }
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity] ?? whole;
    });
  }
  function scalar(text) {
    return unescapeXml(text.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
  }
  function parseXml(bytes) {
    const decoded = decodeXml(bytes), text = decoded.text;
    // DTDs are unnecessary for cheat lists; reject them before invoking any XML parser.
    if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(text)) fail('외부 엔티티·DTD가 포함된 XML은 지원하지 않습니다. 일반 치트 XML을 사용하세요.');
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) fail('XML 문법이 올바르지 않습니다. 원본 치트 파일을 다시 확인하세요.');
    }
    const entries = [], stack = [];
    let pos = 0, rootCount = 0;
    while (pos < text.length) {
      const start = text.indexOf('<', pos);
      if (start < 0) { if (!stack.length && text.slice(pos).trim()) fail('XML 끝부분이 올바르지 않습니다.'); break; }
      if (!stack.length && text.slice(pos, start).trim()) fail('XML의 최상위 형식이 올바르지 않습니다.');
      if (text.startsWith('<!--', start)) {
        const end = text.indexOf('-->', start + 4); if (end < 0) fail('XML 주석이 닫히지 않았습니다.'); pos = end + 3; continue;
      }
      if (text.startsWith('<![CDATA[', start)) {
        const end = text.indexOf(']]>', start + 9); if (end < 0 || !stack.length) fail('XML CDATA 형식이 올바르지 않습니다.'); pos = end + 3; continue;
      }
      if (text.startsWith('<?', start)) {
        const end = text.indexOf('?>', start + 2); if (end < 0) fail('XML 선언이 닫히지 않았습니다.'); pos = end + 2; continue;
      }
      let end = start + 1, quote = '';
      for (; end < text.length; end++) {
        const ch = text[end];
        if (quote) { if (ch === quote) quote = ''; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (end >= text.length) fail('XML 태그가 닫히지 않았습니다.');
      const token = text.slice(start, end + 1);
      const closing = token.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/);
      if (closing) {
        const frame = stack.pop();
        if (!frame || frame.name !== closing[1]) fail('XML 여는 태그와 닫는 태그가 일치하지 않습니다.');
        if (frame.field) {
          const value = scalar(text.slice(frame.contentStart, start));
          if (frame.field === 'gameid') {
            if (frame.entry.id) fail('한 게임에 gameid가 여러 개 있습니다.');
            const match = value.match(/^([A-Za-z0-9]{4})\s+([\da-fA-F]{1,8})$/);
            if (!match) fail('XML의 gameid 형식이 올바르지 않습니다. 예: IPGK 9659131A');
            Object.assign(frame.entry, { code: match[1].toUpperCase(), crc: parseInt(match[2], 16) >>> 0,
              crcHex: hex(parseInt(match[2], 16)), id: `${match[1].toUpperCase()} ${hex(parseInt(match[2], 16))}`,
              idStart: frame.contentStart, idEnd: start });
          } else frame.entry.name = value;
        }
      } else {
        const opening = token.match(/^<([A-Za-z_][\w:.-]*)(?=[\s/>])/);
        if (!opening) fail('지원하지 않거나 손상된 XML 태그가 있습니다.');
        const name = opening[1], parent = stack[stack.length - 1];
        if (parent?.field) fail('게임 이름이나 gameid 안에 중첩된 XML 태그가 있습니다.');
        if (!parent && (++rootCount !== 1 || name !== 'codelist')) fail('codelist 형식의 치트 XML을 선택하세요.');
        let entry = parent?.entry;
        if (name === 'game' && parent?.name === 'codelist') {
          entry = { index: entries.length, name: '', cheatCount: 0 }; entries.push(entry);
        }
        if (name === 'cheat' && entry) entry.cheatCount++;
        const field = parent?.name === 'game' && entry && (name === 'gameid' || name === 'name') ? name : null;
        if (/\/\s*>$/.test(token)) { if (field === 'gameid') fail('비어 있는 gameid가 있습니다.'); }
        else stack.push({ name, contentStart: end + 1, entry, field });
      }
      pos = end + 1;
    }
    if (stack.length || rootCount !== 1) fail('XML 구조가 완성되지 않았습니다.');
    if (!entries.length) fail('XML에서 게임 항목을 찾지 못했습니다.');
    for (const entry of entries) {
      if (!entry.id) fail(`XML의 ${entry.index + 1}번째 게임에 gameid가 없습니다.`);
      entry.name ||= entry.code;
    }
    return { format: 'xml', bytes, ...decoded, entries };
  }
  function parseDat(bytes) {
    if (bytes.length < 0x110 || ascii(bytes.subarray(0, 12)) !== MAGIC)
      fail('지원하는 DAT 형식이 아닙니다. 암호화되지 않은 R4 usrcheat.dat 파일을 선택하세요.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries = [];
    let indexEnd = 0x100, firstOffset = bytes.length, terminated = false;
    for (let offset = 0x100; offset + 16 <= bytes.length && offset + 16 <= firstOffset; offset += 16) {
      const pointer = view.getUint32(offset + 8, true) + view.getUint32(offset + 12, true) * 0x100000000;
      indexEnd = offset + 16;
      if (!pointer) { terminated = true; break; }
      if (!Number.isSafeInteger(pointer) || pointer >= bytes.length || pointer < 0x110)
        fail('DAT 게임 데이터 위치가 올바르지 않습니다. 손상된 파일인지 확인하세요.');
      const code = ascii(bytes.subarray(offset, offset + 4));
      if (!/^[A-Z0-9]{4}$/.test(code)) fail('DAT 게임 인덱스에 잘못된 게임 코드가 있습니다.');
      const crc = view.getUint32(offset + 4, true);
      if (entries.length && pointer <= entries[entries.length - 1].dataOffset)
        fail('DAT 게임 데이터의 순서가 올바르지 않습니다.');
      entries.push({ index: entries.length, indexOffset: offset, dataOffset: pointer, code, crc, crcHex: hex(crc), id: `${code} ${hex(crc)}` });
      firstOffset = Math.min(firstOffset, pointer);
    }
    if (!terminated || !entries.length || firstOffset < indexEnd) fail('DAT 게임 인덱스가 비어 있거나 손상되었습니다.');
    const decoder = new TextDecoder('utf-8');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i], limit = entries[i + 1]?.dataOffset ?? bytes.length;
      let end = entry.dataOffset;
      while (end < Math.min(limit, entry.dataOffset + 4096) && bytes[end] !== 0) end++;
      if (end >= limit || bytes[end] !== 0) fail('DAT 게임 이름의 끝을 찾지 못했습니다.');
      entry.name = decoder.decode(bytes.subarray(entry.dataOffset, end)).trim() || entry.code;
      const meta = (end + 4) & ~3;
      if (meta + 36 > limit) fail('DAT 게임 데이터가 잘렸습니다.');
      entry.itemCount = view.getUint32(meta, true) & 0x0FFFFFFF;
    }
    return { format: 'dat', bytes, entries };
  }
  function parseDatabase(input, filename = '') {
    const bytes = bytesOf(input);
    if (!bytes.length) fail('빈 치트 파일입니다.');
    if (bytes.length > MAX_CHEAT_SIZE) fail('치트 파일은 최대 64MiB까지 지원합니다.');
    const extension = filename.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
    if (extension && !['xml', 'dat'].includes(extension)) fail('.dat 또는 .xml 치트 파일을 선택하세요.');
    if (ascii(bytes.subarray(0, 12)) === MAGIC) {
      if (extension === 'xml') fail('확장자는 XML이지만 내용은 DAT입니다. 올바른 파일을 선택하세요.');
      return parseDat(bytes);
    }
    if (extension === 'dat') fail('암호화되지 않은 R4 usrcheat.dat 형식만 지원합니다. 이 DAT 형식은 읽을 수 없습니다.');
    return parseXml(bytes);
  }
  function chooseEntry(database, rom) {
    const exact = database.entries.filter(e => e.id === rom.id);
    if (exact.length === 1) return exact[0].index;
    const sameCode = database.entries.filter(e => e.code === rom.code);
    if (sameCode.length === 1) return sameCode[0].index;
    return null;
  }
  function retarget(database, index, rom) {
    const entry = database.entries[index];
    if (!entry || entry.index !== index) fail('변환할 게임 항목을 먼저 선택하세요.');
    if (database.entries.some(other => other.index !== index && other.id === rom.id))
      fail('같은 식별값의 게임이 이미 있습니다. 해당 게임 항목을 선택하세요. 중복 항목은 만들지 않습니다.');
    let output;
    const changed = entry.id !== rom.id;
    if (!changed) output = new Uint8Array(database.bytes);
    else if (database.format === 'dat') {
      output = new Uint8Array(database.bytes);
      output.set(new TextEncoder().encode(rom.code), entry.indexOffset);
      new DataView(output.buffer).setUint32(entry.indexOffset + 4, rom.crc, true);
    } else {
      const original = database.text.slice(entry.idStart, entry.idEnd);
      const leading = original.match(/^\s*/)[0], trailing = original.match(/\s*$/)[0];
      const text = database.text.slice(0, entry.idStart) + leading + rom.id + trailing + database.text.slice(entry.idEnd);
      output = encodeXml(text, database.encoding, database.bom);
    }
    return { bytes: output, before: entry.id, after: rom.id, changed, name: entry.name, format: database.format };
  }
  function outputName(filename, rom, format) {
    const stem = filename.replace(/\.(xml|dat)$/i, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 150) || 'usrcheat';
    return `${stem}_${rom.code}_${rom.crcHex}.${format}`;
  }
  const api = Object.freeze({ jamcrc, hex, readRom, parseDatabase, chooseEntry, retarget, outputName, MAX_CHEAT_SIZE });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CheatCRC = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
