# PWA UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 PWA 全面改成中文界面、消除浮动按钮误触、补齐切歌 + 立即响应 + 语音输入。

**Architecture:** 单文件改造（`pwa/index.html`），把三个 `position:fixed` 浮动按钮收纳进 `.header` 右上工具栏；把浮动 chat-bar 改为常驻在播放器卡片内底部的输入条；删除 `djLanguage` 状态，后端 `/api/chat` 始终传 `'zh'`；所有可见文案中文化。聊天发送时链式调用 `/api/next` → `/api/chat`，前者已有的 `{type:'control', action:'next'}` 广播完成立即切歌。语音输入用浏览器 `webkitSpeechRecognition`（`lang='zh-CN'`，hold-to-speak），不支持时优雅降级隐藏按钮。

**Tech Stack:** PWA = 纯 HTML + vanilla JS in `pwa/index.html`。Backend = Express (`server.js`)，已有 `/api/next` 和 `/api/chat`。LLM 提示在 `context.js`，已支持 `djLanguage:'zh'`。

**关于测试**：这个项目前端无单元测试基础设施，每步用 `grep` 内容断言验证 HTML/JS 已包含目标代码，再用浏览器 smoke test 验证实际表现。诚实优于"测试剧场"。

---

## File Inventory

| File | Role | 改动量 |
|---|---|---|
| `pwa/index.html` | 唯一前端文件，承载所有 UI/JS | 全部任务都改它 |
| `server.js` | 后端 Express | Task 5 顺手清掉 `djLanguage` 接收（可选） |
| `context.js` | LLM prompt | Task 1 可选：把 `normalizeDjLanguage` 默认改 `'zh'` |

---

## 执行前提

- 工作目录 `/Users/aspskys/multica_workspaces/seadio-FM/`
- 当前分支 `feat/desktop-mvp`
- 用户的 Tauri Seadio.app（PID 86671，sidecar 在 8080）**不要 kill** —— 本地开发用 `PORT=8181` 启 server。
- netease-api sidecar 已在 PID 14561 / port 3000 跑着；server 调试用 `PORT=8181 node server.js`。

---

## Task 1: 中文化 + 移除 DJ 语言切换

**目标**：所有可见 UI 文案改中文；删除 tweaks 里的 DJ language 切换；`djLanguage` 状态/请求字段统一去掉。

**Files:**
- Modify: `pwa/index.html` (header strings, meta, transcript empty state, tweaks panel labels, status text, body placeholder, dialog text, aria-labels)
- Modify: `pwa/index.html`:793-826 (删除 `djLanguageControl`/`djLanguage`/`setDjLanguage`/`syncDjLanguageControl`)
- Modify: `pwa/index.html`:1785-1791 (`requestChat` body 不再带 `djLanguage`)
- Modify: `pwa/index.html`:1502-1514 (`/api/radio/refill` body 不再带 `djLanguage`)
- Modify: `pwa/index.html`:1891-1895 (删除 `djLanguageControl` 事件监听)
- Modify: `pwa/index.html`:725-731 (删除 tweaks 里整个 `<div class="tweak-row">DJ language</div>`)

### Step 1.1: 替换 header / meta / transcript 静态文案

打开 `pwa/index.html`，做以下替换（用 Edit 工具一条条改，每条都包含足够上下文唯一定位）：

```
"<div class="header-avatar">C</div>\n            Seadio"
→ "<div class="header-avatar">C</div>\n            Seadio FM"

"<span id="headerStatus">Paused</span>"
→ "<span id="headerStatus">已暂停</span>"

"<button class="replay-btn" id="replayBtn" style="display:none">↩ replay</button>"
→ "<button class="replay-btn" id="replayBtn" style="display:none">↩ 重播</button>"

"<div class="meta-name" id="metaName">Your private<br>radio station</div>"
→ "<div class="meta-name" id="metaName">你的私人<br>电台</div>"

"<span id="metaSub">Waiting for Seadio…</span>"
→ "<span id="metaSub">等待 Seadio…</span>"
```

transcript empty state（行 ~636-647）整段替换：

旧：
```html
<div class="turn-head"><span class="who">Seadio</span> · now</div>
<div class="turn-body">
  <span class="word future">Tell</span><span> </span>
  <span class="word future">me</span><span> </span>
  <span class="word future">what</span><span> </span>
  <span class="word future">you're</span><span> </span>
  <span class="word future">in</span><span> </span>
  <span class="word future">the</span><span> </span>
  <span class="word future">mood</span><span> </span>
  <span class="word future">for.</span>
</div>
```

新：
```html
<div class="turn-head"><span class="who">Seadio</span> · 此刻</div>
<div class="turn-body">
  <span class="word future">告诉</span><span> </span>
  <span class="word future">我</span><span> </span>
  <span class="word future">你</span><span> </span>
  <span class="word future">现在</span><span> </span>
  <span class="word future">想听</span><span> </span>
  <span class="word future">什么。</span>
</div>
```

