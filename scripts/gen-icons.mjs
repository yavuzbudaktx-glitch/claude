// One-shot PNG icon generator. No external deps.
// Produces a dark-navy square with a soft sunrise glow + a small sun disk.

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size, withSun = true, padding = 0) {
  const w = size,
    h = size;
  const cx = w / 2,
    cy = h / 2 - h * 0.04;
  const sunR = w * 0.18;
  const glowR = w * 0.55;

  // Per-pixel raw RGBA, with a leading filter byte per row.
  const row = w * 4 + 1;
  const raw = Buffer.alloc(row * h);

  for (let y = 0; y < h; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const i = y * row + 1 + x * 4;
      // Background: deep navy with subtle vertical gradient.
      const t = y / h;
      let r = Math.round(11 + t * 8);
      let g = Math.round(16 + t * 10);
      let b = Math.round(32 + t * 18);
      let a = 255;

      // Maskable padding: keep central 80% safe. For maskable we extend bg fully.
      // Soft sunrise glow.
      if (withSun) {
        const dx = x - cx,
          dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);

        const glow = Math.max(0, 1 - d / glowR);
        const glowT = Math.pow(glow, 2.2);
        r = Math.min(255, r + Math.round(glowT * 90));
        g = Math.min(255, g + Math.round(glowT * 60));
        b = Math.min(255, b + Math.round(glowT * 140));

        if (d < sunR) {
          // Sun disk: warm gradient.
          const k = d / sunR;
          r = Math.round(255 - k * 30);
          g = Math.round(210 - k * 40);
          b = Math.round(120 - k * 30);
        } else if (d < sunR + 2) {
          // Edge softening
          const k = (d - sunR) / 2;
          r = Math.round((1 - k) * 240 + k * r);
          g = Math.round((1 - k) * 190 + k * g);
          b = Math.round((1 - k) * 110 + k * b);
        }
      }

      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", makePng(192));
writeFileSync("public/icons/icon-512.png", makePng(512));
writeFileSync("public/icons/apple-touch-icon.png", makePng(180));
writeFileSync("public/icons/maskable-512.png", makePng(512));
writeFileSync("public/favicon.ico", makePng(32)); // simple PNG; browsers accept it as favicon
console.log("icons generated");
