// 纯函数单元测试：城镇杂货商与词缀重铸（shop.js）。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { AFFIX_POOL } from "../../game/src/config.js";
import { SHOP_GOODS, REFORGE_RULES, buyShopItem, reforgeQuote, reforgeAffix } from "../../game/src/shop.js";

// 队列式假随机：按顺序返回随机值，用尽后回退 0，保证重铸结果可复现。
const queueRandom = (values) => {
  const queue = [...values];
  return () => (queue.length ? queue.shift() : 0);
};

test("SHOP_GOODS：商品 id 唯一、价格为整数且大于 0，覆盖药水 / 材料 / 重铸卷三类出口", () => {
  const ids = SHOP_GOODS.map((good) => good.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const good of SHOP_GOODS) {
    assert.ok(Number.isInteger(good.price) && good.price > 0, `${good.id} 价格应为正整数`);
    assert.ok(["potion", "material", "scroll"].includes(good.effect), `${good.id} effect 非法`);
  }
  assert.deepEqual(SHOP_GOODS.map((good) => good.effect).sort(), ["material", "potion", "scroll"]);
});

test("buyShopItem：金币足够时放行，金币不足与未知商品都返回可读原因", () => {
  const potion = SHOP_GOODS.find((good) => good.effect === "potion");
  const ok = buyShopItem(potion.id, { gold: potion.price });
  assert.equal(ok.ok, true);
  assert.equal(ok.price, potion.price);
  assert.equal(ok.good.id, potion.id);

  const poor = buyShopItem(potion.id, { gold: potion.price - 1 });
  assert.equal(poor.ok, false);
  assert.match(poor.reason, /金币不足/);

  const unknown = buyShopItem("not-a-good", { gold: 99999 });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.good, null);
});

test("reforgeQuote：缺装备 / 缺卷 / 金币不足分别拦截，齐备时给出金币成本", () => {
  const item = { id: "eq-1", name: "矿道旧刃", slot: "weapon", power: 40, enhance: 0, affixes: [] };
  assert.equal(reforgeQuote(null, { gold: 9999, scrolls: 9 }).canReforge, false);
  assert.match(reforgeQuote(null, { gold: 9999, scrolls: 9 }).reason, /没有穿戴装备/);

  const noScroll = reforgeQuote(item, { gold: 9999, scrolls: 0 });
  assert.equal(noScroll.canReforge, false);
  assert.match(noScroll.reason, /缺少词缀重铸卷/);
  assert.equal(noScroll.cost, REFORGE_RULES.baseGold);

  const noGold = reforgeQuote(item, { gold: noScroll.cost - 1, scrolls: 1 });
  assert.equal(noGold.canReforge, false);
  assert.match(noGold.reason, /金币不足/);

  const ready = reforgeQuote(item, { gold: noScroll.cost, scrolls: 1 });
  assert.equal(ready.canReforge, true);
  assert.equal(ready.scrollNeeded, 1);
});

test("reforgeQuote：强化等级与词缀条数都会推高金币成本（后期重铸更贵）", () => {
  const base = { id: "eq-1", name: "矿道旧刃", slot: "weapon", power: 40, enhance: 0, affixes: [] };
  const plain = reforgeQuote(base, { gold: 99999, scrolls: 1 }).cost;
  const enhanced = reforgeQuote({ ...base, enhance: 5 }, { gold: 99999, scrolls: 1 }).cost;
  const affixed = reforgeQuote({ ...base, affixes: [{ key: "attack", label: "攻击", value: 6 }] }, { gold: 99999, scrolls: 1 }).cost;
  assert.equal(enhanced, plain + REFORGE_RULES.enhanceStep * 5);
  assert.equal(affixed, plain + REFORGE_RULES.perAffix);
});

test("reforgeAffix：只重掷被选中的那一条，其余词缀保持不变", () => {
  const item = {
    id: "eq-2",
    name: "灰烬护符",
    slot: "neck",
    power: 55,
    affixes: [
      { group: "主属性", key: "attack", label: "攻击", value: 7 },
      { group: "生存", key: "defense", label: "防御", value: 3 }
    ]
  };
  const original = JSON.parse(JSON.stringify(item));
  // 随机序列：选中第 0 条 → 候选池取第 0 个（排除仍存在的防御）→ 数值系数 0
  const result = reforgeAffix(item, { level: 1, random: queueRandom([0, 0, 0]) });
  assert.equal(result.index, 0);
  assert.equal(result.oldAffix.key, "attack");
  // 剩余词缀里已有 defense，因此新词缀不可能是 defense
  assert.notEqual(result.newAffix.key, "defense");
  assert.equal(result.item.affixes.length, 2);
  assert.deepEqual(result.item.affixes[1], original.affixes[1]);
  // 纯函数：不修改传入装备
  assert.deepEqual(item, original);
});

