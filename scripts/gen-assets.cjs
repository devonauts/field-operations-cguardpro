/* Generate branded app assets (no native image tools needed): a gold shield +
 * check on a dark navy background. Outputs assets/icon.png, splash.png, splash-dark.png
 * for @capacitor/assets to slice into all Android/iOS sizes. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const NAVY = [10, 14, 22, 255];      // #0A0E16
const GOLD = [212, 160, 23, 255];    // #D4A017

// --- minimal PNG encoder (8-bit RGBA) ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// shield polygon + checkmark, normalized to the image; `scale` controls mark size
function draw(size, scale) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) buf.set(NAVY, i * 4);
  const cx = 0.5, cy = 0.5;
  // shield outline points (normalized), scaled around center
  const pts = [
    [0.30, 0.28], [0.70, 0.28], [0.70, 0.50],
    [0.62, 0.66], [0.50, 0.76], [0.38, 0.66], [0.30, 0.50],
  ].map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]);

  const inPoly = (px, py) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // checkmark segments (navy on gold)
  const segs = [[[0.43, 0.50], [0.48, 0.58]], [[0.48, 0.58], [0.60, 0.42]]]
    .map((s) => s.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]));
  const strokeW = 0.022 * scale;
  const distToSeg = (px, py, [[ax, ay], [bx, by]]) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx, qy = ay + t * dy;
    return Math.hypot(px - qx, py - qy);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      if (inPoly(nx, ny)) {
        const onCheck = segs.some((s) => distToSeg(nx, ny, s) < strokeW);
        buf.set(onCheck ? NAVY : GOLD, (y * size + x) * 4);
      }
    }
  }
  return buf;
}

const outDir = path.resolve(__dirname, "..", "assets");
fs.mkdirSync(outDir, { recursive: true });

const icon = encodePng(1024, 1024, draw(1024, 1.0));
fs.writeFileSync(path.join(outDir, "icon.png"), icon);
fs.writeFileSync(path.join(outDir, "icon-foreground.png"), encodePng(1024, 1024, draw(1024, 0.62)));

const splash = encodePng(2732, 2732, draw(2732, 0.34));
fs.writeFileSync(path.join(outDir, "splash.png"), splash);
fs.writeFileSync(path.join(outDir, "splash-dark.png"), splash);

console.log("✔ assets written to", outDir);
