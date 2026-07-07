// One-shot PNG icon generator for Zuya — an original lighthouse mark on a
// deep-plum ground with a warm beam glow. No external deps (hand-rolled PNG).

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

const lerp = (a, b, t) => a + (b - a) * t;

function makePng(size, { maskable = false } = {}) {
  const w = size, h = size;
  const row = w * 4 + 1;
  const raw = Buffer.alloc(row * h);

  // Lighthouse geometry, normalized. Tighter for maskable (safe zone).
  const s = maskable ? 0.86 : 1;
  const cx = 0.5;
  const towerTop = 0.5 - 0.16 * s;
  const towerBot = 0.5 + 0.30 * s;
  const halfTop = 0.075 * s;
  const halfBot = 0.125 * s;
  const lanternTop = towerTop - 0.10 * s;
  const lanternHalf = 0.088 * s;
  const roofTop = lanternTop - 0.055 * s;
  const baseTop = towerBot - 0.02;
  const baseBot = towerBot + 0.055 * s;
  const baseHalf = 0.17 * s;
  const lightY = lanternTop + 0.05 * s;

  const WHITE = [244, 240, 244];
  const ROSE = [214, 69, 112];
  const GOLD = [230, 176, 74];

  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * row + 1 + x * 4;
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;

      // Ground: deep plum with a subtle vertical lift.
      let r = Math.round(48 + ny * 14);
      let g = Math.round(18 + ny * 8);
      let b = Math.round(38 + ny * 14);

      // Warm beam glow from the lantern.
      const dx = nx - cx, dy = ny - lightY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const glow = Math.max(0, 1 - d / (0.5 * s));
      const gt = Math.pow(glow, 2.6);
      r = Math.min(255, r + Math.round(gt * 150));
      g = Math.min(255, g + Math.round(gt * 70));
      b = Math.min(255, b + Math.round(gt * 40));

      let col = null;

      // Base slab.
      if (ny >= baseTop && ny <= baseBot && Math.abs(nx - cx) <= baseHalf) col = WHITE;

      // Tower (tapered), with rose stripes.
      if (ny >= towerTop && ny <= towerBot) {
        const t = (ny - towerTop) / (towerBot - towerTop);
        const half = lerp(halfTop, halfBot, t);
        if (Math.abs(nx - cx) <= half) {
          const band = Math.floor(t * 5) % 2;
          col = band === 0 ? WHITE : ROSE;
        }
      }

      // Gallery deck just under the lantern.
      if (ny >= towerTop - 0.02 * s && ny <= towerTop && Math.abs(nx - cx) <= lanternHalf) col = WHITE;

      // Lantern room (gold), with the light.
      if (ny >= lanternTop && ny <= towerTop - 0.02 * s && Math.abs(nx - cx) <= lanternHalf * 0.8) {
        col = d < 0.045 * s ? [255, 235, 180] : GOLD;
      }

      // Roof.
      if (ny >= roofTop && ny < lanternTop) {
        const rt = (ny - roofTop) / (lanternTop - roofTop);
        if (Math.abs(nx - cx) <= lanternHalf * 0.8 * rt) col = ROSE;
      }

      if (col) {
        r = col[0]; g = col[1]; b = col[2];
      }

      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/zuya-192.png", makePng(192));
writeFileSync("public/icons/zuya-512.png", makePng(512));
writeFileSync("public/icons/zuya-apple-touch.png", makePng(180));
writeFileSync("public/icons/zuya-maskable-512.png", makePng(512, { maskable: true }));
console.log("zuya lighthouse icons generated");