- [ ] **执行替换并验证**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
grep -c "已暂停\|你的私人\|等待 Seadio\|此刻" pwa/index.html
```

预期：`>= 4`

### Step 1.2: 替换 tweaks 面板文案

行 716-756 范围内替换。

```
"<h3>Tweaks</h3>"  →  "<h3>设置</h3>"
"<label>Skin</label>"  →  "<label>外观</label>"
"data-skin-name=\"default\" aria-pressed=\"true\">Cosmic</button>"
  →  "data-skin-name=\"default\" aria-pressed=\"true\">星空</button>"
"data-skin-name=\"glass\" aria-pressed=\"false\">Glass</button>"
  →  "data-skin-name=\"glass\" aria-pressed=\"false\">玻璃</button>"
"<label>DJ volume <span id=\"lblDjVolume\">100%</span></label>"
  →  "<label>DJ 音量 <span id=\"lblDjVolume\">100%</span></label>"
"<label>Music volume <span id=\"lblMusicVolume\">100%</span></label>"
  →  "<label>音乐音量 <span id=\"lblMusicVolume\">100%</span></label>"
"<label>Header tone</label>"  →  "<label>顶部色调</label>"
"<label>Blue hue <span id=\"lblBlueHue\">256°</span></label>"
  →  "<label>蓝色调 <span id=\"lblBlueHue\">256°</span></label>"
"<label>Violet hue <span id=\"lblVioletHue\">330°</span></label>"
  →  "<label>紫色调 <span id=\"lblVioletHue\">330°</span></label>"
```

- [ ] **验证**

```bash
grep -c "设置\|外观\|星空\|玻璃\|DJ 音量\|音乐音量\|顶部色调\|蓝色调\|紫色调" pwa/index.html
```

预期：`>= 9`

### Step 1.3: 删除整个 DJ language tweak-row

用 Edit 删除以下完整块（约行 725-731）：

```html
  <div class="tweak-row">
    <label>DJ language</label>
    <div class="segmented" id="djLanguageControl" role="group" aria-label="DJ language">
      <button type="button" data-lang="en" aria-pressed="true">English</button>
      <button type="button" data-lang="zh" aria-pressed="false">中文</button>
    </div>
  </div>
```

替换为空字符串（删除整段）。

- [ ] **验证已删除**

```bash
grep -c "djLanguageControl\|data-lang=" pwa/index.html
```

预期：`<= 5`（JS 里 const 声明等会一起在下一步删掉，本步只删 HTML 行）

### Step 1.4: 删除 djLanguage 相关 JS

在行 793-794，删除：
```javascript
const djLanguageControl = document.getElementById('djLanguageControl');
let djLanguage = localStorage.getItem('seadio:dj-language') === 'zh' ? 'zh' : 'en';
```

在行 814-828，删除整个 `syncDjLanguageControl` 函数、`setDjLanguage` 函数、以及孤立的 `syncDjLanguageControl();` 调用。

在行 1891-1895，删除：
```javascript
djLanguageControl.addEventListener('click', e => {
  const button = e.target.closest('button[data-lang]');
  if (!button) return;
  setDjLanguage(button.dataset.lang);
});
```

修改 `requestChat`（行 1785-1791）：

旧：
```javascript
async function requestChat(message, { showUserTurn = true } = {}) {
  if (showUserTurn) addUserTurn(message);
  await fetch(window.SeadioConfig.api('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, djLanguage }),
  });
}
```

新：
```javascript
async function requestChat(message, { showUserTurn = true } = {}) {
  if (showUserTurn) addUserTurn(message);
  await fetch(window.SeadioConfig.api('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, djLanguage: 'zh' }),
  });
}
```

修改 refill 调用（行 1502-1514），把 `djLanguage,` 改为 `djLanguage: 'zh',`：

旧：
```javascript
queueLength: queue.length,
djLanguage,
```

新：
```javascript
queueLength: queue.length,
djLanguage: 'zh',
```

- [ ] **验证 djLanguage 状态变量彻底没了**

```bash
grep -nE "let djLanguage|const djLanguage|djLanguageControl|setDjLanguage|syncDjLanguageControl" pwa/index.html
```

预期：无输出（zero hits）

```bash
grep -n "djLanguage" pwa/index.html
```

预期：只剩两行 `djLanguage: 'zh',`

### Step 1.5: 替换 startRadio 提示 + buildStartMessage

修改 `buildStartMessage`（行 806-811）让 Claude 直接得到中文上下文：

旧：
```javascript
function buildStartMessage() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.toLocaleDateString('en-US', { weekday: 'long' });
  return `It's ${hour}:00 on a ${day}. You're on air — open the station. Pick whatever fits the moment.`;
}
```

新：
```javascript
function buildStartMessage() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.toLocaleDateString('zh-CN', { weekday: 'long' });
  return `现在是${day} ${hour}:00。你已经上线 —— 开始这一节，选适合当下时刻的歌。`;
}
```

修改 `startRadio` 里的状态文案（行 1813-1828）：

旧：
```javascript
setRadioStatus('On Air');
metaSub.textContent = 'Tuning Seadio FM…';
```
新：
```javascript
setRadioStatus('节目中');
metaSub.textContent = '正在调台…';
```

旧：
```javascript
setRadioStatus('Paused');
metaSub.textContent = 'Could not start Seadio FM';
```
新：
```javascript
setRadioStatus('已暂停');
metaSub.textContent = 'Seadio FM 启动失败';
```

- [ ] **验证**

```bash
grep -nE "节目中|正在调台|Seadio FM 启动失败|现在是" pwa/index.html
```

预期：4 行

### Step 1.6: 全文扫剩余英文文案

```bash
grep -nE "Paused|On Air|Tuning|Tweaks|Skin|Cosmic|Glass\b|Leave a note|Request line|Patch in|Enter fullscreen|Exit fullscreen" pwa/index.html
```

剩下的逐条处理。预期还会剩：
- `chatToggle` 的 `aria-label="Open request line"` / `title="Request line"` / `Request line` label span —— Task 3 会一并改
- `chat-input` placeholder `Leave a note for Seadio…` —— Task 3 一并改
- `chat-send` 的 `title="Patch in" aria-label="Patch in"` —— Task 3 一并改
- `fullscreenToggle` 的 aria-label/title `Enter fullscreen` / `Fullscreen` —— Task 2 一并改

剩余每条已在后续 Task 处理 → 此步只做记账，不强求清零。

- [ ] **Commit**

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
git add pwa/index.html
git commit -m "i18n(pwa): hardcode Chinese UI, drop djLanguage toggle"
```

