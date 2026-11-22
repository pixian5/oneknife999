// 纯函数单元测试：深层清层后清理玩家残留敌方状态（0.8.64）。
import test from "node:test";
import assert from "node:assert/strict";
import { clearHostileStatus } from "../../game/src/runtime.js";

test("清层清理：毒层、毒计时、减速、眩晕节奏全部归零", () => {
  const player = {
    poison: 4,
    poisonTimer: 0.3,
    slowTimer: 2.5,
    slowFactor: 0.55,
    attackTimer: 0.8,
    hp: 120
  };
  const result = clearHostileStatus(player);
  assert.equal(result, player);
  assert.equal(player.poison, 0);
  assert.equal(player.poisonTimer, 0);
  assert.equal(player.slowTimer, 0);
  assert.equal(player.slowFactor, 1);
  assert.equal(player.attackTimer, 0);
  assert.equal(player.hp, 120, "清状态不能回血");
});

test("清层清理：空玩家对象直接返回，不抛异常", () => {
  assert.equal(clearHostileStatus(null), null);
  assert.equal(clearHostileStatus(undefined), undefined);
});
