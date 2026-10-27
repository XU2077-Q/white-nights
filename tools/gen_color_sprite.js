/* ============================================================
   《白夜》VN：彩色立绘驱动（剪影蒙版填充法）
   ----------------------------------------------------------------
   用户新需求：黑色剪影上覆盖好看的彩色立绘（水彩 × 二次元）。

   原理：同姿态提示词出「水彩全彩立绘」（仍品红底便于键控），
   键控后把内容框对齐到原剪影内容框，再用剪影的 alpha 当蒙版
   把颜色灌进去 —— 成品外形与剪影逐像素一致（站位/大小/发光
   描边层零改动），内部是彩色。

   产物：assets/sprite/<id>.png 同名覆盖（原剪影先备份到
   tools/art_src/silhouette_backup/，只备份一次）。
   中间件：tools/art_src/color/<id>.png（键控后的全彩图，留档可复灌）。

   【key 纪律】同 gen_art_plan.js：只读仓库外 %TEMP%/.ark_plan_key，
   仅注入子进程 API_KEY，用完手动删。

   用法：
     node tools/gen_color_sprite.js --list
     node tools/gen_color_sprite.js --dry             逐张 dry-run 看请求体
     node tools/gen_color_sprite.js --missing --yes   出齐未完成的并灌色
     node tools/gen_color_sprite.js --only nastenka_smile --force --yes
     node tools/gen_color_sprite.js --composite       不生成，用留档彩图重灌
     node tools/gen_color_sprite.js --qa              质检（必须真上色了）
   ============================================================ */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { readPNG } = require("./png_read.js");
const { writePNG, Canvas } = require("./png.js");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(__dirname, "color_manifest.json");
const SKILL_SCRIPT = path.join(ROOT, ".claude", "skills", "byted-ark-seedream-skill", "scripts", "generate.js");
const STAGING = path.join(__dirname, "art_src", "_staging_color");
const COLOR_DIR = path.join(__dirname, "art_src", "color");
const BACKUP_DIR = path.join(__dirname, "art_src", "silhouette_backup");
const SPRITE_DIR = path.join(ROOT, "assets", "sprite");
const KEY_FILE = path.join(os.tmpdir(), ".ark_plan_key");

/* 彩色立绘风格后缀：水彩 × 二次元；品红底与构图约束保持与剪影版一致（对齐靠它） */
const STYLE_COLOR =
	"，全身立绘，二次元风格，水彩画质感，柔和清透上色，面部精致，" +
	"1840年代俄国彼得堡服饰，发丝与衣褶细节细腻，" +
	"人物垂直居中、脚底距画面下缘留少量空，" +
	"纯色洋红背景（#FF00FF），无阴影无地面投影无背景渐变，无文字无水印";

/* 与 gen_art_plan.js 的 12 条立绘工单同姿态描述（scene 原文照抄，保证姿态语义一致） */
const ORDERS = [
	{ id: "dreamer_default", scene: "瘦削青年男子，头戴高顶礼帽，身穿长外套与围巾，一手持手杖自然垂立" },
	{ id: "dreamer_think",   scene: "瘦削青年男子，头戴高顶礼帽，身穿长外套与围巾，一手托着下巴低头沉思，微微驼背" },
	{ id: "dreamer_excited", scene: "瘦削青年男子，头戴高顶礼帽，身穿长外套与围巾，双臂张开激动演说，衣摆扬起" },
	{ id: "dreamer_shy",     scene: "瘦削青年男子，礼帽拿在胸前双手捧着，低头局促，羞涩" },
	{ id: "nastenka_smile",  scene: "少女，1840年代高腰长裙与披巾，发辫盘起，双手背在身后微微歪头微笑" },
	{ id: "nastenka_sad",    scene: "少女，1840年代高腰长裙与披巾，发辫盘起，低头垂手，披巾裹紧肩膀，忧伤" },
	{ id: "nastenka_expect", scene: "少女，1840年代高腰长裙与披巾，发辫盘起，踮脚向远处张望，一手搭在额前" },
	{ id: "nastenka_tears",  scene: "少女，1840年代高腰长裙与披巾，发辫盘起，抬手以手帕拭泪，肩膀微微前倾" },
	{ id: "nastenka_joy",    scene: "少女，1840年代高腰长裙与披巾，发辫盘起，裙摆轻扬转身，双臂舒展，喜悦" },
	{ id: "lodger_default",  scene: "年轻男子房客，短外套与软帽，手提一只小皮箱，客气地微微欠身" },
	{ id: "lodger_serious",  scene: "年轻男子房客，短外套与软帽，双臂交叉抱在胸前，站得笔直，神情严肃" },
	{ id: "granny_default",  scene: "矮胖老妇人，大头巾与厚披肩，长围裙，拄着一根拐杖" },
];