---

## Task 2: 三个浮动按钮整合进 header 工具栏

**目标**：把 `.fullscreen-toggle`（右上）、设置 ⚙（左下，server URL dialog 触发器）、`.tweaks-toggle`（右下 ⚙）全部移到 `.header > .header-top` 右侧成为一个图标工具栏。删除三个 `position:fixed` 样式块。chatToggle 留到 Task 3 处理。

**Files:**
- Modify: `pwa/index.html`:303-322 (`.tweaks-toggle` & `.tweaks` 样式)
- Modify: `pwa/index.html`:370-384 (`.fullscreen-toggle` 样式)
- Modify: `pwa/index.html`:521-538 (`[data-skin="glass"]` 对应玻璃皮肤变体)
- Modify: `pwa/index.html`:590-610 (`.header-top` HTML 结构)
- Modify: `pwa/index.html`:671-685, 710-715 (移除浮动 `<button>` 元素)
- Modify: `pwa/index.html`:1935-1956 (settings dialog open 按钮迁移)

### Step 2.1: 加 header 工具栏 CSS

找到 `.tweaks-toggle {` 那一行（约 303），把以下全部样式块（`.tweaks-toggle` / `.tweaks-toggle:hover` / `.tweaks-toggle svg`）替换成：

```css
/* ── Header tools cluster ─────────────────────────────────────────── */
.header-tools {
  display: inline-flex; align-items: center; gap: 6px;
}
.header-tools button {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.10);
  color: rgba(255,255,255,.78);
  display: grid; place-items: center; cursor: pointer; padding: 0;
  transition: background .15s, transform .15s;
}
.header-tools button:hover { background: rgba(255,255,255,.12); transform: scale(1.04); }
.header-tools button svg { width: 16px; height: 16px; }
.header-tools button .icon-exit { display: none; }
.header-tools button.is-fullscreen .icon-enter { display: none; }
.header-tools button.is-fullscreen .icon-exit { display: block; }

.tweaks {
  position: absolute; right: 16px; top: 56px; width: 280px;
  background: rgba(20,20,22,.96); backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,.10); border-radius: 14px;
  padding: 14px 16px; color: rgb(255,255,255); font-size: 13px;
  z-index: 1000; box-shadow: rgba(0,0,0,.4) 0 12px 32px; display: none;
}
.tweaks.visible { display: block; }
.tweaks h3 { font-size: 12px; font-weight: 600; margin: 0 0 10px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.6); }
```

（即：移除 `.tweaks-toggle` 整组规则，把 `.tweaks` 的 `position:fixed; right:16px; bottom:68px` 改为 `position:absolute; right:16px; top:56px` —— 锚在 header 下方。）

把 `.fullscreen-toggle {` 那一行起整组（包含 `.fullscreen-toggle:hover` / `.fullscreen-toggle svg` / `.fullscreen-toggle .icon-exit` / 两条 `.is-fullscreen` 子规则）直接删掉 —— 已并入 `.header-tools` 的统一样式。

在 `[data-skin="glass"] .tweaks-toggle,` 那块（约 523-538）替换：

旧：
```css
[data-skin="glass"] .tweaks-toggle,
[data-skin="glass"] .chat-toggle,
[data-skin="glass"] .fullscreen-toggle {
  background: rgba(255,255,255,.10);
  ...
}
[data-skin="glass"] .tweaks-toggle:hover,
[data-skin="glass"] .chat-toggle:hover,
[data-skin="glass"] .fullscreen-toggle:hover {
  ...
}
```

新（保留 `.chat-toggle` 占位以免 Task 3 之前出错，但 chat-toggle 元素 Task 3 会删）：

