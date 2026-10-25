// 纯 Node MP3 帧级剪辑器：不解码，按帧边界切片段（用于拉二选段）
// 用法: node cut_mp3.js <in.mp3> <out.mp3> <start秒> <end秒>
const fs = require('fs');

const BITRATES = {
  // [version][layer][index] kbps；layer: 3=LayerI 2=LayerII 1=LayerIII
  3: { 3: [0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],
       2: [0,32,48,56,64,80,96,112,128,160,192,224,256,320,384],
       1: [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] },
  2: { 3: [0,32,48,56,64,80,96,112,128,144,160,176,192,224,256],
       2: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
       1: [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160] },
};
BITRATES[0] = BITRATES[2]; // MPEG2.5 同 MPEG2 表
const SRS = { 3: [44100,48000,32000], 2: [22050,24000,16000], 0: [11025,12000,8000] };

function skipID3(buf) {
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6]&0x7f)<<21)|((buf[7]&0x7f)<<14)|((buf[8]&0x7f)<<7)|(buf[9]&0x7f);
    return 10 + size;
  }
  return 0;
}

function* frames(buf, start) {
  let i = start;
  while (i + 4 <= buf.length) {
    if (buf[i] === 0xff && (buf[i+1] & 0xe0) === 0xe0) {
      const ver = (buf[i+1] >> 3) & 3, layer = (buf[i+1] >> 1) & 3;
      const bi = (buf[i+2] >> 4) & 0xf, si = (buf[i+2] >> 2) & 3, pad = (buf[i+2] >> 1) & 1;
      if (ver !== 1 && layer !== 0 && bi > 0 && bi < 15 && si < 3) {
        const br = BITRATES[ver][layer][bi] * 1000, sr = SRS[ver][si];
        const coef = (layer === 1) ? (ver === 3 ? 144 : 72) : (layer === 2 ? 144 : 12);
        let len;
        if (layer === 3) len = Math.floor(12 * br / sr + pad) * 4; // Layer I
        else len = Math.floor(coef * br / sr) + pad;
        const samples = (layer === 1) ? (ver === 3 ? 1152 : 576) : (layer === 2 ? 1152 : 384);
        if (i + len <= buf.length) { yield { off: i, len, sr, samples }; i += len; continue; }
      }
    }
    i++; // 容错：逐字节找下一个同步
  }
}

const [,, inF, outF, t0s, t1s] = process.argv;
const t0 = parseFloat(t0s), t1 = parseFloat(t1s);
const buf = fs.readFileSync(inF);
const dataStart = skipID3(buf);

let t = 0, cutStart = -1, cutEnd = -1, n = 0, sr0 = 0;
for (const f of frames(buf, dataStart)) {
  const dur = f.samples / f.sr;
  if (cutStart < 0 && t + dur > t0) cutStart = f.off;
  if (cutEnd < 0 && t >= t1) cutEnd = f.off;
  t += dur; n++; sr0 = f.sr;
  if (cutEnd >= 0) break;
}
if (cutStart < 0) { console.error('起点超出音频长度', t.toFixed(1)); process.exit(1); }
if (cutEnd < 0) cutEnd = buf.length;
fs.writeFileSync(outF, buf.subarray(cutStart, cutEnd));
console.log(`${inF}: 全长~${(n*1152/sr0).toFixed(1)}s → ${outF} [${t0}s, ${t1}s] ${(cutEnd-cutStart)/1024|0}KB`);
