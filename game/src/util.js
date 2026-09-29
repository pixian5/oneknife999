// 《一刀999》通用工具：DOM 查询与数学辅助。
// 纯函数模块，不依赖其他模块，可被单元测试直接引用。

export const $ = (id) => document.getElementById(id);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const rand = (min, max) => Math.random() * (max - min) + min;
export const pick = (array) => array[Math.floor(Math.random() * array.length)];
export const formatNumber = (value) => Math.floor(value).toLocaleString("zh-CN");

export function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return entries.at(-1).item;
}
