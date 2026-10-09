import { deflateSync } from "node:zlib";
import type { Raster } from "../src/game/raster";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encode a raster as PNG, nearest-neighbor scaled. */
export function toPNG(r: Raster, scale = 1, bg?: [number, number, number]): Buffer {
  const W = r.w * scale, H = r.h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const i = (Math.floor(y / scale) * r.w + Math.floor(x / scale)) * 4;
      const o = y * (W * 4 + 1) + 1 + x * 4;
      let [cr, cg, cb, ca] = [r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]];
      if (bg) {
        const t = ca / 255;
        cr = cr * t + bg[0] * (1 - t); cg = cg * t + bg[1] * (1 - t); cb = cb * t + bg[2] * (1 - t); ca = 255;
      }
      raw[o] = cr; raw[o + 1] = cg; raw[o + 2] = cb; raw[o + 3] = ca;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