/* ---------------------- 参数 / manifest ---------------------- */

function parseArgs(argv) {
	const a = { only: null, force: false, yes: false, dry: false, list: false, qa: false, composite: false };
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--dry") a.dry = true;
		else if (v === "--list") a.list = true;
		else if (v === "--force") a.force = true;
		else if (v === "--yes" || v === "-y") a.yes = true;
		else if (v === "--qa") a.qa = true;
		else if (v === "--composite") a.composite = true;
		else if (v === "--missing") { /* 默认就是只出未完成的 */ }
		else if (v === "--only") a.only = argv[++i];
		else if (v.startsWith("--only=")) a.only = v.slice(7);
		else { console.error("认不出的参数：" + v); process.exit(2); }
	}
	if (a.only) a.only = a.only.split(",").map((s) => s.trim()).filter(Boolean);
	return a;
}

function loadManifest() {
	if (fs.existsSync(MANIFEST)) return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
	return { items: [] };
}
function saveManifest(m) { fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n"); }
function itemOf(m, id) {
	let it = m.items.find((i) => i.id === id);
	if (!it) { it = { id, status: "pending" }; m.items.push(it); }
	return it;
}

/* ---------------------- 调子 skill（同 gen_art_plan.js 纪律） ---------------------- */

function parseJsonOut(stdout) {
	const s = stdout.indexOf("{"), e = stdout.lastIndexOf("}");
	if (s < 0 || e <= s) throw new Error("skill 没返回 JSON：" + stdout.slice(0, 300));
	return JSON.parse(stdout.slice(s, e + 1));
}

function runSkill(o, dry) {
	const args = [
		"--model", "pro",
		"--size", "1024x1536",
		"--output_format", "png",
		"--watermark", "false",
		"--optimize", "false",
		"--prompt", o.scene + STYLE_COLOR,
	];
	if (dry) args.push("--dry-run", "true");
	const env = { ...process.env, ARK_SEEDREAM_SAVE_PATH: STAGING };
	if (!dry && fs.existsSync(KEY_FILE)) {
		const k = fs.readFileSync(KEY_FILE, "utf8").trim();
		if (!k.startsWith("ark-")) throw new Error("临时 key 文件内容不是 ark- 开头，已拒绝使用。");
		env.API_KEY = k;
	}
	const r = spawnSync(process.execPath, [SKILL_SCRIPT, ...args], {
		cwd: ROOT, encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024,
	});
	if (r.error) throw r.error;
	return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function newestStaging() {
	if (!fs.existsSync(STAGING)) return null;
	const files = [];
	(function walk(dir) {
		for (const f of fs.readdirSync(dir)) {
			const p = path.join(dir, f);
			const st = fs.statSync(p);
			if (st.isDirectory()) walk(p);
			else if (/\.(jpg|jpeg|png)$/i.test(f)) files.push(p);
		}
	})(STAGING);
	if (!files.length) return null;
	files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
	return files[0];
}

/* ---------------------- 品红键控（阈值与剪影版同一套放宽经验） ---------------------- */

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
			if (isKey(r, g, b)) { alpha++; }
			else { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
		}
	}
	writePNG(dest, c);
	return { total: img.w * img.h, alpha };
}

