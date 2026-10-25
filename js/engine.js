// 《白夜》视觉小说 · 引擎（在《罪与罚》导赏引擎基础上改造：立绘层 / event CG / 开场序列 / 白夜天光 / 上升光尘）
(function () {
'use strict';

const $ = id => document.getElementById(id);
const SAVE_VERSION = 1;   // 存档格式版本：升版本老档一律作废回标题
const SAVE_KEY = 'wn_save';
const TYPE_MS = location.search.includes('fast') ? 1 : 30;  // webcheck 用 ?fast 加速打字机
const TRACKS = {
  barcarolle: 'assets/audio/barcarolle.mp3',   // 柴可夫斯基《四季·六月·船歌》：开场/主题
  night:      'assets/audio/night.mp3',        // 夜谈
  morning:    'assets/audio/morning.mp3',      // 早晨
};

// ── 状态 ──
let sceneIdx = 0, beatIdx = 0;
let typing = false, typeTimer = null, fullText = '';
let backlogData = [];
let currentMusic = null;   // 名字
let noteOpen = false, backlogOpen = false, inTitle = true, cgOpen = false, openingOn = false;
let runId = 0;             // 每开一局 +1，作废上一局残留的定时器

// 探测模式：file:// 直开时 fetch 被浏览器拦死，manifest 拿不到 → 逐个 Image 试 .jpg/.png，失败回落 .svg 占位
function probeImg(url) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => res(url);
    im.onerror = () => res(null);
    im.src = url;
  });
}

// ── 音频引擎（Web Audio：交叉淡化 + 循环；manifest 白名单，缺文件不请求不报错；
//    file:// 探测模式回落 HTMLAudio，牺牲交叉淡化换出声） ──
const Audio = {
  ctx: null, master: null, cur: null, buffers: {}, muted: false, manifest: null, probe: false,
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  },
  async ready() {
    if (!this.manifest && !this.probe) {
      try {
        const r = await fetch('assets/audio/manifest.json');
        if (!r.ok) throw new Error(r.status);
        this.manifest = await r.json();
      } catch (e) { this.probe = true; }
    }
    return this.manifest;
  },
  async buffer(name) {
    if (this.buffers[name]) return this.buffers[name];
    const m = await this.ready();
    if (!(m.mp3 || []).includes(name)) { console.warn('音频不在 manifest，未请求:', name); return null; }
    const res = await fetch(TRACKS[name]);
    if (!res.ok) { console.warn('音频载入失败', name, res.status); return null; }
    const raw = await res.arrayBuffer();
    this.buffers[name] = await this.ctx.decodeAudioData(raw);
    return this.buffers[name];
  },
  async play(name) {
    if (name === currentMusic) return;
    const old = this.cur;
    if (old) this.fadeOut(old, 2.2);
    this.cur = null;
    currentMusic = name;
    if (!name) return;
    await this.ready();
    if (this.probe) return this.playEl(name);   // file:// 直开兜底
    if (!this.ctx) { currentMusic = null; return; }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    let buf;
    try { buf = await this.buffer(name); }
    catch (e) { console.warn('音频解码失败', name, e); return; }
    if (!buf) { currentMusic = null; return; }
    if (currentMusic !== name) return; // 等待期间又切了
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2.5);
    src.connect(g); g.connect(this.master);
    src.start();
    this.cur = { src, g };
    if (this.muted) this.master.gain.value = 0;
  },
  // 探测模式的 HTMLAudio 播放：无交叉淡化，rAF 线性淡入
  playEl(name) {
    const el = document.createElement('audio');
    el.src = TRACKS[name]; el.loop = true; el.volume = 0;
    el.play().catch(e => { console.warn('音频播放失败', name, e); if (currentMusic === name) currentMusic = null; });
    const t0 = performance.now(), cur = { el };
    this.cur = cur;
    const tick = () => {
      if (this.cur !== cur) return;
      const k = Math.min(1, (performance.now() - t0) / 2500);
      el.volume = this.muted ? 0 : 0.9 * k;
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  },
  fadeOut(node, sec) {
    if (node.el) {  // HTMLAudio 兜底节点
      const el = node.el, v0 = el.volume, t0 = performance.now();
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
        el.volume = v0 * (1 - k);
        if (k < 1) requestAnimationFrame(tick); else { el.pause(); el.removeAttribute('src'); }
      };
      tick();
      return;
    }
    const t = this.ctx.currentTime;
    node.g.gain.cancelScheduledValues(t);
    node.g.gain.setValueAtTime(node.g.gain.value, t);
    node.g.gain.linearRampToValueAtTime(0, t + sec);
    setTimeout(() => { try { node.src.stop(); } catch (e) {} }, sec * 1000 + 100);
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime + 0.3);
    if (this.cur && this.cur.el) this.cur.el.volume = this.muted ? 0 : 0.9;
    $('btnMute').textContent = this.muted ? '♪̸' : '♪';
  },
};

