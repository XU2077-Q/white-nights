// 《白夜》立绘占位：12 张 1024×1536 透明底剪影 SVG
// 1840s 彼得堡廓形提示：礼帽长外套 / 长裙头巾；AI 成图（品红键控 alpha PNG）同名替换
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'sprite');
fs.mkdirSync(OUT, { recursive: true });

const W = 1024, H = 1536;

// pose 微调：头倾角 / 肩线 / 手臂提示 / 整体亮度
const POSES = {
  default: { tilt: 0,   shoulder: 0,  arm: null,      op: 1 },
  think:   { tilt: 9,   shoulder: 4,  arm: 'chin',    op: 0.97 },
  excited: { tilt: -6,  shoulder: -6, arm: 'raise',   op: 1 },
  shy:     { tilt: 12,  shoulder: 8,  arm: 'fold',    op: 0.95 },
  smile:   { tilt: -3,  shoulder: -2, arm: null,      op: 1 },
  sad:     { tilt: 10,  shoulder: 9,  arm: 'fold',    op: 0.93 },
  expect:  { tilt: -8,  shoulder: -4, arm: 'reach',   op: 1 },
  tears:   { tilt: 13,  shoulder: 10, arm: 'wipe',    op: 0.93 },
  joy:     { tilt: -9,  shoulder: -8, arm: 'open',    op: 1 },
  serious: { tilt: 2,   shoulder: 2,  arm: 'fold',    op: 0.97 },
};

// 角色基础廓形（cx=512，脚底 y=1480）
const CHARS = {
  // 幻想家：瘦，高礼帽，长外套
  dreamer: p => `
    <g transform="rotate(${p.tilt * 0.4} 512 420)">
      <rect x="472" y="130" width="80" height="110" rx="6"/>
      <rect x="446" y="228" width="132" height="16" rx="8"/>
      <circle cx="512" cy="300" r="62"/>
    </g>
    <path d="M512,368 C430,${390 + p.shoulder} 400,460 396,560 L384,1180 Q380,1320 420,1480 L604,1480 Q644,1320 640,1180 L628,560 C624,460 594,${390 + p.shoulder} 512,368 Z"/>
    ${arm(p, 'coat')}`,
  // 娜斯津卡：头巾+长发轮廓，大摆长裙
  nastenka: p => `
    <g transform="rotate(${p.tilt * 0.4} 512 430)">
      <circle cx="512" cy="310" r="64"/>
      <path d="M448,300 Q440,220 512,208 Q584,220 576,300 Q590,360 572,420 L452,420 Q434,360 448,300 Z"/>
    </g>
    <path d="M512,378 C444,${400 + p.shoulder} 424,470 428,560 L400,900 Q360,1240 330,1480 L694,1480 Q664,1240 624,900 L596,560 C600,470 580,${400 + p.shoulder} 512,378 Z"/>
    ${arm(p, 'dress')}`,
  // 年轻房客：略壮，礼帽，短外套+高领
  lodger: p => `
    <g transform="rotate(${p.tilt * 0.4} 512 425)">
      <rect x="466" y="150" width="92" height="100" rx="6"/>
      <rect x="440" y="240" width="144" height="16" rx="8"/>
      <circle cx="512" cy="310" r="66"/>
    </g>
    <path d="M512,382 C424,${400 + p.shoulder} 388,470 388,570 L380,1000 Q378,1260 404,1480 L620,1480 Q646,1260 644,1000 L636,570 C636,470 600,${400 + p.shoulder} 512,382 Z"/>
    ${arm(p, 'coat')}`,
  // 祖母：佝偻，头巾，宽裙，拄杖
  granny: p => `
    <g transform="rotate(6 500 500)">
      <path d="M452,420 Q440,330 505,320 Q570,330 558,420 Q566,470 550,510 L460,510 Q444,470 452,420 Z"/>
      <circle cx="505" cy="450" r="56"/>
    </g>
    <path d="M505,512 C430,540 410,620 416,720 L380,1480 L640,1480 L612,720 C620,630 590,550 505,512 Z"/>
    <rect x="664" y="820" width="12" height="660" rx="6"/>
    <circle cx="670" cy="812" r="16"/>`,
};

// 手臂姿态提示（简化色块，叠在躯干上）
function arm(p, kind) {
  const c = '#0d1124';
  switch (p.arm) {
    case 'chin':   return `<path d="M600,700 Q640,560 560,430" stroke="${c}" stroke-width="46" fill="none" stroke-linecap="round"/>`;
    case 'raise':  return `<path d="M610,680 Q700,520 740,360" stroke="${c}" stroke-width="46" fill="none" stroke-linecap="round"/>`;
    case 'fold':   return `<path d="M420,720 Q512,790 604,720" stroke="${c}" stroke-width="48" fill="none" stroke-linecap="round"/>`;
    case 'reach':  return `<path d="M612,690 Q700,640 790,620" stroke="${c}" stroke-width="44" fill="none" stroke-linecap="round"/>`;
    case 'wipe':   return `<path d="M600,700 Q660,560 580,460" stroke="${c}" stroke-width="46" fill="none" stroke-linecap="round"/>`;
    case 'open':   return `<path d="M404,700 Q320,620 260,560" stroke="${c}" stroke-width="44" fill="none" stroke-linecap="round"/><path d="M620,700 Q704,620 764,560" stroke="${c}" stroke-width="44" fill="none" stroke-linecap="round"/>`;
    default:       return kind === 'dress'
      ? `<path d="M436,600 Q420,760 430,880" stroke="${c}" stroke-width="40" fill="none" stroke-linecap="round"/><path d="M588,600 Q604,760 594,880" stroke="${c}" stroke-width="40" fill="none" stroke-linecap="round"/>`
      : `<path d="M416,600 Q404,800 420,980" stroke="${c}" stroke-width="42" fill="none" stroke-linecap="round"/><path d="M608,600 Q620,800 604,980" stroke="${c}" stroke-width="42" fill="none" stroke-linecap="round"/>`;
  }
}

function sprite(char, pose) {
  const p = POSES[pose];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="rim" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="d"/>
      <feFlood flood-color="#7d8fc4" flood-opacity="0.55" result="f"/>
      <feComposite in="f" in2="d" operator="in" result="r"/>
      <feMerge><feMergeNode in="r"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g fill="#10142a" opacity="${p.op}" filter="url(#rim)">
    ${CHARS[char](p)}
  </g>
  <!-- ${char}_${pose} 占位 -->
</svg>`;
}

const LIST = [
  ['dreamer', 'default'], ['dreamer', 'think'], ['dreamer', 'excited'], ['dreamer', 'shy'],
  ['nastenka', 'smile'], ['nastenka', 'sad'], ['nastenka', 'expect'], ['nastenka', 'tears'], ['nastenka', 'joy'],
  ['lodger', 'default'], ['lodger', 'serious'],
  ['granny', 'default'],
];
for (const [c, p] of LIST) {
  fs.writeFileSync(path.join(OUT, `${c}_${p}.svg`), sprite(c, p));
  console.log('✓', `${c}_${p}.svg`);
}
console.log('共', LIST.length, '张');