```css
[data-skin="glass"] .header-tools button,
[data-skin="glass"] .chat-toggle {
  background: rgba(255,255,255,.10);
  border-color: rgba(255,255,255,.16);
  color: rgba(255,255,255,.86);
}
[data-skin="glass"] .header-tools button:hover,
[data-skin="glass"] .chat-toggle:hover {
  background: rgba(255,255,255,.18);
}
```

- [ ] **验证 CSS**

```bash
grep -nE "\.header-tools|\.tweaks-toggle|\.fullscreen-toggle" pwa/index.html
```

预期：`.header-tools` 出现 ≥ 4 次；`.tweaks-toggle` / `.fullscreen-toggle` 0 次。

### Step 2.2: 改 header HTML 结构

定位行 593-605（`.header-top` 内部），整段替换：

旧：
```html
<div class="header-top">
  <div>
    <div class="header-name">
      <div class="header-avatar">C</div>
      Seadio FM
    </div>
    <div class="header-status">
      <span class="dot-live" id="dotLive" style="display:none"></span>
      <span id="headerStatus">已暂停</span>
      <button class="replay-btn" id="replayBtn" style="display:none">↩ 重播</button>
    </div>
  </div>
  <div class="header-time" id="headerTime">—:—</div>
</div>
```

新：
```html
<div class="header-top">
  <div>
    <div class="header-name">
      <div class="header-avatar">C</div>
      Seadio FM
    </div>
    <div class="header-status">
      <span class="dot-live" id="dotLive" style="display:none"></span>
      <span id="headerStatus">已暂停</span>
      <button class="replay-btn" id="replayBtn" style="display:none">↩ 重播</button>
    </div>
  </div>
  <div class="header-right">
    <div class="header-time" id="headerTime">—:—</div>
    <div class="header-tools">
      <button id="fullscreenToggle" aria-label="进入全屏" title="全屏">
        <svg class="icon-enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
          <path d="M16 3h3a2 2 0 0 1 2 2v3"/>
          <path d="M21 16v3a2 2 0 0 1-2 2h-3"/>
          <path d="M8 21H5a2 2 0 0 1-2-2v-3"/>
        </svg>
        <svg class="icon-exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 3v3a2 2 0 0 1-2 2H3"/>
          <path d="M16 3v3a2 2 0 0 0 2 2h3"/>
          <path d="M21 16h-3a2 2 0 0 0-2 2v3"/>
          <path d="M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
      </button>
      <button id="seadio-settings-open" aria-label="服务器设置" title="服务器设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M3 12h2"/><path d="M19 12h2"/><path d="M12 3v2"/><path d="M12 19v2"/>
          <path d="M5.6 5.6l1.4 1.4"/><path d="M17 17l1.4 1.4"/>
          <path d="M5.6 18.4 7 17"/><path d="M17 7l1.4-1.4"/>
        </svg>
      </button>
      <button id="tweaksToggle" aria-label="界面调整" title="界面">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </div>
</div>
```

并在 `.header-top` 旧 CSS 旁补 `.header-right` 样式 —— 找 `.header-top` 的 CSS 定义（可能在 ~200-280 行附近），紧接其后追加：

```css
.header-right { display: inline-flex; align-items: center; gap: 12px; }
.header { position: relative; }
```

如果 `.header-time` 之前是 flex 子项靠右对齐，新结构里 `.header-right` 接管这一角色 —— 验证视觉位置不变。

- [ ] **验证**

```bash
grep -nE "header-tools|header-right|进入全屏|服务器设置|界面调整" pwa/index.html
```

预期：每个串至少 1 次。

### Step 2.3: 删除三个浮动按钮元素

定位行 671-685（`<button class="fullscreen-toggle" id="fullscreenToggle" ...>`），整段（包括两个 `<svg>` 和 `</button>`）删除 —— 因为该 button 已迁到 header-tools 里。

定位行 710-715（`<button class="tweaks-toggle" id="tweaksToggle" aria-label="Toggle tweaks">`），整段删除。

定位行 1935-1956 附近的 `<button id="seadio-settings-open">`，整段删除（已迁到 header-tools）。先看下原始内容：

```bash
grep -n "seadio-settings-open" pwa/index.html
```

读出原始按钮（应该带 `position:fixed; left:14px; bottom:14px` 内联样式）然后整段删除。

- [ ] **验证浮动按钮元素全部消失**

```bash
grep -cE "class=\"fullscreen-toggle\"|class=\"tweaks-toggle\"" pwa/index.html
```

预期：0

```bash
grep -nE "id=\"fullscreenToggle\"|id=\"tweaksToggle\"|id=\"seadio-settings-open\"" pwa/index.html
```

预期：每个 ID 各只出现 1 次（在 header-tools 里）。

### Step 2.4: 浏览器 smoke test

```bash
cd /Users/aspskys/multica_workspaces/seadio-FM
PORT=8181 DISABLE_NETEASE=0 node server.js &
sleep 2
open "http://localhost:8181"
```

