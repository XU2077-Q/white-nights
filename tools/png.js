/* ============================================================
   零依赖 PNG 写入器

   本机没有 ImageMagick / rsvg-convert / cairosvg（`convert` 是 Windows 自带的
   分区转换工具，不是 ImageMagick），所以 PNG 只能自己写。好在不难：
   PNG = 签名 + IHDR + IDAT(zlib 压过的扫描线) + IEND，Node 内建 zlib 就够。

   用法：
       const { writePNG, Canvas } = require("./png.js");
       const c = new Canvas(1280, 720);
       c.fill(...); c.over(...);
       writePNG("out.png", c);

   只有 RGBA8、无隔行、滤镜全 0 —— 够用且实现最短。
   ============================================================ */
"use strict";

const zlib = require("zlib");
const fs = require("fs");

/* ---------------------- CRC32 ---------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function writePNG(path, canvas) {
  const { width: w, height: h, data: rgba } = canvas;

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // 位深
  ihdr[9] = 6;   // 颜色类型 6 = RGBA
  ihdr[10] = 0;  // 压缩方法
  ihdr[11] = 0;  // 滤镜方法
  ihdr[12] = 0;  // 非隔行

  // 每条扫描线前面加一个滤镜字节。全 0（None）最简单；
  // 渐变图用 Sub/Up 会更小，但先不折腾。
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * stride, (y + 1) * stride);
  }

  // level 6：宽底图 5184×720 在 level 9 下 deflate 要好几分钟，
  // level 6 对这种近邻放大、大片平色的像素图体积几乎一样（~1% 内），快一大截。
  const idat = zlib.deflateSync(raw, { level: 6 });

  fs.writeFileSync(path, Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

/* ---------------------- 画布 ---------------------- */

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4); // 全透明
  }

  /** 铺满一个不透明底色 */
  fill(r, g, b, a = 1) {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a * 255;
    }
    return this;
  }

  /**
   * source-over 混合一个像素。颜色按 0-255，alpha 按 0-1。
   * 每像素调一次，热点；所以不做参数校验。
   */
  blend(x, y, r, g, b, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (a > 1) a = 1;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) { d[i + 3] = 0; return; }
    d[i]     = (r * a + d[i]     * da * (1 - a)) / oa;
    d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }

  /**
   * CSS 风格径向渐变，对应
   *     radial-gradient(ellipse at CX CY, rgba(...) A0, rgba(...) A1 T1)
   *
   * 距离按「到最远角的距离」归一化（CSS 的 farthest-corner）：
   * t=0 在圆心，t=1 在最远角。alpha 从 a0（t=t0）线性走到 a1（t=t1），
   * 区间外按端点值截断 —— 这样既能画中心亮斑（a1=0），
   * 也能画暗角（a0=0，从 t0 起才渐渐压暗）。
   */
  radialGrad(cx, cy, r, g, b, a0, a1, t0, t1) {
    const W = this.width, H = this.height;
    const px = cx * W, py = cy * H;

    // farthest-corner：椭圆两半轴取到最远角的水平/垂直距离
    const rx = Math.max(px, W - px);
    const ry = Math.max(py, H - py);
    const span = (t1 - t0) || 1e-9;

    for (let y = 0; y < H; y++) {
      const ny = (y + 0.5 - py) / ry;
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5 - px) / rx;
        const t = Math.sqrt(nx * nx + ny * ny);
        let a;
        if (t <= t0) a = a0;
        else if (t >= t1) a = a1;
        else a = a0 + (a1 - a0) * ((t - t0) / span);
        if (a > 0) this.blend(x, y, r, g, b, a);
      }
    }
    return this;
  }

  /**
   * repeating-linear-gradient：每 period 像素里前 on 像素着色。
   * dir = "h" 画横线（0deg），"v" 画竖线（90deg）。
   */
  lines(dir, period, on, r, g, b, a) {
    const W = this.width, H = this.height;
    for (let y = 0; y < H; y++) {
      const isOnRow = dir === "h" && (y % period) < on;
      for (let x = 0; x < W; x++) {
        const isOn = dir === "h" ? isOnRow : (x % period) < on;
        if (isOn) this.blend(x, y, r, g, b, a);
      }
    }
    return this;
  }

  /** 整幅矩形，坐标按像素 */
  rect(x0, y0, x1, y1, r, g, b, a) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.height, y1 | 0); y++) {
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.width, x1 | 0); x++) {
        this.blend(x, y, r, g, b, a);
      }
    }
    return this;
  }
}

module.exports = { writePNG, Canvas, clamp01 };