/* 非透明像素包围盒（img 为 readPNG 结果） */
function bboxOf(img) {
	let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
	for (let y = 0; y < img.h; y++) {
		for (let x = 0; x < img.w; x++) {
			if (img.at(x, y)[3] < 24) continue;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		}
	}
	if (x1 < 0) return null;
	return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* ---------------------- 蒙版灌色 ---------------------- */

/* 比 isKey 宽的「洋红家族」判定，仅用于 QA 品红占比指标。
   注意：灌色真假颜料判别不靠颜色规则（背景漏网像素有品红/绯红/深红
   一整个家族，色相规则堵不全），靠连通域——见 buildFillMaps。 */
function isBgPink(r, g, b) {
	return r >= 170 && b >= 110 && r - g >= 60 && b - g >= 25;
}

/* 更宽的「背景洋红家族」判定 = isBgPink ∪ 绯红支（b<110 的深红/玫瑰红，
   isBgPink 的 b>=110 把它们漏了——nastenka_expect 头上一片绯红涂抹的教训）。
   用于：清洗彩图内容框 + BFS 兜底源排除 + QA 参考指标。
   不用于双线性角落拒绝（那里只认 alpha，保住红披肩等正当红色的细节）。
   苍白粉裙（r-g≈45）、肤色（r-g≈40）、棕发（r<140）都够不着阈值；
   正当红披肩（180,40,60）会被误中——接受：它仍是双线性颜料，只是不当兜底源。 */
function isBgWide(r, g, b) {
	if (isBgPink(r, g, b)) return true;
	return r >= 140 && b < 110 && r - g >= 60 && b - g >= 15;
}

/* 浅粉背景残渍（水彩背景不是纯色，品红被冲淡成 r-g 只有 20~45 的浅粉，
   isBgWide 的 r-g>=60 漏掉）——round 4 之后条纹残留的元凶：它不透明，
   过了 alpha 角落测试，被双线性直接采进剪影悬空区（lodger_serious 腿间
   粉柱、dreamer_excited 双臂粉纹，实测成品浅粉占比放大到母版的 10 倍+）。
   肤色（b-g<0）、白衣（r-g≈0）够不着；但娜斯津卡的粉纱裙/粉头纱也是
   这个色——所以能不能当背景剔，要看它在母版里的占比（见 buildFillMaps
   的 paleIsBg 闸门）：残渍 ≤0.8%，正当粉衣 ≥8%，3% 干净分开。 */
function isBgPale(r, g, b) {
	return r >= 190 && b >= 150 && r - g >= 20 && b - g >= 5;
}

/* 灌色用两张预计算图：
   valid —— 「真颜料」掩码：不透明、非洋红家族（isBgWide）、且属于
            最大 8-连通域（人物主体）。
   near  —— 每个像素最近的 valid 像素下标（多源 BFS，O(W*H) 一次跑完）。
   为什么要两道闸：
   坑 1（色相闸）：键控漏网的背景残点不透明，且颜色是一整个家族——
   浅品红（g 到 130+）逃过 isKey，绯红/深红（b<110）再逃过 isBgPink，
   不剔掉就会被当成真颜料灌进成品（lodger_serious 左半身、
   dreamer_think 背姿大片品红斜纹都是这么来的）。
   坑 2（连通闸）：漏网残斑若与主体 8-连通（贴着人物边缘），单靠色相
   之外的「最大连通域=主体」假设会把洋红斑当主体；先色相剔除再取
   最大域，剩下的碎斑（非洋红的灰尘点之类）也被连通域挡掉。
   另：彩图内容框必须取 valid 的包围盒而不是 bboxOf(全体不透明)——
   漏网洋红斑会把框撑宽（dreamer_think 框 776 宽而人很窄），
   对齐映射直接把剪影左半身映射进洋红区，双线性四角全「合法」地采洋红。
   （旧 nearestOpaque 环形搜索：O(洞面积×环²)，12 张重灌 10 分钟+；
   BFS 全图一次几秒。）
   round 5 再加两道：
   paleIsBg —— 浅粉占比 ≤3% 的母版把浅粉也当背景（残渍）；>3% 的是正当
   粉衣（nastenka_sad 13.4%/expect 27.7%/joy 8.0%），浅粉留作颜料。
   bgMask/depth —— 「背景面」（透明 ∪ 窄品红 ∪ 条件浅粉；绯红支不算，
   保住红披肩/joy 粉裙的双线性细节）与到背景面的距离场（BFS，封顶
   DEEP=4）。sample 只有中心点落在「深处」（非背景且距背景 ≥4px）才
   直接双线性，否则一律 BFS 兜底——悬空区夹在 bbox 边缘的浅粉薄边
   （深度 1~2）就此再也采不进来。 */
const DEEP = 4;
function buildFillMaps(img) {
	const W = img.w, H = img.h, N = W * H;
	/* 第一遍：不透明数 + 浅粉占比，定 paleIsBg 闸门 */
	let opaque = 0, pale = 0;
	for (let i = 0; i < N; i++) {
		const p = img.at(i % W, (i / W) | 0);
		if (p[3] < 24) continue;
		opaque++;
		if (!isBgWide(p[0], p[1], p[2]) && isBgPale(p[0], p[1], p[2])) pale++;
	}
	const paleIsBg = pale <= opaque * 0.03;
	const bgMask = new Uint8Array(N);
	for (let i = 0; i < N; i++) {
		const p = img.at(i % W, (i / W) | 0);
		if (p[3] < 24 || isBgPink(p[0], p[1], p[2]) ||
			(paleIsBg && !isBgWide(p[0], p[1], p[2]) && isBgPale(p[0], p[1], p[2])))
			bgMask[i] = 1;
	}
	const comp = new Int32Array(N).fill(-1);
	const stack = new Int32Array(N);
	let ncomp = 0, best = -1, bestSize = 0;
	const paint = (i) => {
		if (bgMask[i]) return false;
		const p = img.at(i % W, (i / W) | 0);
		return !isBgWide(p[0], p[1], p[2]);   // 绯红支仍不算颜料（只清洗，不进 bgMask）
	};
	for (let s = 0; s < N; s++) {
		if (comp[s] !== -1) continue;
		if (!paint(s)) { comp[s] = -2; continue; }   // 透明/洋红家族不属于任何域
		let sp = 0, size = 0;
		stack[sp++] = s; comp[s] = ncomp;
		while (sp > 0) {
			const i = stack[--sp];
			size++;
			const x = i % W, y = (i / W) | 0;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (!dx && !dy) continue;
					const nx = x + dx, ny = y + dy;
					if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
					const j = ny * W + nx;
					if (comp[j] !== -1) continue;
					if (!paint(j)) { comp[j] = -2; continue; }
					comp[j] = ncomp; stack[sp++] = j;
				}
			}
		}
		if (size > bestSize) { bestSize = size; best = ncomp; }
		ncomp++;
	}
	const valid = new Uint8Array(N);
	for (let i = 0; i < N; i++) if (comp[i] === best) valid[i] = 1;
	/* 距离场：到背景面（bgMask）的 8-连通距离，封顶 DEEP。
	   deep = 非背景且距离 >= DEEP——双线性直采只许落在深处。 */
	const deep = new Uint8Array(N);
	{
		const dist = new Int16Array(N).fill(-1);
		const queue = new Int32Array(N);
		let qh = 0, qt = 0;
		for (let i = 0; i < N; i++) if (bgMask[i]) { dist[i] = 0; queue[qt++] = i; }
		while (qh < qt) {
			const i = queue[qh++];
			if (dist[i] >= DEEP) continue;
			const x = i % W, y = (i / W) | 0;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (!dx && !dy) continue;
					const nx = x + dx, ny = y + dy;
					if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
					const j = ny * W + nx;
					if (dist[j] !== -1) continue;
					dist[j] = dist[i] + 1;
					queue[qt++] = j;
				}
			}
		}
		for (let i = 0; i < N; i++) if (!bgMask[i] && (dist[i] === -1 || dist[i] >= DEEP)) deep[i] = 1;
	}
	/* near：每个像素最近的「深处理料」下标（多源 BFS）。源取 valid∩deep，
	   薄边/残渍/碎斑都不当源；若整图没有深处理料（病态）退化为 valid。 */
	const near = new Int32Array(N).fill(-1);
	const queue = new Int32Array(N);
	let qh = 0, qt = 0, nsrc = 0;
	for (let i = 0; i < N; i++) {
		if (valid[i] && deep[i]) { near[i] = i; queue[qt++] = i; nsrc++; }
	}
	if (!nsrc) for (let i = 0; i < N; i++) if (valid[i]) { near[i] = i; queue[qt++] = i; }
	while (qh < qt) {
		const i = queue[qh++];
		const x = i % W, y = (i / W) | 0;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
				const j = ny * W + nx;
				if (near[j] !== -1) continue;
				near[j] = near[i];
				queue[qt++] = j;
			}
		}
	}
	return { valid, near, bgMask, deep, paleIsBg };
}