打开 DevTools，验证：
- header 右上角同时显示「时钟 | 全屏按钮 | 设置 ⚙ | 界面 ⚙」共四个元素
- 点击「界面 ⚙」 → tweaks 面板从 header 下方展开（不是右下角浮起）
- 点击「全屏」 → 进入全屏
- 点击「设置 ⚙」 → server URL dialog 打开
- 页面四角无任何浮动 fixed 按钮（chatToggle 还在，Task 3 处理）

- [ ] 视觉确认全部 OK

- [ ] **Commit**

```bash
git add pwa/index.html
git commit -m "ux(pwa): consolidate floating buttons into header tools cluster"
```

---

## Task 3: 把 Request line 改成常驻输入条

**目标**：删除浮动 chat-toggle 按钮和浮动 chat-bar，改为在播放器卡片的 `.body` 底部加一个常驻、贴着卡片宽度的输入条。占位文案 + button title 全中文。

**Files:**
- Modify: `pwa/index.html`:270-300 (`.chat-bar` CSS)
- Modify: `pwa/index.html`:346-368 (`.chat-toggle` CSS 全删)
- Modify: `pwa/index.html`:687-707 (chat-toggle button 删 + chat-bar 重做)
- Modify: `pwa/index.html`:1700-1783 附近的 chatToggle / openRequestLine / closeRequestLine 逻辑

### Step 3.1: 移除 chat-toggle CSS + 改造 chat-bar CSS

删除 `.chat-toggle` 起的整段规则（约 346-368），以及 `@media (max-width: 560px)` 里关于 `.chat-toggle` 的两行（保留 `.chat-bar` 的 width 规则，但接下来会改）。

把 `.chat-bar` 整组（约 270-300）替换：

旧（要找到的关键标记是 `.chat-bar { position: fixed; left: 16px; bottom: 16px;`）：

新：
```css
/* ── Request line (resident inside card body) ─────────────────────── */
.chat-bar {
  margin: 14px 20px 18px;
  display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center;
  background: rgba(13,13,16,.66); backdrop-filter: blur(20px) saturate(1.05);
  border: 1px solid rgba(255,255,255,.12); border-radius: 999px;
  padding: 9px 10px 9px 17px;
  box-shadow: rgba(0,0,0,.34) 0 8px 20px, rgba(255,255,255,.04) 0 1px 0 inset;
}
#chat-input {
  background: transparent; border: none; outline: none; resize: none;
  color: rgba(255,255,255,.92); font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px; line-height: 1.45; max-height: 84px; overflow-y: auto;
  padding: 6px 0;
}
#chat-input::placeholder { color: rgba(255,255,255,.42); }
#chat-send, #chat-mic {
  width: 34px; height: 34px; border-radius: 999px; border: none;
  display: grid; place-items: center; cursor: pointer; padding: 0;
  transition: transform .12s, background .15s;
}
#chat-send { background: rgb(255,255,255); color: rgb(17,17,17); }
#chat-send:hover { transform: scale(1.04); background: rgb(236,236,238); }
#chat-send svg { width: 15px; height: 15px; }
#chat-send:disabled { opacity: .4; cursor: not-allowed; }
#chat-mic { background: rgba(255,255,255,.12); color: rgba(255,255,255,.92); }
#chat-mic:hover { background: rgba(255,255,255,.20); transform: scale(1.04); }
#chat-mic.recording { background: rgb(255,72,72); color: rgb(255,255,255); }
#chat-mic svg { width: 16px; height: 16px; }
#chat-mic.hidden { display: none; }

@media (max-width: 560px) {
  .chat-bar { margin: 10px 12px 14px; }
}
```

把 glass 皮肤里残留的 `.chat-toggle` 选择器删掉：

```bash
grep -nE "\.chat-toggle" pwa/index.html
```

剩余的 chat-toggle 选择器全删干净（包括 Task 2 Step 2.1 里临时保留的过渡）。

- [ ] **验证**

```bash
grep -cE "\.chat-toggle" pwa/index.html
```

预期：0

```bash
grep -n "#chat-mic" pwa/index.html
```

预期：≥ 5 行

### Step 3.2: 改 HTML 结构

删除行 687-696 整段 `<!-- Request line toggle -->` + `<button class="chat-toggle" id="chatToggle" ...>...</button>`。

把 `.chat-bar` 的 HTML 改为（替换原行 698-707 那段）：

旧：
```html
<!-- Chat bar -->
<div class="chat-bar hidden" id="chatBar">
  <textarea id="chat-input" rows="1" placeholder="Leave a note for Seadio…"></textarea>
  <button id="chat-send" title="Patch in" aria-label="Patch in">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h13"/>
      <path d="m13 6 6 6-6 6"/>
    </svg>
  </button>
</div>
```

新（注意：从浮动 `<body>` 子节点位置删除，把它放到 `.card > .body` 内 `.player` 之后作为兄弟节点）：

操作分两步：
1. 在原位置删除整段。
2. 在 `</div><!-- .player -->` 之后（也就是 `</div><!-- .body -->` 之前）插入：

