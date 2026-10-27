// export_renpy.js —— 把 js/script.js 的 655 拍全量转写成 Ren'Py script.rpy
// 用法：node tools/export_renpy.js   → 写 ../white-nights-renpy/game/script.rpy
// 状态跟踪：pos 缺省沿用该角色上次站位（引擎 engine.js:193 行为）；说话人 lit、其余 dim，
// 只在状态变化时发射 show 语句，与网页版立绘演出语义一致。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = 'D:/claude/white-nights-renpy/game/script.rpy';
const src = fs.readFileSync(path.join(ROOT, 'js', 'script.js'), 'utf8');
const mod = {};
(new Function('exports', src + '\nexports.SCRIPT=SCRIPT;exports.OPENING=OPENING;exports.CHAR_SPRITE=CHAR_SPRITE;exports.CHAR_COLORS=CHAR_COLORS;'))(mod);
const { SCRIPT, OPENING, CHAR_SPRITE, CHAR_COLORS } = mod;

const CHAR_VAR = { '幻想家': 'dreamer', '娜斯津卡': 'nastenka', '年轻房客': 'lodger', '祖母': 'granny', '玛特廖娜': 'matryona' };

function esc(t) {
    return t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\{/g, '{{').replace(/\}/g, '}}');
}

// ---- 收集用到的 glow 档位（scene.glow + glow 拍）----
const glowVals = new Set();
for (const sc of SCRIPT) {
    glowVals.add(sc.glow != null ? sc.glow : 0);
    for (const b of sc.beats) if (b.type === 'glow') glowVals.add(b.set);
}

// ---- 收集用到的背景名（scene.bg + bg 拍 + 开场 + cg/title）----
const bgNames = new Set(['black']);
for (const sc of SCRIPT) {
    bgNames.add(sc.bg);
    for (const b of sc.beats) if (b.type === 'bg') bgNames.add(b.set);
}
for (const im of OPENING.images) bgNames.add(im);

// ---- 收集用到的立绘（sprite 目录全定义，用到的姿态集合做校验）----
const spriteDir = path.join(ROOT, 'assets', 'sprite');
const spriteFiles = fs.readdirSync(spriteDir).filter(f => f.endsWith('.png'));
const poseNames = {};
for (const f of spriteFiles) {
    const m = f.match(/^(\w+?)_(\w+)\.png$/);
    if (!m) continue;
    (poseNames[m[1]] = poseNames[m[1]] || []).push(m[2]);
}
const usedPoses = {};
for (const sc of SCRIPT) for (const b of sc.beats) {
    if (b.type === 'sprite' && !b.off) {
        const sp = CHAR_SPRITE[b.who];
        if (!sp) throw new Error('sprite 拍角色无映射: ' + b.who);
        const pose = b.pose || 'default';
        usedPoses[sp + '_' + pose] = true;
        if (!poseNames[sp] || !poseNames[sp].includes(pose)) throw new Error(`缺立绘 ${sp}_${pose}.png`);
    }
}

const L = [];
const emit = s => L.push(s);