/* valid 掩码的包围盒——清洗过的彩图内容框（不含洋红家族/碎斑），
   对齐映射必须用它，否则漏网背景把框撑宽、剪影大片区域映射进背景色。 */
function bboxOfValid(img, valid) {
	let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
	for (let y = 0; y < img.h; y++) {
		for (let x = 0; x < img.w; x++) {
			if (!valid[y * img.w + x]) continue;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		}
	}
	if (x1 < 0) return null;
	return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* 直采判定 + 双线性（clamp 到彩图内容框内）；失败返回 null 走扩散填充。
   坑 1：彩图姿态与剪影不可能逐像素一致，错位区四个角会采到键控后的
   透明像素（RGB=0,0,0）→ 成品黑头/半身黑洞。
   坑 2：键控漏网的背景残点不透明，但已被挡在清洗内容框之外；
   框内薄边的洋红残点只影响贴边个别像素，且兜底源已剔洋红家族。
   坑 3（round 5）：悬空区经 clamp 落在内容框边缘的浅粉薄边上 → 粉条纹。
   直采条件 = 中心点落在深处（非背景面且距背景面 ≥DEEP）且四角都不在
   背景面上。
   坑 4（round 6 教训）：失败样本无论走钳位拉伸、行/列边缘延伸平涂还是
   近源 Voronoi 平涂，都会出条纹或显缝（棕/米色条纹粉色闸门全盲）。
   round 7 起失败样本一律返回 null，交给 maskFill 的谐和扩散（Laplace
   填充）从周围直采内容平滑过渡生成。 */
function sampleDirect(img, box, fx, fy, maps) {
	if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;   // 越界悬空区
	const sx = box.x0 + fx * (box.w - 1);
	const sy = box.y0 + fy * (box.h - 1);
	const W = img.w;
	const cx = Math.max(box.x0, Math.min(box.x1, Math.round(sx)));
	const cy = Math.max(box.y0, Math.min(box.y1, Math.round(sy)));
	const ci = cy * W + cx;
	const x0 = Math.max(box.x0, Math.min(box.x1, Math.floor(sx)));
	const y0 = Math.max(box.y0, Math.min(box.y1, Math.floor(sy)));
	const x1 = Math.min(box.x1, x0 + 1), y1 = Math.min(box.y1, y0 + 1);
	const bg = (x, y) => maps.bgMask[y * W + x];
	if (!maps.deep[ci] || bg(x0, y0) || bg(x1, y0) || bg(x0, y1) || bg(x1, y1)) return null;
	const c00 = img.at(x0, y0), c10 = img.at(x1, y0), c01 = img.at(x0, y1), c11 = img.at(x1, y1);
	const tx = Math.max(0, Math.min(1, sx - x0)), ty = Math.max(0, Math.min(1, sy - y0));
	const out = [0, 0, 0];
	for (let k = 0; k < 3; k++) {
		out[k] = Math.round(
			c00[k] * (1 - tx) * (1 - ty) + c10[k] * tx * (1 - ty) +
			c01[k] * (1 - tx) * ty + c11[k] * tx * ty);
	}
	return out;
}

/* colorFile 灌进 silFile 的剪影形状 → destFile；返回对齐参数供日志 */
function maskFill(colorFile, silFile, destFile) {
	const col = readPNG(colorFile);
	const sil = readPNG(silFile);
	const maps = buildFillMaps(col);
	/* 内容框必须取清洗后（剔洋红家族+碎斑）的 valid 包围盒——bboxOf(全体
	   不透明) 会被漏网背景撑宽，对齐映射直接把剪影映射进背景色。 */
	const cb = bboxOfValid(col, maps.valid), sb = bboxOf(sil);
	if (!cb) throw new Error("彩图全空（键控+清洗后无内容）：" + colorFile);
	if (!sb) throw new Error("剪影全空：" + silFile);
	/* 等比缩放：以高度为准；水平居中、底边（脚底）对齐 */
	const scale = sb.h / cb.h;
	const drawW = cb.w * scale;
	const offX = sb.x0 + (sb.w - drawW) / 2;   // 彩图内容框左缘在剪影坐标系里的落点
	const offY = sb.y0;                        // 顶对齐（高已等比一致）
	const W = sil.w, H = sil.h, N = W * H;
	const c = new Canvas(W, H);
	const d = c.data;
	/* 剪影噪点剔除（round 8）：部分剪影母版自带数以万计的零碎噪点块
	   （dreamer_shy 两万个、合计 2.3 万像素——黑剪影时代喷在黑底上看不见，
	   灌色后变亮色斑点，满屏「下雪」）。只保留 a>=24 的大连通块
	   （≥500px：祖母的拐杖 19280、房客的手套 1162 都是合法分离件，而最大
	   噪点才 160），再外扩 2px 罩住软边晕环；噪点像素不进 zone、保持全透明。 */
	const MINCOMP = 500;
	const keep = new Uint8Array(N);
	{
		const comp = new Int32Array(N).fill(-1);
		const sizes = [];
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const i = y * W + x;
				if (sil.at(x, y)[3] < 24 || comp[i] >= 0) continue;
				const cid = sizes.length;
				let sz = 0;
				const q = [i];
				comp[i] = cid;
				while (q.length) {
					const p = q.pop();
					sz++;
					const px = p % W, py = (p / W) | 0;
					if (px > 0 && comp[p - 1] < 0 && sil.at(px - 1, py)[3] >= 24) { comp[p - 1] = cid; q.push(p - 1); }
					if (px < W - 1 && comp[p + 1] < 0 && sil.at(px + 1, py)[3] >= 24) { comp[p + 1] = cid; q.push(p + 1); }
					if (py > 0 && comp[p - W] < 0 && sil.at(px, py - 1)[3] >= 24) { comp[p - W] = cid; q.push(p - W); }
					if (py < H - 1 && comp[p + W] < 0 && sil.at(px, py + 1)[3] >= 24) { comp[p + W] = cid; q.push(p + W); }
				}
				sizes.push(sz);
			}
		}
		for (let i = 0; i < N; i++) if (comp[i] >= 0 && sizes[comp[i]] >= MINCOMP) keep[i] = 1;
		/* 外扩 2px 罩软边（alpha 2~23 的晕环贴着实边） */
		for (let round = 0; round < 2; round++) {
			const old = keep.slice();
			for (let y = 0; y < H; y++) {
				for (let x = 0; x < W; x++) {
					const i = y * W + x;
					if (old[i]) continue;
					if ((x > 0 && old[i - 1]) || (x < W - 1 && old[i + 1]) ||
						(y > 0 && old[i - W]) || (y < H - 1 && old[i + W])) keep[i] = 1;
				}
			}
		}
	}
	/* 第一遍：直采像素落定并当扩散的固定边界；失败像素（悬空区/姿态错位
	   区/薄边残点）先用最近深处理料色当初值，记入填充清单。
	   round 7：失败区不再自己采样（钳位拉伸/边缘延伸/Voronoi 平涂全都
	   出条纹或显缝），初值随便给，交给第二遍谐和扩散。 */
	const zone = new Uint8Array(N);      // 剪影内（要出颜色的像素）
	const farr = new Float32Array(N * 3);
	const fillList = [];
	for (let y = sb.y0; y <= sb.y1; y++) {
		for (let x = sb.x0; x <= sb.x1; x++) {
			const a = sil.at(x, y)[3];
			if (a < 2 || !keep[y * W + x]) continue;
			const i = y * W + x;
			zone[i] = 1;
			const fx = (x - offX) / (drawW - 1);
			const fy = (y - offY) / (sb.h - 1);
			let rgb = sampleDirect(col, cb, fx, fy, maps);
			const o = i * 4;
			if (rgb) {
				d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2];
			} else {
				/* 初值：钳回内容框取最近深处理料（near 图已剔洋红家族/薄边/碎斑） */
				const qx = Math.max(cb.x0, Math.min(cb.x1, Math.round(cb.x0 + Math.max(0, Math.min(1, fx)) * (cb.w - 1))));
				const qy = Math.max(cb.y0, Math.min(cb.y1, Math.round(cb.y0 + Math.max(0, Math.min(1, fy)) * (cb.h - 1))));
				const j = maps.near[qy * col.w + qx];
				if (j >= 0) { const p = col.at(j % col.w, (j / col.w) | 0); rgb = [p[0], p[1], p[2]]; }
				else rgb = [40, 34, 30];   // 病态兜底（扩散会立即盖掉）
				fillList.push(i);
			}
			const f = i * 3;
			farr[f] = rgb[0]; farr[f + 1] = rgb[1]; farr[f + 2] = rgb[2];
			d[o + 3] = a;                  // 外形 alpha 完全跟随剪影
		}
	}
	/* 第二遍：谐和扩散（Laplace 填充，SOR 加速）——填充区颜色由周围直采
	   内容平滑过渡生成；与直采区不邻接的孤立填充区收敛到初值均值，拼缝
	   同样抹平。ω 取略低于最优（2/(1+π/L)，L≈区宽一两百）保稳。 */
	const ITERS = 240, OMEGA = 1.9;
	for (let it = 0; it < ITERS; it++) {
		for (const i of fillList) {
			const x = i % W;
			let r = 0, g = 0, b = 0, n = 0;
			if (x > 0 && zone[i - 1]) { const o = (i - 1) * 3; r += farr[o]; g += farr[o + 1]; b += farr[o + 2]; n++; }
			if (x < W - 1 && zone[i + 1]) { const o = (i + 1) * 3; r += farr[o]; g += farr[o + 1]; b += farr[o + 2]; n++; }
			if (i >= W && zone[i - W]) { const o = (i - W) * 3; r += farr[o]; g += farr[o + 1]; b += farr[o + 2]; n++; }
			if (i < N - W && zone[i + W]) { const o = (i + W) * 3; r += farr[o]; g += farr[o + 1]; b += farr[o + 2]; n++; }
			if (!n) continue;
			const o = i * 3;
			farr[o] += OMEGA * (r / n - farr[o]);
			farr[o + 1] += OMEGA * (g / n - farr[o + 1]);
			farr[o + 2] += OMEGA * (b / n - farr[o + 2]);
		}
	}
	for (const i of fillList) {
		const f = i * 3, o = i * 4;
		d[o] = Math.max(0, Math.min(255, Math.round(farr[f])));
		d[o + 1] = Math.max(0, Math.min(255, Math.round(farr[f + 1])));
		d[o + 2] = Math.max(0, Math.min(255, Math.round(farr[f + 2])));
	}
	writePNG(destFile, c);
	return { scale: +scale.toFixed(3), silBox: `${sb.w}x${sb.h}`, colBox: `${cb.w}x${cb.h}`, paleIsBg: maps.paleIsBg };
}