```html
<!-- Request line: resident input row -->
<div class="chat-bar" id="chatBar">
  <textarea id="chat-input" rows="1" placeholder="想点什么？告诉 Seadio…"></textarea>
  <button id="chat-mic" type="button" title="按住说话" aria-label="按住说话">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3"/>
      <path d="M5 11a7 7 0 0 0 14 0"/>
      <path d="M12 18v3"/>
    </svg>
  </button>
  <button id="chat-send" type="button" title="发送" aria-label="发送">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h13"/>
      <path d="m13 6 6 6-6 6"/>
    </svg>
  </button>
</div>
```

（注意 `.player` 没有 `</div><!-- .player -->` 注释，要找到行 `</div><!-- .body -->`，在它之前插入即可。也即在 `<div class="player">...</div>` 关闭之后、body 关闭之前。）

- [ ] **验证**

```bash
grep -n "想点什么" pwa/index.html
grep -n "按住说话" pwa/index.html
grep -cE "id=\"chatToggle\"|class=\"chat-toggle\"" pwa/index.html
```

预期：前两行有命中；第三行 0。

### Step 3.3: 删除 chat-toggle 相关 JS

删除以下声明（搜索定位）：
- `const chatToggle = document.getElementById('chatToggle');`
- 任何 `chatToggle.addEventListener(...)` / `chatToggle.classList.toggle(...)` / `chatToggle.classList.add(...)` 调用
- `openRequestLine` / `closeRequestLine` 函数里凡是涉及 `chatToggle` 的行
- `chatBar.classList.add('hidden')` / `chatBar.classList.remove('hidden')` 的调用 —— 改为不做（输入条始终可见），或全删

定位：
```bash
grep -nE "chatToggle|openRequestLine|closeRequestLine|chatBar\.classList" pwa/index.html
```

读取每一行上下文，删除：
- `closeRequestLine()` 调用统统删除（输入条不需要关闭）
- `openRequestLine()` 调用也删除
- 两个函数定义本身可以保留但改为空函数；或直接删除函数定义、删除所有调用（更干净）
- `document.addEventListener('keydown', e => { if (e.key === 'Escape' && !chatBar.classList.contains('hidden')) closeRequestLine(); });` —— 整段删除

`sendMessage()` 函数里把 `closeRequestLine();` 删掉。

- [ ] **验证**

```bash
grep -cE "chatToggle|openRequestLine|closeRequestLine" pwa/index.html
```

预期：0

### Step 3.4: 浏览器 smoke test

刷新 `http://localhost:8181`。验证：
- 主卡片下方常驻一条胶囊输入条，含 textarea + 麦克风按钮 + 发送按钮三栏
- 不再有左下浮动按钮
- 桌面端宽度跟随卡片
- 手机端（DevTools 切到 iPhone 14 视图）输入条不与播放按钮、不与 header 工具栏重叠

- [ ] 视觉确认 OK

- [ ] **Commit**

```bash
git add pwa/index.html
git commit -m "ux(pwa): make request line a resident input row inside the card"
```

---

## Task 4: 切歌按钮 + 立即切歌发送语义

**目标**：在播放器内 `play-btn` 旁加一个「下一首」按钮。`sendMessage()` 先打 `/api/next` 再 `/api/chat`。

**Files:**
- Modify: `pwa/index.html`:653-666 (`.player` HTML，加 skip 按钮)
- Modify: `pwa/index.html`（CSS，加 `.skip-btn` 样式）
- Modify: `pwa/index.html`:1831-1840 (`sendMessage` 链式调用)

### Step 4.1: 加切歌按钮样式

定位 `.play-btn` 的 CSS（用 grep）：

```bash
grep -n "\.play-btn" pwa/index.html | head -5
```

在 `.play-btn { ... }` 整组之后追加：

```css
.skip-btn {
  width: 36px; height: 36px; border-radius: 999px;
  background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.14);
  color: rgba(255,255,255,.88);
  display: grid; place-items: center; cursor: pointer; padding: 0;
  transition: background .15s, transform .12s;
  margin-left: 8px;
}
.skip-btn:hover { background: rgba(255,255,255,.20); transform: scale(1.04); }
.skip-btn:disabled { opacity: .4; cursor: not-allowed; }
.skip-btn svg { width: 16px; height: 16px; }
```

### Step 4.2: 加切歌按钮 HTML

定位 `.player` 块行 654-666。在 `<button class="play-btn" id="playBtn" ...>...</button>` 之后、`</div><!-- .body -->` 之前（即在 player div 内、playBtn 兄弟）插入：

```html
<button class="skip-btn" id="skipBtn" type="button" aria-label="下一首" title="下一首">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="5 4 15 12 5 20" fill="currentColor"/>
    <line x1="19" y1="5" x2="19" y2="19"/>
  </svg>
</button>
```

### Step 4.3: 加切歌按钮逻辑

定位 `const playBtn = document.getElementById('playBtn');`，紧接其后追加：

```javascript
const skipBtn = document.getElementById('skipBtn');
```

定位 `playBtn.addEventListener('click', ...)` 上方或下方添加：

