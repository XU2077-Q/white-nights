/* ============================================================
   《罪与罚》导赏 VN：10 张 AI 底图经官方 AgentPlan seedream skill 出图
   ----------------------------------------------------------------
   风格（桌面参照图《罪与罚》不同风格配图生成.png）：
     极简文学插画骨架：大留白、黑色剪影、纤细红线象征
     叠水粉莫奈印象：浓雾、冷暖反光、松散笔触 → 文学封面感的哲学寓言图

   【key 纪律】（与时局图项目同一套）
   · 本脚本不接受命令行 key，也不打印 key。
   · key 只从仓库外 %TEMP%/.ark_plan_key 读（一行，ark- 开头），
     仅作为 API_KEY 注入子进程环境。批次结束手动删除该文件。

   用法：
     node tools/gen_bg_plan.js --list            看工单
     node tools/gen_bg_plan.js --dry             逐张 --dry-run，不联网不读 key
     node tools/gen_bg_plan.js --only title      真出一张
     node tools/gen_bg_plan.js --missing --yes   出齐所有未完成的
     node tools/gen_bg_plan.js --only x --force --yes   废片重出
     node tools/gen_bg_plan.js --qa              本地质检（存在性/尺寸/非空）

   出图固定参数：--model pro --size 1920x1080 --output_format jpeg
     --watermark false --optimize false
   ============================================================ */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(__dirname, "bg_manifest.json");
const SKILL_SCRIPT = "D:\\claude\\时局图-rpg\\.agents\\skills\\byted-ark-seedream-skill\\scripts\\generate.js";
const STAGING = path.join(__dirname, "art_src", "_staging");
const OUT_DIR = path.join(ROOT, "assets", "bg");
const ENGINE_MANIFEST = path.join(OUT_DIR, "manifest.json");
const KEY_FILE = path.join(os.tmpdir(), ".ark_plan_key");

/* 风格后缀：每张工单的场景描述后面都接这一段，漏一个元素画风就飘 */
const STYLE =
	"，水粉画质感，莫奈印象派松散笔触，浓雾弥漫，大面积留白构图，" +
	"冷蓝灰色调中点缀暖黄灯光反光，极简文学插画风格，人物为纯黑色剪影无面部细节，" +
	"画面中有一根纤细的红色丝线穿过，十九世纪俄国圣彼得堡背景，" +
	"文学小说封面感，哲学寓言氛围，柔和漫射光，无文字无水印";

