// 单元测试：0.8.81 F90 回响 B 奖励与经验分流。
import test from "node:test";
import assert from "node:assert/strict";
import { computeKillReward } from "../../game/src/combat.js";

const BOSS = { boss: true };
const rule = { kills: 5, mapsPerLevel: 4 };

test("回响提前击破：半额经验、0 印记", () => {
  const early = computeKillReward({ target: BOSS, quest: { kills: 0, need: 5, bossDefeated: false, echoEarlyDefeated: true }, rule });
  assert.equal(early.firstProgressKill, false);
  assert.equal(early.expGain, Math.max(1, Math.round(30 / 4 / 2)));
  assert.equal(early.marksGain, 0);
});

test("回响最终击破：首次首领结算，35 印记", () => {
  const final = computeKillReward({
    target: BOSS,
    quest: { kills: 5, need: 5, bossDefeated: false, echoEarlyDefeated: false, bossMarksAwarded: false },
    rule
  });
  assert.equal(final.firstProgressKill, true);
  assert.equal(final.marksGain, 35);
});

test("回响印记只发一次：最终击破后再杀不发", () => {
  const again = computeKillReward({
    target: BOSS,
    quest: { kills: 5, need: 5, bossDefeated: true, bossMarksAwarded: true },
    rule
  });
  assert.equal(again.marksGain, 0);
});