```javascript
async function skipCurrent() {
  skipBtn.disabled = true;
  try {
    await fetch(window.SeadioConfig.api('/api/next'), { method: 'POST' });
  } catch (err) {
    console.error('[skip]', err);
  } finally {
    setTimeout(() => { skipBtn.disabled = false; }, 800);
  }
}

skipBtn.addEventListener('click', skipCurrent);
```

### Step 4.4: 改造 sendMessage 走立即切歌

定位 `async function sendMessage()`（约行 1831）和 `async function patchCallerIntoStation(text)`（约行 1794）。

修改 `sendMessage` 为：

旧：
```javascript
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  closeRequestLine();
  chatSend.disabled = true;
  try {
    await patchCallerIntoStation(text);
  } catch (err) { console.error('[chat]', err); }
  finally { chatSend.disabled = false; }
}
```

新（已删了 closeRequestLine）：
```javascript
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatSend.disabled = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  try {
    // 立即切下一首，让用户感觉「即时响应」
    fetch(window.SeadioConfig.api('/api/next'), { method: 'POST' }).catch(err => console.error('[cut-in:next]', err));
    await patchCallerIntoStation(text);
  } catch (err) { console.error('[chat]', err); }
  finally { chatSend.disabled = false; }
}
```

注：`/api/next` 用 fire-and-forget（不 await），让它和 caller TTS 并行 —— `patchCallerIntoStation` 内部已经有 ducking/请求 TTS 流程，先广播 next 让客户端先把当前曲目切走，新节目准备好的同时调度听众音频。

### Step 4.5: 浏览器 smoke test

刷新，先点播放（等节目起来开始放音乐），然后：
1. 点切歌按钮 → 当前歌应立即切到下一首
2. 在输入条里输入「换点轻快的爵士」回车 → 应立即切歌 + 几秒后听到新的 caller 语音

- [ ] 视觉/听觉确认 OK

- [ ] **Commit**

```bash
git add pwa/index.html
git commit -m "feat(pwa): add skip button + immediate cut-in on request line send"
```

---

## Task 5: 语音输入（Web Speech API，hold-to-speak）

**目标**：按住 `#chat-mic` 开始识别，松开停止，识别文本追加到 `#chat-input`。识别中按钮变红有抖动。不支持 SpeechRecognition 的浏览器自动隐藏麦克风按钮。

**Files:**
- Modify: `pwa/index.html`（新增 JS 段在 `chatSend.addEventListener` 之后）

### Step 5.1: 加语音识别逻辑

定位 `chatSend.addEventListener('click', sendMessage);`，紧接其后追加：

```javascript
/* ── Voice input (hold-to-speak) ─────────────────────────────────── */
const chatMic = document.getElementById('chat-mic');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  chatMic.classList.add('hidden');
} else {
  let recognition = null;
  let recognizing = false;
  let recognitionInsertStart = 0;

  function ensureRecognition() {
    if (recognition) return recognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let interim = '';
    recognition.addEventListener('result', e => {
      let finalText = '';
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      const fixed = chatInput.value.slice(0, recognitionInsertStart);
      chatInput.value = fixed + finalText + interim;
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 84) + 'px';
      if (finalText) recognitionInsertStart += finalText.length;
    });
    recognition.addEventListener('error', e => {
      console.error('[speech]', e.error);
      stopRecognizing();
    });
    recognition.addEventListener('end', () => {
      if (recognizing) {
        // 用户还在按住但 recognition 自己停了，重启一次
        try { recognition.start(); } catch (err) { console.error('[speech-restart]', err); }
      }
    });
    return recognition;
  }

  function startRecognizing() {
    if (recognizing) return;
    const r = ensureRecognition();
    recognizing = true;
    recognitionInsertStart = chatInput.value.length;
    chatMic.classList.add('recording');
    try {
      r.start();
    } catch (err) {
      console.error('[speech-start]', err);
      stopRecognizing();
    }
  }

  function stopRecognizing() {
    if (!recognizing) return;
    recognizing = false;
    chatMic.classList.remove('recording');
    if (recognition) {
      try { recognition.stop(); } catch (err) { console.error('[speech-stop]', err); }
    }
  }

  // 鼠标 + 触摸两套事件
  chatMic.addEventListener('pointerdown', e => {
    e.preventDefault();
    startRecognizing();
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => {
    chatMic.addEventListener(ev, () => stopRecognizing());
  });

  // 防止上下文菜单/选中
  chatMic.addEventListener('contextmenu', e => e.preventDefault());
}
```

### Step 5.2: 浏览器 smoke test

刷新 `http://localhost:8181`：
- 麦克风按钮可见（Chrome / Edge / Safari 桌面端都支持）
- 按住麦克风，开始说话 → 文本逐字出现在输入框
- 松开 → 文本固定保留，按钮恢复白色
- 中途松开再按住可以追加更多语音内容
- 在 Firefox（无 webkitSpeechRecognition）麦克风按钮应隐藏

如手头无 Firefox，跑：
```bash
node -e "console.log('ok')"  # 占位，不强求 Firefox 测试
```

