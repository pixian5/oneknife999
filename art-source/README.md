# 美术源文件归档

`monster-legacy/` 存放 0.6.0 之前使用的 55 张 `monster-*.png` 旧原图（约 41.3MB）。

- 这些文件不再被运行时引用；`game/src/render.js` 只解析 `monster-full-*.png`。
- 0.8.78 起从 `game/assets/` 移出，只保留归档，避免被打包进 PWA 和移动端下载。
- 完整备份：`/home/user/backups/oneknife999-assets-pre-0.8.78-20261123-2225.tar.gz`。
