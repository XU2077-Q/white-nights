/* ============================================================
   《白夜》VN：AI 出图驱动（官方 AgentPlan seedream skill）
   ----------------------------------------------------------------
   三类工单：
     bg     背景 11 张，jpeg 1920x1080  → assets/bg/<id>.jpg（引擎 manifest jpg 白名单）
     cg     结尾拥抱全彩 CG 1 张，jpeg 1920x1080 → assets/bg/cg_hug.jpg（同属 bg 目录）
     sprite 立绘 12 张，png 1024x1536 品红底 → 键控去背 → assets/sprite/<id>.png（manifest png 白名单）

   【key 纪律】（与时局图/罪与罚同一套）
   · 本脚本不接受命令行 key，也不打印 key。
   · key 只从仓库外 %TEMP%/.ark_plan_key 读（一行，ark- 开头），
     仅作为 API_KEY 注入子进程环境。批次结束手动删除该文件。

   用法：
     node tools/gen_art_plan.js --list            看工单
     node tools/gen_art_plan.js --dry             逐张 --dry-run，不联网不读 key
     node tools/gen_art_plan.js --only garret     真出一张
     node tools/gen_art_plan.js --missing --yes   出齐所有未完成的
     node tools/gen_art_plan.js --only x --force --yes   废片重出
     node tools/gen_art_plan.js --qa              本地质检（尺寸/体积/alpha 占比/包围盒）
   ============================================================ */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { readPNG } = require("./png_read.js");
const { writePNG, Canvas } = require("./png.js");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(__dirname, "art_manifest.json");
const SKILL_SCRIPT = path.join(ROOT, ".claude", "skills", "byted-ark-seedream-skill", "scripts", "generate.js");
const STAGING = path.join(__dirname, "art_src", "_staging");
const BG_DIR = path.join(ROOT, "assets", "bg");
const SPRITE_DIR = path.join(ROOT, "assets", "sprite");
const BG_ENGINE_MANIFEST = path.join(BG_DIR, "manifest.json");
const SPRITE_ENGINE_MANIFEST = path.join(SPRITE_DIR, "manifest.json");
const KEY_FILE = path.join(os.tmpdir(), ".ark_plan_key");

/* 背景风格后缀：罪与罚同款水粉极简骨架，红线换成白夜蓝紫天光 */
const STYLE_BG =
	"，水粉画质感，莫奈印象派松散笔触，薄雾弥漫，大面积留白构图，" +
	"白夜奇异的天光——淡蓝紫色暮空整夜不落，冷蓝灰色调中点缀暖黄灯火反光，" +
	"极简文学插画风格，人物为纯黑色剪影无面部细节，十九世纪俄国圣彼得堡背景，" +
	"文学小说封面感，温柔忧郁而含希望的氛围，柔和漫射光，无文字无水印";

/* 立绘风格后缀：品红纯色底 + 精致黑色剪影，便于键控去背 */
const STYLE_SPRITE =
	"，全身立绘，纯黑色精致剪影无面部细节，1840年代俄国彼得堡服饰廓形，" +
	"剪影边缘清晰，发丝与衣褶轮廓细腻，人物垂直居中、脚底距画面下缘留少量空，" +
	"纯色洋红背景（#FF00FF），无阴影无地面投影无背景渐变，无文字无水印";

