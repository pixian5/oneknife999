// 《一刀999》素材瘦身工具：对超过阈值的 PNG 做调色板量化重编码（保持格式与透明通道）。
// 用法：node optimize-assets.mjs <素材目录> [最小字节阈值=1000000]
// 依赖 sharp（npm i sharp，不进游戏依赖——本工具离线使用，保持游戏零构建）。
// 替换策略：仅当新体积 < 原体积的 88% 才落盘，避免无意义重写；输出逐文件对照表。
import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const dir = process.argv[2];
const threshold = Number(process.argv[3] || 1_000_000);
if (!dir) throw new Error("用法：node optimize-assets.mjs <素材目录> [阈值]");

const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".png")).sort();
let oldSum = 0, newSum = 0, touched = 0;
const rows = [];
for (const name of files) {
  const full = path.join(dir, name);
  const info = await stat(full);
  if (info.size < threshold) continue;
  const before = info.size;
  const buf = await readFile(full);
  // palette:true 走调色板量化（含 alpha），effort 9 尽力压；游戏帧是手绘有限色，收益大。
  const out = await sharp(buf, { failOn: "none" })
    .png({ palette: true, quality: 82, effort: 9, compressionLevel: 9 })
    .toBuffer();
  // 完整性自检：重读解码必须成功且尺寸一致
  const meta = await sharp(out).metadata();
  const origMeta = await sharp(buf).metadata();
  if (meta.width !== origMeta.width || meta.height !== origMeta.height) {
    rows.push([name, before, before, "尺寸不一致，跳过"]);
    continue;
  }
  if (out.length < before * 0.88) {
    await writeFile(full, out);
    touched += 1;
    oldSum += before; newSum += out.length;
    rows.push([name, before, out.length, ""]);
  } else {
    rows.push([name, before, before, "收益不足，保留"]);
  }
}
rows.sort((a, b) => b[1] - a[1]);
for (const [name, b, a, note] of rows) {
  console.log(`${String(b).padStart(9)} -> ${String(a).padStart(9)}  ${100 - Math.round((a / b) * 100)}%`.padEnd(28), note, name);
}
if (oldSum > 0) console.log(`\n重编码 ${touched} 个文件：${(oldSum / 1048576).toFixed(1)}MB -> ${(newSum / 1048576).toFixed(1)}MB（省 ${100 - Math.round((newSum / oldSum) * 100)}%）`);
