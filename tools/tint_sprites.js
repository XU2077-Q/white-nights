/* ============================================================
   剪影立绘渐变上色（零依赖）

   剪影是纯黑+alpha，这里把 RGB 换成纵向渐变、alpha 原样保留：
   按每张图自身的不透明像素包围盒归一化（顶=0 → 底=1），
   顶色浅、底色深，保住夜戏氛围。

   配色改下面的 TINT 表即可（ hex，顶/底 ）。
   用法：node tools/tint_sprites.js            覆盖写 assets/sprite/*.png
         node tools/tint_sprites.js --dry     只报各图包围盒，不写
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const { readPNG } = require("./png_read.js");
const { writePNG } = require("./png.js");

const DIR = path.join(__dirname, "..", "assets", "sprite");

/* 顶色 → 底色（渐变在人物包围盒内纵向插值） */
const TINT = {
  dreamer:  ["#4a6bab", "#0a1020"],   // 幻想家：蓝黑
  nastenka: ["#ecc27f", "#b04a74"],   // 娜斯津卡：黄粉
  lodger:   ["#6b8577", "#121c16"],   // 年轻房客：苔灰绿（配角，压暗）
  granny:   ["#7a6a85", "#16121c"],   // 祖母：紫灰（配角，压暗）
};

function hex(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

const dry = process.argv.includes("--dry");

for (const f of fs.readdirSync(DIR).filter(f => f.endsWith(".png")).sort()) {
  const key = Object.keys(TINT).find(k => f.startsWith(k + "_"));
  if (!key) { console.log("跳过（无配色）：", f); continue; }

  const img = readPNG(path.join(DIR, f));
  const { w, h } = img;

  // 不透明像素包围盒（纵向）。按行计数、要求一行至少 10 个采样点才计入，
  // 防孤立残点把包围盒顶到画布边缘（dreamer_shy 顶部有散点会到 y=0）。
  let minY = h, maxY = -1;
  for (let y = 0; y < h; y += 2) {
    let n = 0;
    for (let x = 0; x < w; x += 2) if (img.at(x, y)[3] > 32) n++;
    if (n >= 10) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxY < 0) { console.log("跳过（全透明）：", f); continue; }
  console.log(`${f}  包围盒 y ${minY}~${maxY}（高 ${maxY - minY + 1}）`);
  if (dry) continue;

  const [top, bot] = TINT[key].map(hex);
  const span = maxY - minY || 1;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = Math.min(1, Math.max(0, (y - minY) / span));
    const r = Math.round(top[0] + (bot[0] - top[0]) * t);
    const g = Math.round(top[1] + (bot[1] - top[1]) * t);
    const b = Math.round(top[2] + (bot[2] - top[2]) * t);
    for (let x = 0; x < w; x++) {
      const a = img.at(x, y)[3];
      const o = (y * w + x) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
    }
  }
  writePNG(path.join(DIR, f), { width: w, height: h, data });
  console.log(`  已上色 ${key}：${TINT[key][0]} → ${TINT[key][1]}`);
}
