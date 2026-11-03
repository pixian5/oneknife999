# 0.8.6 公网部署加固与两处前端缺陷修复

- 时间：2026-10-30 16:50 UTC（北京时间 2026-10-31 00:50）
- 模型：DeepSeek-V4.1-Flash
- 环境：Instabox 沙箱 `m_agqxoy6u363jxgfufg2onqxbm4`（agent-browser 模板，4 vCPU / 8 GiB / 20 GiB），`game/` 由本机静态服务 + cloudflared 快速隧道对外
- 公网地址：`https://schedule-naturally-horse-pace.trycloudflare.com`（临时隧道，重启换域名）

## 背景

本轮不写玩法，只按「公网地址 + 真浏览器」做部署验收，顺带把验收里暴露的缺陷一次性收口。复验方式：沙箱内 `chromium --headless=new --remote-debugging-port=9223`，用 CDP 冷加载公网地址、点职业卡、读 `localStorage`、改视口尺寸、抓控制台异常。

## 前端缺陷

### 1. 每次 resize 必抛 `ReferenceError: scheduleResize is not defined`

- 证据：CDP 控制台 `Runtime.exceptionThrown` 报 `main.js:2167:41`；把视口从 900×600 改到 1440×900，两次 resize 抛两次，画布始终停在 `444×215` 不跟随视口。
- 根因：`render.js` 早已导出 `scheduleResize()`（rAF 合并 resize 风暴），`main.js` 的 import 列表只引了 `resizeCanvas`，漏了 `scheduleResize`；而 2167 行的 `window.addEventListener("resize", () => scheduleResize())` 一直在调它。
- 修复：import 列表补一行 `scheduleResize,`（`game/src/main.js`）。
- 影响面：桌面拖窗口、手机横竖屏切换、iOS 工具栏收展都会命中；异常发生在事件回调里，不会中断主循环，但画布不自适应 + 控制台刷错。

### 2. `chooseClass()` 不落盘，选完职业立刻刷新等于白选

- 证据：全新 profile 点战士卡后打 9 秒，`localStorage` 仍为 `[]`；`Page.reload` 后退回职业选择（`#classModal` 未隐藏）。
- 根因：`persistGame()` 只挂在升级 / 通关 / 自动拾取 / 喝药 / 强化等事件上，`chooseClass()` 里没有。
- 修复：`chooseClass()` 里 `loadMap(...)` 之后补一次 `persistGame()`，并加中文注释说明原因。
- 说明：这并不是「存档坏了」——打到升级就会落盘；补的是「开局那几秒」的空窗。

### 3. 每次冷启动一个 `/favicon.ico` 404

- 证据：首屏 49 个请求里唯一的非 2xx 就是它；0.8.5 的资产解析层已经把素材 404 清干净，只剩这一条。
- 修复：`index.html` 内联 SVG data URI 图标（`刀` 字 + 品牌底色），零额外请求、不增加文件。

## 部署侧

### 4. 静态服务把 `/src/`、`/assets/` 整份列出来，且不支持 Range

`python -m http.server` 的行为：目录无 `index.html` 时返回 HTML 列表（`/src/` 直接列出 18 个模块，`/assets/` 列出 543 个文件），且忽略 `Range`（1.9 MB 的 Boss 图也整份下发，无 `Accept-Ranges`/`Content-Range`）。

替换为 `serve.py`（标准库，单文件）：

- 目录访问直接 403，关闭列表；
- 支持 `Range`：`bytes=a-b` / `bytes=a-` / 后缀形式返回 206 + `Content-Range`，越界返回 416；
- `Cache-Control`：HTML `no-cache`，其余 `public, max-age=3600`；
- 附带 `Accept-Ranges: bytes` 与 `X-Content-Type-Options: nosniff`；
- 仍只监听 `127.0.0.1:8080`，对外只经隧道。

### 5. 进程没有守护，掉线没人拉

2026-10-30 14:12 UTC 出现过一次 `http.server` 无声重启 + `web.log` 被截断（cloudflared 未重启，所以地址没变），机器上没有 cron、没有 systemd timer、没有 supervisor。

补 `keepalive.sh`：每 20 秒检查 `serve.py` 与 `cloudflared tunnel`，缺哪个拉哪个，重启事件写 `keepalive.log`。注意：隧道进程重启会换域名，这是 quick tunnel 的固有代价，不是守护能消除的。

### 6. 空闲自动暂停关不掉（免费套餐限制）

按部署方案要求调用 `PATCH /v1/machines/{id}` `{"autoSuspendAfterSeconds":0}`，返回：

```
permission_denied: Free users are not able to change idle time: a free sandbox pauses after
30 idle minutes (autoSuspendAfterSeconds 1800; send 1800 or leave it out). Upgrade to Pro ...
```

即：**免费套餐下 `autoSuspend` 恒为 1800 秒，`setAutoSuspend(0)` 不可用**，要真正拿到「不掉线的公网地址」必须升级 Pro（或改自有服务器部署）。这条不是代码能修的，记录在案。

## 验证

| 用例 | 结果 |
| --- | --- |
| 公网地址 `HEAD /` | 200 |
| `<title>` | 一刀999 · 百图征途 |
| 冷启动（全新 profile，CDP） | `readyState=complete`、1 个 canvas、三职业卡齐全，控制台 0 异常 |
| 点「战士」 | 进入 `001 · 灰烬村外`，画布抽样 446/446 非空像素 |
| resize（900×600 → 1440×900） | 无异常，画布随视口变化 |
| `chooseClass` 落盘 | 选完即写入 `oneknife999-prototype-save-v4`，刷新回到原地图 |
| `/src/` `/assets/` | 403（原为目录列表） |
| `Range: bytes=0-99` | 206 + `Content-Range`，100 字节 |
| 不存在资源 | 404 |

## 遗留

1. 公网地址是 trycloudflare 临时隧道，无 SLA，隧道重启即换域名。
2. 沙箱单次运行上限 480 分钟，到期暂停；免费套餐 30 分钟空闲自动暂停无法关闭。
3. GitHub `main`（`c1d3123`）与本线（`3700649` + 本轮）**分叉**：`3700649` 在 GitHub 上不存在，直接把本线推成 GitHub main 需要强推或先合并，尚未执行。
4. GitCode 令牌曾以明文写在沙箱 `.git/config` 的 remote URL 里，本轮改 origin 到 GitHub 时已随手清掉，但**令牌本身建议轮换**。
