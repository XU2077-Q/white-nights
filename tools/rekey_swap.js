// rekey_swap.js —— 一次性修复：dreamer_shy ↔ granny_default 主体对调 + 放宽品红阈值重抠
// 两张已成图的 PNG 是「抠图失败但原色保留」的不透明图，直接换名再重抠即可，无需重新出图。
const fs = require('fs');
const path = require('path');
const { readPNG } = require('./png_read');
const { Canvas, writePNG } = require('./png');

const DIR = path.join(__dirname, '..', 'assets', 'sprite');
const A = path.join(DIR, 'dreamer_shy.png');   // 内容是祖母
const B = path.join(DIR, 'granny_default.png'); // 内容是羞怯幻想家

function isKey(r, g, b) {
	return r >= 170 && b >= 100 && g <= 110 && r - g >= 80 && b - g >= 40;
}

function keyOut(src, dest) {
	const img = readPNG(src);
	const c = new Canvas(img.w, img.h);
	let alpha = 0;
	const d = c.data, W = img.w;
	for (let y = 0; y < img.h; y++) {
		for (let x = 0; x < img.w; x++) {
			const [r, g, b] = img.at(x, y);
			const i = (y * W + x) * 4;
			if (isKey(r, g, b)) alpha++;
			else { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
		}
	}
	writePNG(dest, c);
	return (alpha / (img.w * img.h) * 100).toFixed(0);
}

const tmp = A + '.swap';
fs.renameSync(A, tmp);
fs.renameSync(B, A);   // 羞怯幻想家 → dreamer_shy.png
fs.renameSync(tmp, B); // 祖母 → granny_default.png
console.log('已对调文件名');

console.log('dreamer_shy  透明' + keyOut(A, A) + '%');
console.log('granny_default 透明' + keyOut(B, B) + '%');