- [ ] 浏览器确认 OK

- [ ] **Commit**

```bash
git add pwa/index.html
git commit -m "feat(pwa): add hold-to-speak voice input via Web Speech API"
```

---

## Task 6: 移动端微调 + 最终回归

**目标**：在 iPhone 视图下确认所有控件无重叠、无误触、可点击。

**Files:**
- Modify: `pwa/index.html`（必要时调 `@media (max-width: 560px)` 规则）

### Step 6.1: 移动端 DevTools 巡检

`open "http://localhost:8181"` → DevTools → Device toolbar → iPhone 14（390 × 844）。

逐项验证：
- header 顶部「时钟 + 三个工具按钮」一行容得下？若挤，把 `.header-tools button` 在 max-width 560px 下缩到 28×28：

如需要，找到 `@media (max-width: 560px)` 块，追加：
```css
@media (max-width: 560px) {
  .header-tools button { width: 28px; height: 28px; }
  .header-tools button svg { width: 14px; height: 14px; }
  .header-right { gap: 8px; }
}
```

- 播放按钮 + 切歌按钮间距合适，与 settings 按钮已无邻近误触关系（settings 已在 header 上端）
- 输入条横铺，textarea + mic + send 三按钮可点
- tweaks 展开时不超出屏幕（`right:16px; top:56px` 在小屏可能要改 `right:8px; left:8px; width:auto`）

如 tweaks 在小屏溢出，追加 media rule：
```css
@media (max-width: 560px) {
  .tweaks { right: 12px; left: 12px; width: auto; top: 52px; }
}
```

- [ ] iPhone 视图全绿

### Step 6.2: 端到端节目流程

桌面 Safari（或 Chrome）：
1. 点播放按钮 → 节目起来，听到中文 cold open
2. 在输入条里输入「来点周杰伦的早期作品」回车
3. 应立即切歌（旧 buffer 中断）+ 几秒后听到中文 caller 语音 + 新节目接管
4. 按住麦克风说「换成轻音乐」松开 → 输入框出现文本 → 点发送 → 同效果

- [ ] 端到端 OK

### Step 6.3: 关闭调试服务器、清理 background 进程

```bash
# 找到后台 node server.js (PORT=8181) 进程
ps -o pid,command -p $(lsof -nP -iTCP:8181 -sTCP:LISTEN -t) 2>/dev/null
# 用对应 PID kill
```

如果 Task 1-5 已每 task commit 过，此 task 可能无新改动；如有 media rule 微调：

- [ ] **Commit**

```bash
git add pwa/index.html
git commit -m "ux(pwa): mobile media tweaks for header tools and tweaks panel"
```

### Step 6.4: 推送（可选）

```bash
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
  git push origin feat/desktop-mvp
```

---

## Self-Review

**1. Spec coverage**

用户原文 5 条逐条对照：

| 需求 | 落点 |
|---|---|
| (1) request line 中文 | Task 3 `placeholder="想点什么？告诉 Seadio…"` + Task 1 整体中文化 |
| (2) tweaks 中文切换无变化 | Task 1 删除该控件 + 全 UI 中文化，根本上消除「切了没反应」 |
| (3) 三按钮整合 + 手机重叠 | Task 2（header 工具栏）+ Task 3（chat-bar 常驻）+ Task 6（mobile media） |
| (4a) 切歌按钮 | Task 4 Step 4.1-4.3 |
| (4b) 发请求立即切歌 | Task 4 Step 4.4 |
| (5) 语音输入 | Task 5 |

无 spec 缺口。

**2. Placeholder scan**

- 无「TODO / TBD / fill in」字样
- 每个有代码改动的步骤都给出了完整新代码块
- 「DJ 语言切换」的删除给出了全部行号 + 全部 5 个删除点
- 浏览器 smoke test 给出了具体观察项（不是「测试一下」）
- 唯一柔性环节是 Step 5.2 「Firefox 测试」—— 标注「无 Firefox 不强求」，明确允许跳过

**3. Type / 命名一致性**

- `chatInput` / `chatSend` / `chatMic` / `chatBar` 全文一致
- `skipBtn` / `skipCurrent` 一致
- `recognizing` / `recognitionInsertStart` 在 Task 5 闭包内一致
- `djLanguage` 删除路径：Task 1 Step 1.4 删除 7 处（const 声明 1 + 函数 2 + 监听器 1 + body 2 + buildStartMessage 调用 = 文中明确点名 ≥ 4 个文件位置）；后续 Task 不再引用 → 无残留风险
- `header-tools` / `header-right` CSS 类一致

无问题，可执行。

---

## Execution Handoff

Plan 已保存到 `docs/superpowers/plans/2026-05-29-pwa-ux-overhaul.md`。

两种执行方式：

**1. Subagent-Driven（推荐）** —— 每个 Task 派一个新 subagent 执行，我在每 Task 之间 review，迭代快。

**2. Inline Execution** —— 我在当前会话里逐 Task 执行（用 executing-plans skill）。

选哪个？
