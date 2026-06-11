// Generates the PWA icons in public/ — a baseball on the app's navy background.
// No image dependencies: pixels are drawn directly and encoded as PNG via node:zlib.
// Run with: npm run icons

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// ---- PNG encoding ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- drawing ----
const NAVY = [27, 42, 65]; // #1B2A41
const WHITE = [250, 250, 247]; // #FAFAF7
const RED = [214, 69, 69]; // #D64545

// Color at a point in unit space (0..1). ballR shrinks for the maskable
// icon so the art stays inside the safe zone.
function colorAt(x, y, ballR) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const d = Math.hypot(dx, dy);
  if (d > ballR) return NAVY;
  // Two seam arcs: circles offset left/right of the ball.
  const seamR = ballR * 1.08;
  const seamW = ballR * 0.045;
  for (const sx of [0.5 - ballR * 1.6, 0.5 + ballR * 1.6]) {
    const sd = Math.hypot(x - sx, dy);
    if (Math.abs(sd - seamR) < seamW && d < ballR * 0.96) return RED;
  }
  return WHITE;
}

function drawIcon(size, ballR) {
  const SS = 4; // supersampling factor for smooth edges
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, ballR);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (y * size + x) * 4;
      rgba[i] = r / (SS * SS);
      rgba[i + 1] = g / (SS * SS);
      rgba[i + 2] = b / (SS * SS);
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, rgba);
}

mkdirSync(OUT, { recursive: true });
const files = {
  "icon-192.png": drawIcon(192, 0.36),
  "icon-512.png": drawIcon(512, 0.36),
  "icon-512-maskable.png": drawIcon(512, 0.3),
  "apple-touch-icon.png": drawIcon(180, 0.36),
};
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(OUT, name), buf);
  console.log(`wrote public/${name} (${buf.length} bytes)`);
}