function ensureBackup(id) {
	const src = path.join(SPRITE_DIR, id + ".png");
	const dst = path.join(BACKUP_DIR, id + ".png");
	if (fs.existsSync(dst)) return;             // 只备份一次，防彩色成品被当成「原剪影」再备份
	fs.mkdirSync(BACKUP_DIR, { recursive: true });
	fs.copyFileSync(src, dst);
}

/* ---------------------- QA：必须真上色了 ---------------------- */

function qa() {
	let bad = 0;
	for (const o of ORDERS) {
		const f = path.join(SPRITE_DIR, o.id + ".png");
		if (!fs.existsSync(f)) { console.log("  ✗ " + o.id + "：缺文件"); bad++; continue; }
		const img = readPNG(f);
		let opaque = 0, lumSum = 0, satSum = 0, pink = 0, wide = 0, pale = 0;
		for (let y = 0; y < img.h; y++) {
			for (let x = 0; x < img.w; x++) {
				const [r, g, b, a] = img.at(x, y);
				if (a < 24) continue;
				opaque++;
				lumSum += 0.299 * r + 0.587 * g + 0.114 * b;
				satSum += Math.max(r, g, b) - Math.min(r, g, b);
				if (isBgPink(r, g, b)) pink++;
				if (isBgWide(r, g, b)) wide++;
				else if (isBgPale(r, g, b)) pale++;
			}
		}
		if (!opaque) { console.log("  ✗ " + o.id + "：全透明"); bad++; continue; }
		const lum = lumSum / opaque, sat = satSum / opaque, pinkR = pink / opaque, wideR = wide / opaque, paleR = pale / opaque;
		/* 纯黑剪影 lum≈0、sat≈0；灌色成功应 sat>8 且 lum>30（水彩清淡，阈值别定高；
		   坑：深色礼服角色如 dreamer_think 合法地 lum≈37，定 40 会误杀）。
		   品红占比是防「键控漏网品红被当真颜料灌进去」的闸——亮度/彩度会把
		   品红当真上色放行（lodger_serious 头上一片品红 QA 照样绿的教训）。
		   合法粉裙/粉披肩到不了 12%，超过即判漏控。 */
		const ok = lum > 30 && sat > 8 && pinkR <= 0.12;
		/* 洋红族占比（宽口径，含绯红支）只打印不设闸：正当红披肩/粉围巾
		   会进宽口径（nastenka_tears），窄口径>12% 才判漏控。
		   浅粉占比同样只打印：正当粉纱裙/头纱高达 25%+（nastenka_expect），
		   但无粉衣角色灌完后应在 ~1% 以下（round 5 前 lodger_serious 5.0%、
		   dreamer_excited 4.7% 都是悬空区条纹）。 */
		console.log(`  ${ok ? "✓" : "✗"} ${o.id.padEnd(18)} 平均亮度 ${lum.toFixed(0)}  平均彩度 ${sat.toFixed(0)}  品红占比 ${(pinkR * 100).toFixed(1)}%  洋红族 ${(wideR * 100).toFixed(1)}%  浅粉 ${(paleR * 100).toFixed(1)}%`);
		if (!ok) bad++;
	}
	console.log(bad ? `  **${bad} 张没上色或太暗**` : "  全部真上色。");
	process.exitCode = bad ? 1 : 0;
}

