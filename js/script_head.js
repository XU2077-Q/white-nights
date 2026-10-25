// 《白夜》剧本数据 · 由 tools/build_script.js 从谷羽译本全文生成，勿手改
// （本头部为常量区，改角色色/精灵映射/开场序列请编辑本文件后重跑生成器）
//
// beat 类型：
//   { type:'bg',     set:'<名>' }              换背景（同名 jpg 优先于 svg 占位）
//   { type:'music',  set:'barcarolle|night|morning|null' }
//   { type:'glow',   set:0..1 }                白夜天光强度
//   { type:'sprite', who:'<中文名>', pose:'<姿态>', pos:'left|center|right' }  上场/换姿态
//   { type:'sprite', who:'<中文名>', off:true }                                下场
//   { type:'cg',     set:'hug', text:'<回想里的一句话>' }                      全屏 event CG，点击继续
//   { type:'black',  text:'<黑场字>', shake?:true }
//   { type:'narr',   text, cls?, speed? }      旁白（楷体）
//   { type:'say',    who:'<中文名>' 或 '*<中文名>'（内心）, text, cls?, speed? }
//
// scene 级字段：title / bg / music / glow / fx(['fog','candle','dust']) / kb('in'|'pan'|'out')

const CHAR_COLORS = {
  '幻想家':   '#a8bce0',   // 白夜蓝
  '娜斯津卡': '#e8c9d8',   // 浅玫瑰
  '年轻房客': '#c9b98a',   // 旧金
  '祖母':     '#9a9a8f',   // 灰
  '玛特廖娜': '#b0a89a',   // 暖灰（无立绘）
};

const CHAR_SPRITE = {
  '幻想家':   'dreamer',
  '娜斯津卡': 'nastenka',
  '年轻房客': 'lodger',
  '祖母':     'granny',
};

// 开场序列：环境大图 + 引入字幕（原著开场白节选）
const OPENING = {
  music: 'barcarolle',
  images: ['open_city', 'open_roof', 'open_canal', 'open_street'],
  lines: [
    '这是个奇妙的夜晚，这样的夜晚，亲爱的读者，只有我们年轻的时候才能遇到。',
    '天空是这样的夜……星星、这样的星星！',
    '天上闪烁的星星明亮而美丽，当你抬头仰望星空的时候，首先想到的就是：',
    '在这样的天空下，难道还会有各种各样愤怒暴躁、反复无常的人吗？',
  ],
};
