// 《白夜》程序化 SVG 占位背景（1600×900）
// 风格骨架：白夜天光（蓝紫不夜天）+ 大留白 + 剪影；无红线，雾保留
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'bg');
fs.mkdirSync(OUT, { recursive: true });

const W = 1600, H = 900;

// 公共骨架：天空渐变 + 天光晕 + 雾团 + 剪影层
function frame({ id, sky, mists = [], bodies = '', glow = null, stars = 0 }) {
  const mistEls = mists.map(m =>
    `<ellipse cx="${m.x}" cy="${m.y}" rx="${m.rx}" ry="${m.ry}" fill="${m.c}" opacity="${m.o}" filter="url(#blur${m.b || 40})"/>`
  ).join('\n  ');
  const blurs = [...new Set(mists.map(m => m.b || 40))].map(b =>
    `<filter id="blur${b}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${b}"/></filter>`
  ).join('\n    ');
  const glowEl = glow
    ? `<circle cx="${glow.x}" cy="${glow.y}" r="${glow.r}" fill="${glow.c}" opacity="${glow.o}" filter="url(#blur${glow.b || 30})"/>`
    : '';
  let starEls = '';
  if (stars) {
    let pts = '';
    for (let i = 0; i < stars; i++) {
      const x = (i * 173 + 97) % W, y = (i * 89 + 31) % 420;
      pts += `<circle cx="${x}" cy="${y}" r="${(i % 3) * 0.6 + 0.8}" fill="#dfe6f2" opacity="${0.25 + (i % 5) * 0.1}"/>`;
    }
    starEls = `<g>${pts}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      ${sky.map((s, i) => `<stop offset="${(i / (sky.length - 1)).toFixed(2)}" stop-color="${s}"/>`).join('\n      ')}
    </linearGradient>
    ${blurs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${glowEl}
  ${starEls}
  ${mistEls}
  ${bodies}
  <!-- ${id} -->
</svg>`;
}

// 简易人形剪影（头圆+梯形身体）
function person(x, y, s, c = '#0d1020', op = 1) {
  return `<g fill="${c}" opacity="${op}">
    <circle cx="${x}" cy="${y - 34 * s}" r="${11 * s}"/>
    <path d="M${x - 13 * s},${y - 20 * s} Q${x},${y - 30 * s} ${x + 13 * s},${y - 20 * s} L${x + 10 * s},${y + 30 * s} L${x - 10 * s},${y + 30 * s} Z"/>
  </g>`;
}
// 屋顶天际线
function skyline(base, blocks, c = '#141828') {
  let d = `M0,${H} L0,${base}`;
  for (const [x, h, w] of blocks) d += ` L${x},${base} L${x},${base - h} L${x + w},${base - h} L${x + w},${base}`;
  d += ` L${W},${base} L${W},${H} Z`;
  return `<path d="${d}" fill="${c}"/>`;
}
// 彼得堡尖塔（海军部大厦式）
function spire(x, base, h, c = '#10142a') {
  return `<path d="M${x - 22},${base} L${x - 8},${base - h * 0.55} L${x - 2},${base - h} L${x + 2},${base - h} L${x + 8},${base - h * 0.55} L${x + 22},${base} Z" fill="${c}"/>
  <line x1="${x}" y1="${base - h}" x2="${x}" y2="${base - h - 26}" stroke="${c}" stroke-width="3"/>`;
}
// 运河桥栏杆
function railing(y, c = '#0d1020') {
  return `<g stroke="${c}" stroke-width="5">${Array.from({ length: 41 }, (_, i) => `<line x1="${i * 40}" y1="${y - 44}" x2="${i * 40}" y2="${y}"/>`).join('')}
  <line x1="0" y1="${y - 46}" x2="${W}" y2="${y - 46}" stroke-width="7"/></g>`;
}
// 街灯（白夜里不点亮的灯柱，剪影）
function lamp(x, y, s = 1, c = '#0d1020') {
  return `<g fill="${c}">
  <rect x="${x - 3 * s}" y="${y - 150 * s}" width="${6 * s}" height="${150 * s}"/>
  <path d="M${x - 14 * s},${y - 150 * s} L${x},${y - 178 * s} L${x + 14 * s},${y - 150 * s} Z"/>
</g>`;
}

// 白夜天色：不夜的蓝紫，地平线一线淡金
const NIGHT = ['#1c2440', '#2c3a5e', '#4a5a84', '#7d88a8'];
const LATE  = ['#232c4c', '#3a4a74', '#6a74a0', '#b8a888'];  // 天更亮些，近黎明

const scenes = {
  // 标题：白夜全景、尖塔、星、长椅孤影
  title: frame({
    id: 'title', sky: NIGHT, stars: 26,
    glow: { x: 800, y: 560, r: 200, c: '#aebcd8', o: 0.35, b: 60 },
    mists: [
      { x: 400, y: 620, rx: 520, ry: 150, c: '#5a6a94', o: 0.25 },
      { x: 1150, y: 560, rx: 480, ry: 130, c: '#7d88b0', o: 0.18, b: 60 },
      { x: 800, y: 800, rx: 700, ry: 120, c: '#2c3450', o: 0.35, b: 50 },
    ],
    bodies: `
  ${skyline(700, [[120, 90, 130], [330, 150, 90], [500, 60, 180], [760, 110, 120], [950, 55, 200], [1230, 130, 100], [1400, 70, 160]], '#12162a')}
  ${spire(352, 700, 340)}
  ${spire(1280, 700, 250, '#12162a')}
  ${person(800, 770, 1.4, '#080a16')}`,
  }),

  // 开场 1：城市全景，白夜天光压在地平线上
  open_city: frame({
    id: 'open_city', sky: NIGHT, stars: 34,
    glow: { x: 800, y: 600, r: 320, c: '#c4cfe8', o: 0.3, b: 80 },
    mists: [
      { x: 800, y: 560, rx: 900, ry: 140, c: '#8a96bc', o: 0.25, b: 70 },
      { x: 300, y: 680, rx: 500, ry: 110, c: '#4a5578', o: 0.3, b: 50 },
    ],
    bodies: `
  ${skyline(620, [[40, 150, 170], [260, 220, 120], [420, 120, 200], [660, 260, 110], [820, 140, 190], [1060, 200, 140], [1250, 130, 180], [1470, 170, 130]], '#141830')}
  ${spire(700, 620, 330)}
  ${spire(1150, 620, 220, '#141830')}
  <path d="M0,760 Q800,730 1600,760 L1600,900 L0,900 Z" fill="#0e1224"/>`,
  }),

  // 开场 2：屋顶之上，贴近天光
  open_roof: frame({
    id: 'open_roof', sky: LATE, stars: 14,
    glow: { x: 1100, y: 380, r: 240, c: '#d8d4c0', o: 0.4, b: 70 },
    mists: [
      { x: 500, y: 420, rx: 600, ry: 130, c: '#98a2c4', o: 0.28, b: 60 },
      { x: 1200, y: 500, rx: 500, ry: 120, c: '#6a74a0', o: 0.3, b: 55 },
    ],
    bodies: `
  <path d="M0,900 L0,640 L300,560 L640,660 L640,900 Z" fill="#10142a"/>
  <path d="M640,900 L640,700 L1050,600 L1600,720 L1600,900 Z" fill="#0c1020"/>
  <path d="M300,560 L340,470 L380,560 Z" fill="#10142a"/>
  <rect x="880" y="560" width="46" height="110" fill="#0c1020"/>
  <rect x="1350" y="640" width="40" height="90" fill="#0c1020"/>
  ${person(1010, 655, 0.9, '#06081a')}`,
  }),

  // 开场 3：运河，水面反光
  open_canal: frame({
    id: 'open_canal', sky: NIGHT, stars: 20,
    glow: { x: 400, y: 500, r: 180, c: '#aebcd8', o: 0.3, b: 60 },
    mists: [
      { x: 800, y: 520, rx: 800, ry: 120, c: '#6a76a0', o: 0.28, b: 65 },
    ],
    bodies: `
  ${skyline(500, [[60, 170, 160], [280, 110, 220], [560, 190, 120], [760, 100, 200], [1150, 150, 180], [1390, 190, 140]], '#131730')}
  <rect x="0" y="500" width="1600" height="60" fill="#0e1226"/>
  <path d="M0,560 L1600,560 L1600,900 L0,900 Z" fill="#1e2846"/>
  <path d="M0,560 L1600,560 L1600,620 Q800,600 0,630 Z" fill="#3a4670" opacity="0.8"/>
  <ellipse cx="400" cy="700" rx="200" ry="30" fill="#8a96c0" opacity="0.3"/>
  <ellipse cx="1100" cy="760" rx="260" ry="26" fill="#6a76a4" opacity="0.25"/>
  ${railing(560)}`,
  }),

  // 开场 4：空荡长街，街灯成行
  open_street: frame({
    id: 'open_street', sky: NIGHT, stars: 16,
    glow: { x: 800, y: 430, r: 160, c: '#b8c4e0', o: 0.3, b: 55 },
    mists: [
      { x: 800, y: 480, rx: 700, ry: 110, c: '#7d88b0', o: 0.3, b: 60 },
      { x: 300, y: 620, rx: 400, ry: 100, c: '#3c4468', o: 0.35, b: 50 },
    ],
    bodies: `
  <path d="M0,900 L0,420 L380,420 L480,900 Z" fill="#10142a"/>
  <path d="M1600,900 L1600,400 L1180,400 L1080,900 Z" fill="#0d1126"/>
  <g fill="#181d38">
    ${Array.from({ length: 5 }, (_, i) => `<rect x="${60 + i * 62}" y="${470 + (i % 2) * 40}" width="34" height="52"/>`).join('')}
    ${Array.from({ length: 5 }, (_, i) => `<rect x="${1230 + i * 62}" y="${460 + (i % 2) * 46}" width="34" height="52"/>`).join('')}
  </g>
  ${lamp(560, 820, 1.1)}
  ${lamp(760, 700, 0.8)}
  ${lamp(920, 620, 0.6)}
  <path d="M480,900 L620,520 L980,520 L1080,900 Z" fill="#161b34"/>`,
  }),

  // 第一夜：街边，遇见她的那条街
  street: frame({
    id: 'street', sky: NIGHT, stars: 18,
    glow: { x: 1050, y: 400, r: 150, c: '#b0bce0', o: 0.32, b: 50 },
    mists: [
      { x: 500, y: 500, rx: 600, ry: 130, c: '#6a76a4', o: 0.3, b: 60 },
      { x: 1200, y: 640, rx: 450, ry: 110, c: '#343c60', o: 0.4, b: 50 },
    ],
    bodies: `
  <path d="M0,900 L0,380 L420,380 L520,900 Z" fill="#11152c"/>
  <path d="M1600,900 L1600,360 L1140,360 L1040,900 Z" fill="#0d1124"/>
  <g fill="#1a2040">
    ${Array.from({ length: 4 }, (_, i) => `<rect x="${70 + i * 74}" y="${440 + (i % 2) * 50}" width="40" height="60"/>`).join('')}
    ${Array.from({ length: 4 }, (_, i) => `<rect x="${1210 + i * 74}" y="${430 + (i % 2) * 55}" width="40" height="60"/>`).join('')}
  </g>
  ${lamp(660, 830, 1.2)}
  <path d="M520,900 L640,540 L960,540 L1040,900 Z" fill="#171c38"/>`,
  }),

  // 堤岸长椅：四章主场景，栏杆+长椅+水面
  embankment: frame({
    id: 'embankment', sky: NIGHT, stars: 22,
    glow: { x: 1200, y: 420, r: 190, c: '#b4c0e2', o: 0.35, b: 60 },
    mists: [
      { x: 700, y: 470, rx: 700, ry: 120, c: '#7d88b4', o: 0.3, b: 65 },
      { x: 300, y: 700, rx: 500, ry: 110, c: '#323a5e', o: 0.4, b: 50 },
    ],
    bodies: `
  ${skyline(430, [[100, 120, 200], [400, 80, 260], [900, 100, 220], [1300, 90, 200]], '#151a34')}
  ${spire(1050, 430, 200, '#151a34')}
  <path d="M0,560 L1600,560 L1600,640 L0,640 Z" fill="#232c50"/>
  <ellipse cx="1200" cy="600" rx="240" ry="20" fill="#8a96c4" opacity="0.3"/>
  ${railing(660)}
  <path d="M0,900 L0,660 L1600,660 L1600,900 Z" fill="#141830"/>
  <g fill="#0b0e20">
    <rect x="620" y="740" width="360" height="26"/>
    <rect x="620" y="700" width="360" height="16"/>
    <rect x="640" y="766" width="18" height="70"/>
    <rect x="942" y="766" width="18" height="70"/>
  </g>
  ${lamp(400, 760, 1.0)}
  ${lamp(1240, 760, 1.0)}`,
  }),

  // 桥：第四夜他出现的地方
  bridge: frame({
    id: 'bridge', sky: LATE, stars: 10,
    glow: { x: 800, y: 400, r: 220, c: '#c8cce0', o: 0.35, b: 65 },
    mists: [
      { x: 800, y: 480, rx: 800, ry: 120, c: '#8a94bc', o: 0.3, b: 65 },
    ],
    bodies: `
  <path d="M0,620 Q800,500 1600,620 L1600,700 Q800,580 0,700 Z" fill="#101430"/>
  <path d="M0,620 Q800,500 1600,620" fill="none" stroke="#05070f" stroke-width="10"/>
  ${Array.from({ length: 17 }, (_, i) => `<line x1="${i * 100}" y1="${618 - Math.sin(i / 16 * Math.PI) * 56}" x2="${i * 100}" y2="${650 - Math.sin(i / 16 * Math.PI) * 40}" stroke="#05070f" stroke-width="5"/>`).join('')}
  <path d="M0,700 L1600,700 L1600,900 L0,900 Z" fill="#1c2444"/>
  <ellipse cx="800" cy="790" rx="420" ry="30" fill="#6a76a8" opacity="0.3"/>
  ${person(800, 505, 1.0, '#05070f')}
  ${lamp(300, 640, 0.9)}
  ${lamp(1300, 640, 0.9)}`,
  }),

  // 祖母家室内：娜斯津卡的故事
  room: frame({
    id: 'room', sky: ['#221d2e', '#2e2638', '#16121e'],
    glow: { x: 1130, y: 540, r: 80, c: '#e0c88a', o: 0.8, b: 22 },
    mists: [
      { x: 1130, y: 520, rx: 260, ry: 170, c: '#a08855', o: 0.22, b: 55 },
      { x: 400, y: 300, rx: 400, ry: 140, c: '#3c3a52', o: 0.25, b: 60 },
    ],
    bodies: `
  <g transform="translate(240,180)">
    <rect width="180" height="260" fill="#8a9cba" opacity="0.45"/>
    <rect x="82" width="16" height="260" fill="#16121e"/>
    <rect y="120" width="180" height="16" fill="#16121e"/>
  </g>
  <path d="M0,900 L0,780 L1600,760 L1600,900 Z" fill="#100c16"/>
  <g>
    <rect x="1112" y="600" width="36" height="60" fill="#0d0a10"/>
    <rect x="1124" y="540" width="12" height="62" fill="#d8cfa8"/>
    <ellipse cx="1130" cy="532" rx="9" ry="16" fill="#f0d992"/>
  </g>
  <g fill="#0a0810">
    <rect x="600" y="640" width="400" height="30"/>
    <rect x="620" y="670" width="24" height="130"/>
    <rect x="950" y="670" width="24" height="130"/>
  </g>
  ${person(760, 640, 0.95, '#0a0810')}
  <g transform="translate(890,640) scale(-0.9,0.9)">${person(0, 0, 1, '#0a0810').replace('<g fill="#0a0810" opacity="1">', '').replace('</g>', '')}</g>`,
  }),

  // 幻想家阁楼：斜顶、小窗、白夜的光透进来
  garret: frame({
    id: 'garret', sky: ['#20232e', '#2a2e3c', '#14161e'],
    glow: { x: 1150, y: 300, r: 110, c: '#a8b8d8', o: 0.45, b: 26 },
    mists: [
      { x: 1150, y: 380, rx: 320, ry: 160, c: '#5e6c8c', o: 0.25, b: 50 },
      { x: 400, y: 650, rx: 500, ry: 140, c: '#282c38', o: 0.4, b: 55 },
    ],
    bodies: `
  <path d="M0,0 L900,0 L700,240 L0,420 Z" fill="#121420"/>
  <path d="M1600,0 L900,0 L700,240 L1600,380 Z" fill="#0e1018"/>
  <g transform="translate(1090,240)">
    <rect width="120" height="150" fill="#bccade" opacity="0.8"/>
    <rect x="55" width="10" height="150" fill="#14161e"/>
    <rect y="70" width="120" height="10" fill="#14161e"/>
  </g>
  <path d="M180,760 Q420,690 640,740 L660,800 L160,810 Z" fill="#0b0d14"/>
  <ellipse cx="430" cy="725" rx="90" ry="26" fill="#05070c"/>
  ${person(430, 740, 0.8, '#05070c', 0.9)}`,
  }),

  // 早晨：雨后清晨，天光灰白，白夜结束
  morning_street: frame({
    id: 'morning_street', sky: ['#5a6070', '#7a8090', '#9aa0a8', '#b8b4a4'],
    glow: { x: 500, y: 300, r: 200, c: '#e0dccc', o: 0.4, b: 70 },
    mists: [
      { x: 800, y: 450, rx: 900, ry: 150, c: '#b0b4bc', o: 0.4, b: 70 },
      { x: 400, y: 620, rx: 500, ry: 110, c: '#888c96', o: 0.4, b: 55 },
    ],
    bodies: `
  <path d="M0,900 L0,400 L400,400 L500,900 Z" fill="#3c4048"/>
  <path d="M1600,900 L1600,380 L1160,380 L1060,900 Z" fill="#34383f"/>
  <g fill="#4a4e56">
    ${Array.from({ length: 4 }, (_, i) => `<rect x="${70 + i * 72}" y="${450 + (i % 2) * 50}" width="38" height="56"/>`).join('')}
    ${Array.from({ length: 4 }, (_, i) => `<rect x="${1230 + i * 72}" y="${440 + (i % 2) * 52}" width="38" height="56"/>`).join('')}
  </g>
  <path d="M500,900 L630,560 L970,560 L1060,900 Z" fill="#484c55"/>
  <g stroke="#c8ccd4" stroke-width="2" opacity="0.35">
    ${Array.from({ length: 24 }, (_, i) => `<line x1="${(i * 67) % W}" y1="${(i * 137) % 500}" x2="${(i * 67) % W - 26}" y2="${(i * 137) % 500 + 90}"/>`).join('')}
  </g>
  ${person(760, 800, 1.1, '#22242a')}`,
  }),

  // 结尾 CG 占位：她扑入他怀中（全屏 16:9 构图提示，AI 成图 1920×1080 替换）
  cg_hug: frame({
    id: 'cg_hug', sky: LATE, stars: 12,
    glow: { x: 800, y: 430, r: 300, c: '#d4d8ec', o: 0.45, b: 80 },
    mists: [
      { x: 800, y: 500, rx: 800, ry: 130, c: '#98a2c8', o: 0.3, b: 65 },
      { x: 400, y: 720, rx: 500, ry: 110, c: '#3c4468', o: 0.35, b: 50 },
    ],
    bodies: `
  ${railing(680)}
  <path d="M0,900 L0,680 L1600,680 L1600,900 Z" fill="#141830"/>
  <g fill="#060818">
    <circle cx="770" cy="596" r="24"/>
    <path d="M742,622 Q770,600 798,622 L812,740 Q770,760 728,740 Z"/>
    <circle cx="836" cy="604" r="21"/>
    <path d="M816,628 Q840,610 862,630 L872,742 Q838,758 806,744 Z"/>
    <path d="M798,640 Q820,632 838,644" stroke="#060818" stroke-width="14" fill="none"/>
  </g>`,
  }),
};

for (const [name, svg] of Object.entries(scenes)) {
  fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
  console.log('✓', name, (svg.length / 1024).toFixed(1) + 'KB');
}
console.log('共', Object.keys(scenes).length, '张');
