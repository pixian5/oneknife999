// 纯函数单元测试：掉落、拾取与场景节点收益（drops.js）。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { COMMON_DROPS } from "../../game/src/config.js";
import {
  BOSS_MARK_SHARD,
  rollDropItem,
  rollDropCount,
  computePickup,
  computeSiteEffect,
  stackMaterial,
  salvageReward,
  normalizeInventory
} from "../../game/src/drops.js";

// 队列式假随机：按给定顺序返回随机值，用尽后回退为 0，保证掉落结果完全可复现。
const queueRandom = (values) => {
  const queue = [...values];
  return () => (queue.length ? queue.shift() : 0);
};

const MAP_DROPS = [
  { name: "矿道旧刃", slot: "weapon", quality: "blue", color: "#78b6ec" },
  { name: "灰烬护符", slot: "neck", quality: "purple", color: "#a88ce3" }
];
const MOB_SOURCE = { name: "腐烬矿工", x: 800, y: 600, boss: false };
const BOSS_SOURCE = { name: "裂碑领主", x: 1980, y: 760, boss: true };

test("rollDropItem：随机序列固定时掉落结果完全可复现（顺序：地图物品 → 权重池 → id → 坐标）", () => {
  const item = rollDropItem({
    source: MOB_SOURCE,
    mapDrops: MAP_DROPS,
    commonDrops: COMMON_DROPS,
    random: queueRandom([0, 0, 0.5, 1, 0]),
    now: 1000,
    roll: 0
  });
  assert.equal(item.name, "生命药水");
  assert.equal(item.kind, "health_potion");
  assert.equal(item.id, "item-1000-0-0.5");
  assert.equal(item.x, MOB_SOURCE.x + 30);
  assert.equal(item.y, MOB_SOURCE.y - 24);
  assert.equal(item.source, MOB_SOURCE.name);
  assert.equal(item.amount, undefined, "非金币掉落不应写入 amount");
});

test("rollDropItem：金币掉落写入 12-34（首领 70-150）的随机数量", () => {
  const mob = rollDropItem({
    source: MOB_SOURCE,
    mapDrops: MAP_DROPS,
    commonDrops: COMMON_DROPS,
    random: queueRandom([0, 0.7, 0, 0.5, 0.5, 0.5]),
    now: 1000
  });
  assert.equal(mob.kind, "gold");
  assert.equal(mob.amount, Math.round(0.5 * 22 + 12));
  const boss = rollDropItem({
    source: BOSS_SOURCE,
    mapDrops: MAP_DROPS,
    commonDrops: COMMON_DROPS,
    random: queueRandom([0, 0.45, 0, 0.5, 0.5, 0.5]),
    now: 1000
  });
  assert.equal(boss.kind, "gold");
  assert.equal(boss.amount, Math.round(0.5 * 80 + 70));
});

test("rollDropItem：首领掉落池额外包含权重 18 的首领印记碎片", () => {
  // 碎片是掉落池最后一项、权重 18：roll 落在最后 18 点区间内必中碎片，略低于该区间则仍掉地图物品。
  const totalWeight = COMMON_DROPS.reduce((sum, item) => sum + item.weight, 0) + 62 + 18;
  const shard = rollDropItem({
    source: BOSS_SOURCE,
    mapDrops: MAP_DROPS,
    commonDrops: COMMON_DROPS,
    random: queueRandom([0, (totalWeight - 9) / totalWeight, 0, 0, 0]),
    now: 1000
  });
  assert.equal(shard.name, BOSS_MARK_SHARD.name);
  assert.equal(shard.kind, "marks");
  const belowBand = rollDropItem({
    source: BOSS_SOURCE,
    mapDrops: MAP_DROPS,
    commonDrops: COMMON_DROPS,
    random: queueRandom([0, (totalWeight - 27) / totalWeight, 0, 0, 0]),
    now: 1000
  });
  assert.equal(belowBand.name, MAP_DROPS[0].name, "碎片权重区间之外仍掉地图物品");
  const mob = rollDropItem({
    source: MOB_SOURCE,
    mapDrops: MAP_DROPS,
    commonDrops: COMMON_DROPS,
    random: queueRandom([0, 1, 0, 0, 0]),
    now: 1000
  });
  assert.notEqual(mob.name, BOSS_MARK_SHARD.name, "普通怪掉落池不含碎片");
});