// ── 背景（manifest 声明哪些有 .jpg 成图，其余用 .svg 占位；双层交叉淡化） ──
const Bg = {
  front: 'bgA', cache: {}, manifest: null, probe: false,
  async resolve(name) {
    if (this.cache[name]) return this.cache[name];
    if (!this.manifest && !this.probe) {
      try {
        const r = await fetch('assets/bg/manifest.json');
        if (!r.ok) throw new Error(r.status);
        this.manifest = await r.json();
      } catch (e) { this.probe = true; }
    }
    const url = this.probe
      ? (await probeImg(`assets/bg/${name}.jpg`)) || `assets/bg/${name}.svg`
      : `assets/bg/${name}.${(this.manifest.jpg || []).includes(name) ? 'jpg' : 'svg'}`;
    this.cache[name] = url;
    return url;
  },
  async set(name) {
    const url = await this.resolve(name);
    const back = this.front === 'bgA' ? 'bgB' : 'bgA';
    $(back).style.backgroundImage = `url("${url}")`;
    $(back).classList.add('show');
    $(this.front).classList.remove('show');
    this.front = back;
  },
};

// ── 剪影立绘（who→sprite 键由 CHAR_SPRITE 给；上场/换姿态/下场 + 说话人高亮） ──
const Sprites = {
  els: {},   // who → DOM
  manifest: null, probe: false, cache: {},
  async url(key) {
    // 立绘成图为 alpha PNG，占位为同名 SVG
    if (this.cache[key]) return this.cache[key];
    if (!this.manifest && !this.probe) {
      try {
        const r = await fetch('assets/sprite/manifest.json');
        if (!r.ok) throw new Error(r.status);
        this.manifest = await r.json();
      } catch (e) { this.probe = true; }
    }
    const url = this.probe
      ? (await probeImg(`assets/sprite/${key}.png`)) || `assets/sprite/${key}.svg`
      : `assets/sprite/${key}.${(this.manifest.png || []).includes(key) ? 'png' : 'svg'}`;
    this.cache[key] = url;
    return url;
  },
  async set(who, pose, pos) {
    const key = CHAR_SPRITE[who];
    if (!key) { console.warn('无立绘映射:', who); return; }
    let el = this.els[who];
    if (!el) {
      el = document.createElement('div');
      el.className = 'sprite';
      el.dataset.who = who;
      $('sprites').appendChild(el);
      this.els[who] = el;
      void el.offsetWidth; // 让首次 class 变化有过渡
    }
    el.style.backgroundImage = `url("${await this.url(key + '_' + pose)}")`;
    el.classList.remove('pos-left', 'pos-center', 'pos-right');
    el.classList.add('pos-' + (pos || el.dataset.pos || 'center'));
    el.dataset.pos = pos || el.dataset.pos || 'center';
    el.classList.add('on');
    el.classList.remove('talk');
    el.classList.add('idle');
  },
  off(who) {
    const el = this.els[who];
    if (el) el.classList.remove('on', 'talk', 'idle');
  },
  clear() {
    for (const who in this.els) this.off(who);
  },
  // say 拍驱动：说话者前移高亮，其余在场者退后压暗；旁白则全部归 idle
  highlight(who) {
    for (const w in this.els) {
      const el = this.els[w];
      if (!el.classList.contains('on')) continue;
      const talking = who && CHAR_SPRITE[w] && (w === who || w === who.replace(/^\*/, ''));
      el.classList.toggle('talk', talking);
      el.classList.toggle('idle', !talking);
    }
  },
};

