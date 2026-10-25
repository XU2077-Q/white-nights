// audiocheck2.js —— 第二探：包装 AudioContext/AudioNode，记录 ctx 状态与节点图，量主增益实际输出电平
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

const PRELOAD = `
window.__probe = { ctxs: [], gains: [], sources: [], links: [] };
(function () {
  const AC = window.AudioContext;
  window.AudioContext = function (...a) { const c = new AC(...a); window.__probe.ctxs.push(c); return c; };
  window.AudioContext.prototype = AC.prototype;
  const cg = AC.prototype.createGain;
  AC.prototype.createGain = function () { const g = cg.call(this); window.__probe.gains.push(g); return g; };
  const cs = AC.prototype.createBufferSource;
  AC.prototype.createBufferSource = function () { const s = cs.call(this); window.__probe.sources.push(s); return s; };
  const cn = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    window.__probe.links.push([this.constructor.name, dest && dest.constructor ? dest.constructor.name : '?']);
    return cn.call(this, dest, ...rest);
  };
})();`;

async function main() {
  await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));
  edgeChild = spawn(EDGE, [
    '--headless=old', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(ROOT, 'build', '_audiocheck_profile')}`,
    // 不开 autoplay 豁免：复现用户真实环境
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD });

  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
  await sleep(2500);

  await cdp.evalJS(`document.getElementById('btnStart').click()`);
  await sleep(500);
  await cdp.click(640, 360);
  await sleep(5000); // 等 barcarolle 载完+淡入

  const st = await cdp.evalJS(`(() => {
    const P = window.__probe;
    return {
      ctxStates: P.ctxs.map(c => c.state),
      gains: P.gains.map(g => +g.gain.value.toFixed(3)),
      sourcesStarted: P.sources.length,
      links: P.links,
    };
  })()`);
  console.log('音频图状态:', JSON.stringify(st, null, 1));

  // 找接到 destination 的 master 增益，挂 analyser 量输出
  const level = await cdp.evalJS(`(async () => {
    const P = window.__probe;
    if (!P.ctxs.length) return { err: '没有 AudioContext' };
    const ctx = P.ctxs[0];
    const an = ctx.createAnalyser(); an.fftSize = 2048;
    // master 是唯一 connect 到 destination 的 gain
    const master = P.gains[0];
    if (!master) return { err: '没有 gain' };
    master.connect(an);
    const arr = new Float32Array(an.fftSize);
    let peak = 0;
    for (let i = 0; i < 10; i++) {
      an.getFloatTimeDomainData(arr);
      for (const v of arr) if (Math.abs(v) > peak) peak = Math.abs(v);
      await new Promise(r => setTimeout(r, 100));
    }
    master.disconnect(an);
    return { ctxState: ctx.state, peak: +peak.toFixed(4) };
  })()`);
  console.log('master 输出电平:', JSON.stringify(level));

  killEdgeTree();
  server.close();
  process.exit(0);
}
main().catch(e => { console.error(e); killEdgeTree(); process.exit(1); });
