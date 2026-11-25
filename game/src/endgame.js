// 《一刀999》终局与长线系统（0.6.0 P2）：难度阶梯、无尽深层、图鉴与套装。
// 全部为纯函数 + 注入随机，不依赖 DOM / 全局状态，可直接单测。

// ============ 难度模式 ============
// 通关百图后解锁烬火难度：怪物数值放大、掉落品质提升、经验加成，可重复挑战。
// 难度不改变掉落池与掉落率（保持经济稳定），只调整数值与经验。
export const DIFFICULTY_TIERS = [
  { id: "normal", label: "常规", unlockAt: 0, monsterHp: 1, monsterAttack: 1, expBonus: 0, qualityBonus: 0, desc: "百图原始难度" },
  {
    id: "ember",
    label: "烬火",
    unlockAt: 100,
    monsterHp: 1.5,
    monsterAttack: 1.4,
    expBonus: 0.25,
    qualityBonus: 1,
    desc: "怪物生命 +50% / 攻击 +40%，经验 +25%，掉落品质 +1 档"
  },
  {
    id: "ashen",
    label: "灰烬",
    unlockAt: 130,
    monsterHp: 2.2,
    monsterAttack: 1.9,
    expBonus: 0.6,
    qualityBonus: 2,
    desc: "怪物生命 +120% / 攻击 +90%，经验 +60%，掉落品质 +2 档"
  }
];

// 解析难度：未解锁时回退常规。返回难度配置对象。
export function resolveDifficulty(tierId, clearedMaps = 0) {
  const tier = DIFFICULTY_TIERS.find((entry) => entry.id === tierId) || DIFFICULTY_TIERS[0];
  if (clearedMaps < tier.unlockAt) return DIFFICULTY_TIERS[0];
  return tier;
}

// 已解锁的难度列表（供 UI 展示）。
export function unlockedDifficulties(clearedMaps = 0) {
  return DIFFICULTY_TIERS.filter((tier) => clearedMaps >= tier.unlockAt);
}

// 难度对怪物数值的缩放：一次算出 hp / attack / exp 的新值。
export function scaleForDifficulty({ hp, attack, exp = 0 }, difficulty) {
  const tier = difficulty || DIFFICULTY_TIERS[0];
  return {
    hp: Math.max(1, Math.round(hp * tier.monsterHp)),
    attack: Math.max(1, Math.round(attack * tier.monsterAttack)),
    exp: Math.max(0, Math.round(exp * (1 + tier.expBonus)))
  };
}

// 掉落品质提升：white → blue → purple → orange，封顶 orange。
const QUALITY_ORDER = ["white", "blue", "purple", "orange"];
export function upgradeQuality(quality, bonus = 0) {
  const index = QUALITY_ORDER.indexOf(quality);
  if (index < 0) return quality;
  return QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, index + Math.max(0, bonus))];
}

// ============ 无尽深层 ============
// 百图通关后解锁：层数无上限，每层继承上一层的数值成长，每 10 层一个 Boss。
// 层数越高，怪物数值与掉落品质越高——这是百图之后的长期目标循环。
export const ABYSS_RULES = {
  hpGrowthPerFloor: 0.14,
  // 0.8.38：0.11→0.07。实测 F10 首领层毕业装 10 秒连死 6 次（死亡循环）——
  // 攻击成长直接乘 boss 基准（本就高于普通怪），10 层 ×2.1 达百图终关 2.3 倍。
  attackGrowthPerFloor: 0.07,
  expGrowthPerFloor: 0.18,
  bossEvery: 10,
  qualityGrowthPerFloor: 0.15 // 每层累积到 1 才升一档品质
};

// 深层第 N 层的怪物与 Boss 数值倍率。
export function abyssMultipliers(floor) {
  const n = Math.max(0, Math.floor(Number(floor) || 0));
  return {
    hp: 1 + n * ABYSS_RULES.hpGrowthPerFloor,
    attack: 1 + n * ABYSS_RULES.attackGrowthPerFloor,
    exp: 1 + n * ABYSS_RULES.expGrowthPerFloor
  };
}

