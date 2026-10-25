// 《白夜》全文 → js/script.js 分拍器
// 用法：
//   node tools/build_script.js --map     只打印章节/段落索引映射（定标注点用）
//   node tools/build_script.js           生成 js/script.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const RAW = fs.readFileSync(path.join(ROOT, 'text', 'baiye_guyu.txt'), 'utf8');
const MAX = 130;  // 每拍最多字符

// ── 解析章节/段落 ──
const chapters = [];
let cur = null;
for (const line of RAW.split(/\r?\n/)) {
  const t = line.trim();
  if (!t) continue;
  const m = t.match(/^##\s+(.+)$/);
  if (m) { cur = { title: m[1], paras: [] }; chapters.push(cur); }
  else if (cur) cur.paras.push(t);
}

// ── 说话人识别 ──
const DREAMER = '幻想家', NASTENKA = '娜斯津卡', LODGER = '年轻房客', GRANNY = '祖母', MATRYONA = '玛特廖娜';
const RULES = [
  [/(娜斯津卡)(?:说道|说|问|答|道|喊|叫|嚷|悄声|低声|喃喃|嘟囔|补充|解释|提议|回答|开口|打断|请求|坚持|微笑|小声)/, NASTENKA],
  [/(?<![她他我您你])她(?:说道|说|问|答|道|喊|叫|嚷|悄声|低声说|喃喃|嘟囔|补充|解释|回答|开口|打断|请求|坚持|又说|问道)/, NASTENKA],
  [/(年轻房客|房客|年轻人)(?:说道|说|问|答|道|喊|叫|解释|回答|开口)/, LODGER],
  [/祖母(?:说道|说|问|答|道|喊|叫)/, GRANNY],
  [/玛特廖娜[^，。]{0,6}说/, MATRYONA],
  [/我(?:说道|说|问|答|道|喊|叫|嚷|嘟囔|喃喃|补充|解释|提议|回答|开口|打断|请求|坚持|又问|问道)/, DREAMER],
];

// 每章对话默认起始说话人（交替回退用）
const FIRST_SPEAKER = {
  '第一夜': DREAMER, '第二夜': DREAMER, '娜斯津卡的故事': NASTENKA,
  '第三夜': NASTENKA, '第四夜': NASTENKA, '早晨': DREAMER,
};

function attrib(fullPara, lastSay, fallback) {
  for (const [re, who] of RULES) if (re.test(fullPara)) return who;
  // 区间回退（长篇独白章：规则未命中的引号段全部归叙述者，不做交替）
  if (fallback) return fallback;
  // 回退：与上一说话人交替
  if (lastSay === DREAMER) return NASTENKA;
  if (lastSay === NASTENKA) return DREAMER;
  return null;
}

// ── 长段切拍：按句末标点切块 ≤MAX ──
function chunk(text) {
  const out = [];
  let buf = '';
  // 在 。！？；… 后切（省略号序列视为整体）
  const parts = text.split(/(?<=[。！？；])|(?<=……)/);
  for (const p of parts) {
    if (buf.length + p.length > MAX && buf) { out.push(buf); buf = ''; }
    if (p.length > MAX && !buf) {
      // 单句仍超长：按逗号硬切
      const sub = p.split(/(?<=[，、：])/);
      for (const s of sub) {
        if (buf.length + s.length > MAX && buf) { out.push(buf); buf = ''; }
        buf += s;
      }
    } else buf += p;
  }
  if (buf) out.push(buf);
  return out.filter(s => s.trim());
}

// ── 标注表：{章, 首次出现含 key 的段落前插入 beats}（生成后按 --map 调） ──
const ANNO = JSON.parse(fs.readFileSync(path.join(__dirname, 'build_anno.json'), 'utf8'));

function paraToBeats(chTitle, para, state, fixWho, fallback) {
  const beats = [];
  const isQuote = para.startsWith('“');
  if (isQuote) {
    const close = para.lastIndexOf('”');
    let speech = close > 0 ? para.slice(1, close) : para.slice(1);
    let tail = close > 0 ? para.slice(close + 1).trim() : '';
    let who = fixWho || attrib(para, state.lastSay, fallback) || state.lastSay || FIRST_SPEAKER[chTitle] || DREAMER;
    // 纯转述尾巴（"她说。"之类）丢掉；有内容的尾巴转旁白
    if (tail && tail.length <= 14 && /(说|道|问|答|喊|叫|嚷|笑|哭|解释|补充|提议|打断|请求|坚持)/.test(tail)) tail = '';
    state.lastSay = who;
    for (const c of chunk(speech)) beats.push({ type: 'say', who, text: c });
    if (tail) for (const c of chunk(tail)) { beats.push({ type: 'narr', text: c }); state.lastSay = null; }
  } else {
    // 幻想家大段内心/叙述：保留为旁白（楷体）
    state.lastSay = null;
    for (const c of chunk(para)) beats.push({ type: 'narr', text: c });
  }
  return beats;
}

// ── --map 模式 ──
if (process.argv.includes('--map')) {
  for (const ch of chapters) {
    console.log(`\n### ${ch.title} (${ch.paras.length} 段)`);
    ch.paras.forEach((p, i) => console.log(String(i).padStart(3), p.slice(0, 42)));
  }
  process.exit(0);
}

// ── 生成 ──
const SCENE = ANNO.scene;   // 章名 → scene 级配置
const scenesOut = [];
let total = 0, skippedTotal = 0;
const stats = {};
for (const ch of chapters) {
  const cfg = SCENE[ch.title] || {};
  const beats = [];
  const state = { lastSay: null };
  const annos  = (ANNO.insert[ch.title] || []).map(a => ({ ...a, done: false }));
  const splits = (ANNO.split[ch.title]  || []).map(s => ({ ...s, done: false }));
  const fixes  = ANNO.fix[ch.title]  || [];
  const skips  = ANNO.skip[ch.title] || [];
  const fallbacks = (ANNO.fallback || {})[ch.title] || [];
  const pushB = b => { if (b.type === 'say') stats[b.who] = (stats[b.who] || 0) + 1; beats.push(b); };
  ch.paras.forEach((p, i) => {
    // skip：整段丢弃（译者脚注等）；安全阀——被跳段不应以引号开头
    if (skips.some(([a, b]) => i >= a && i <= b)) {
      if (p.startsWith('“')) console.warn(`! ${ch.title}#${i} 跳过段以引号开头，疑似跳错:`, p.slice(0, 30));
      skippedTotal++;
      return;
    }
    // 区间回退（娜斯津卡的故事：嵌套叙述段默认归她）
    const fb = (fallbacks.find(r => i >= r.range[0] && i <= r.range[1]) || {}).who || null;
    // split：段内断点，前半→插入拍→后半（拥抱 CG 用）
    const sp = splits.find(s => !s.done && p.includes(s.key));
    if (sp) {
      sp.done = true;
      const idx = p.indexOf(sp.at);
      if (idx < 0) console.warn(`! ${ch.title} split 断点未找到:`, sp.at);
      else {
        for (const b of paraToBeats(ch.title, p.slice(0, idx), state, null, fb)) pushB(b);
        beats.push(...sp.beats);
        for (const b of paraToBeats(ch.title, p.slice(idx), state, null, fb)) pushB(b);
        return;
      }
    }
    for (const a of annos) {
      if (!a.done && p.includes(a.key)) { beats.push(...a.beats); a.done = true; }
    }
    const fx = fixes.find(f => p.includes(f.key));
    for (const b of paraToBeats(ch.title, p, state, fx ? fx.who : null, fb)) pushB(b);
  });
  const missed = annos.filter(a => !a.done);
  if (missed.length) console.warn(`! ${ch.title} 未命中标注:`, missed.map(a => a.key));
  const missedSp = splits.filter(s => !s.done);
  if (missedSp.length) console.warn(`! ${ch.title} 未命中 split:`, missedSp.map(s => s.key));
  total += beats.length;
  scenesOut.push({ title: ch.title, ...cfg, beats });
}

const header = fs.readFileSync(path.join(ROOT, 'js', 'script_head.js'), 'utf8');
const body = JSON.stringify(scenesOut, null, 1)
  .replace(/"type":/g, "type:").replace(/"who":/g, 'who:').replace(/"text":/g, 'text:')
  .replace(/"set":/g, 'set:').replace(/"pose":/g, 'pose:').replace(/"pos":/g, 'pos:')
  .replace(/"off":/g, 'off:').replace(/"title":/g, 'title:').replace(/"bg":/g, 'bg:')
  .replace(/"music":/g, 'music:').replace(/"glow":/g, 'glow:').replace(/"fx":/g, 'fx:')
  .replace(/"kb":/g, 'kb:').replace(/"beats":/g, 'beats:').replace(/"shake":/g, 'shake:')
  .replace(/"cls":/g, 'cls:').replace(/"speed":/g, 'speed:');
fs.writeFileSync(path.join(ROOT, 'js', 'script.js'),
  header + '\nconst SCRIPT = ' + body + ';\n');
console.log('chapters:', scenesOut.length, 'beats:', total);
console.log('跳过脚注段:', skippedTotal, skippedTotal === 17 ? '(=17 ✓)' : '(预期 17，核对!)');
console.log('say 分布:', stats);
for (const s of scenesOut) console.log(` ${s.title}: ${s.beats.length} beats`);
