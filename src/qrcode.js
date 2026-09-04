// ============================================================
// Minimaler, aber vollständig standardkonformer QR-Code-Encoder
// (Byte-Modus, Fehlerkorrektur-Level L/M/Q/H, automatische
// Versionswahl, Reed-Solomon-Fehlerkorrektur, Maskierung).
//
// Basiert auf dem seit vielen Jahren verbreiteten Referenz-
// Algorithmus von Kazuhiko Arase (MIT-Lizenz), hier als
// eigenständiges ES-Modul ohne Canvas-Abhängigkeit: erzeugt nur
// die Modul-Matrix (true = dunkel), das Rendering (SVG/Canvas)
// übernimmt die aufrufende Seite.
// ============================================================

const PAD0 = 0xEC, PAD1 = 0x11;

const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

function getBCHDigit(data) {
  let digit = 0;
  while (data !== 0) { digit++; data >>>= 1; }
  return digit;
}
function getBCHTypeInfo(data) {
  let d = data << 10;
  while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15)));
  return ((data << 10) | d) ^ G15_MASK;
}
function getBCHTypeNumber(data) {
  let d = data << 12;
  while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18)));
  return (data << 12) | d;
}

// ---- GF(256) tables ----
const EXP_TABLE = new Array(256);
const LOG_TABLE = new Array(256);
for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
for (let i = 8; i < 256; i++) {
  EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

class Polynomial {
  constructor(num, shift) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + (shift || 0));
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    for (let i = num.length - offset; i < this.num.length; i++) this.num[i] = 0;
  }
  get(i) { return this.num[i]; }
  get length() { return this.num.length; }
  multiply(e) {
    const num = new Array(this.length + e.length - 1).fill(0);
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < e.length; j++) {
        num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
      }
    }
    return new Polynomial(num, 0);
  }
  mod(e) {
    if (this.length - e.length < 0) return this;
    const ratio = glog(this.get(0)) - glog(e.get(0));
    const num = this.num.slice();
    for (let i = 0; i < e.length; i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new Polynomial(num, 0).mod(e);
  }
}
function glog(n) { if (n < 1) throw new Error('glog(' + n + ')'); return LOG_TABLE[n]; }
function gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n]; }

function getErrorCorrectPolynomial(errorCorrectLength) {
  let a = new Polynomial([1], 0);
  for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new Polynomial([1, gexp(i)], 0));
  return a;
}

// ---- RS block table (data codewords per block etc.) ----
// [totalCodewords, ecCodewordsPerBlock, blocks...]
// Level order per version: L, M, Q, H
const RS_BLOCK_TABLE = [
  [1,26,19],[1,26,16],[1,26,13],[1,26,9],
  [1,44,34],[1,44,28],[1,44,22],[1,44,16],
  [1,70,55],[1,70,44],[2,35,17],[2,35,13],
  [1,100,80],[2,50,32],[2,50,24],[4,25,9],
  [1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],
  [2,86,68],[4,43,27],[4,43,19],[4,43,15],
  [2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],
  [2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],
  [2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],
  [2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],
  [4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],
  [2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],
  [4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],
  [3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],
  [5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],
  [5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],
  [1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],
  [5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],
  [3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],
  [3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],
];
// This table covers versions 1-20 (enough for URLs up to ~250 bytes, which is far
// beyond anything this app needs). Version count intentionally capped below.

const EC_LEVEL_INDEX = { L: 0, M: 1, Q: 2, H: 3 };

function getRSBlocks(typeNumber, errorCorrectLevel) {
  const row = RS_BLOCK_TABLE[(typeNumber - 1) * 4 + EC_LEVEL_INDEX[errorCorrectLevel]];
  if (!row) throw new Error('bad rs block @ typeNumber:' + typeNumber);
  const list = [];
  for (let i = 0; i < row.length; i += 3) {
    const count = row[i], totalCount = row[i + 1], dataCount = row[i + 2];
    for (let j = 0; j < count; j++) list.push({ totalCount, dataCount });
  }
  return list;
}

// ---- Bit buffer ----
class BitBuffer {
  constructor() { this.buffer = []; this.length = 0; }
  get(index) { return ((this.buffer[Math.floor(index / 8)] >>> (7 - index % 8)) & 1) === 1; }
  put(num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1); }
  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  }
}