const ORDERS = [
	{ id: "title",      scene: "雾夜的城市全景，远处一座尖顶教堂刺破浓雾，天空一轮昏黄月亮，前景一个孤独的黑色剪影青年背影仰望城市，红色丝线从画面左下角蜿蜒伸向远方" },
	{ id: "petersburg", scene: "夏日闷热的彼得堡运河街景，狭窄运河水面倒映暖黄灯火，两岸歪斜的古典楼房剪影，两个小小的人影在桥上交错而过，雾气浑浊泛黄" },
	{ id: "tavern",     scene: "昏暗小酒馆内部，琥珀色灯光，长吧台和几个酒瓶剪影，一个醉汉剪影伏在吧台上，背景烟雾缭绕" },
	{ id: "garret",     scene: "顶楼斜顶阁楼内部，极低的天花板压下来，一扇小小的方窗透进冷灰色天光，窗下一个瘦削青年剪影抱膝坐在窄床上" },
	{ id: "pawnshop",   scene: "阴暗公寓楼道，一扇紧闭的房门，门缝下漏出一线暗红色光芒，门前站着一个低头伫立的青年黑色剪影，楼梯向黑暗中盘旋而下" },
	{ id: "dream_horse",scene: "噩梦场景，暗紫色调，一匹瘦马剪影被人群剪影围住，人群举着手臂，画面压抑扭曲，红色丝线在地面散乱缠绕" },
	{ id: "porfiry",    scene: "审讯室内部，一盏悬吊台灯投下锥形光柱，光柱中一张桌子和两把相对的椅子，两个对坐的人影剪影，窗外是苍白的天光" },
	{ id: "sonya_room", scene: "狭小歪斜的房间内部，桌上一支蜡烛发出温暖光晕，窗上十字窗棂，两个相对而坐的人影剪影，一个低头一个倾身，氛围温柔哀伤" },
	{ id: "square",     scene: "开阔的城市广场，远处洋葱头圆顶教堂剪影，广场中央一个人影跪俯于地亲吻大地，红色丝线从人影身上延伸钻进地面" },
	{ id: "siberia",    scene: "西伯利亚雪原黎明，冷蓝白色天地间一线温暖的橙色地平线，宽阔河面，远处几座营房剪影，两个人影剪影并肩站在河边，氛围宁静重生" },
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
	return { items: ORDERS.map((o) => ({ id: o.id, status: "pending", file: null })) };
}
function saveManifest(m) { fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n"); }

/* ---------------------- 调子 skill ---------------------- */

function parseJsonOut(stdout) {
	const s = stdout.indexOf("{"), e = stdout.lastIndexOf("}");
	if (s < 0 || e <= s) throw new Error("skill 没返回 JSON：" + stdout.slice(0, 300));
	return JSON.parse(stdout.slice(s, e + 1));
}

function runSkill(prompt, dry) {
	const args = [
		"--model", "pro",
		"--size", "1920x1080",
		"--output_format", "jpeg",
		"--watermark", "false",   // 不显式关就盖水印
		"--optimize", "false",    // 不显式关就追加「电影质感/8K」污染文风
		"--prompt", prompt,
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

/* JPEG SOF 段读尺寸 */
function jpgSize(file) {
	const b = fs.readFileSync(file);
	for (let i = 2; i < b.length - 9; i++) {
		if (b[i] === 0xff && b[i + 1] >= 0xc0 && b[i + 1] <= 0xcf && b[i + 1] !== 0xc4 && b[i + 1] !== 0xc8 && b[i + 1] !== 0xcc) {
			return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
		}
	}
	return null;
}

/* 引擎 manifest：把已成图的 id 写进 jpg 列表 */
function syncEngineManifest(m) {
	const jpgs = m.items.filter((i) => i.status === "done").map((i) => i.id);
	fs.writeFileSync(ENGINE_MANIFEST, JSON.stringify({ jpg: jpgs }, null, 2) + "\n");
}

/* ---------------------- 主流程 ---------------------- */

function main() {
	const a = parseArgs(process.argv.slice(2));
	const m = loadManifest();

	if (a.list) {
		for (const o of ORDERS) {
			const it = m.items.find((i) => i.id === o.id) || { status: "pending" };
			console.log(`  ${it.status === "done" ? "✓" : "·"} ${o.id.padEnd(12)} ${o.scene.slice(0, 30)}…`);
		}
		return;
	}

	if (a.qa) {
		let bad = 0;
		for (const o of ORDERS) {
			const f = path.join(OUT_DIR, o.id + ".jpg");
			if (!fs.existsSync(f)) { console.log("  ✗ " + o.id + "：缺文件"); bad++; continue; }
			const sz = jpgSize(f), kb = Math.round(fs.statSync(f).size / 1024);
			if (!sz) { console.log("  ✗ " + o.id + "：读不出 JPEG 尺寸"); bad++; continue; }
			const ok = ((sz.w === 1920 && sz.h === 1080) || (sz.w === 1024 && sz.h === 576)) && kb > 100;
			console.log(`  ${ok ? "✓" : "✗"} ${o.id.padEnd(12)} ${sz.w}x${sz.h}  ${kb}KB`);
			if (!ok) bad++;
		}
		console.log(bad ? `  **${bad} 张不合格**` : "  全部合格。");
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
			const r = runSkill(o.scene + STYLE, true);
			if (r.status !== 0) { console.error("  ✗ dry 失败 " + o.id + "：" + r.stderr.slice(0, 200)); process.exitCode = 1; continue; }
			const j = parseJsonOut(r.stdout);
			console.log(`  ✓ ${o.id.padEnd(12)} model=${j.request && j.request.model}  size=${j.request && j.request.size}  watermark=${j.request && j.request.watermark}  prompt=${(j.request && j.request.prompt || "").length}字`);
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
	fs.mkdirSync(OUT_DIR, { recursive: true });
	for (const o of items) {
		process.stdout.write(`  出图 ${o.id} … `);
		const before = newestStaging();
		const r = runSkill(o.scene + STYLE, false);
		if (r.status !== 0) { console.log("✗\n" + r.stderr.slice(0, 400)); continue; }
		const got = newestStaging();
		if (!got || (before && got === before)) { console.log("✗ staging 没有新文件"); continue; }
		const dest = path.join(OUT_DIR, o.id + ".jpg");
		fs.copyFileSync(got, dest);
		const sz = jpgSize(dest);
		const it = m.items.find((i) => i.id === o.id);
		if (it) { it.status = "done"; it.file = "assets/bg/" + o.id + ".jpg"; }
		saveManifest(m);
		syncEngineManifest(m);
		console.log(`✓ ${sz ? sz.w + "x" + sz.h : "?"}  ${Math.round(fs.statSync(dest).size / 1024)}KB → assets/bg/${o.id}.jpg`);
	}
	syncEngineManifest(m);
	console.log("  引擎 manifest 已同步。记得删 %TEMP%/.ark_plan_key。");
}

main();
