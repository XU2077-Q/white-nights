// audiocheck.js —— 定位「进游戏没音乐」：逐段验证音频链路
// 1) 三首 mp3 能否 decodeAudioData；2) 解码后 RMS（文件是不是静音）；3) ctx.state；
// 4) 走完 begin 后 Audio.cur 是否挂着源、master 增益多少；5) 用 AnalyserNode 量 master 实际输出电平。
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 9336, HTTP_PORT = 8793;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let edgeChild = null;
function killEdgeTree() {
  const c = edgeChild; if (!c || c.killed) return; edgeChild = null;
  try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); }
  catch (_) { try { c.kill(); } catch (_) {} }
}
process.on('exit', killEdgeTree);
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id); if (!p) return;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    });
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} 超时`)); }, timeoutMs);
      this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
    });
  }
  async evalJS(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  async click(x, y) {
    const base = { x, y, button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  }
}

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));
  edgeChild = spawn(EDGE, [
    '--headless=old', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(ROOT, 'build', '_audiocheck_profile')}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 100 && !page; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = l.find(t => t.type === 'page'); } catch (_) {}
    if (!page) await sleep(200);
  }
  if (!page) throw new Error('Edge 调试端口没起来');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
  await sleep(2500);

  // 1+2) 三首 mp3 直接解码 + RMS
  const decode = await cdp.evalJS(`(async () => {
    const out = {};
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    for (const n of ['barcarolle', 'night', 'morning']) {
      try {
        const raw = await (await fetch('assets/audio/' + n + '.mp3')).arrayBuffer();
        const buf = await ctx.decodeAudioData(raw);
        const d = buf.getChannelData(0);
        let sum = 0, peak = 0;
        for (let i = 0; i < d.length; i += 97) { const v = Math.abs(d[i]); sum += v * v; if (v > peak) peak = v; }
        out[n] = { ok: true, sec: +buf.duration.toFixed(1), rms: +Math.sqrt(sum / (d.length / 97)).toFixed(4), peak: +peak.toFixed(3) };
      } catch (e) { out[n] = { ok: false, err: String(e).slice(0, 120) }; }
    }
    return out;
  })()`);
  console.log('解码+RMS:', JSON.stringify(decode, null, 1));

  // 3+4) 走真实 begin 流程，看 ctx / cur / master
  await cdp.evalJS(`document.getElementById('btnStart').click()`);
  await sleep(500);
  await cdp.click(640, 360);
  await sleep(4000); // 等 barcarolle 载完+淡入
  const st = await cdp.evalJS(`(() => ({
    ctxState: Audio.ctx && Audio.ctx.state,
    curMusic: (typeof currentMusic !== 'undefined') ? currentMusic : null,
    hasCur: !!Audio.cur,
    masterGain: Audio.master && Audio.master.gain.value,
    muted: Audio.muted,
    buffered: Object.keys(Audio.buffers),
  }))()`);
  console.log('播放状态:', JSON.stringify(st));

  // 5) AnalyserNode 量 master 输出电平 1 秒
  const level = await cdp.evalJS(`(async () => {
    if (!Audio.ctx || !Audio.master) return { err: 'no ctx' };
    const an = Audio.ctx.createAnalyser(); an.fftSize = 2048;
    Audio.master.connect(an);
    const arr = new Float32Array(an.fftSize);
    let peak = 0;
    for (let i = 0; i < 10; i++) {
      an.getFloatTimeDomainData(arr);
      for (const v of arr) if (Math.abs(v) > peak) peak = Math.abs(v);
      await new Promise(r => setTimeout(r, 100));
    }
    Audio.master.disconnect(an);
    return { peak: +peak.toFixed(4) };
  })()`);
  console.log('master 输出电平:', JSON.stringify(level));

  killEdgeTree();
  server.close();
  process.exit(0);
}
main().catch(e => { console.error(e); killEdgeTree(); process.exit(1); });
