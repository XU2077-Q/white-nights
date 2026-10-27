/* 探针：量化立绘成品与彩图母版里的粉系残留（一次性诊断用）
   用法：node tools/probe_pink.js <id> */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ---- 极简 PNG 读（与 gen_color_sprite.js 同款逻辑复制） ---- */
function readPNG(file) {
	const buf = fs.readFileSync(file);
	let pos = 8, w = 0, h = 0, depth = 8, ctype = 6;
	const idat = [];
	while (pos < buf.length) {
		const len = buf.readUInt32BE(pos); pos += 4;
		const type = buf.toString("ascii", pos, pos + 4); pos += 4;
		const data = buf.slice(pos, pos + len); pos += len + 4;
		if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; }
		else if (type === "IDAT") idat.push(data);
		else if (type === "IEND") break;
	}
	const raw = zlib.inflateSync(Buffer.concat(idat));
	const ch = ctype === 6 ? 4 : 3;
	const stride = w * ch;
	const data = Buffer.alloc(w * h * 4);
	let prev = Buffer.alloc(stride);
	let off = 0;
	for (let y = 0; y < h; y++) {
		const f = raw[off++];
		const line = raw.slice(off, off + stride); off += stride;
		const cur = Buffer.alloc(stride);
		for (let i = 0; i < stride; i++) {
			const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
			let v = line[i];
			if (f === 1) v = (v + a) & 255;
			else if (f === 2) v = (v + b) & 255;
			else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
			else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
			cur[i] = v;
		}
		for (let x = 0; x < w; x++) {
			const o = (y * w + x) * 4;
			data[o] = cur[x * ch]; data[o + 1] = cur[x * ch + 1]; data[o + 2] = cur[x * ch + 2];
			data[o + 3] = ch === 4 ? cur[x * ch + 3] : 255;
		}
		prev = cur;
	}
	return { w, h, data, at(x, y) { const o = (y * w + x) * 4; return [data[o], data[o + 1], data[o + 2], data[o + 3]]; } };
}

function isBgPink(r, g, b) { return r >= 170 && b >= 110 && r - g >= 60 && b - g >= 25; }
function isBgWide(r, g, b) {
	if (isBgPink(r, g, b)) return true;
	return r >= 140 && b < 110 && r - g >= 60 && b - g >= 15;
}
function isPalePink(r, g, b) { return r >= 200 && b >= 150 && r - g >= 25 && b - g >= 5 && !isBgWide(r, g, b); }

const id = process.argv[2];
const master = readPNG(path.join(__dirname, "art_src", "color", id + ".png"));
const out = readPNG(path.join(__dirname, "..", "assets", "sprite", id + ".png"));

/* 母版：不透明/窄品红/绯红支/浅粉 统计 */
let mo = 0, mNarrow = 0, mCrim = 0, mPale = 0;
for (let y = 0; y < master.h; y++) for (let x = 0; x < master.w; x++) {
	const [r, g, b, a] = master.at(x, y);
	if (a < 24) continue;
	mo++;
	if (isBgPink(r, g, b)) mNarrow++;
	else if (isBgWide(r, g, b)) mCrim++;
	else if (isPalePink(r, g, b)) mPale++;
}
console.log(`母版 ${id}: 不透明 ${mo}  窄品红 ${mNarrow} (${(100 * mNarrow / mo).toFixed(2)}%)  绯红支 ${mCrim} (${(100 * mCrim / mo).toFixed(2)}%)  浅粉 ${mPale} (${(100 * mPale / mo).toFixed(1)}%)`);

/* 成品：粉系像素统计 + 最大连通块位置（看条纹在哪） */
let oo = 0, oWide = 0, oPale = 0;
const paleMap = new Uint8Array(out.w * out.h);
for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
	const [r, g, b, a] = out.at(x, y);
	if (a < 24) continue;
	oo++;
	if (isBgWide(r, g, b)) oWide++;
	else if (isPalePink(r, g, b)) { oPale++; paleMap[y * out.w + x] = 1; }
}
console.log(`成品 ${id}: 不透明 ${oo}  洋红族 ${oWide} (${(100 * oWide / oo).toFixed(2)}%)  浅粉 ${oPale} (${(100 * oPale / oo).toFixed(2)}%)`);

/* 浅粉像素的 y 分布直方图（10 段） */
const bins = new Array(10).fill(0);
for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) if (paleMap[y * out.w + x]) bins[Math.min(9, (y / out.h * 10) | 0)]++;
console.log("浅粉 y 分布:", bins.join(" "));
