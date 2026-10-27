// scan_script.js —— 统计剧本结构，为 Ren'Py 转写摸底的临时工具
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'script.js'), 'utf8');
const mod = {};
(new Function('exports', src + '\nexports.SCRIPT=SCRIPT;exports.OPENING=OPENING;exports.CHAR_SPRITE=CHAR_SPRITE;'))(mod);
const { SCRIPT, OPENING } = mod;

const typeCount = {};
const poses = {};
const poss = {};
const whos = {};
let total = 0;
for (const sc of SCRIPT) {
    console.log(`scene「${sc.title}」 bg=${sc.bg} music=${sc.music} glow=${sc.glow} fx=${JSON.stringify(sc.fx)} kb=${sc.kb} beats=${sc.beats.length}`);
    for (const b of sc.beats) {
        total++;
        typeCount[b.type] = (typeCount[b.type] || 0) + 1;
        if (b.type === 'sprite' && !b.off) { poses[b.pose] = (poses[b.pose] || 0) + 1; poss[b.pos] = (poss[b.pos] || 0) + 1; }
        if (b.type === 'say') whos[b.who] = (whos[b.who] || 0) + 1;
        if (b.cls) console.log('  cls beat:', JSON.stringify(b).slice(0, 120));
        if (b.speed) console.log('  speed beat:', JSON.stringify(b).slice(0, 120));
    }
}
console.log('total beats', total);
console.log('types', typeCount);
console.log('poses', poses);
console.log('pos', poss);
console.log('say who', whos);
console.log('OPENING', JSON.stringify(OPENING));
