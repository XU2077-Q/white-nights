// webcheck.js —— 在真浏览器（Edge headless=old）里把《白夜》VN 从头走到尾。
// 引擎状态全在 DOM 里可读（#line / #nextHint / #blackout / #cgLayer / #opening / #sprites），
// 所以推进是闭环的：等打字机打完 → 截图/推进，不盲按时长。
// 额外断言：开场序列出现并可跳过 / 说话人立绘 .talk 高亮 / 第四夜拥抱 CG 层弹出 / 章节按钮 6 个。
// 用法：node tools/webcheck.js
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'shots');
const PORT = 9334, HTTP_PORT = 8791;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let edgeChild = null;
function killEdgeTree() {
  const c = edgeChild; if (!c || c.killed) return; edgeChild = null;
  try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch (_) { try { c.kill(); } catch (_) {} }
}
process.on('exit', killEdgeTree);
process.on('uncaughtException', e => { killEdgeTree(); console.error(e); process.exit(2); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 极简静态服务器（file:// 下 fetch 会被 CORS 挡，必须走 http）──
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.logs = []; this.errors = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id); if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
        return;
      }
      const m = msg.method;
      if (m === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : a.description || a.type).join(' ');
        this.logs.push({ kind: msg.params.type, text });
        if (msg.params.type === 'error') this.errors.push(text);
      } else if (m === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text || '未知异常');
      } else if (m === 'Log.entryAdded') {
        const e = msg.params.entry;
        this.logs.push({ kind: e.level, text: `${e.level}: ${e.text}` });
        if (e.level === 'error') this.errors.push(`${e.level}: ${e.text}`);
      }
    });
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} 超时`)); }, timeoutMs);
      this.pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    });
  }
  async evalJS(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
  async shot(file) {
    try {
      const r = await this.send('Page.captureScreenshot', { format: 'png' }, 20000);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return fs.statSync(file).size;
    } catch (e) { console.error('  ! 截图失败', path.basename(file), e.message); return 0; }
  }
  async click(x, y) {
    const base = { x, y, button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  }
  async key(key, code, vk) {
    const base = { windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, code, key };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));

  edgeChild = spawn(EDGE, [
    '--headless=old', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(ROOT, 'build', '_webcheck_profile')}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 100 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find(t => t.type === 'page');
    } catch (_) {}
    if (!page) await sleep(200);
  }
  if (!page) throw new Error('Edge 调试端口没起来');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  const fails = [];   // 断言失败收集
  const assert = (ok, msg) => { if (!ok) { fails.push(msg); console.error('  ✗ 断言:', msg); } };

  // ?fast：引擎把打字机降到 1ms/字，回归时长减半
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html?fast` });
  await sleep(2500);
  await cdp.shot(path.join(OUT, '01-标题屏.png'));

  // 标题屏断言：章节按钮 6 个
  const chBtns = await cdp.evalJS(`document.querySelectorAll('#chapterList button').length`);
  assert(chBtns === 6, `章节按钮应为 6 个，实际 ${chBtns}`);

  // 点「开始」→ 音频解锁遮罩 → 再点一次进入开场序列
  await cdp.evalJS(`document.getElementById('btnStart').click()`);
  await sleep(600);
  await cdp.shot(path.join(OUT, '02-音频解锁遮罩.png'));
  await cdp.click(640, 360);

  // 开场序列：等 #opening.show，截两帧（验证 Ken Burns 轮播在换图），再空格跳过
  let openingSeen = false;
  for (let i = 0; i < 25; i++) {
    if (await cdp.evalJS(`document.getElementById('opening').classList.contains('show')`)) { openingSeen = true; break; }
    await sleep(200);
  }
  assert(openingSeen, '开场序列未出现（#opening.show）');
  if (openingSeen) {
    await sleep(1800);
    await cdp.shot(path.join(OUT, '03-开场·1.png'));
    const openTxt1 = await cdp.evalJS(`document.getElementById('openText').textContent`);
    await sleep(5400);   // 每张 5.2s 轮播
    await cdp.shot(path.join(OUT, '04-开场·2.png'));
    const openTxt2 = await cdp.evalJS(`document.getElementById('openText').textContent`);
    assert(openTxt1 !== openTxt2, `开场字幕未换（${openTxt1.slice(0, 12)}…）`);
    console.log(`  · 开场序列：「${openTxt1.slice(0, 16)}…」→「${openTxt2.slice(0, 16)}…」`);
    await cdp.key(' ', 'Space', 32);   // 跳过
    await sleep(1200);
    assert(!(await cdp.evalJS(`document.getElementById('opening').classList.contains('show')`)), '空格未跳过开场序列');
  }

  const state = `(() => ({
    tag: document.getElementById('chapterTag').textContent,
    speaker: document.getElementById('speaker').textContent,
    line: document.getElementById('line').textContent,
    typingDone: document.getElementById('nextHint').classList.contains('on'),
    note: document.getElementById('noteCard').classList.contains('show'),
    black: document.getElementById('blackout').classList.contains('show'),
    blackText: document.getElementById('blackoutText').textContent,
    title: !document.getElementById('titleScreen').classList.contains('gone'),
    cg: document.getElementById('cgLayer').classList.contains('show'),
    cgImg: document.getElementById('cgImg').style.backgroundImage,
    sprites: [...document.querySelectorAll('#sprites .sprite')]
      .filter(e => e.classList.contains('on'))
      .map(e => e.dataset.who + (e.classList.contains('talk') ? '*' : '')).join(','),
  }))()`;

  const shots = [];
  let shotN = 5, lastTag = '', lastSig = '';
  let cgCount = 0, talkChecks = 0;
  const want = { // 每章至少留一张
    '第一夜': '第一夜', '第二夜': '第二夜', '娜斯津卡的故事': '娜斯津卡的故事',
    '第三夜': '第三夜', '第四夜': '第四夜', '早晨': '早晨',
  };
  const taken = {};

  // 655 文本拍×2（打完+推进）+ 5 黑场×约 8 次轮询 + CG + 余量
  for (let i = 0; i < 1800; i++) {
    const s = await cdp.evalJS(state);
    if (s.title) { // 走完了，回标题
      await cdp.shot(path.join(OUT, `${String(shotN++).padStart(2, '0')}-终·回到标题.png`));
      console.log('  · 走完全程，回到标题屏');
      break;
    }
    if (s.black) {
      const name = `${String(shotN++).padStart(2, '0')}-黑场·${s.blackText || '无字'}.png`;
      await sleep(900); await cdp.shot(path.join(OUT, name)); shots.push(name);
      console.log(`  · 黑场：「${s.blackText}」`);
      await sleep(2000); continue;
    }
    if (s.cg) { // 第四夜拥抱 CG：断言 + 截图 + 点击淡出
      cgCount++;
      assert(/cg_hug/.test(s.cgImg), `CG 图不是 cg_hug：${s.cgImg}`);
      const name = `${String(shotN++).padStart(2, '0')}-CG·拥抱.png`;
      await cdp.shot(path.join(OUT, name)); shots.push(name);
      console.log(`  · CG 层弹出：${s.cgImg.slice(0, 60)}`);
      await cdp.click(640, 360); await sleep(900); continue;
    }
    if (s.note) { // 白夜不用导赏卡，机制兜底
      await cdp.click(640, 360); await sleep(700); continue;
    }
    if (!s.typingDone) { await cdp.key(' ', 'Space', 32); await sleep(250); continue; }
    // 说话人立绘高亮断言：高亮者必须是说话人；说话人在场则必须是唯一高亮；
    // 说话人不在场（娜斯津卡跑远后的「明天见！」）或本就无立绘（玛特廖娜）→ 允许零高亮
    if (s.speaker && s.sprites) {
      talkChecks++;
      const on = s.sprites.split(',');
      const talking = on.filter(x => x.endsWith('*')).map(x => x.slice(0, -1));
      const who = s.speaker;
      if (talking.length > 1 || (talking.length === 1 && talking[0] !== who)) {
        fails.push(`立绘高亮错：[${s.tag}] 说话人「${who}」，高亮 ${talking.join('/') || '无'}，在场 ${s.sprites}`);
      } else if (on.includes(who) && !on.includes(who + '*')) {
        fails.push(`说话人在场却未高亮：[${s.tag}] 说话人「${who}」，在场 ${s.sprites}`);
      }
    }
    // 打字机打完：换章时截一张
    const sig = s.tag + '|' + s.speaker + '|' + s.line.slice(0, 10);
    if (s.tag !== lastTag || !taken[s.tag]) {
      lastTag = s.tag; taken[s.tag] = true;
      const name = `${String(shotN++).padStart(2, '0')}-${want[s.tag] || '场景'}·首拍.png`;
      await cdp.shot(path.join(OUT, name)); shots.push(name);
      console.log(`  · ${s.tag}：${(s.speaker || '旁白')}「${s.line.slice(0, 18)}…」`);
    }
    if (sig !== lastSig && (i % 20 === 0)) {
      lastSig = sig;
      const name = `${String(shotN++).padStart(2, '0')}-中景·${s.speaker || '旁白'}.png`;
      await cdp.shot(path.join(OUT, name)); shots.push(name);
    }
    // 交替用空格和鼠标推进（两条输入通路都验）
    if (i % 2 === 0) await cdp.key(' ', 'Space', 32); else await cdp.click(640, 620);
    await sleep(300);
  }

  // 全程断言汇总
  for (const t of Object.keys(want)) assert(taken[t], `未走到章节「${t}」`);
  assert(cgCount === 1, `拥抱 CG 应弹出 1 次，实际 ${cgCount}`);
  assert(talkChecks > 30, `立绘高亮断言样本太少（${talkChecks}）`);
  console.log(`  · 立绘高亮断言 ${talkChecks} 次；CG ${cgCount} 次`);

  // 回想面板（回标题重开 → 跳过开场 → H）
  await cdp.evalJS(`document.getElementById('btnTitle').click()`); await sleep(800);
  await cdp.evalJS(`document.getElementById('btnStart').click()`); await sleep(1500);
  await cdp.key(' ', 'Space', 32); await sleep(900);   // 跳过开场
  for (let i = 0; i < 3; i++) { await cdp.key(' ', 'Space', 32); await sleep(350); }
  await cdp.key('h', 'KeyH', 72); await sleep(700);
  await cdp.shot(path.join(OUT, `${String(shotN++).padStart(2, '0')}-回想面板.png`));
  await cdp.key('h', 'KeyH', 72);

  ws.close(); killEdgeTree(); server.close();

  const errs = cdp.errors.filter(e => !/net::|favicon/.test(e));
  console.log(`\n  截图 ${shots.length + 5} 张 → build/shots`);
  if (fails.length) { console.log(`  **断言失败 ${fails.length} 条**`); fails.slice(0, 10).forEach(f => console.log('   ', f)); process.exitCode = 1; }
  if (errs.length) { console.log(`  **控制台报错 ${errs.length} 条**`); errs.slice(0, 10).forEach(e => console.log('   ', e.split('\n')[0])); process.exitCode = 1; }
  if (!fails.length && !errs.length) console.log('  控制台零报错，断言全绿。');
}
main().catch(e => { killEdgeTree(); server.close(); console.error(e); process.exit(2); });