function createBytes(buffer, rsBlocks) {
  let offset = 0;
  const maxDcCount = Math.max(...rsBlocks.map(b => b.dataCount));
  const maxEcCount = Math.max(...rsBlocks.map(b => b.totalCount - b.dataCount));
  const dcdata = new Array(rsBlocks.length);
  const ecdata = new Array(rsBlocks.length);

  for (let r = 0; r < rsBlocks.length; r++) {
    const dcCount = rsBlocks[r].dataCount;
    const ecCount = rsBlocks[r].totalCount - dcCount;
    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
    offset += dcCount;
    const rsPoly = getErrorCorrectPolynomial(ecCount);
    const rawPoly = new Polynomial(dcdata[r], rsPoly.length - 1);
    const modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.length - 1);
    for (let i = 0; i < ecdata[r].length; i++) {
      const modIndex = i + modPoly.length - ecdata[r].length;
      ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
    }
  }

  const totalCodeCount = rsBlocks.reduce((a, b) => a + b.totalCount, 0);
  const data = new Array(totalCodeCount);
  let index = 0;
  for (let i = 0; i < maxDcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
  for (let i = 0; i < maxEcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
  return data;
}

function createData(typeNumber, errorCorrectLevel, bytes) {
  const rsBlocks = getRSBlocks(typeNumber, errorCorrectLevel);
  const buffer = new BitBuffer();
  buffer.put(4, 4); // byte mode
  buffer.put(bytes.length, getLengthBits(typeNumber));
  for (let i = 0; i < bytes.length; i++) buffer.put(bytes[i], 8);

  const totalDataCount = rsBlocks.reduce((a, b) => a + b.dataCount, 0);
  if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.length % 8 !== 0) buffer.putBit(false);
  while (true) {
    if (buffer.length >= totalDataCount * 8) break;
    buffer.put(PAD0, 8);
    if (buffer.length >= totalDataCount * 8) break;
    buffer.put(PAD1, 8);
  }
  return createBytes(buffer, rsBlocks);
}

function getLengthBits(typeNumber) {
  if (typeNumber <= 9) return 8;
  return 16;
}

// ---- Module matrix building ----
const PATTERN_POSITION_TABLE = [
  [],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
  [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
  [6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],
];

class QRModel {
  constructor(typeNumber, errorCorrectLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
  }
  addData(bytes) { this.dataList = bytes; this.dataCache = null; }
  isDark(row, col) {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) throw new Error(row + ',' + col);
    return this.modules[row][col];
  }
  make(test) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = Array.from({ length: this.moduleCount }, () => new Array(this.moduleCount).fill(null));
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, this.bestMask);
    if (this.typeNumber >= 7) this.setupTypeNumber(test);
    if (this.dataCache == null) this.dataCache = createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
    this.mapData(this.dataCache);
  }
  setupPositionProbePattern(row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        const dark = (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
                     (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
                     (2 <= r && r <= 4 && 2 <= c && c <= 4);
        this.modules[row + r][col + c] = dark;
      }
    }
  }
  setupPositionAdjustPattern() {
    const pos = PATTERN_POSITION_TABLE[this.typeNumber - 1] || [];
    for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
      const row = pos[i], col = pos[j];
      if (this.modules[row][col] !== null) continue;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        this.modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
      }
    }
  }
  setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) if (this.modules[r][6] === null) this.modules[r][6] = (r % 2 === 0);
    for (let c = 8; c < this.moduleCount - 8; c++) if (this.modules[6][c] === null) this.modules[6][c] = (c % 2 === 0);
  }
  setupTypeNumber(test) {
    const bits = getBCHTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
    }
    for (let i = 0; i < 18; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }
  setupTypeInfo(test, maskPattern) {
    const data = (EC_BITS[this.errorCorrectLevel] << 3) | maskPattern;
    const bits = getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;
    }
    for (let i = 0; i < 15; i++) {
      const mod = (!test && ((bits >> i) & 1) === 1);
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = !test;
  }
  mapData(data) {
    let inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
    const maskFn = MASK_FNS[this.bestMask ?? 0];
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
            const mask = maskFn(row, col - c);
            if (mask) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
      }
    }
  }
}

const EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

