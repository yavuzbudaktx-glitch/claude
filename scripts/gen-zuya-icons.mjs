// One-shot PNG icon generator for Zuya. No external deps — same hand-rolled
// PNG encoder as gen-icons.mjs, drawing a rose heart with a soft gold glow on
// a deep-plum ground.

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

// Implicit heart curve: (x^2 + y^2 - 1)^3 - x^2 * y^3 <= 0 (y up).
function inHeart(nx, ny) {
  const x = nx, y = -ny; // flip so the point is down
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

function makePng(size, { maskable = false } = {}) {
  const w = size, h = size;
  const row = w * 4 + 1;
  const raw = Buffer.alloc(row * h);
  const cx = w / 2;
  const cy = h / 2;
  // Heart occupies less of the tile on maskable icons (safe zone).
  const scale = (maskable ? 0.30 : 0.36) * size;

  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * row + 1 + x * 4;

      // Ground: deep plum with a subtle vertical lift.
      const t = y / h;
      let r = Math.round(48 + t * 14);
      let g = Math.round(18 + t * 8);
      let b = Math.round(38 + t * 14);

      // Soft gold-rose glow behind the heart.
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const glow = Math.max(0, 1 - d / (size * 0.55));
      const glowT = Math.pow(glow, 2.4);
      r = Math.min(255, r + Math.round(glowT * 120));
      g = Math.min(255, g + Math.round(glowT * 42));
      b = Math.min(255, b + Math.round(glowT * 60));

      // The heart itself — supersample 2x2 for smooth edges.
      let hit = 0;
      for (const [ox, oy] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const nx = (x + ox - cx) / scale;
        const ny = (y + oy - (cy - size * 0.02)) / scale;
        if (inHeart(nx * 1.15, ny * 1.15)) hit++;
      }
      if (hit > 0) {
        const k = hit / 4;
        // Rose gradient: brighter toward the top-left lobe.
        const lx = (x - cx) / scale, ly = (y - cy) / scale;
        const light = Math.max(0, 1 - (lx * lx + (ly + 0.4) * (ly + 0.4)) * 0.5);
        const hr = Math.round(214 + light * 34);
        const hg = Math.round(62 + light * 52);
        const hb = Math.round(106 + light * 44);
        r = Math.round(hr * k + r * (1 - k));
        g = Math.round(hg * k + g * (1 - k));
        b = Math.round(hb * k + b * (1 - k));
      }

      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/zuya-192.png", makePng(192));
writeFileSync("public/icons/zuya-512.png", makePng(512));
writeFileSync("public/icons/zuya-apple-touch.png", makePng(180));
writeFileSync("public/icons/zuya-maskable-512.png", makePng(512, { maskable: true }));
console.log("zuya icons generated");
