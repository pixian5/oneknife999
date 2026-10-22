import test from "node:test";
import assert from "node:assert/strict";
import { COMBO_RULES, advanceCombo, registerComboKill, resolveGuideTarget } from "../../game/src/feedback.js";

// 0.3.3 打击感与目标指引纯逻辑单测：连击计时 / 连击奖励 / 三阶段指引目标。

test("advanceCombo：倒计时递减，归零后连击清零", () => {
  const first = advanceCombo({ count: 3, timer: 1 }, 0.4);
  assert.deepEqual(first, { count: 3, timer: 0.6, expired: false });
  const expired = advanceCombo({ count: 3, timer: 0.2 }, 0.3);
  assert.deepEqual(expired, { count: 0, timer: 0, expired: true });
});

test("advanceCombo：空连击不产生过期事件，负 dt 不增加计时", () => {
  assert.deepEqual(advanceCombo({ count: 0, timer: 0 }, 1), { count: 0, timer: 0, expired: false });
  assert.deepEqual(advanceCombo({ count: 2, timer: 1 }, -1), { count: 2, timer: 1, expired: false });
});

test("registerComboKill：连击递增并重置窗口，每 5 连击给金币", () => {
  let combo = { count: 3, timer: 0.2 };
  combo = registerComboKill(combo);
  assert.deepEqual(combo, { count: 4, timer: COMBO_RULES.window, milestone: false, bonusGold: 0 });
  combo = registerComboKill({ count: 4, timer: 1 });
  assert.deepEqual(combo, { count: 5, timer: COMBO_RULES.window, milestone: true, bonusGold: COMBO_RULES.bonusGold });
  const sixth = registerComboKill({ count: 5, timer: 1 });
  assert.equal(sixth.count, 6);
  assert.equal(sixth.milestone, false);
  assert.equal(sixth.bonusGold, 0);
});

test("registerComboKill：连击不超过上限", () => {
  const result = registerComboKill({ count: COMBO_RULES.max, timer: 1 });
  assert.equal(result.count, COMBO_RULES.max);
});

test("resolveGuideTarget：清剿阶段指向最近的普通怪，并跳过 NPC", () => {
  const player = { x: 0, y: 0 };
  const entities = [
    { id: "far", x: 300, y: 0, alive: true },
    { id: "near", x: 120, y: 0, alive: true },
    { id: "npc", x: 30, y: 0, alive: true, npc: true }
  ];
  const guide = resolveGuideTarget({ player, entities, progress: { kills: 1, need: 8, completed: false } });
  assert.equal(guide.kind, "kills");
  assert.equal(guide.target.id, "near");
});

test("resolveGuideTarget：普通怪清完指向首领，首领倒下退回固定坐标", () => {
  const player = { x: 0, y: 0 };
  const bossEntity = { id: "boss", x: 500, y: 0, alive: true, boss: true, name: "裂碑领主" };
  const aliveGuide = resolveGuideTarget({
    player,
    entities: [bossEntity],
    progress: { kills: 8, need: 8, completed: false },
    boss: { x: 900, y: 0, name: "裂碑领主" }
  });
  assert.equal(aliveGuide.kind, "boss");
  assert.equal(aliveGuide.target.x, 500);

  const deadGuide = resolveGuideTarget({
    player,
    entities: [{ ...bossEntity, alive: false }],
    progress: { kills: 8, need: 8, completed: false },
    boss: { x: 900, y: 0, name: "裂碑领主" }
  });
  assert.equal(deadGuide.kind, "boss");
  assert.equal(deadGuide.target.x, 900);
});

test("resolveGuideTarget：通关后指向前进出口，全部完成且无出口时返回 null", () => {
  const guide = resolveGuideTarget({
    player: { x: 0, y: 0 },
    entities: [],
    progress: { kills: 8, need: 8, completed: true },
    forwardExit: { x: 2000, y: 700, label: "东侧山道" }
  });
  assert.equal(guide.kind, "exit");
  assert.equal(guide.target.x, 2000);
  assert.equal(guide.label, "前往 东侧山道");
  assert.equal(resolveGuideTarget({ player: { x: 0, y: 0 }, entities: [], progress: { completed: true } }), null);
});
