// 版本一致性检查：VERSION / package / 应用内版本 / PWA 缓存版本 / Service Worker 壳清单。
// 用法：node tools/check-version.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const errors = [];
const read = (path) => readFileSync(join(ROOT, path), "utf8");

const version = read("VERSION").trim();
const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const mainJs = read("game/src/main.js");
const swJs = read("game/sw.js");

const expect = (label, actual) => {
  if (actual !== version) errors.push(`${label} = ${JSON.stringify(actual)}，应为 ${version}`);
};

expect("package.json version", packageJson.version);
expect("package-lock.json version", packageLock.version);
expect('package-lock.json packages[""].version', packageLock.packages?.[""]?.version);

const appVersion = mainJs.match(/CURRENT_APP_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
expect("game/src/main.js CURRENT_APP_VERSION", appVersion);

const cacheVersion = swJs.match(/CACHE_VERSION\s*=\s*["']oneknife999-v([^"']+)["']/)?.[1];
expect("game/sw.js CACHE_VERSION", cacheVersion);

// Service Worker 的 SHELL 必须覆盖 game/src 下全部顶层 ES 模块，否则离线启动会缺模块。
const shellBlock = swJs.match(/const SHELL\s*=\s*\[([\s\S]*?)\];/)?.[1];
if (!shellBlock) {
  errors.push("game/sw.js 未找到 const SHELL 数组");
} else {
  const shellModules = [...shellBlock.matchAll(/["']\.\/src\/([^"']+\.js)["']/g)].map((match) => match[1]);
  const sourceModules = readdirSync(join(ROOT, "game/src")).filter((name) => name.endsWith(".js"));
  const shellSet = new Set(shellModules);
  const sourceSet = new Set(sourceModules);

  for (const name of sourceModules) {
    if (!shellSet.has(name)) errors.push(`game/sw.js SHELL 缺少 ./src/${name}`);
  }
  for (const name of shellModules) {
    if (!sourceSet.has(name)) errors.push(`game/sw.js SHELL 多出 ./src/${name}，源文件不存在`);
    if (!existsSync(join(ROOT, "game/src", name))) errors.push(`game/sw.js SHELL 引用的 ./src/${name} 不存在`);
  }
}

if (errors.length) {
  console.error("版本一致性检查失败：");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`版本一致性通过：${version}（应用、PWA 缓存与 SHELL 清单一致）`);
