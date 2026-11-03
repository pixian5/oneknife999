// 精英系统（0.8.13）：把 docs/04「精英词缀组合」的八条词缀落成可执行规则。
//
// 设计约束（来自 04 分卷）：
// - 精英最多两条行为词缀，词缀在接战前就可见（本作靠铭牌常显，天然满足「0.5 秒可读」）；
// - 生成时先查互斥图，避免同一条词缀链路上出现互相抵消或叠到无法反制的组合；
// - 「同线连续三只相同高威胁词缀触发 10 分钟冷却」属于多线刷新的网络侧规则，单机只有一条刷新线，
//   本轮不实现，记在 docs/11 的差异表里。
//
// 本模块只放纯函数与常量，不依赖 state / DOM，方便单测；实体上的具体结算在 main.js。

// 八条行为词缀。desc 会直接显示在铭牌上方，所以必须短（≤14 字）。
export const ELITE_AFFIXES = {
  enrage: { name: "狂怒", desc: "残血时攻速大增", color: "#f16d66" },
  guardian: { name: "护卫", desc: "为首领分摊伤害", color: "#78b6ec" },
  echo: { name: "回响", desc: "复制你的技能余波", color: "#c79bf0" },
  split: { name: "分裂", desc: "死亡后裂成两只弱体", color: "#e7b36b" },
  hunt: { name: "追猎", desc: "追击时移速更快", color: "#f0a35e" },
  hoard: { name: "守财", desc: "离开刷新点后减伤", color: "#e7c66b" },
  purge: { name: "净化", desc: "命中时驱散破势", color: "#dff3ff" },
  toxic: { name: "毒爆", desc: "死亡时留下毒区", color: "#8fc7a2" }
};

// 互斥对：两条都偏「提速」或都偏「拖时间」，同时出现会把反制窗口压没。
export const ELITE_MUTEX = [
  ["enrage", "hunt"],
  ["guardian", "hoard"]
];

// 强度调参。精英是「可选的硬仗」，不是第二套 BOSS：
// 生命 1.8 倍让玩家有击杀成本，攻击只 +15% 避免一发秒人，经验 / 金币翻倍作为正反馈。
export const ELITE_TUNING = {
  chance: 0.12,
  maxPerMap: 3,
  minMonsters: 6,
  hpMult: 1.8,
  attackMult: 1.15,
  expMult: 2,
  goldMult: 2,
  // 词缀数量：前 20 关 1 条（教学期），之后 2 条。
  singleAffixBefore: 20
};

// FNV-1a → [0,1)。用「地图 id + 刷怪点序号」做种子，保证同一张图的精英位置固定：
// 玩家重进不换位，e2e / 探针也能复现；不引入 Math.random 以免同一次会话内漂移。
export function hash01(text) {
  let h = 2166136261 >>> 0;
  const str = String(text);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// 从候选池里抽 count 条互不互斥的词缀。
// random 注入是为了单测能构造「一定抽到某条」的场景。
export function pickAffixes(count, random = Math.random, pool = Object.keys(ELITE_AFFIXES)) {
  const picked = [];
  const candidates = [...pool];
  while (picked.length < count && candidates.length) {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    const [id] = candidates.splice(index, 1);
    const conflict = ELITE_MUTEX.some(([a, b]) => (a === id && picked.includes(b)) || (b === id && picked.includes(a)));
    if (!conflict) picked.push(id);
  }
  return picked;
}

// mulberry32：用字符串种子生成确定性随机序列。
// 精英的位置与词缀必须「同一张图每次都一样」，否则玩家重进关卡会看到精英换位。
export function seededRandom(seedText) {
  let a = Math.floor(hash01(seedText) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 判定某只怪是否精英。返回 null 或 { affixes, reward }。
// order 是关卡序号（1 起），决定词缀条数。
export function rollElite({ mapId, index, monsterCount, order, random = Math.random, force = false }) {
  if (monsterCount < ELITE_TUNING.minMonsters) return null;
  if (!force && random() >= ELITE_TUNING.chance) return null;
  const count = order > ELITE_TUNING.singleAffixBefore ? 2 : 1;
  const affixes = pickAffixes(count, random);
  if (!affixes.length) return null;
  return { affixes, reward: affixes.includes("hoard") ? "gold" : "material" };
}

export function hasAffix(entity, id) {
  return Boolean(entity?.elite?.affixes?.includes(id));
}

// 守财：离刷新点越远越硬（逼玩家在怪的地盘里打完，而不是一路风筝）。
export function hoardDamageMult(entity, distanceFromSpawn, tuning = ELITE_TUNING) {
  if (!hasAffix(entity, "hoard")) return 1;
  return distanceFromSpawn > 140 ? 0.6 : 1;
}

// 追猎：基础提速 15%，玩家半血以下再叠到 30%。
export function huntSpeedMult(entity, playerHpRatio) {
  if (!hasAffix(entity, "hunt")) return 1;
  return playerHpRatio < 0.5 ? 1.3 : 1.15;
}

// 狂怒：生命 20% 以下时出手更密（闸门 ×0.75 ≈ 攻速 +33%）。
export function enrageGateMult(entity) {
  if (!hasAffix(entity, "enrage")) return 1;
  const ratio = entity.hp / Math.max(1, entity.maxHp);
  return ratio < 0.2 ? 0.75 : 1;
}

// 回响：玩家在窗口内放过技能时，精英下一次命中附带余波伤害。
export const ECHO_WINDOW = 3;
export function echoDamageMult(entity, lastSkillAge) {
  if (!hasAffix(entity, "echo")) return 1;
  if (!Number.isFinite(lastSkillAge) || lastSkillAge < 0 || lastSkillAge > ECHO_WINDOW) return 1;
  return 1.4;
}

// 护卫：为首领分摊的伤害比例与搜索半径。
export const GUARDIAN_RATIO = 0.3;
export const GUARDIAN_RANGE = 220;

// 分裂：裂生体的属性倍率（不再二次分裂，也不再是精英）。
export const SPLIT_TUNING = { hpRatio: 0.35, attackRatio: 0.6, count: 2 };
