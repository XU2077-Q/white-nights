/* ============================================================
   PNG 读取器（零依赖）

   写这个是因为核对观感时靠肉眼看压缩过的截图不靠谱 —— 「这块底色到底
   从哪一行开始变」这种问题，量像素比看图准得多。

   只支持 8 位 RGB / RGBA、非隔行 —— Ren'Py 截图和 tools/png.js 产出的
   都是这两种，够用。遇到别的直接抛错，不静默返回错数据。

   用法：const { readPNG } = require("./png_read.js");
         const img = readPNG("shots/11_长引文.png");
         img.w, img.h, img.at(x, y) -> [r, g, b, a]
   ============================================================ */
"use strict";

const fs = require("fs");
const zlib = require("zlib");

function readPNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG：" + file);

  let pos = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);

    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }

  if (depth !== 8) throw new Error("只支持 8 位深，收到 " + depth);
  if (interlace !== 0) throw new Error("不支持隔行 PNG");
  const chan = ctype === 6 ? 4 : ctype === 2 ? 3 : 0;
  if (!chan) throw new Error("只支持 RGB / RGBA，收到 color type " + ctype);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chan;
  const out = Buffer.alloc(h * stride);

  // 逐行反滤波。filter 字节在每行开头，a/b/c 分别是左/上/左上邻居。
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;

    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= chan ? out[dst + i - chan] : 0;
      const b = y > 0 ? out[up + i] : 0;
      const c = (i >= chan && y > 0) ? out[up + i - chan] : 0;

      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error("未知 filter " + f + "（第 " + y + " 行）");
      out[dst + i] = v & 0xff;
    }
  }

  return {
    w, h, chan,
    at(x, y) {
      const i = y * stride + x * chan;
      return chan === 4
        ? [out[i], out[i + 1], out[i + 2], out[i + 3]]
        : [out[i], out[i + 1], out[i + 2], 255];
    },
  };
}

module.exports = { readPNG };