test("rollDropCount：首领固定 2 次，普通怪 42% 概率 1 次", () => {
  assert.equal(rollDropCount(BOSS_SOURCE, queueRandom([])), 2);
  assert.equal(rollDropCount(MOB_SOURCE, queueRandom([0.41])), 1);
  assert.equal(rollDropCount(MOB_SOURCE, queueRandom([0.42])), 0);
  assert.equal(rollDropCount(MOB_SOURCE, queueRandom([0.9])), 0);
});

test("computePickup：药水 / 资源 / 金币 / 印记分别写回对应字段", () => {
  const hero = { resource: 100, resourceName: "怒气" };
  const player = { potion: 3, resource: 10, gold: 5, marks: 1 };
  assert.deepEqual(computePickup({ kind: "health_potion" }, { player, hero }).patch, { potion: 4 });
  const resource = computePickup({ kind: "resource_potion" }, { player, hero });
  assert.deepEqual(resource.patch, { resource: 45 });
  assert.equal(resource.log.amount, 35);
  assert.deepEqual(computePickup({ kind: "gold", amount: 23 }, { player, hero }).patch, { gold: 28 });
  assert.deepEqual(computePickup({ kind: "marks" }, { player, hero }).patch, { marks: 4 });
});

test("computePickup：资源药水回复不超过上限，装备类物品进入背包", () => {
  const hero = { resource: 100, resourceName: "怒气" };
  const nearFull = computePickup({ kind: "resource_potion" }, { player: { resource: 90 }, hero });
  assert.equal(nearFull.patch.resource, 100, "回复后不应超过职业资源上限");
  const equipment = computePickup({ name: "矿道旧刃", slot: "weapon" }, { player: {}, hero });
  assert.equal(equipment.toInventory, true);
  assert.equal(equipment.patch, undefined);
});

const ENTITIES = [
  { id: "mob-1", name: "腐烬矿工", alive: true, x: 100, y: 100 },
  { id: "boss-ash", name: "裂碑领主", alive: true, boss: true, x: 900, y: 900 }
];
const sitePlayer = (overrides = {}) => ({
  x: 0,
  y: 0,
  hp: 100,
  resource: 20,
  charge: 10,
  poison: 2,
  poisonTimer: 1,
  targetId: null,
  invulnerable: 0,
  ...overrides
});
const siteContext = (player, entities = ENTITIES) => ({ player, hero: { resource: 100, resourceName: "怒气" }, entities, maxHp: 400 });

test("computeSiteEffect：rally / fortify / banner / decree 的补血与破势文案", () => {
  const rally = computeSiteEffect({ effect: "rally", detail: "备用文案" }, siteContext(sitePlayer()));
  assert.equal(rally.result, "破势槽已充满");
  assert.equal(rally.patch.charge, 100);

  const fortify = computeSiteEffect({ effect: "fortify" }, siteContext(sitePlayer()));
  assert.equal(fortify.patch.hp, 240);
  assert.equal(fortify.patch.invulnerable, 4);
  assert.equal(fortify.result, "生命 +140，免伤 4 秒");

  const banner = computeSiteEffect({ effect: "banner" }, siteContext(sitePlayer()));
  assert.equal(banner.patch.hp, 180);
  assert.equal(banner.patch.charge, 60);
  assert.equal(banner.result, "生命 +80、破势 +50");

  const decree = computeSiteEffect({ effect: "decree" }, siteContext(sitePlayer()));
  assert.deepEqual(decree.patch, { hp: 400, resource: 100, charge: 100, poison: 0, poisonTimer: 0 });
  assert.equal(decree.result, "生命、职业资源与破势槽全部补满");
});