// ============ 头部：角色 / 图像 / 变换 ============
emit('## 《白夜》Ren' + "'" + 'Py 版剧本 —— 由 tools/export_renpy.js 从 js/script.js 全量转写，勿手改');
emit('## 谷羽译本全文 655 拍 · 六章 · 剪影立绘 lit/dim 演出与网页版一致');
emit('');
emit('define nn = Character(None, what_font="fonts/LXGWWenKai-Regular.ttf", what_color="#e6ecf7")');
for (const [who, color] of Object.entries(CHAR_COLORS)) {
    const v = CHAR_VAR[who];
    if (!v) throw new Error('CHAR_COLORS 角色缺变量名: ' + who);
    emit(`define ${v} = Character("${who}", color="${color}")`);
}
emit('');
emit('image glow_overlay = Solid("#dce9ff", xysize=(1920, 1080))');
// 坑：AI 成图已是原生 1920x1080，直接引用；若再 FactorScale(1.875) 会放大成 3600x2025 居中裁切
emit('image cg hug = "images/bg/cg_hug.jpg"');
emit('image mm_bg = "images/bg/title.jpg"');
emit('image gm_bg = "images/bg/open_canal.jpg"');
for (const n of [...bgNames].sort()) {
    if (n === 'black') continue;
    emit(`image bg_${n} = "images/bg/${n}.jpg"`);
}
for (const [sp, poses] of Object.entries(poseNames)) {
    for (const p of poses.sort()) {
        emit(`image ${sp} ${p} = "images/sprite/${sp}_${p}.png"`);
        // 微光描边层：模糊烘焙进 im.MatrixColor（im.Blur 走 CPU），transform blur 会走 GPU 串原图暖色鬼影
        emit(`image ${sp} ${p} glow = im.MatrixColor(im.Blur("images/sprite/${sp}_${p}.png", 16), im.matrix.colorize("#8fb4e8", "#8fb4e8"))`);
    }
}
emit('');
emit('transform pos_left:');
emit('    xalign 0.18 yalign 1.0 zoom 0.63');
emit('transform pos_center:');
emit('    xalign 0.5 yalign 1.0 zoom 0.63');
emit('transform pos_right:');
emit('    xalign 0.82 yalign 1.0 zoom 0.63');
emit('transform sp_lit:');
emit('    easein 0.45 matrixcolor BrightnessMatrix(0.0) yoffset 0 zoom 0.63 xoffset 0');
emit('transform sp_dim:');
emit('    easein 0.45 matrixcolor BrightnessMatrix(-0.55) yoffset 14 zoom 0.60 xoffset 0');
emit('transform sp_glowfx:');
emit('    zoom 0.63 xoffset 0 yoffset 0');
emit('    alpha 0.0');
emit('    easein 0.45 alpha 0.8');
for (const v of [...glowVals].sort((a, b) => a - b)) {
    emit(`transform glow_${Math.round(v * 100)}:`);
    emit(`    alpha ${(v * 0.32).toFixed(2)}`);
}
emit('');
emit('transform kb_in:');
emit('    subpixel True xalign 0.5 yalign 0.5 zoom 1.0');
emit('    ease 40.0 zoom 1.09');
emit('transform kb_pan:');
emit('    subpixel True xalign 0.0 yalign 0.5 zoom 1.08');
emit('    ease 40.0 xalign 1.0');
emit('transform kb_out:');
emit('    subpixel True xalign 0.5 yalign 0.5 zoom 1.09');
emit('    ease 40.0 zoom 1.0');
emit('');
emit('screen cg_view(img):');
emit('    add img');
emit('screen chapter_select():');
emit('    tag menu');
emit('    use game_menu(_("章节选择")):');
emit('        vbox:');
emit('            xalign 0.5 yalign 0.5 spacing 18');
SCRIPT.forEach((sc, i) => {
    const lab = 'ch' + (i + 1);
    emit(`            textbutton "${sc.title}" action Start("${lab}") sensitive (i == 0 or persistent.unlocked_${lab})`.replace('(i == 0', `(${i} == 0`));
});
emit('');

// ============ 正片 ============
// 立绘状态：{ who中文: { pose, pos, lit } }
let stage = {};
let curMusic = null;

function showSprite(who, poseChanged) {
    const st = stage[who];
    const sp = CHAR_SPRITE[who];
    emit(`    show ${sp} ${st.pose} at pos_${st.pos}, ${st.lit ? 'sp_lit' : 'sp_dim'}`);
    if (st.lit) emit(`    show ${sp} ${st.pose} glow as ${sp}_glow at pos_${st.pos}, sp_glowfx behind ${sp}`);
    else emit(`    hide ${sp}_glow`);
}

function spriteBeat(b) {
    const who = b.who;
    if (b.off) {
        if (stage[who]) {
            emit(`    hide ${CHAR_SPRITE[who]}_glow with dissolve`);
            emit(`    hide ${CHAR_SPRITE[who]} with dissolve`);
            delete stage[who];
        }
        return;
    }
    const pose = b.pose || 'default';
    const prev = stage[who];
    const pos = b.pos || (prev && prev.pos) || 'center';
    if (!prev) {
        stage[who] = { pose, pos, lit: false };
        showSprite(who);
    } else if (prev.pose !== pose || prev.pos !== pos) {
        prev.pose = pose; prev.pos = pos;
        showSprite(who);
    }
}

