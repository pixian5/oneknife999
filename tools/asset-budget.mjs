// 素材体积门禁：防止新图把 PWA 缓存和移动端下载量继续推高。
// 用法：node tools/asset-budget.mjs
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ASSETS = join(resolve(process.cwd()), "game", "assets");
const MB = 1024 * 1024;
const KB = 1024;
const LIMITS = {
  totalMB: 60,
  mapKB: 450,
  nonMapKB: 500
};

function walk(dir, result = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // 跳过 Finder 的 .DS_Store 与本地抠图报告：它们不是运行包素材，不应计入总量。
    if (entry.name.startsWith(".") || entry.name === "_cutout_report.json") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, result);
    } else if (entry.isFile()) {
      result.push(path);
    }
  }
  return result;
}

const files = walk(ASSETS).map((path) => ({ path, size: statSync(path).size }));
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
const totalMB = totalBytes / MB;
const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 5);
const errors = [];

if (totalMB > LIMITS.totalMB) errors.push(`素材总 ${totalMB.toFixed(1)}MB，超过 ${LIMITS.totalMB}MB 上限`);

for (const file of files) {
  const name = relative(ASSETS, file.path).replaceAll("\\", "/");
  if (name === "_cutout_report.json") continue;
  const isMap = name.startsWith("map-c") && name.endsWith(".jpg");
  const limit = isMap ? LIMITS.mapKB : LIMITS.nonMapKB;
  if (file.size > limit * KB) {
    errors.push(`${name} ${(file.size / KB).toFixed(0)}KB，超过 ${limit}KB${isMap ? "（地图底图）" : ""}上限`);
  }
  if (file.size === 0) errors.push(`${name} 是 0 字节文件`);
}

console.log(`素材体积：${totalMB.toFixed(1)}MB / ${files.length} 个文件（上限 ${LIMITS.totalMB}MB）`);
console.log("最大 5 个文件：");
for (const file of largest) console.log(`- ${relative(ASSETS, file.path)} ${(file.size / KB).toFixed(0)}KB`);

if (errors.length) {
  console.error("\n素材体积门禁失败：");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("素材体积门禁通过");