function penalty(modules, moduleCount) {
  let score = 0;
  // rule 1: runs
  for (let r = 0; r < moduleCount; r++) {
    let run = 1;
    for (let c = 1; c < moduleCount; c++) {
      if (modules[r][c] === modules[r][c - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let c = 0; c < moduleCount; c++) {
    let run = 1;
    for (let r = 1; r < moduleCount; r++) {
      if (modules[r][c] === modules[r - 1][c]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  // rule 2: 2x2 blocks
  for (let r = 0; r < moduleCount - 1; r++) for (let c = 0; c < moduleCount - 1; c++) {
    const v = modules[r][c];
    if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
  }
  // rule 3: finder-like patterns
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c <= moduleCount - 11; c++) {
      let m1 = true, m2 = true;
      for (let k = 0; k < 11; k++) {
        if (modules[r][c + k] !== pat1[k]) m1 = false;
        if (modules[r][c + k] !== pat2[k]) m2 = false;
      }
      if (m1 || m2) score += 40;
    }
  }
  for (let c = 0; c < moduleCount; c++) {
    for (let r = 0; r <= moduleCount - 11; r++) {
      let m1 = true, m2 = true;
      for (let k = 0; k < 11; k++) {
        if (modules[r + k][c] !== pat1[k]) m1 = false;
        if (modules[r + k][c] !== pat2[k]) m2 = false;
      }
      if (m1 || m2) score += 40;
    }
  }
  // rule 4: dark ratio
  let dark = 0;
  for (let r = 0; r < moduleCount; r++) for (let c = 0; c < moduleCount; c++) if (modules[r][c]) dark++;
  const ratio = Math.abs(100 * dark / (moduleCount * moduleCount) - 50) / 5;
  score += Math.floor(ratio) * 10;
  return score;
}

function utf8Bytes(str) {
  return Array.from(new TextEncoder().encode(str));
}

function fitsInVersion(typeNumber, errorCorrectLevel, byteLength) {
  try {
    const rsBlocks = getRSBlocks(typeNumber, errorCorrectLevel);
    const totalDataCount = rsBlocks.reduce((a, b) => a + b.dataCount, 0);
    const headerBits = 4 + getLengthBits(typeNumber);
    const neededBits = headerBits + byteLength * 8;
    return neededBits <= totalDataCount * 8;
  } catch (e) { return false; }
}

/**
 * Erzeugt eine QR-Code-Modulmatrix für den gegebenen Text.
 * @param {string} text
 * @param {'L'|'M'|'Q'|'H'} errorCorrectLevel
 * @returns {{ size: number, isDark: (r:number,c:number)=>boolean }}
 */
export function encodeQR(text, errorCorrectLevel = 'M') {
  const bytes = utf8Bytes(text);
  let typeNumber = 1;
  while (typeNumber <= 20 && !fitsInVersion(typeNumber, errorCorrectLevel, bytes.length)) typeNumber++;
  if (typeNumber > 20) throw new Error('Text zu lang für QR-Code (max. Version 20 unterstützt).');

  let bestMask = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const model = new QRModel(typeNumber, errorCorrectLevel);
    model.addData(bytes);
    model.bestMask = mask;
    model.make(true); // test pass: format info left blank, doesn't affect penalty
    const score = penalty(model.modules, model.moduleCount);
    if (score < bestScore) { bestScore = score; bestMask = mask; }
  }

  // Final pass with the chosen mask: writes the real format/version info bits.
  const final = new QRModel(typeNumber, errorCorrectLevel);
  final.addData(bytes);
  final.bestMask = bestMask;
  final.make(false);

  return {
    size: final.moduleCount,
    isDark: (r, c) => !!final.modules[r][c],
  };
}

/** Baut einen SVG-String aus einer QR-Matrix. */
export function qrToSVG(qr, { moduleSize = 6, margin = 4, dark = '#3C3C3B', light = '#ffffff' } = {}) {
  const total = qr.size + margin * 2;
  const px = total * moduleSize;
  let rects = '';
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(c + margin) * moduleSize}" y="${(r + margin) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" shape-rendering="crispEdges"><rect width="${px}" height="${px}" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`;
}

/** Zeichnet eine QR-Matrix auf ein <canvas>. */
export function qrToCanvas(qr, canvas, { moduleSize = 6, margin = 4, dark = '#3C3C3B', light = '#ffffff' } = {}) {
  const total = qr.size + margin * 2;
  const px = total * moduleSize;
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = light; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = dark;
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * moduleSize, (r + margin) * moduleSize, moduleSize, moduleSize);
    }
  }
  return canvas;
}