const ORDERS = [
	/* ---- 背景 11 张 ---- */
	{ kind: "bg", id: "title",          scene: "白夜的彼得堡全景，涅瓦河宽阔水面倒映淡蓝紫色天光，远处尖顶教堂与要塞剪影，天顶几颗稀疏的星，前景屋顶边缘一个青年黑色剪影仰望天空" },
	{ kind: "bg", id: "open_city",      scene: "白夜城市全景，连绵的古典楼房与烟囱剪影层层叠叠，天空是整夜不落的淡蓝白色暮光，几缕薄云被染成淡紫" },
	{ kind: "bg", id: "open_roof",      scene: "屋顶与烟囱的剪影世界，斜屋顶层层叠叠伸向远方，白夜天光从楼后漫上来，一只鸟剪影飞过" },
	{ kind: "bg", id: "open_canal",     scene: "运河笔直伸向远方，水面如镜倒映淡蓝紫色白夜天光与两岸楼房剪影，石栏杆与复古街灯剪影" },
	{ kind: "bg", id: "open_street",    scene: "空荡的长街纵深构图，两侧三层古典楼房剪影，街灯刚亮起暖黄光晕，石板路微微反光，尽头是白夜天光" },
	{ kind: "bg", id: "street",         scene: "白夜街景，人行道与一盏街灯，远处两个小小人影剪影交错而过，楼房窗内零星暖光" },
	{ kind: "bg", id: "embankment",     scene: "堤岸石栏杆与一张空长椅，运河水面倒映白夜天光，一盏街灯，树枝从画角垂落" },
	{ kind: "bg", id: "bridge",         scene: "铸铁小桥横跨运河，桥灯两盏，桥心一个少女剪影凭栏低头，远处一个青年剪影快步走来" },
	{ kind: "bg", id: "room",           scene: "十九世纪俄国老妇人客厅内部，桌上茶炊冒着热气，一只猫蜷缩在旧扶手椅上，窗台几盆天竺葵，暖黄灯光与窗外白夜微光交织" },
	{ kind: "bg", id: "garret",         scene: "顶楼斜顶阁楼内部，极低的天花板压下来，一扇小方窗透进白夜淡蓝天光，窗下窄床与旧书桌，一支蜡烛和摊开的书" },
	{ kind: "bg", id: "morning_street", scene: "清晨雨中的街，灰绿色天空低垂，石板路湿反光，远处一个撑伞邮差剪影走过，氛围微凉惆怅" },
	/* ---- 结尾全彩 CG 1 张（全游戏唯一上色画面） ---- */
	{ kind: "cg", id: "cg_hug",         scene: "白夜的堤岸上，少女扑进青年怀中紧紧相拥，少女的披巾被风扬起，两人脚下运河水面倒映淡蓝紫色天光，水粉画质感，莫奈印象派松散笔触，温柔而心碎的氛围，柔和漫射光，无文字无水印", fullColor: true },
	/* ---- 立绘 12 张 ---- */
	{ kind: "sprite", id: "dreamer_default", scene: "瘦削青年男子，头戴高顶礼帽，身穿长外套与围巾，一手持手杖自然垂立" },
	{ kind: "sprite", id: "dreamer_think",   scene: "瘦削青年男子，头戴高顶礼帽，身穿长外套与围巾，一手托着下巴低头沉思，微微驼背" },
	{ kind: "sprite", id: "dreamer_excited", scene: "瘦削青年男子，头戴高顶礼帽，身穿长外套与围巾，双臂张开激动演说，衣摆扬起" },
	{ kind: "sprite", id: "dreamer_shy",     scene: "瘦削青年男子，礼帽拿在胸前双手捧着，低头局促，羞涩" },
	{ kind: "sprite", id: "nastenka_smile",  scene: "少女，1840年代高腰长裙与披巾，发辫盘起，双手背在身后微微歪头微笑" },
	{ kind: "sprite", id: "nastenka_sad",    scene: "少女，1840年代高腰长裙与披巾，发辫盘起，低头垂手，披巾裹紧肩膀，忧伤" },
	{ kind: "sprite", id: "nastenka_expect", scene: "少女，1840年代高腰长裙与披巾，发辫盘起，踮脚向远处张望，一手搭在额前" },
	{ kind: "sprite", id: "nastenka_tears",  scene: "少女，1840年代高腰长裙与披巾，发辫盘起，抬手以手帕拭泪，肩膀微微前倾" },
	{ kind: "sprite", id: "nastenka_joy",    scene: "少女，1840年代高腰长裙与披巾，发辫盘起，裙摆轻扬转身，双臂舒展，喜悦" },
	{ kind: "sprite", id: "lodger_default",  scene: "年轻男子房客，短外套与软帽，手提一只小皮箱，客气地微微欠身" },
	{ kind: "sprite", id: "lodger_serious",  scene: "年轻男子房客，短外套与软帽，双臂交叉抱在胸前，站得笔直，神情严肃" },
	{ kind: "sprite", id: "granny_default",  scene: "矮胖老妇人，大头巾与厚披肩，长围裙，拄着一根拐杖" },
];

/* ---------------------- 参数 ---------------------- */

