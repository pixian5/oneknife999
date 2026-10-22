import { clamp, distance, weightedPick } from "./util.js";
import { AFFIX_POOL, BASIC_MATERIAL } from "./config.js";

// 《一刀999》掉落与场景节点收益纯逻辑：掉落掷点、拾取结算与战术节点效果。
// 不依赖 DOM 与游戏全局状态，随机数 / 时间由参数注入，便于单元测试与未来服务端共享。

// 首领专属掉落：拾取后获得 3 枚首领印记。
export const BOSS_MARK_SHARD = {
  name: "首领印记碎片",
  kind: "marks",
  slot: "currency",
  quality: "purple",
  glyph: "印",
  color: "#a88ce3",
  desc: "拾取后获得 3 枚首领印记"
};

// 为装备滚 0~2 条词缀（docs/03 主属性/生存/资源三组的原型实现）。
// 数值区间按掉落者等级缩放；同组最多 1 条；随机数由参数注入。
export function rollAffixes({ level = 1, count, random = Math.random }) {
  const target = count ?? (random() < 0.35 ? (random() < 0.3 ? 2 : 1) : 0);
  if (target <= 0) return [];
  const picked = [];
  const pool = [...AFFIX_POOL];
  for (let index = 0; index < target && pool.length; index += 1) {
    const entry = pool.splice(Math.floor(random() * pool.length), 1)[0];
    const scale = entry.base + entry.perStage * Math.max(0, level - 1);
    const value = Math.max(1, Math.round(scale * (0.7 + random() * 0.6)));
    picked.push({ group: entry.group, key: entry.key, label: entry.label, value, percent: Boolean(entry.percent) });
  }
  return picked;
}

// 掷出一件掉落物：先抽地图专属物品，再用权重池决定最终物品，最后生成位置与金币数量。
// 装备类物品追加词缀滚动（随机调用顺序：地图物品 → 权重池 → 词缀数 → 词缀 → 唯一 id → x → y → 金币数量）。
export function rollDropItem({ source, mapDrops, commonDrops, random = Math.random, now = Date.now(), roll = 0 }) {
  const mapItem = mapDrops[Math.floor(random() * mapDrops.length)];
  const pool = commonDrops.map((item) => ({ item, weight: item.weight }));
  pool.push({ item: mapItem, weight: source.boss ? 62 : 20 });
  if (source.boss) pool.push({ item: BOSS_MARK_SHARD, weight: 18 });
  const rolled = weightedPick(pool, random);
  const isEquipment = rolled.slot && !["consumable", "currency", "material"].includes(rolled.slot);
  const affixes = isEquipment ? rollAffixes({ level: source.level, random }) : undefined;
  const item = {
    ...rolled,
    id: `item-${now}-${roll}-${random()}`,
    x: source.x + (random() * 60 - 30),
    y: source.y + (random() * 48 - 24),
    source: source.name
  };
  if (affixes && affixes.length) item.affixes = affixes;
  if (item.kind === "gold") item.amount = Math.round(source.boss ? random() * 80 + 70 : random() * 22 + 12);
  return item;
}

// 掉落次数：首领固定 2 次，普通怪 42% 概率掉 1 次。
export function rollDropCount(source, random = Math.random) {
  return source.boss ? 2 : random() < 0.42 ? 1 : 0;
}

// 拾取结算：返回 { patch } 表示需要写回玩家的字段；返回 { toInventory: true } 表示放入背包。
// log 字段提供日志需要的数据（类型与数值），文案仍由调用方拼装。
export function computePickup(drop, { player, hero }) {
  if (drop.kind === "health_potion") return { patch: { potion: player.potion + 1 }, log: { type: "health_potion" } };
  if (drop.kind === "resource_potion") {
    const restored = Math.round(hero.resource * 0.35);
    return { patch: { resource: clamp(player.resource + restored, 0, hero.resource) }, log: { type: "resource_potion", amount: restored } };
  }
  if (drop.kind === "gold") return { patch: { gold: player.gold + drop.amount }, log: { type: "gold", amount: drop.amount } };
  if (drop.kind === "marks") return { patch: { marks: player.marks + 3 }, log: { type: "marks", amount: 3 } };
  return { toInventory: true, log: { type: "equipment" } };
}

// 材料堆叠：同类材料（同名同品质）进背包时合并 count，避免基础材料占满 12 格背包。
// 返回新 inventory（纯函数，可单测）；仅对 slot === "material" 的掉落生效。
export function stackMaterial(inventory, drop) {
  const list = inventory || [];
  if (drop?.slot !== "material") return [...list, drop];
  const existing = list.find((entry) => entry.slot === "material" && entry.name === drop.name);
  if (existing) {
    return list.map((entry) => (entry === existing ? { ...entry, count: (entry.count || 1) + 1 } : entry));
  }
  return [...list, { ...drop, count: 1 }];
}