// 深层成长文案：old 版写“每层 +14%”，会被误读成复利；实际公式是相对基础值加法。
// 同一章内（F1–F10、F11–F20…）每层累加 14% 基础生命，换章后基础值提升。
export function abyssGrowthText() {
  const hp = Math.round(ABYSS_RULES.hpGrowthPerFloor * 100);
  const attack = Math.round(ABYSS_RULES.attackGrowthPerFloor * 100);
  return `同章每层 +${hp}% 基础生命 / +${attack}% 基础攻击，10 层换章`;
}

// 任意两层之间的“相对生命增幅”，用于解释为什么 F80→F90 不是 +140%。
export function abyssRelativeHpGain(fromFloor, toFloor) {
  const from = abyssMultipliers(fromFloor).hp;
  const to = abyssMultipliers(toFloor).hp;
  if (from <= 0) return 0;
  return (to / from - 1) * 100;
}

// 深层每层入口一次性补给：只有第一次进入该深层才发放。
// 用 visitedMaps 作为“已领过”的持久标记；死亡重进 / 刷新都不会重复领。
// 0.8.85：F90 终局入口一次补给 5 瓶。真实键鼠验收显示：普通怪降档后，
// 20 瓶起步的存档清完 5 只任务怪只剩约 4 瓶，而回响实战约需 5 瓶，差 1 瓶无法收尾。
// 终局层单独补 5 瓶，使 20 瓶起步拥有 25 瓶完整预算；F1–F89 仍只发 1 瓶。
export function abyssEntrySupplyGain(mapId, floor, firstVisit) {
  if (!firstVisit) return 0;
  if (!String(mapId || "").startsWith("abyss-F")) return 0;
  const depth = Math.max(0, Math.floor(Number(floor) || 0));
  if (depth <= 0) return 0;
  if (depth === 90) return 5; // F90 终局补给：只补清层后回响战的缺口
  return 1;
}

// F90 回响 B 方案：只有“先清 5 只普通怪、再击破回响”才算通关。
// rule=clear-first 且 kills<need 时，首领死亡当帧不置 bossDefeated，等 42 秒重生后再杀。
// 其他整十层保持旧行为（rule=legacy），避免一次改动影响 F10–F80 的复玩节奏。
export function shouldDeferAbyssBossVictory(rule, kills, need) {
  if (rule !== "clear-first") return false;
  const targetKills = Math.max(1, Math.floor(Number(need) || 0));
  const currentKills = Math.max(0, Math.floor(Number(kills) || 0));
  return currentKills < targetKills;
}

// 该层是否为 Boss 层；每 10 层一次。
export function isAbyssBossFloor(floor) {
  return Math.max(1, Math.floor(Number(floor) || 1)) % ABYSS_RULES.bossEvery === 0;
}

// 该层掉落品质加成档数。
export function abyssQualityBonus(floor) {
  return Math.floor(Math.max(0, Math.floor(Number(floor) || 0)) * ABYSS_RULES.qualityGrowthPerFloor);
}

// 层数进度：百图通关 → 解锁深层；返回 { unlocked, bestFloor, nextFloor }。
export function abyssProgress({ clearedMaps = 0, bestFloor = 0 } = {}) {
  const unlocked = clearedMaps >= 100;
  return {
    unlocked,
    bestFloor: Math.max(0, Math.floor(Number(bestFloor) || 0)),
    nextFloor: Math.max(1, Math.floor(Number(bestFloor) || 0) + 1)
  };
}

// ============ 图鉴（怪物）============
// 记录玩家击败过的怪物种类与次数。纯数据，驱动「收集感」与图鉴面板。
// 返回新对象（不修改入参），便于存档比对与单测。
export function recordBestiary(bestiary = {}, monsterName) {
  if (!monsterName) return { ...bestiary };
  const current = bestiary[monsterName] || 0;
  return { ...bestiary, [monsterName]: current + 1 };
}

// 图鉴完成度：已记录种类 / 全部种类。返回 { seen, total, ratio, missing }。
export function bestiaryStats(bestiary = {}, allNames = []) {
  const seen = allNames.filter((name) => (bestiary[name] || 0) > 0).length;
  const total = allNames.length;
  return {
    seen,
    total,
    ratio: total ? seen / total : 0,
    missing: allNames.filter((name) => !(bestiary[name] || 0))
  };
}

