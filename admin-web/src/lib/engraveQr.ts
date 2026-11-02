/* ------------------------------------------------------------------
   Clamp QR files for LASER ENGRAVING (IT Admin → QR Management)

   One SVG per clamp, drawn at the real tag size (TAG_SIZE_IN, 3.9 in
   square), in millimetres:
     - the QR (same link as Print QR) with its 4-module quiet zone
     - the clamp number underneath
   Everything is plain black filled shapes: no <text> (fonts don't survive
   engraving software), no transforms, no white background (it could be
   engraved too). Black = engrave.

   Several clamps → one ZIP (zipFiles below, no extra library).
------------------------------------------------------------------ */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

/** Size of the metal tag (square), in inches. */
export const TAG_SIZE_IN = 3.9;

const MM_PER_IN = 25.4;
const QUIET_ZONE = 4; // modules of white around the QR (QR standard)

const n = (v: number) => Number(v.toFixed(3)).toString();

/** Rows of the QR as runs of dark modules: [x, y, width] in modules. */
function qrRuns(value: string): { size: number; runs: [number, number, number][] } {
  const markup = renderToStaticMarkup(
    createElement(QRCodeSVG, { value, level: "H", marginSize: 0 })
  );
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(markup)?.[1]);
  const dark = /<path fill="#000000" d="([^"]+)"/.exec(markup)?.[1] ?? "";
  const runs: [number, number, number][] = [];
  for (const m of dark.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1H\d+z/g)) {
    runs.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  if (!size || runs.length === 0) throw new Error("Couldn't build the QR code.");
  return { size, runs };
}

// 5×7 block letters for clamp numbers (A–Z, 0–9, "-").
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};

/** The clamp number as filled shapes, centred on centerX, top at y. */
function labelPath(label: string, centerX: number, y: number, height: number, maxWidth: number): string {
  const chars = [...label.toUpperCase()].filter((c) => GLYPHS[c]);
  if (chars.length === 0) return "";
  let cell = height / 7;
  const cols = chars.length * 6 - 1; // 5 wide + 1 space
  if (cols * cell > maxWidth) cell = maxWidth / cols;
  const left = centerX - (cols * cell) / 2;
  const top = y + (height - 7 * cell) / 2;

  let d = "";
  chars.forEach((c, i) => {
    GLYPHS[c].forEach((row, r) => {
      // Join neighbouring squares in a row into one bar.
      for (const m of row.matchAll(/1+/g)) {
        const x = left + (i * 6 + (m.index ?? 0)) * cell;
        d += `M${n(x)},${n(top + r * cell)}h${n(m[0].length * cell)}v${n(cell)}h${n(-m[0].length * cell)}z`;
      }
    });
  });
  return d;
}

/** SVG for one clamp tag, at the real size. */
export function engravingSvg(clampId: string, url: string, sizeIn = TAG_SIZE_IN): string {
  const S = sizeIn * MM_PER_IN; // tag side, mm
  const labelH = S * 0.09; // clamp number height (~9 mm on a 3.9" tag)
  const qrBlock = S * 0.85; // QR + quiet zone
  const { size, runs } = qrRuns(url);
  const mod = qrBlock / (size + QUIET_ZONE * 2);
  const ox = (S - qrBlock) / 2 + QUIET_ZONE * mod;
  const oy = QUIET_ZONE * mod;

  let qr = "";
  for (const [x, y, w] of runs) {
    qr += `M${n(ox + x * mod)},${n(oy + y * mod)}h${n(w * mod)}v${n(mod)}h${n(-w * mod)}z`;
  }
  const label = labelPath(clampId, S / 2, qrBlock + S * 0.01, labelH, S * 0.85);

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(S)}mm" height="${n(S)}mm" viewBox="0 0 ${n(S)} ${n(S)}">`,
    `  <title>MTPB clamp ${clampId}: QR tag ${sizeIn} in (${n(S)} mm). Black = engrave.</title>`,
    `  <path id="qr" fill="#000000" d="${qr}"/>`,
    label ? `  <path id="clamp-number" fill="#000000" d="${label}"/>` : "",
    `</svg>`,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Safe file name for a clamp: "A-20" → "A-20.svg". */
export const svgFileName = (clampId: string) =>
  `${clampId.toUpperCase().replace(/[^A-Z0-9-]/g, "_") || "clamp"}.svg`;

/* --------------------------- ZIP (stored) --------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Plain ZIP (no compression) of text files. */
export function zipFiles(files: { name: string; text: string }[]): Blob {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.name);
    const data = enc.encode(file.text);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, dosTime, true);
    dir.setUint16(14, dosDate, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: "application/zip",
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Notes for the engraving shop, put inside the ZIP. */
export function engravingReadme(clampIds: string[], sizeIn = TAG_SIZE_IN): string {
  const mm = (sizeIn * MM_PER_IN).toFixed(1);
  return [
    "MTPB clamp QR tags - laser engraving files",
    "",
    `Size: each SVG is the full tag, ${sizeIn} x ${sizeIn} in (${mm} x ${mm} mm). Import at 100% - do not resize.`,
    "Black = engrave. White/empty = leave as is. The empty border around the QR is required (quiet zone).",
    "If the laser makes LIGHT marks on this metal, invert the QR (engrave the white areas) - ask MTPB first.",
    "The clamp number under each QR is already shapes (no font needed).",
    "Please engrave ONE sample first so MTPB can test-scan it.",
    "",
    `Files (${clampIds.length}):`,
    ...clampIds.map((id) => `  ${svgFileName(id)}  ->  clamp ${id}`),
    "",
  ].join("\r\n");
}
