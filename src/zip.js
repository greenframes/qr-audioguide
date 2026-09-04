// ============================================================
// Minimaler ZIP-Writer (nur "store", keine Kompression) für den
// "Alle QR-Codes als ZIP herunterladen"-Knopf im Admin-Bereich.
// Erzeugt ein valides PKZIP-Archiv im Browser, ganz ohne
// externe Abhängigkeit.
// ============================================================

function crc32(bytes) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() / 2) & 0x1F);
  const dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
  return { time, dosDate };
}

function writeUint16(arr, offset, val) { arr[offset] = val & 0xFF; arr[offset + 1] = (val >>> 8) & 0xFF; }
function writeUint32(arr, offset, val) { arr[offset] = val & 0xFF; arr[offset + 1] = (val >>> 8) & 0xFF; arr[offset + 2] = (val >>> 16) & 0xFF; arr[offset + 3] = (val >>> 24) & 0xFF; }

/**
 * @param {Array<{name: string, data: Uint8Array}>} files
 * @returns {Blob}
 */
export function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, dosDate } = dosDateTime(new Date());
  const encoder = new TextEncoder();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0); // store, no compression
    writeUint16(local, 10, time);
    writeUint16(local, 12, dosDate);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);

    chunks.push(local, data);

    const centralEntry = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralEntry, 0, 0x02014b50);
    writeUint16(centralEntry, 4, 20);
    writeUint16(centralEntry, 6, 20);
    writeUint16(centralEntry, 8, 0);
    writeUint16(centralEntry, 10, 0);
    writeUint16(centralEntry, 12, time);
    writeUint16(centralEntry, 14, dosDate);
    writeUint32(centralEntry, 16, crc);
    writeUint32(centralEntry, 20, data.length);
    writeUint32(centralEntry, 24, data.length);
    writeUint16(centralEntry, 28, nameBytes.length);
    writeUint16(centralEntry, 30, 0);
    writeUint16(centralEntry, 32, 0);
    writeUint16(centralEntry, 34, 0);
    writeUint16(centralEntry, 36, 0);
    writeUint32(centralEntry, 38, 0);
    writeUint32(centralEntry, 42, offset);
    centralEntry.set(nameBytes, 46);
    central.push(centralEntry);

    offset += local.length + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) { chunks.push(c); centralSize += c.length; }

  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, centralStart);
  writeUint16(end, 20, 0);
  chunks.push(end);

  return new Blob(chunks, { type: 'application/zip' });
}
