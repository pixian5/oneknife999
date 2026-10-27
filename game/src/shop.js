import { AFFIX_POOL } from "./config.js";

// 《一刀999》城镇杂货商与词缀重铸纯逻辑（0.3.5）。
// 只描述价格、能否购买 / 重铸与重掷结果，不依赖 DOM 与游戏全局状态；
// 随机数由参数注入，金币 / 卷轴数量由调用方传入，便于单元测试。

// 杂货商商品表：effect 决定购买后写回哪个字段。
// 定价按 docs/07 交易经济基线：金币是唯一通用货币，消耗品必须持续消耗才能形成出口。
export const SHOP_GOODS = [
  {
    id: "potion",
    name: "生命药水",
    effect: "potion",
    price: 90,
    glyph: "药",
    color: "#f16d66",
    desc: "使用后恢复 32% 最大生命；城镇与危险区均可补给"
  },
  {
    id: "material",
    name: "黑铁矿石 ×1",
    effect: "material",
    price: 60,
    glyph: "矿",
    color: "#78b6ec",
    desc: "基础强化材料：+8 起强化消耗 1 件，背包内同名堆叠"
  },
  {
    id: "scroll",
    name: "词缀重铸卷",
    effect: "scroll",
    price: 200,
    glyph: "卷",
    color: "#a88ce3",
    desc: "重铸穿戴装备的一条词缀；装备本身没有词缀时可新附一条"
  }
];

// 重铸定价：金币成本随强化等级与词缀条数上升，另需消耗 1 张词缀重铸卷。
// 这样后期装备的重铸更贵，避免「低战力装备反复刷词缀」成为最优解。
export const REFORGE_RULES = {
  baseGold: 120,
  enhanceStep: 40,
  perAffix: 60,
  scrollPerReforge: 1
};

// 单件商品购买结算：返回 { ok, good, price, reason }。
// 只做资格判断，不修改任何状态（写回由 main.js 完成）。
export function buyShopItem(goodId, { gold = 0 } = {}) {
  const good = SHOP_GOODS.find((entry) => entry.id === goodId) || null;
  if (!good) return { ok: false, good: null, price: 0, reason: "杂货商没有这件商品" };
  if (gold < good.price) return { ok: false, good, price: good.price, reason: `金币不足（需要 ${good.price}）` };
  return { ok: true, good, price: good.price, reason: "" };
}

// 重铸报价：返回 { canReforge, reason, cost, affixCount, scrollNeeded, lockActive }。
// cost 为金币成本；卷轴单独计数（不足时给出明确原因，方便界面提示）。
// 0.4.2 锁定词缀（P1-4）：lockIndex 指向要保留的词缀（需 ≥2 条词缀才有意义），报价 ×1.8。
export function reforgeQuote(item, { gold = 0, scrolls = 0, lockIndex = null } = {}) {
  const scrollNeeded = REFORGE_RULES.scrollPerReforge;
  if (!item) return { canReforge: false, reason: "该部位没有穿戴装备", cost: 0, affixCount: 0, scrollNeeded, lockActive: false };
  const affixCount = (item.affixes || []).length;
  const lockActive = Number.isInteger(lockIndex) && lockIndex >= 0 && lockIndex < affixCount && affixCount >= 2;
  let cost = Math.round(REFORGE_RULES.baseGold + REFORGE_RULES.enhanceStep * (item.enhance || 0) + REFORGE_RULES.perAffix * affixCount);
  if (lockActive) cost = Math.round(cost * 1.8);
  if (scrolls < scrollNeeded)
    return { canReforge: false, reason: `缺少词缀重铸卷 ×${scrollNeeded}（杂货商有售）`, cost, affixCount, scrollNeeded, lockActive };
  if (gold < cost) return { canReforge: false, reason: `金币不足（需要 ${cost}）`, cost, affixCount, scrollNeeded, lockActive };
  return { canReforge: true, reason: "", cost, affixCount, scrollNeeded, lockActive };
}

// 重掷一条词缀（纯函数，不修改传入装备）：
// - 已有词缀：随机挑一条重掷，其余词缀保持不变；
// - 没有词缀：新附一条，避免「白板装备无法使用重铸」的死路。
// 新词缀优先避开装备上已有的属性 key，防止同属性重复堆叠。
// 返回 { item, index, oldAffix, newAffix }，index 为 -1 表示新附。
export function reforgeAffix(item, { level = 1, random = Math.random, lockIndex = null } = {}) {
  if (!item) return { item, index: -1, oldAffix: null, newAffix: null };
  const affixes = [...(item.affixes || [])];
  // 锁定词缀不参与重掷：可重掷下标只从非锁定槽位里抽（单条词缀锁定时退化为新附一条）。
  const lockActive = Number.isInteger(lockIndex) && lockIndex >= 0 && lockIndex < affixes.length && affixes.length >= 2;
  const rollableIndexes = lockActive
    ? affixes.map((_, position) => position).filter((position) => position !== lockIndex)
    : affixes.map((_, position) => position);
  const index = rollableIndexes.length ? rollableIndexes[Math.floor(random() * rollableIndexes.length)] : -1;
  const oldAffix = index >= 0 ? affixes[index] : null;
  const keep = index >= 0 ? affixes.filter((_, position) => position !== index) : affixes;
  const candidates = AFFIX_POOL.filter((entry) => !keep.some((affix) => affix.key === entry.key));
  const pool = candidates.length ? candidates : AFFIX_POOL;
  const entry = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  const scale = entry.base + entry.perStage * Math.max(0, level - 1);
  const value = Math.max(1, Math.round(scale * (0.7 + random() * 0.6)));
  const newAffix = { group: entry.group, key: entry.key, label: entry.label, value, percent: Boolean(entry.percent) };
  const next = index >= 0 ? affixes.map((affix, position) => (position === index ? newAffix : affix)) : [...affixes, newAffix];
  return { item: { ...item, affixes: next }, index, oldAffix, newAffix };
}
