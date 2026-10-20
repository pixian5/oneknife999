// 《一刀999》通用工具：DOM 查询与数学辅助。
// 纯函数模块，不依赖其他模块，可被单元测试直接引用。

export const $ = (id) => document.getElementById(id);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const rand = (min, max) => Math.random() * (max - min) + min;
export const pick = (array) => array[Math.floor(Math.random() * array.length)];
export const formatNumber = (value) => Math.floor(value).toLocaleString("zh-CN");

// 按权重随机取一项；random 可注入，便于纯逻辑单测复现（默认 Math.random）。
// 空池、负权重或权重总和非正时直接抛清晰错误，避免静默返回错误结果。
export function weightedPick(entries, random = Math.random) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("weightedPick：权重池不能为空");
  let total = 0;
  for (const entry of entries) {
    if (!Number.isFinite(entry.weight) || entry.weight < 0) throw new Error(`weightedPick：非法权重 ${entry.weight}`);
    total += entry.weight;
  }
  if (total <= 0) throw new Error("weightedPick：权重总和必须为正");
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return entries.at(-1).item;
}