// 拆解返还（docs/03：返还 50% 基础强化材料与少量金币）：输入背包装备，返回返还物列表。
// 装备拆解得到 1 件基础材料（BASIC_MATERIAL，同名堆叠）+ 10% 价值金币；材料/消耗品/货币不可拆解。
export function salvageReward(item) {
  if (!item || item.slot === "material" || item.slot === "consumable" || item.slot === "currency") return { rewards: [] };
  return {
    rewards: [
      { ...BASIC_MATERIAL, id: `salvage-${item.id}` },
      { kind: "gold", amount: Math.max(1, Math.round((item.value || 0) * 0.1)) }
    ]
  };
}

// 背包规范化：合并历史 / 迁移存档中重复的同名材料（旧档条目无 count 字段，视为 1 件）。
// 存档恢复与任何外部读入的背包都先过一遍，保证材料堆叠在运行时始终成立。
export function normalizeInventory(inventory) {
  const result = [];
  for (const entry of inventory || []) {
    if (entry?.slot === "material") {
      const existing = result.find((item) => item.slot === "material" && item.name === entry.name);
      if (existing) {
        existing.count = (existing.count || 1) + (entry.count || 1);
        continue;
      }
      result.push({ ...entry, count: entry.count || 1 });
    } else {
      result.push(entry);
    }
  }
  return result;
}

// 战术节点（site）激活效果：覆盖 rally/scout/fortify/bridge/resonance/compass/banner/breach/purify/decree。
// 返回 { result, patch, clearHazards, retarget }：
//   result 为界面文案；patch 为玩家字段增量；clearHazards 表示需要清空地面危险区；retarget 表示需要取消点击寻路。
export function computeSiteEffect(point, { player, hero, entities, maxHp }) {
  const alive = entities.filter((entity) => entity.alive);
  const nearestAlive = () => [...alive].sort((a, b) => distance(player, a) - distance(player, b))[0] || null;
  const patch = {};
  let result = point.detail;
  let clearHazards = false;
  let retarget = false;
  switch (point.effect) {
    case "rally":
      patch.charge = 100;
      result = "破势槽已充满";
      break;
    case "scout": {
      const resourceBefore = player.resource;
      patch.resource = clamp(player.resource + Math.round(hero.resource * 0.25), 0, hero.resource);
      const target = nearestAlive();
      patch.targetId = target?.id || null;
      retarget = true;
      result = "职业资源 +" + Math.max(0, Math.round(patch.resource - resourceBefore)) + (target ? "，已锁定 " + target.name : "");
      break;
    }
    case "fortify": {
      const hpBefore = player.hp;
      patch.hp = clamp(player.hp + Math.round(maxHp * 0.35), 0, maxHp);
      patch.invulnerable = 4;
      result = "生命 +" + Math.max(0, Math.round(patch.hp - hpBefore)) + "，免伤 4 秒";
      break;
    }
    case "bridge":
      clearHazards = true;
      patch.poison = 0;
      patch.poisonTimer = 0;
      patch.invulnerable = 3;
      result = "危险区已清除、毒层已净化，免伤 3 秒";
      break;
    case "resonance": {
      const resourceBefore = player.resource;
      patch.resource = clamp(player.resource + Math.round(hero.resource * 0.5), 0, hero.resource);
      patch.charge = clamp(player.charge + 30, 0, 100);
      result = "职业资源 +" + Math.max(0, Math.round(patch.resource - resourceBefore)) + "、破势 +30";
      break;
    }
    case "compass": {
      const target = alive.find((entity) => entity.boss) || nearestAlive();
      patch.targetId = target?.id || null;
      retarget = true;
      result = target ? "已锁定 " + target.name : "当前没有可锁定目标";
      break;
    }
    case "banner": {
      const hpBefore = player.hp;
      patch.hp = clamp(player.hp + Math.round(maxHp * 0.2), 0, maxHp);
      patch.charge = clamp(player.charge + 50, 0, 100);
      result = "生命 +" + Math.max(0, Math.round(patch.hp - hpBefore)) + "、破势 +50";
      break;
    }
    case "breach": {
      const resourceBefore = player.resource;
      patch.resource = clamp(player.resource + Math.round(hero.resource * 0.2), 0, hero.resource);
      patch.charge = clamp(player.charge + 75, 0, 100);
      result = "职业资源 +" + Math.max(0, Math.round(patch.resource - resourceBefore)) + "、破势 +75";
      break;
    }
    case "purify":
      patch.poison = 0;
      patch.poisonTimer = 0;
      patch.resource = hero.resource;
      result = "毒层已清除，职业资源已补满";
      break;
    case "decree":
      patch.hp = maxHp;
      patch.resource = hero.resource;
      patch.charge = 100;
      patch.poison = 0;
      patch.poisonTimer = 0;
      result = "生命、职业资源与破势槽全部补满";
      break;
    default:
      result = "场景节点已激活";
  }
  return { result, patch, clearHazards, retarget };
}