test("reforgeAffix：白板装备重铸会新附一条词缀（避免无法使用的死路）", () => {
  const item = { id: "eq-3", name: "矿道旧刃", slot: "weapon", power: 32 };
  const result = reforgeAffix(item, { level: 1, random: queueRandom([0, 0]) });
  assert.equal(result.index, -1);
  assert.equal(result.oldAffix, null);
  assert.equal(result.item.affixes.length, 1);
  assert.equal(result.item.affixes[0].key, AFFIX_POOL[0].key);
  assert.ok(result.item.affixes[0].value >= 1);
});

test("reforgeAffix：候选池耗尽时回退到完整词缀池，仍只保留原有条数", () => {
  // 4 条词缀已覆盖整个池；重掷第 0 条后，候选池为空 → 回退完整池。
  const item = {
    id: "eq-4",
    name: "满词缀玉佩",
    slot: "talisman",
    power: 80,
    affixes: AFFIX_POOL.map((entry) => ({
      group: entry.group,
      key: entry.key,
      label: entry.label,
      value: 2,
      percent: Boolean(entry.percent)
    }))
  };
  const result = reforgeAffix(item, { level: 1, random: queueRandom([0, 0, 0]) });
  assert.equal(result.item.affixes.length, AFFIX_POOL.length);
  assert.ok(result.newAffix.value >= 1);
});

test("reforgeQuote：锁定词缀（≥2 条）报价 ×1.8；单条词缀锁定无效", () => {
  const item = {
    id: "eq-lock",
    name: "测试锁刃",
    slot: "weapon",
    power: 40,
    enhance: 0,
    affixes: [
      { group: "生存", key: "hp", label: "生命", value: 30 },
      { group: "主属性", key: "attack", label: "攻击", value: 8 }
    ]
  };
  const base = reforgeQuote(item, { gold: 99999, scrolls: 9 });
  assert.equal(base.canReforge, true);
  assert.equal(base.lockActive, false);
  const locked = reforgeQuote(item, { gold: 99999, scrolls: 9, lockIndex: 0 });
  assert.equal(locked.lockActive, true);
  assert.equal(locked.cost, Math.round(base.cost * 1.8), "锁定报价 = 基础 ×1.8 取整");
  // 越界下标与单条词缀：锁定不生效，报价与基础一致
  assert.equal(reforgeQuote(item, { gold: 99999, scrolls: 9, lockIndex: 5 }).lockActive, false);
  const single = { ...item, affixes: item.affixes.slice(0, 1) };
  assert.equal(reforgeQuote(single, { gold: 99999, scrolls: 9, lockIndex: 0 }).lockActive, false);
});

test("reforgeAffix：锁定词缀不被重掷，非锁定槽位在剩余词缀里重掷", () => {
  const lockedAffix = { group: "生存", key: "hp", label: "生命", value: 30 };
  const otherAffix = { group: "主属性", key: "attack", label: "攻击", value: 8 };
  const item = { id: "eq-lock", slot: "weapon", power: 40, affixes: [lockedAffix, otherAffix] };
  // 假随机 0 → 候选下标取首位（锁定 0 时唯一候选是 1）；0 → 池首位；0.5 → 数值系数
  const result = reforgeAffix(item, { level: 20, random: queueRandom([0, 0, 0.5]), lockIndex: 0 });
  assert.equal(result.index, 1, "只重掷非锁定槽位");
  assert.equal(result.item.affixes[0], lockedAffix, "锁定词缀对象原样保留");
  assert.notEqual(result.item.affixes[1], otherAffix, "另一条被重掷（对象被替换，允许抽回同 key 新值）");
  // 锁定 1 时唯一候选是 0
  const flipped = reforgeAffix(item, { level: 20, random: queueRandom([0, 0, 0.5]), lockIndex: 1 });
  assert.equal(flipped.index, 0);
  assert.equal(flipped.item.affixes[1], otherAffix);
  // 不传锁定：行为与旧版一致（下标从全部词缀里抽）
  const unlocked = reforgeAffix(item, { level: 20, random: queueRandom([0, 0, 0.5]) });
  assert.equal(unlocked.index, 0);
});