test("computeSiteEffect：scout / compass 锁定目标并取消点击寻路", () => {
  const scout = computeSiteEffect({ effect: "scout" }, siteContext(sitePlayer()));
  assert.equal(scout.patch.resource, 45);
  assert.equal(scout.patch.targetId, "mob-1", "锁定最近的存活目标");
  assert.equal(scout.retarget, true);
  assert.equal(scout.result, "职业资源 +25，已锁定 腐烬矿工");

  const compass = computeSiteEffect({ effect: "compass" }, siteContext(sitePlayer()));
  assert.equal(compass.patch.targetId, "boss-ash", "罗盘优先锁定首领");
  assert.equal(compass.retarget, true);
  assert.equal(compass.result, "已锁定 裂碑领主");

  const empty = computeSiteEffect({ effect: "compass" }, siteContext(sitePlayer(), []));
  assert.equal(empty.patch.targetId, null);
  assert.equal(empty.result, "当前没有可锁定目标");
});

test("computeSiteEffect：bridge / purify 清除危险区与毒层", () => {
  const bridge = computeSiteEffect({ effect: "bridge" }, siteContext(sitePlayer()));
  assert.equal(bridge.clearHazards, true);
  assert.deepEqual(bridge.patch, { poison: 0, poisonTimer: 0, invulnerable: 3 });
  assert.equal(bridge.result, "危险区已清除、毒层已净化，免伤 3 秒");

  const purify = computeSiteEffect({ effect: "purify" }, siteContext(sitePlayer()));
  assert.deepEqual(purify.patch, { poison: 0, poisonTimer: 0, resource: 100 });
  assert.equal(purify.result, "毒层已清除，职业资源已补满");
});

test("computeSiteEffect：resonance / breach 按比例回复职业资源并补破势", () => {
  const resonance = computeSiteEffect({ effect: "resonance" }, siteContext(sitePlayer()));
  assert.equal(resonance.patch.resource, 70);
  assert.equal(resonance.patch.charge, 40);
  assert.equal(resonance.result, "职业资源 +50、破势 +30");

  const breach = computeSiteEffect({ effect: "breach" }, siteContext(sitePlayer()));
  assert.equal(breach.patch.resource, 40);
  assert.equal(breach.patch.charge, 85);
  assert.equal(breach.result, "职业资源 +20、破势 +75");
});

test("computeSiteEffect：未知效果回退到固定文案且不产生变更", () => {
  const fallback = computeSiteEffect({ effect: "unknown", detail: "石碑纹路亮起" }, siteContext(sitePlayer()));
  assert.equal(fallback.result, "场景节点已激活");
  assert.deepEqual(fallback.patch, {});
  assert.equal(fallback.clearHazards, false);
  assert.equal(fallback.retarget, false);
});

test("stackMaterial：同名材料合并 count，首件写入 count=1", () => {
  const ore = { name: "黑铁矿石", slot: "material", id: "m1" };
  const merged = stackMaterial([], ore);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 1);

  const again = stackMaterial(merged, { name: "黑铁矿石", slot: "material", id: "m2" });
  assert.equal(again.length, 1);
  assert.equal(again[0].count, 2);
  assert.equal(again[0].id, "m1"); // 保留首件 id（强化消耗按 id 定位仍有效）
});

test("stackMaterial：不同名材料不合并，装备不受影响直接追加", () => {
  const list = stackMaterial([], { name: "首领魂核", slot: "material", id: "c1" });
  const result = stackMaterial(list, { name: "锁子甲", slot: "armor", id: "a1" });
  assert.equal(result.length, 2);
  assert.equal(result[1].slot, "armor");
  assert.equal(result[1].count, undefined); // 装备不写 count 字段
});