function sayBeat(b) {
    const who = b.who;
    const sp = CHAR_SPRITE[who];
    // 说话人 lit、其余在台上的 dim（仅当说话人有立绘且在台上时动演出，对齐网页版）
    if (sp && stage[who]) {
        let changed = false;
        for (const [w, st] of Object.entries(stage)) {
            const want = (w === who);
            if (st.lit !== want) { st.lit = want; changed = true; }
        }
        if (changed) for (const w of Object.keys(stage)) showSprite(w);
    }
    emit(`    ${CHAR_VAR[who]} "${esc(b.text)}"`);
}

// ---- 开场 ----
emit('label start:');
emit('    scene black');
emit(`    play music "audio/${OPENING.music}.mp3" fadein 2.0`);
curMusic = OPENING.music;
OPENING.images.forEach((im, i) => {
    const kb = ['kb_in', 'kb_pan', 'kb_in', 'kb_out'][i % 4];
    emit(`    scene bg_${im} at ${kb} with Dissolve(1.2)`);
    emit(`    show expression Text("${esc(OPENING.lines[i])}", size=40, color="#f2f5fb", xalign=0.5, yalign=0.82, textalign=0.5, outlines=[(2, "#10131c", 0, 0)]) as oline with dissolve`);
    emit('    pause 5.0');
    emit('    hide oline with dissolve');
});
emit('');

// ---- 六章 ----
SCRIPT.forEach((sc, si) => {
    const lab = 'ch' + (si + 1);
    emit(`label ${lab}:   # ${sc.title}`);
    emit(`    $ persistent.unlocked_${lab} = True`);
    const kb = sc.kb ? ` at kb_${sc.kb}` : '';
    emit(`    scene bg_${sc.bg}${kb} with Dissolve(1.0)`);
    if (sc.music !== curMusic) {
        emit(`    play music "audio/${sc.music}.mp3" fadein 1.5`);
        curMusic = sc.music;
    }
    const gv = sc.glow != null ? sc.glow : 0;
    emit(`    show glow_overlay at glow_${Math.round(gv * 100)}`);
    emit('');
    stage = {};   // scene 已清空图层，台帐同步重置，否则同姿态同站位会被误判「无变化」漏发 show
    for (const b of sc.beats) {
        switch (b.type) {
            case 'narr':
                emit(`    nn "${esc(b.text)}"`);
                break;
            case 'say':
                sayBeat(b);
                break;
            case 'sprite':
                spriteBeat(b);
                break;
            case 'bg':
                emit(`    scene bg_${b.set} with dissolve`);
                stage = {};   // 同上：scene 清图层后重置台帐
                break;
            case 'glow':
                emit(`    show glow_overlay at glow_${Math.round(b.set * 100)} with dissolve`);
                break;
            case 'music':
                if (b.set !== curMusic) {
                    emit(b.set ? `    play music "audio/${b.set}.mp3" fadein 1.5` : '    stop music fadeout 1.5');
                    curMusic = b.set;
                }
                break;
            case 'black': {
                emit('    show expression Solid("#000", xysize=(1920, 1080)) as blk with dissolve');
                if (b.text) emit(`    show expression Text("${esc(b.text)}", size=46, color="#e6ecf7", xalign=0.5, yalign=0.5, textalign=0.5) as blkt ${b.shake ? 'with hpunch' : 'with dissolve'}`);
                emit('    pause 2.6');
                if (b.text) emit('    hide blkt with dissolve');
                emit('    hide blk with dissolve');
                break;
            }
            case 'cg': {
                emit(`    show screen cg_view("cg ${b.set}") with Dissolve(0.8)`);
                emit('    pause');
                emit('    hide screen cg_view with Dissolve(0.8)');
                break;
            }
            default:
                throw new Error('未知 beat 类型: ' + b.type);
        }
    }
    emit('');
});
emit('    stop music fadeout 2.5');
emit('    scene black with Dissolve(1.5)');
emit('    return');
emit('');

fs.writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('写出', OUT, L.length, '行');
console.log('用到的 glow 档:', [...glowVals].join(', '), '| 背景:', bgNames.size, '| 立绘:', Object.keys(usedPoses).length, '种');
