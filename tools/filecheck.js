// filecheck.js —— file:// 直开复现：抓 console，看音频链路死在哪
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const child = spawn(EDGE, [
  '--headless=old', '--no-first-run', '--remote-debugging-port=9338',
  '--user-data-dir=' + path.join(__dirname, '..', 'build', '_filecheck_profile'),
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' });
const kill = () => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {} };
process.on('exit', kill);

(async () => {
  let page = null;
  for (let i = 0; i < 100 && !page; i++) {
    try { const l = await (await fetch('http://127.0.0.1:9338/json/list')).json(); page = l.find(t => t.type === 'page'); } catch (_) {}
    if (!page) await sleep(200);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let id = 0; const pend = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled') {
      console.log('CONSOLE[' + m.params.type + ']:', m.params.args.map(a => a.value || a.description || '').join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      console.log('EXCEPTION:', JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    }
  });
  const send = (method, params = {}) => { id++; ws.send(JSON.stringify({ id, method, params })); return new Promise(r => pend.set(id, r)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__media = [];
    const op = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__media.push(this); return op.call(this); };
  ` });
  await send('Page.navigate', { url: 'file:///D:/claude/white-nights/index.html' });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: "document.getElementById('btnStart').click()" });
  await sleep(400);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 });
  await sleep(4000);
  const r = await send('Runtime.evaluate', {
    expression: `window.__media.map(a => ({ src: a.src.split('/').pop(), paused: a.paused, vol: +a.volume.toFixed(2), t: +a.currentTime.toFixed(1), err: a.error && a.error.code }))`,
    returnByValue: true,
  });
  console.log('audio 元素:', JSON.stringify(r.result && r.result.result ? r.result.result.value : r.result));
  kill(); process.exit(0);
})().catch(e => { console.error(e); kill(); process.exit(1); });
