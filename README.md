# 白夜 · Белые ночи

陀思妥耶夫斯基《白夜》视觉小说（谷羽译本全文收录），网页版。

**在线游玩：https://xu2077-q.github.io/white-nights/**

Ren'Py 桌面版（Windows 打包下载）：[XU2077-Q/white-nights-renpy](https://github.com/XU2077-Q/white-nights-renpy)

## 运行

静态站点，无构建：直接打开 `index.html`（或任意静态服务器托管）。章节选择、回想（H）、音乐开关（M）、自动存档。

## 目录

- `index.html` / `css/style.css` / `js/engine.js` — 引擎（打字机、立绘演出、开场序列、event CG、Ken Burns、白夜光尘）
- `js/script.js` — 剧本：谷雨译本全文 → 六章 655 拍
- `assets/bg|sprite|cg/` — 图（manifest 白名单驱动，SVG 占位与 AI 成图同名平滑升级）
- `assets/audio/` — 三首 BGM
- `tools/webcheck.js` — CDP 全剧情回归（`node tools/webcheck.js`）
- `tools/cut_mp3.js` — 纯 Node 帧级 MP3 剪辑

## 文本

剧本采用**谷羽译本《白夜》全文**（果麦经典 / 浙江文艺出版社 2020），不删节。译文版权归译者及出版方所有，本项目仅供学习交流。

## 音乐版权

- **开场主题曲《六月·船歌》**（柴可夫斯基《四季》Op.37a 之六）：Gregor Quendel 演奏录音，经 [Free Music Archive](https://freemusicarchive.org/music/gregor-quendel/tchaikovsky-the-seasons-op-37a/) 获取，许可 **CC BY-SA 4.0**。本项目音频部分因此同样以 CC BY-SA 4.0 使用。
- **夜晚场景《降 E 大调夜曲》Op.9 No.2**（肖邦）：Aya Higuchi（钢琴），MusOpen「Set Chopin Free」计划，公有领域（CC0）。
- **早晨场景《雨滴前奏曲》Op.28 No.15**（肖邦）：Ivan Ilić（钢琴，巴黎 2005），经 [IMSLP](https://imslp.org/) 获取，许可 **CC BY 3.0**。

## 美术

AI 生成（Seedream）：黑色剪影立绘（1840s 彼得堡服饰廓形）+ 水粉极简文学插画风背景；结尾 event CG 为全游戏唯一全彩画面。
