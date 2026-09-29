import { clamp, distance, weightedPick } from "./util.js";

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

// 掷出一件掉落物：先抽地图专属物品，再用权重池决定最终物品，最后生成位置与金币数量。
// 随机调用顺序与旧实现保持一致（地图物品 → 权重池 → 唯一 id → x → y → 金币数量）。
export function rollDropItem({ source, mapDrops, commonDrops, random = Math.random, now = Date.now(), roll = 0 }) {
  const mapItem = mapDrops[Math.floor(random() * mapDrops.length)];
  const pool = commonDrops.map((item) => ({ item, weight: item.weight }));
  pool.push({ item: mapItem, weight: source.boss ? 62 : 20 });
  if (source.boss) pool.push({ item: BOSS_MARK_SHARD, weight: 18 });
  const rolled = weightedPick(pool, random);
  const item = {
    ...rolled,
    id: `item-${now}-${roll}-${random()}`,
    x: source.x + (random() * 60 - 30),
    y: source.y + (random() * 48 - 24),
    source: source.name
  };
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
