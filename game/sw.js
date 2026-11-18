// 《一刀999》Service Worker（0.8.36 PWA 应用化）
//
// 策略（克制为上——素材 108MB 不能全量预缓存）：
// - install：只预缓存「应用壳」（index.html / game.css / manifest / src 全部 js，约几百 KB），
//   装完即可离线打开到职业选择界面；
// - fetch：素材与静态资源 runtime 缓存（cache-first，首次在线取、此后离线可用）；
//   导航请求 network-first（保证更新即时生效），离线时回退缓存的 index.html；
// - activate：清理旧版本缓存（cache name 带构建版本，VERSION 变更即失效）。
//
// 更新语义：index.html 里 SW 地址带版本查询串（?v=0.8.38），版本变更触发浏览器重新安装
// SW → activate 清旧缓存 → 壳与素材按需重取。e2e/探针（?e2e=1）由 main.js 侧不注册，互不影响。

const CACHE_VERSION = "oneknife999-v0.8.38";
const SHELL = ["./", "./index.html", "./game.css", "./manifest.webmanifest"];

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
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 静态资源（js/css/图片）：缓存优先 + 后台回填——首次访问过的素材离线可用
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
