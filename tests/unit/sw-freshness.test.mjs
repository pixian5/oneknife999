// 0.8.46 回归：Service Worker 对 js/css/webmanifest 必须 network-first。
// 旧策略 cache-first 会在升级未完成时继续发旧 render.js，新 main.js 的 import 直接失败。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sw = readFileSync(new URL("../../game/sw.js", import.meta.url), "utf8");

test("代码文件走 network-first 且失败时回退缓存", () => {
  assert.match(sw, /const isCode = \/\\\.\(js\|css\|webmanifest\)\$\/\.test\(url\.pathname\)/);
  const branch = sw.slice(sw.indexOf("if (isCode)"), sw.indexOf("// 图片素材"));
  assert.match(branch, /fetch\(request, \{ cache: "no-cache" \}\)/);
  assert.match(branch, /catch\(\(\) => caches\.match\(request\)/);
  assert.doesNotMatch(branch, /caches\.match\(request\)\.then\(\(cached\) => \{\s*if \(cached\) return cached/);
});

test("导航请求不做 HTTP 缓存复用", () => {
  assert.match(sw, /request\.mode === "navigate"[\s\S]*?fetch\(request, \{ cache: "no-cache" \}\)/);
});