// ── 白夜天光 ──
function setGlow(v) { $('nightGlow').style.opacity = v; }

// ── 程序化动效（雾/烛光走 body 类；上升光尘唯一 rAF，按需启停） ──
const Fx = {
  raf: null, lastTs: 0, dust: [],
  reduced: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches,
  set(arr) {
    const b = document.body;
    b.classList.toggle('fx-fog', arr.includes('fog'));
    b.classList.toggle('fx-candle', arr.includes('candle'));
    b.classList.toggle('fx-dust', arr.includes('dust'));
    if (arr.includes('dust') && !this.dust.length) this.seedDust();
    this.sync();
  },
  seedDust() {
    const n = innerWidth < 700 ? 30 : 60;
    for (let i = 0; i < n; i++) this.dust.push({
      x: Math.random(), y: Math.random(),
      r: .8 + Math.random() * 1.8,
      vy: .015 + Math.random() * .04,  // 屏高/秒，向上
      ph: Math.random() * Math.PI * 2,
      a: .25 + Math.random() * .5,
    });
  },
  sync() {
    const need = document.body.classList.contains('fx-dust') && !this.reduced && !document.hidden;
    if (need && !this.raf) { this.lastTs = 0; this.raf = requestAnimationFrame(t => this.tick(t)); }
    else if (!need && this.raf) { cancelAnimationFrame(this.raf); this.raf = null; this.clearDust(); }
  },
  tick(ts) {
    this.raf = requestAnimationFrame(t => this.tick(t));
    const dt = this.lastTs ? Math.min((ts - this.lastTs) / 1000, .1) : .016;
    this.lastTs = ts;
    if (document.body.classList.contains('fx-dust')) this.drawDust(dt);
  },
  drawDust(dt) {
    const c = $('fxCanvas');
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    for (const p of this.dust) {
      p.y -= p.vy * dt; p.ph += dt * .7;
      if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
      const x = (p.x + Math.sin(p.ph) * .012) * w;
      const tw = .6 + .4 * Math.sin(p.ph * 2.3);   // 闪烁
      g.fillStyle = `rgba(190,206,242,${(p.a * tw).toFixed(3)})`;
      g.beginPath(); g.arc(x, p.y * h, p.r, 0, 7); g.fill();
    }
  },
  clearDust() {
    const c = $('fxCanvas');
    if (c.width) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  },
};
document.addEventListener('visibilitychange', () => Fx.sync());

// ── 打字机 ──
function typeText(el, text, done, speed) {
  typing = true; fullText = text; el.textContent = '';
  let i = 0;
  clearInterval(typeTimer);
  typeTimer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) finishType(el, done);
  }, speed || TYPE_MS);
}
function finishType(el, done) {
  clearInterval(typeTimer);
  el.textContent = fullText;
  typing = false;
  $('nextHint').classList.add('on');
  if (done) done();
}

// ── 开场序列（环境大图 Ken Burns 轮播 + 引入字幕 + 引入配乐；点击/空格跳过） ──
const Opening = {
  i: 0, timer: null, front: 'openBgA', run: 0,
  async start(run) {
    if (!OPENING || !OPENING.images || !OPENING.images.length) { this.finish(run); return; }
    this.run = run;
    openingOn = true;
    this.i = 0;
    $('opening').classList.add('show');
    $('textbox').classList.add('hidden');
    Audio.play(OPENING.music || 'barcarolle');
    this.step();
  },
  async step() {
    if (this.run !== runId || !openingOn) return;
    const n = OPENING.images.length;
    if (this.i >= n) { this.finish(this.run); return; }
    const url = await Bg.resolve(OPENING.images[this.i]);
    if (this.run !== runId || !openingOn) return;
    const back = this.front === 'openBgA' ? 'openBgB' : 'openBgA';
    $(back).style.backgroundImage = `url("${url}")`;
    // 重触发 Ken Burns（class 重加）
    $(back).classList.remove('show'); void $(back).offsetWidth; $(back).classList.add('show');
    $(this.front).classList.remove('show');
    this.front = back;
    const ot = $('openText');
    ot.classList.remove('show');
    setTimeout(() => {
      if (this.run !== runId || !openingOn) return;
      ot.textContent = OPENING.lines[this.i] || '';
      ot.classList.add('show');
    }, 700);
    this.i++;
    this.timer = setTimeout(() => this.step(), 5200);
  },
  finish(run) {
    if (run !== runId) return;
    openingOn = false;
    clearTimeout(this.timer);
    $('opening').classList.remove('show');
    $('textbox').classList.remove('hidden');
    enterScene();
  },
};

