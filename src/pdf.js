// ============================================================
// Minimaler PDF-Writer: eine Seite, ein Bild (JPEG), zentriert,
// mit optionaler Beschriftung. Genug für den "QR-Code als PDF"-
// Download im Admin-Bereich, ganz ohne externe Abhängigkeit.
// ============================================================

/**
 * @param {Uint8Array} jpegBytes  Rohe JPEG-Daten (z.B. via canvas.toBlob('image/jpeg'))
 * @param {number} imgWidthPx
 * @param {number} imgHeightPx
 * @param {{ label?: string }} [opts]
 * @returns {Blob}
 */
export function makeSingleImagePDF(jpegBytes, imgWidthPx, imgHeightPx, opts = {}) {
  const pageW = 283.5; // A6-artige Größe (100mm) in pt - handlich für Stationsschilder
  const pageH = 283.5;
  const margin = 28;
  const label = opts.label || '';

  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2 - (label ? 24 : 0);
  const scale = Math.min(maxW / imgWidthPx, maxH / imgHeightPx);
  const drawW = imgWidthPx * scale;
  const drawH = imgHeightPx * scale;
  const x = (pageW - drawW) / 2;
  const y = margin + (maxH - drawH) / 2;

  const enc = new TextEncoder();
  // PDF string literals for a standard font are read as Latin-1/WinAnsi bytes,
  // not UTF-8 - map code points onto single bytes so accented/·-style chars
  // (common in German station labels) render instead of turning to mojibake.
  const toLatin1Bytes = (s) => Uint8Array.from(
    Array.from(s).map(ch => { const cp = ch.codePointAt(0); return cp <= 255 ? cp : 0x3F; })
  );
  const labelEscStr = label.replace(/[\\()]/g, c => '\\' + c);
  const labelBytes = toLatin1Bytes(labelEscStr);
  const contentHead = enc.encode(
    `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n` +
    (label ? `BT /F1 11 Tf ${margin.toFixed(2)} ${(pageH - margin + 6).toFixed(2)} Td (` : '')
  );
  const contentTail = enc.encode(label ? ') Tj ET\n' : '');
  const contentParts = label ? [contentHead, labelBytes, contentTail] : [contentHead];
  const contentBytes = new Uint8Array(contentParts.reduce((n, p) => n + p.length, 0));
  { let o = 0; for (const p of contentParts) { contentBytes.set(p, o); o += p.length; } }

  const catalogIdx = 1, pagesIdx = 2, pageIdx = 3, imgIdx = 4, contentIdx = 5, fontIdx = 6;

  // Jedes Objekt wird als Liste von Byte-Chunks gebaut (Text oder rohe Bytes),
  // damit binäre JPEG-Daten sauber eingebettet werden können.
  const objects = [
    // 1: Catalog
    [enc.encode(`<< /Type /Catalog /Pages ${pagesIdx} 0 R >>`)],
    // 2: Pages
    [enc.encode(`<< /Type /Pages /Kids [${pageIdx} 0 R] /Count 1 >>`)],
    // 3: Page
    [enc.encode(
      `<< /Type /Page /Parent ${pagesIdx} 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources << /XObject << /Im0 ${imgIdx} 0 R >> /Font << /F1 ${fontIdx} 0 R >> >> ` +
      `/Contents ${contentIdx} 0 R >>`
    )],
    // 4: Image XObject (raw JPEG via DCTDecode)
    [
      enc.encode(
        `<< /Type /XObject /Subtype /Image /Width ${imgWidthPx} /Height ${imgHeightPx} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
      ),
      jpegBytes,
      enc.encode('\nendstream'),
    ],
    // 5: Content stream
    [
      enc.encode(`<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      enc.encode('\nendstream'),
    ],
    // 6: Font
    [enc.encode(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`)],
  ];

  const chunks = [];
  let len = 0;
  const push = (bytes) => { chunks.push(bytes); len += bytes.length; };

  push(enc.encode('%PDF-1.4\n'));

  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(len);
    push(enc.encode(`${i + 1} 0 obj\n`));
    for (const part of objects[i]) push(part);
    push(enc.encode('\nendobj\n'));
  }

  const xrefStart = len;
  push(enc.encode(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`));
  for (const off of offsets) push(enc.encode(String(off).padStart(10, '0') + ' 00000 n \n'));
  push(enc.encode(`trailer\n<< /Size ${offsets.length + 1} /Root ${catalogIdx} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`));

  return new Blob(chunks, { type: 'application/pdf' });
}