// ============ 套装 ============
// docs/03 的 6 套套装原型实现：装备带 setKey 字段，穿戴 2 / 4 / 6 件触发阶梯加成。
// 套装加成只作用于「有效战力 / 生命 / 防御」三项，与 equipmentTotals 同源。
export const SET_BONUSES = {
  边境: { 2: { attack: 12 }, 4: { hp: 120, defense: 8 }, 6: { attack: 40, hp: 300, defense: 20 } },
  苍月: { 2: { defense: 10 }, 4: { attack: 22, hp: 90 }, 6: { defense: 34, attack: 55 } },
  龙脉: { 2: { hp: 90 }, 4: { attack: 20, defense: 12 }, 6: { hp: 420, attack: 48 } },
  冰封: { 2: { defense: 12 }, 4: { hp: 160 }, 6: { defense: 40, attack: 62 } },
  烬火: { 2: { attack: 16 }, 4: { attack: 30, hp: 130 }, 6: { attack: 78, hp: 260 } },
  帝陵: { 2: { attack: 20, defense: 8 }, 4: { hp: 220, defense: 16 }, 6: { attack: 90, hp: 520, defense: 40 } }
};

// 统计已穿戴装备的套装件数：返回 { 套装名: 件数 }。
export function setCounts(equipment = {}) {
  const counts = {};
  for (const item of Object.values(equipment || {})) {
    const key = item?.setKey;
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// 套装加成汇总：按件数取已激活的最高档（2/4/6），累加三项属性。
// 返回 { attack, hp, defense, active: [{ setKey, pieces, tier, bonus }] }。
export function setBonusTotals(equipment = {}, bonuses = SET_BONUSES) {
  const counts = setCounts(equipment);
  let attack = 0;
  let hp = 0;
  let defense = 0;
  const active = [];
  for (const [setKey, pieces] of Object.entries(counts)) {
    const tiers = bonuses[setKey];
    if (!tiers) continue;
    const reached = Object.keys(tiers)
      .map(Number)
      .filter((tier) => pieces >= tier)
      .sort((a, b) => b - a)[0];
    if (!reached) continue;
    const bonus = tiers[reached];
    attack += bonus.attack || 0;
    hp += bonus.hp || 0;
    defense += bonus.defense || 0;
    active.push({ setKey, pieces, tier: reached, bonus });
  }
  return { attack, hp, defense, active };
}

// 某件装备穿上后离下一档还差几件（供 UI 提示「再穿 1 件触发 4 件套」）。
export function nextSetTier(pieces = 0) {
  for (const tier of [2, 4, 6]) if (pieces < tier) return { tier, missing: tier - pieces };
  return null;
}

// ============ 图鉴称号（0.8.27 P2：零数值收集反馈） ============
// 针对「长线目标感弱」（见 docs/20261106-2130 当前进度分析）的最小解法：
// 集齐一章（该章全部怪物击杀过至少一次）点亮该章图鉴，点亮数量达到门槛授予称号。
// 刻意零数值：不加属性、不掉落，只做展示与收集动机，避免破坏数值平衡。
export const BESTIARY_TITLE_TIERS = [
  { chapters: 1, title: "见闻者" },
  { chapters: 3, title: "博物学徒" },
  { chapters: 6, title: "怪物学者" },
  { chapters: 10, title: "百图全鉴" }
];

// 统计各章图鉴完成度。chapterGroups 形如 [{ name, names: [怪物名...] }]（render 层按章分组）。
// 返回 { perChapter: [{ name, seen, total, done }], doneChapters, totalChapters, title }。
export function bestiaryChapterProgress(chapterGroups, bestiary = {}) {
  const perChapter = (chapterGroups || []).map((group) => {
    const seen = group.names.filter((name) => (bestiary[name] || 0) > 0).length;
    return { name: group.name, seen, total: group.names.length, done: seen >= group.names.length && group.names.length > 0 };
  });
  const doneChapters = perChapter.filter((chapter) => chapter.done).length;
  let title = "";
  for (const tier of BESTIARY_TITLE_TIERS) if (doneChapters >= tier.chapters) title = tier.title;
  return { perChapter, doneChapters, totalChapters: perChapter.length, title };
}