test("salvageReward：装备拆解返还 1 基础材料与 10% 价值金币", () => {
  const { rewards } = salvageReward({ name: "雾松短剑", slot: "weapon", value: 120, id: "w1" });
  assert.equal(rewards.length, 2);
  const material = rewards.find((reward) => reward.slot === "material");
  assert.ok(material);
  assert.equal(material.name, "黑铁矿石"); // 与掉落基础材料同名，堆叠共用
  assert.equal(rewards.find((reward) => reward.kind === "gold").amount, 12);
});

test("salvageReward：材料 / 消耗品 / 货币不可拆解（返回空返还）", () => {
  assert.deepEqual(salvageReward({ slot: "material", id: "m1" }).rewards, []);
  assert.deepEqual(salvageReward({ slot: "consumable", kind: "health_potion" }).rewards, []);
  assert.deepEqual(salvageReward({ slot: "currency", kind: "gold" }).rewards, []);
  assert.deepEqual(salvageReward(null).rewards, []);
});

test("normalizeInventory：恢复存档时合并重复同名材料，无 count 的旧条目视为 1 件", () => {
  const list = normalizeInventory([
    { name: "黑铁矿石", slot: "material", id: "m1" },
    { name: "黑铁矿石", slot: "material", id: "m2", count: 3 },
    { name: "锁子甲", slot: "armor", id: "a1" },
    { name: "首领魂核", slot: "material", id: "c1" }
  ]);
  assert.equal(list.length, 3);
  const ore = list.find((entry) => entry.name === "黑铁矿石");
  assert.equal(ore.count, 4); // 1（无 count 旧条目）+ 3
  assert.equal(ore.id, "m1"); // 保留首件 id
  const armor = list.find((entry) => entry.slot === "armor");
  assert.equal(armor.count, undefined); // 装备不写 count
});

// ============ 0.4.4 掉落类型判定与红名爆装抽件 ============
import { isEquipmentDrop, pickRedNameDrop } from "../../game/src/drops.js";

test("isEquipmentDrop：装备槽位为真，消耗品 / 货币 / 材料与空槽位为假", () => {
  for (const slot of ["weapon", "helmet", "neck", "armor", "braceletL", "ringR", "belt", "boots", "medal", "talisman"])
    assert.equal(isEquipmentDrop({ slot }), true, `${slot} 应判定为装备`);
  assert.equal(isEquipmentDrop({ slot: "consumable" }), false);
  assert.equal(isEquipmentDrop({ slot: "currency" }), false);
  assert.equal(isEquipmentDrop({ slot: "material" }), false);
  assert.equal(isEquipmentDrop({}), false);
  assert.equal(isEquipmentDrop(null), false);
});

test("pickRedNameDrop：只从已穿戴槽位等概率抽取，掉落围绕倒下位置", () => {
  const equipment = {
    weapon: { id: "w1", name: "黑铁长剑", color: "#a88ce3" },
    helmet: null,
    neck: { id: "n1", name: "魂链", color: "#78b6ec" }
  };
  const pick = pickRedNameDrop(equipment, { x: 500, y: 600, random: () => 0 });
  assert.equal(pick.slotKey, "weapon", "random=0 命中第一个已穿槽位");
  assert.equal(pick.drop.id, "w1");
  assert.equal(pick.drop.source, "红名死亡");
  assert.ok(Math.abs(pick.drop.x - 500) <= 30 && Math.abs(pick.drop.y - 600) <= 24, "坐标抖动 ±30/±24 与原实现一致");
  // random 覆盖全区间只命中已穿槽位，永不选中空槽。
  for (const roll of [0, 0.3, 0.6, 0.99]) {
    const other = pickRedNameDrop(equipment, { random: () => roll });
    assert.ok(["weapon", "neck"].includes(other.slotKey), `roll=${roll} 不应命中空槽 helmet`);
    assert.equal(other.drop[other.slotKey], undefined);
  }
});

test("pickRedNameDrop：无穿戴或装备为空返回 null", () => {
  assert.equal(pickRedNameDrop({}, {}), null);
  assert.equal(pickRedNameDrop(null, {}), null);
  assert.equal(pickRedNameDrop({ weapon: null, armor: null }, {}), null);
});