// ── 演出 ──
async function showBeat() {
  const scene = SCRIPT[sceneIdx];
  const beat = scene.beats[beatIdx];
  $('chapterTag').textContent = scene.title;
  $('nextHint').classList.remove('on');
  save();

  switch (beat.type) {
    case 'bg':     await Bg.set(beat.set); next(); return;
    case 'music':  Audio.play(beat.set);   next(); return;
    case 'glow':   setGlow(beat.set);      next(); return;
    case 'sprite':
      if (beat.off) Sprites.off(beat.who);
      else await Sprites.set(beat.who, beat.pose || 'default', beat.pos);
      next(); return;
    case 'cg': {
      cgOpen = true;
      const url = await Bg.resolve('cg_' + beat.set);   // CG 与背景同仓同名前缀
      $('cgImg').style.backgroundImage = `url("${url}")`;
      $('cgLayer').classList.add('show');
      backlogData.push({ who: null, note: true, text: '【画面】' + (beat.text || '') });
      return;   // 停在 CG，等点击 dismiss
    }
    case 'black': {
      $('blackoutText').textContent = beat.text || '';
      $('blackout').classList.add('show');
      $('textbox').classList.add('hidden');
      if (beat.shake) {
        const app = $('app');
        app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake');
      }
      const run = runId;
      setTimeout(() => {
        if (run !== runId) return;
        $('blackout').classList.remove('show');
        $('textbox').classList.remove('hidden');
        next();
      }, 2600);
      return;
    }
    case 'note': {
      noteOpen = true;
      $('noteBody').textContent = beat.text;
      $('noteCard').classList.add('show');
      backlogData.push({ who: null, note: true, text: beat.text });
      return;
    }
    case 'narr': {
      $('speaker').textContent = '';
      $('speaker').className = '';
      $('line').className = ('narr ' + (beat.cls || '')).trim();
      Sprites.highlight(null);
      backlogData.push({ who: null, text: beat.text });
      typeText($('line'), beat.text, null, beat.speed);
      return;
    }
    case 'say': {
      let who = beat.who, inner = false;
      if (who.startsWith('*')) { inner = true; who = who.slice(1); }
      $('speaker').textContent = who;
      $('speaker').className = inner ? 'inner' : '';
      $('speaker').style.color = CHAR_COLORS[who] || 'var(--gold)';
      $('line').className = beat.cls || '';
      Sprites.highlight(who);
      backlogData.push({ who: (inner ? '〈内心〉' : '') + who, text: beat.text });
      typeText($('line'), beat.text, null, beat.speed);
      return;
    }
  }
}

function next() {
  beatIdx++;
  const scene = SCRIPT[sceneIdx];
  if (beatIdx >= scene.beats.length) {
    if (sceneIdx < SCRIPT.length - 1) { sceneIdx++; beatIdx = 0; enterScene(); }
    else endGame();
    return;
  }
  showBeat();
}

async function enterScene() {
  const scene = SCRIPT[sceneIdx];
  await Bg.set(scene.bg);
  Audio.play(scene.music);
  setGlow(scene.glow != null ? scene.glow : 0);
  Fx.set(scene.fx || []);
  $('app').dataset.kb = scene.kb || 'in';
  Sprites.clear();
  showBeat();
}

function endGame() {
  if (inTitle) return;
  inTitle = true;
  const run = runId;
  localStorage.removeItem(SAVE_KEY);
  $('chapterTag').textContent = '终';
  $('textbox').classList.add('hidden');
  setTimeout(() => {
    if (run !== runId) return;
    $('titleScreen').classList.remove('gone');
    refreshTitle();
  }, 1600);
}

