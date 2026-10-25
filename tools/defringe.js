// defringe.js —— 去品红残边：抠图后轮廓上残留的品红-黑过渡像素（r/b 明显压 g 的暗像素）置透明
// 剪影本体近黑（三通道都低且相近），红蓝双双甩绿的只可能是品红边的抗锯齿残留。
const fs = require('fs');
const path = require('path');
const { readPNG } = require('./png_read');
const { Canvas, writePNG } = require('./png');

const DIR = path.join(__dirname, '..', 'assets', 'sprite');

for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.png'))) {
	const p = path.join(DIR, f);
	const img = readPNG(p);
	const c = new Canvas(img.w, img.h);
	const d = c.data;
	let stripped = 0, kept = 0;
	for (let y = 0; y < img.h; y++) {
		for (let x = 0; x < img.w; x++) {
			const [r, g, b, a] = img.at(x, y);
			const i = (y * img.w + x) * 4;
			if (a === 0) continue;
			if (r - g >= 30 && b - g >= 15) { stripped++; continue; }
			d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
			kept++;
		}
	}
	writePNG(p, c);
	console.log(f, '去残边', stripped, '保留', kept, '透明' + ((img.w * img.h - kept) / (img.w * img.h) * 100).toFixed(0) + '%');
}