function parseArgs(argv) {
	const a = { only: null, force: false, yes: false, dry: false, list: false, qa: false };
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--dry") a.dry = true;
		else if (v === "--list") a.list = true;
		else if (v === "--force") a.force = true;
		else if (v === "--yes" || v === "-y") a.yes = true;
		else if (v === "--qa") a.qa = true;
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
	if (!it) { it = { id, status: "pending", file: null }; m.items.push(it); }
	return it;
}

/* ---------------------- 调子 skill ---------------------- */

function parseJsonOut(stdout) {
	const s = stdout.indexOf("{"), e = stdout.lastIndexOf("}");
	if (s < 0 || e <= s) throw new Error("skill 没返回 JSON：" + stdout.slice(0, 300));
	return JSON.parse(stdout.slice(s, e + 1));
}

function orderSpec(o) {
	if (o.kind === "sprite") return { size: "1024x1536", fmt: "png", style: STYLE_SPRITE };
	return { size: "1920x1080", fmt: "jpeg", style: o.fullColor ? "" : STYLE_BG };
}

function runSkill(o, dry) {
	const spec = orderSpec(o);
	const args = [
		"--model", "pro",
		"--size", spec.size,
		"--output_format", spec.fmt,
		"--watermark", "false",   // 不显式关就盖水印
		"--optimize", "false",    // 不显式关就追加「电影质感/8K」污染文风
		"--prompt", o.scene + spec.style,
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

/* staging 里时间最新的图就是刚出的那张（skill 会存进日期子目录，得递归） */
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

/* ---------------------- JPEG/PNG 尺寸 ---------------------- */

function jpgSize(file) {
	const b = fs.readFileSync(file);
	for (let i = 2; i < b.length - 9; i++) {
		if (b[i] === 0xff && b[i + 1] >= 0xc0 && b[i + 1] <= 0xcf && b[i + 1] !== 0xc4 && b[i + 1] !== 0xc8 && b[i + 1] !== 0xcc) {
			return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
		}
	}
	return null;
}
function pngSize(file) {
	const b = fs.readFileSync(file);
	if (b.readUInt32BE(0) !== 0x89504e47) return null;
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* ---------------------- 品红键控去背 ---------------------- */

function isKey(r, g, b) {
	// Seedream 的「洋红」实际色漂得厉害：见过 #FF00FF，也见过偏红的 (246,12,163)/(230,3,127)。
	// 阈值放宽到 b>=100，靠 r/b 双高 + g 低 + 红蓝都甩绿来认；剪影近黑像素三通道全低，不会误伤。
	return r >= 170 && b >= 100 && g <= 110 && r - g >= 80 && b - g >= 40;
}

/* 品红底 → alpha PNG；返回 {total, alpha} 透明像素统计 */
function keyOut(src, dest) {
	const img = readPNG(src);
	const c = new Canvas(img.w, img.h);
	let alpha = 0;
	const d = c.data, W = img.w;   // Canvas 无 set()，直接写底层 RGBA 缓冲（初始全透明）
	for (let y = 0; y < img.h; y++) {
		for (let x = 0; x < img.w; x++) {
			const [r, g, b] = img.at(x, y);
			const i = (y * W + x) * 4;
			if (isKey(r, g, b)) { alpha++; }   // 已全透明，无需写
			else { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
		}
	}
	writePNG(dest, c);
	return { total: img.w * img.h, alpha };
}

/* contentBox：键控后非透明像素包围盒；全空（废片）返回 null */
function contentBox(file) {
	const img = readPNG(file);
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

/* ---------------------- 引擎 manifest ---------------------- */

function syncEngineManifests(m) {
	const jpgs = m.items.filter((i) => i.status === "done" && i.kind !== "sprite").map((i) => i.id);
	fs.writeFileSync(BG_ENGINE_MANIFEST, JSON.stringify({ jpg: jpgs }, null, 2) + "\n");
	const pngs = m.items.filter((i) => i.status === "done" && i.kind === "sprite").map((i) => i.id);
	fs.writeFileSync(SPRITE_ENGINE_MANIFEST, JSON.stringify({ png: pngs }, null, 2) + "\n");
}

/* ---------------------- QA ---------------------- */

function qa() {
	let bad = 0;
	for (const o of ORDERS) {
		if (o.kind === "sprite") {
			const f = path.join(SPRITE_DIR, o.id + ".png");
			if (!fs.existsSync(f)) { console.log("  ✗ " + o.id + "：缺文件"); bad++; continue; }
			const sz = pngSize(f), kb = Math.round(fs.statSync(f).size / 1024);
			if (!sz) { console.log("  ✗ " + o.id + "：读不出 PNG 尺寸"); bad++; continue; }
			const img = readPNG(f);
			let alpha = 0;
			for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.at(x, y)[3] < 24) alpha++;
			const box = contentBox(f);
			const ratio = alpha / (img.w * img.h);
			const ok = (sz.w === 1024 && sz.h === 1536) && kb > 50 && box && ratio > 0.15 && ratio < 0.92;
			console.log(`  ${ok ? "✓" : "✗"} ${o.id.padEnd(18)} ${sz.w}x${sz.h}  ${kb}KB  透明${(ratio * 100).toFixed(0)}%  人物${box ? box.w + "x" + box.h : "无"}`);
			if (!ok) bad++;
		} else {
			const f = path.join(BG_DIR, o.id + ".jpg");
			if (!fs.existsSync(f)) { console.log("  ✗ " + o.id + "：缺文件"); bad++; continue; }
			const sz = jpgSize(f), kb = Math.round(fs.statSync(f).size / 1024);
			if (!sz) { console.log("  ✗ " + o.id + "：读不出 JPEG 尺寸"); bad++; continue; }
			const ok = ((sz.w === 1920 && sz.h === 1080) || (sz.w === 1024 && sz.h === 576)) && kb > 100;
			console.log(`  ${ok ? "✓" : "✗"} ${o.id.padEnd(18)} ${sz.w}x${sz.h}  ${kb}KB`);
			if (!ok) bad++;
		}
	}
	console.log(bad ? `  **${bad} 张不合格**` : "  全部合格。");
	process.exitCode = bad ? 1 : 0;
}

/* ---------------------- 主流程 ---------------------- */

function main() {
	const a = parseArgs(process.argv.slice(2));
	const m = loadManifest();

	if (a.list) {
		for (const o of ORDERS) {
			const it = m.items.find((i) => i.id === o.id) || { status: "pending" };
			console.log(`  ${it.status === "done" ? "✓" : "·"} [${o.kind}] ${o.id.padEnd(18)} ${o.scene.slice(0, 26)}…`);
		}
		return;
	}

	if (a.qa) { qa(); return; }

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
			console.log(`  ✓ ${o.id.padEnd(18)} model=${j.request && j.request.model}  size=${j.request && j.request.size}  fmt=${j.request && j.request.output_format}  watermark=${j.request && j.request.watermark}  prompt=${(j.request && j.request.prompt || "").length}字`);
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
	fs.mkdirSync(BG_DIR, { recursive: true });
	fs.mkdirSync(SPRITE_DIR, { recursive: true });
	for (const o of items) {
		process.stdout.write(`  出图 ${o.id} … `);
		const before = newestStaging();
		const r = runSkill(o, false);
		if (r.status !== 0) { console.log("✗\n" + r.stderr.slice(0, 400)); continue; }
		const got = newestStaging();
		if (!got || (before && got === before)) { console.log("✗ staging 没有新文件"); continue; }
		const it = itemOf(m, o.id);
		it.kind = o.kind;
		if (o.kind === "sprite") {
			const dest = path.join(SPRITE_DIR, o.id + ".png");
			const st = keyOut(got, dest);
			const sz = pngSize(dest);
			it.status = "done"; it.file = "assets/sprite/" + o.id + ".png";
			saveManifest(m); syncEngineManifests(m);
			console.log(`✓ ${sz ? sz.w + "x" + sz.h : "?"}  ${Math.round(fs.statSync(dest).size / 1024)}KB  透明${(st.alpha / st.total * 100).toFixed(0)}% → assets/sprite/${o.id}.png`);
		} else {
			const dest = path.join(BG_DIR, o.id + ".jpg");
			fs.copyFileSync(got, dest);
			const sz = jpgSize(dest);
			it.status = "done"; it.file = "assets/bg/" + o.id + ".jpg";
			saveManifest(m); syncEngineManifests(m);
			console.log(`✓ ${sz ? sz.w + "x" + sz.h : "?"}  ${Math.round(fs.statSync(dest).size / 1024)}KB → assets/bg/${o.id}.jpg`);
		}
	}
	console.log("  引擎 manifest 已同步。记得删 %TEMP%/.ark_plan_key。");
}

main();