/* ---------------------- 主流程 ---------------------- */

function compositeOne(id) {
	const colorFile = path.join(COLOR_DIR, id + ".png");
	const silFile = path.join(BACKUP_DIR, id + ".png");
	if (!fs.existsSync(colorFile)) { console.log("  ✗ " + id + "：缺留档彩图 " + colorFile); return false; }
	if (!fs.existsSync(silFile)) { console.log("  ✗ " + id + "：缺剪影备份 " + silFile); return false; }
	const info = maskFill(colorFile, silFile, path.join(SPRITE_DIR, id + ".png"));
	console.log(`  ✓ 灌色 ${id}  scale=${info.scale}  剪影框${info.silBox}  彩图框${info.colBox}  浅粉${info.paleIsBg ? "剔" : "留"}`);
	return true;
}

function main() {
	const a = parseArgs(process.argv.slice(2));
	const m = loadManifest();

	if (a.list) {
		for (const o of ORDERS) {
			const it = m.items.find((i) => i.id === o.id) || { status: "pending" };
			console.log(`  ${it.status === "done" ? "✓" : "·"} ${o.id.padEnd(18)} ${o.scene.slice(0, 24)}…`);
		}
		return;
	}

	if (a.qa) { qa(); return; }

	if (a.composite) {
		let bad = 0;
		for (const o of ORDERS) {
			if (a.only && !a.only.includes(o.id)) continue;
			if (!compositeOne(o.id)) bad++;
		}
		process.exitCode = bad ? 1 : 0;
		return;
	}

	let items = ORDERS.filter((o) => !a.only || a.only.includes(o.id));
	if (!a.force) items = items.filter((o) => {
		const it = m.items.find((i) => i.id === o.id);
		return !it || it.status !== "done";
	});
	if (!items.length) { console.log("  没有待出的图。（--force 可废片重出）"); return; }

	if (a.dry) {
		for (const o of items) {
			const r = runSkill(o, true);
			if (r.status !== 0) { console.error("  ✗ dry 失败 " + o.id + "：" + r.stderr.slice(0, 200)); process.exitCode = 1; continue; }
			const j = parseJsonOut(r.stdout);
			console.log(`  ✓ ${o.id.padEnd(18)} size=${j.request && j.request.size}  prompt=${(j.request && j.request.prompt || "").length}字`);
			console.log(`      ${(j.request && j.request.prompt || "").slice(0, 80)}…`);
		}
		return;
	}

	if (!fs.existsSync(KEY_FILE)) {
		console.error("  找不到 %TEMP%/.ark_plan_key —— 请先把 ark- 开头的 AgentPlan key 写进这个文件（一行）。");
		process.exit(2);
	}
	if (items.length > 3 && !a.yes) {
		console.error(`  一次要出 ${items.length} 张，加 --yes 确认。`);
		process.exit(2);
	}

	fs.mkdirSync(STAGING, { recursive: true });
	fs.mkdirSync(COLOR_DIR, { recursive: true });
	for (const o of items) {
		process.stdout.write(`  出图 ${o.id} … `);
		const before = newestStaging();
		const r = runSkill(o, false);
		if (r.status !== 0) { console.log("✗\n" + r.stderr.slice(0, 400)); continue; }
		const got = newestStaging();
		if (!got || (before && got === before)) { console.log("✗ staging 没有新文件"); continue; }
		const keyed = path.join(COLOR_DIR, o.id + ".png");
		const st = keyOut(got, keyed);
		const ratio = st.alpha / st.total;
		if (ratio < 0.15 || ratio > 0.92) { console.log(`✗ 键控异常 透明${(ratio * 100).toFixed(0)}%（留档未灌色，可目检 ${keyed}）`); continue; }
		ensureBackup(o.id);
		if (compositeOne(o.id)) {
			const it = itemOf(m, o.id);
			it.status = "done";
			saveManifest(m);
		}
	}
	console.log("  完。");
}

main();
