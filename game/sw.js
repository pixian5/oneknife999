// 《一刀999》Service Worker（0.8.36 PWA 应用化）
//
// 策略（克制为上——素材 108MB 不能全量预缓存）：
// - install：只预缓存「应用壳」（index.html / game.css / manifest / src 全部 js，约几百 KB），
//   装完即可离线打开到职业选择界面；
// - fetch：导航与代码（js/css/webmanifest）network-first，保证更新后模块图一致；
//   图片素材 cache-first（体积大、变化少），离线可用；
// - activate：清理旧版本缓存（cache name 带构建版本，VERSION 变更即失效）。
//
// 更新语义：index.html 里 SW 地址带版本查询串（?v=0.8.38），版本变更触发浏览器重新安装
// SW → activate 清旧缓存 → 壳与素材按需重取。e2e/探针（?e2e=1）由 main.js 侧不注册，互不影响。

const CACHE_VERSION = "oneknife999-v0.8.75";
// 0.8.39：应用壳必须包含全部 ES 模块。此前只缓存 index.html/game.css/manifest，
// 而 SW 注册发生在整张模块图加载完之后——首次会话的 src/*.js 全绕过缓存，
// 离线再开时 main.js 取不到，启动画面（z-index 99）永久停留。
const SHELL = [
  "./",
  "./index.html",
  "./game.css",
  "./manifest.webmanifest",
  "./src/assets.js",
  "./src/audio.js",
  "./src/combat.js",
  "./src/config.js",
  "./src/drops.js",
  "./src/elite.js",
  "./src/endgame.js",
  "./src/feedback.js",
  "./src/geometry.js",
  "./src/input.js",
  "./src/keybinds.js",
  "./src/logger.js",
  "./src/main.js",
  "./src/maps.js",
  "./src/monster-abilities.js",
  "./src/persist.js",
  "./src/render.js",
  "./src/runtime.js",
  "./src/shop.js",
  "./src/skills.js",
  "./src/util.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 只管同源（HF/instabox 都是同源静态托管）

  // 导航请求：网络优先（更新即时），离线回退缓存壳
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-cache" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 0.8.46：代码文件必须 network-first。此前 cache-first 会在 SW 升级未完成时
  // 继续返回旧 render.js，而新 main.js 已经 import 新导出，整张模块图直接加载失败
  // （职业选择页只剩标题、三张职业卡为空）。网络失败才回退缓存，保证离线仍可玩。
  const isCode = /\.(js|css|webmanifest)$/.test(url.pathname);
  if (isCode) {
    event.respondWith(
      fetch(request, { cache: "no-cache" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response("", { status: 504, statusText: "offline-miss" })))
    );
    return;
  }

  // 图片素材：缓存优先 + 后台回填——首次访问过的素材离线可用
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return (
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          // 0.8.39：cached 在走到 catch 时必然是 undefined（有值时前面已 return），
          // 返回 undefined 会让 respondWith 直接抛错。给一个 504 空响应兜底。
          .catch(() => cached || new Response("", { status: 504, statusText: "offline-miss" }))
      );
    })
  );
});