// ── 存档 ──
function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, s: sceneIdx, b: beatIdx }));
}
function readSave() {
  try {
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (sv && sv.v === SAVE_VERSION && Number.isInteger(sv.s) && sv.s < SCRIPT.length) return sv;
  } catch (e) { /* 坏档按无档处理 */ }
  return null;
}
function refreshTitle() {
  if (localStorage.getItem(SAVE_KEY) && !readSave()) localStorage.removeItem(SAVE_KEY);
  $('btnContinue').disabled = !readSave();
}

// ── 回想 ──
function toggleBacklog() {
  backlogOpen = !backlogOpen;
  if (backlogOpen) {
    $('backlogInner').innerHTML = backlogData.map(b =>
      b.note
        ? `<div class="bNote">【画面】</div><div class="bText">${esc(b.text)}</div>`
        : (b.who ? `<div class="bWho">${esc(b.who)}</div>` : '') + `<div class="bText">${esc(b.text)}</div>`
    ).join('');
    $('backlog').classList.add('show');
    $('backlogInner').scrollTop = $('backlogInner').scrollHeight;
  } else $('backlog').classList.remove('show');
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ── 输入 ──
function advance() {
  if (inTitle || backlogOpen) return;
  if (openingOn) { Opening.finish(runId); return; }
  if (cgOpen) { cgOpen = false; $('cgLayer').classList.remove('show'); setTimeout(next, 600); return; }
  if (noteOpen) { noteOpen = false; $('noteCard').classList.remove('show'); next(); return; }
  if ($('blackout').classList.contains('show')) return;
  if (typing) { finishType($('line')); return; }
  next();
}

document.addEventListener('click', e => {
  if (e.target.closest('button') || e.target.closest('#backlog') || e.target.closest('#titleScreen')) return;
  if ($('clickToStart').classList.contains('show')) return;
  advance();
});
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') { e.preventDefault(); advance(); }
  if (e.code === 'KeyH' && !inTitle) toggleBacklog();
  if (e.code === 'KeyM') Audio.toggleMute();
  if (e.code === 'Escape' && backlogOpen) toggleBacklog();
});

$('btnBacklog').onclick = toggleBacklog;
$('backlogClose').onclick = toggleBacklog;
$('btnMute').onclick = () => Audio.toggleMute();
$('btnTitle').onclick = () => { $('titleScreen').classList.remove('gone'); inTitle = true; refreshTitle(); };
$('app').addEventListener('animationend', e => {
  if (e.animationName === 'shake') $('app').classList.remove('shake');
});

// ── 标题画面 ──
$('btnStart').onclick = () => begin(0, 0, true);
$('btnContinue').onclick = () => {
  const sv = readSave();
  if (sv) begin(sv.s, sv.b, false); else refreshTitle();
};
$('btnChapters').onclick = () => $('chapterList').classList.toggle('show');
SCRIPT.forEach((sc, i) => {
  const b = document.createElement('button');
  b.textContent = sc.title;
  b.onclick = () => begin(i, 0, false);
  $('chapterList').appendChild(b);
});

async function begin(s, b, withOpening) {
  // 首次进入需要先解锁音频
  if (!Audio.ctx) {
    $('clickToStart').classList.add('show');
    await new Promise(res => {
      // 必须 stopPropagation：解遮罩的这次点击若冒泡到 document 的 advance()，
      // 微任务（Opening.start 加 .show）会先于冒泡执行，同一击点立刻把开场序列掐掉
      const go = e => { if (e) e.stopPropagation(); $('clickToStart').classList.remove('show'); res(); };
      $('clickToStart').addEventListener('click', go, { once: true });
      document.addEventListener('keydown', go, { once: true });
    });
    Audio.init();
  }
  sceneIdx = s; beatIdx = b;
  backlogData = [];
  runId++;
  inTitle = false;
  $('titleScreen').classList.add('gone');
  $('textbox').classList.remove('hidden');
  if (SCRIPT[s].music) Audio.buffer(SCRIPT[s].music).catch(() => {});
  if (withOpening && s === 0 && b === 0) Opening.start(runId);
  else enterScene();
}

// 标题画面背景图
Bg.resolve('title').then(url => { $('titleArt').style.backgroundImage = `url("${url}")`; });
refreshTitle();

})();
