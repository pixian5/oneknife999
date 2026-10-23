// 纯函数单元测试：装备系统（12 部位 / 强化 / 词缀 / 有效战力）。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASSES,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_KEYS,
  enhanceQuote,
  effectiveItemPower,
  equipmentHpBonus,
  equipmentDefenseBonus,
  ENHANCE_RULES,
  SKILL_UPGRADE,
  PK_RULES
} from "../../game/src/config.js";
import { setState, playerDefense } from "../../game/src/runtime.js";
import { rollAffixes } from "../../game/src/drops.js";

// 队列式假随机：按给定顺序返回，用尽后回退 0。
const queueRandom = (values) => {
  const queue = [...values];
  return () => (queue.length ? queue.shift() : 0);
};

test("装备部位：12 部位与 docs/03 清单一致", () => {
  assert.equal(EQUIPMENT_SLOT_KEYS.length, 12);
  assert.deepEqual(EQUIPMENT_SLOT_KEYS, [
    "weapon",
    "helmet",
    "neck",
    "armor",
    "braceletL",
    "braceletR",
    "ringL",
    "ringR",
    "belt",
    "boots",
    "medal",
    "talisman"
  ]);
  for (const slotKey of EQUIPMENT_SLOT_KEYS) assert.ok(EQUIPMENT_SLOTS[slotKey].label, `${slotKey} 缺少中文标签`);
});

test("rollAffixes：词缀数与内容可由注入随机数复现，同组不重复", () => {
  // random: 0.3 → 进入有词缀分支；0.9 → 不触发第二条；0.0 → 池首位；0.5 → 数值系数
  const affixes = rollAffixes({ level: 40, random: queueRandom([0.3, 0.9, 0.0, 0.5]) });
  assert.equal(affixes.length, 1);
  const affix = affixes[0];
  assert.equal(affix.key, "attack");
  assert.equal(affix.group, "主属性");
  const expected = Math.max(1, Math.round((4 + 0.35 * 39) * (0.7 + 0.5 * 0.6)));
  assert.equal(affix.value, expected);
  // 两条词缀时组不重复
  const two = rollAffixes({ level: 10, random: queueRandom([0.1, 0.1, 0.1, 0.1, 0.5, 0.5]) });
  assert.equal(two.length, 2);
  assert.notEqual(two[0].group + two[0].key, two[1].group + two[1].key);
  // 零词缀路径
  assert.equal(rollAffixes({ level: 1, random: queueRandom([0.9]) }).length, 0);
});

test("effectiveItemPower：强化按基础 power 的 8% 逐级放大，攻击词缀为加算", () => {
  const base = { power: 100, slot: "weapon" };
  assert.equal(effectiveItemPower(base), 100);
  assert.equal(effectiveItemPower({ ...base, enhance: 5 }), Math.round(100 * (1 + 0.08 * 5)));
  const withAffix = { ...base, enhance: 10, affixes: [{ key: "attack", value: 17 }] };
  assert.equal(effectiveItemPower(withAffix), Math.round(100 * (1 + 0.08 * 10) + 17));
  assert.equal(effectiveItemPower(null), 0);
});

test("equipmentHpBonus：部位固定生命 + 生命词缀；防御词缀只进防御加成", () => {
  const armor = {
    slot: "armor",
    affixes: [
      { key: "hp", value: 30 },
      { key: "defense", value: 5 }
    ]
  };
  assert.equal(equipmentHpBonus(armor, "armor"), 60 + 30);
  assert.equal(equipmentDefenseBonus(armor), 5);
  assert.equal(equipmentHpBonus(null, "helmet"), 0);
  assert.equal(equipmentHpBonus({ slot: "weapon" }, "weapon"), 0, "武器不提供固定生命");
});

test("playerDefense：职业基础防御 + 装备防御词缀（0.3.7 接线，承伤必须吃到装备防御）", () => {
  setState({
    classId: "warrior",
    player: {
      equipment: {
        armor: { slot: "armor", affixes: [{ key: "defense", value: 12 }] },
        boots: { slot: "boots", affixes: [{ key: "defense", value: 8 }] }
      }
    }
  });
  assert.equal(playerDefense(), CLASSES.warrior.defense + 20, "防御词缀要累加进玩家总防御");
  // 未穿戴装备时退回职业基础防御，不应出现 NaN / undefined。
  setState({ classId: "mage", player: {} });
  assert.equal(playerDefense(), CLASSES.mage.defense);
  // 攻击 / 生命词缀不参与防御。
  setState({
    classId: "taoist",
    player: {
      equipment: {
        weapon: {
          slot: "weapon",
          affixes: [
            { key: "attack", value: 30 },
            { key: "hp", value: 50 }
          ]
        }
      }
    }
  });
  assert.equal(playerDefense(), CLASSES.taoist.defense);
});

test("enhanceQuote：金币成本按 1.5^目标等级增长，+8 起需要材料，祝福满必成", () => {
  const item = { slot: "weapon", power: 50, enhance: 0 };
  const quote = enhanceQuote(item, 100000, []);
  assert.equal(quote.canEnhance, true);
  assert.equal(quote.cost, Math.round(70 * 1.5)); // +1
  assert.equal(quote.materialNeeded, 0);
  assert.equal(quote.rate, 1, "+1~+5 必成");
  // 金币不足
  assert.equal(enhanceQuote(item, 1, []).canEnhance, false);
  // +8 起需要材料
  const high = { slot: "weapon", power: 50, enhance: 7 };
  const noMaterial = enhanceQuote(high, 100000, []);
  assert.equal(noMaterial.canEnhance, false);
  assert.equal(noMaterial.materialNeeded, 1);
  const withMaterial = enhanceQuote(high, 100000, [{ slot: "material", name: "魂核" }]);
  assert.equal(withMaterial.canEnhance, true);
  assert.equal(withMaterial.rate, 0.7, "+6~+8 成功率 70%");
  // 祝福满 100 → 必成
  assert.equal(enhanceQuote({ slot: "weapon", power: 50, enhance: 12, blessing: 100 }, 100000, [{ slot: "material" }]).rate, 1);
  // 上限
  assert.equal(enhanceQuote({ slot: "weapon", power: 50, enhance: 15 }, 100000, [{ slot: "material" }]).canEnhance, false);
});

test("规则常量与 docs/02/03/05 对齐", () => {
  assert.equal(ENHANCE_RULES.max, 15);
  assert.deepEqual(
    ENHANCE_RULES.rates.map((rule) => rule.rate),
    [1, 0.7, 0.4, 0.2]
  );
  assert.equal(SKILL_UPGRADE.multiplierPerLevel, 0.06);
  assert.equal(PK_RULES.minLevelToAttack, 20);
  assert.equal(PK_RULES.sinPerKill, 100);
  assert.equal(PK_RULES.redNameThreshold, 300);
});
