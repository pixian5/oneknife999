// 纯函数单元测试：0.8.80 地图威胁的计时与倍率。
import test from "node:test";
import assert from "node:assert/strict";
import {
  THREAT_RULES,
  createThreatRuntime,
  advanceThreat,
  threatDamageMultiplier,
  threatPotionMultiplier,
  threatHealMultiplier
} from "../../game/src/threat.js";

test("0.8.80：未知 / 空威胁不创建运行时", () => {
  assert.equal(createThreatRuntime(null), null);
  assert.equal(createThreatRuntime({ id: "unknown" }), null);
  const runtime = createThreatRuntime({ id: "heat", label: "灼热" });
  assert.equal(runtime.id, "heat");
  assert.equal(runtime.heatTimer, THREAT_RULES.heat.interval);
});

test("0.8.80：灼热每 5 秒扣 2% 最大生命，安全区不扣血但计时继续", () => {
  const runtime = createThreatRuntime({ id: "heat" });
  assert.deepEqual(advanceThreat(runtime, 4.9, { maxHp: 1000 }), []);
  const [event] = advanceThreat(runtime, 0.1, { maxHp: 1000 });
  assert.deepEqual(event, { kind: "heat", amount: 20 });
  assert.deepEqual(advanceThreat(runtime, 5, { maxHp: 1000, safe: true }), []);
  assert.ok(runtime.heatTimer > 4.999 && runtime.heatTimer <= 5.000001, "安全区也应把计时重置回整周期");
});

test("0.8.80：雷暴每 8 秒在玩家位置生成 1.2 秒预警危险区", () => {
  const runtime = createThreatRuntime({ id: "storm" });
  assert.deepEqual(advanceThreat(runtime, 7.9, { maxHp: 1000, playerX: 100, playerY: 200 }), []);
  const [event] = advanceThreat(runtime, 0.1, { maxHp: 1000, playerX: 100, playerY: 200 });
  assert.deepEqual(event, { kind: "storm", x: 100, y: 200, radius: THREAT_RULES.storm.radius, damage: 70 });
  assert.deepEqual(advanceThreat(runtime, 8, { maxHp: 1000, playerX: 100, playerY: 200, safe: true }), []);
});

test("0.8.80：潮汐每 7 秒减速 1.6 秒，安全区不触发", () => {
  const runtime = createThreatRuntime({ id: "tide" });
  assert.deepEqual(advanceThreat(runtime, 6.9, { maxHp: 1000 }), []);
  const [event] = advanceThreat(runtime, 0.1, { maxHp: 1000 });
  assert.deepEqual(event, { kind: "tide", duration: 1.6, factor: 0.65 });
  assert.deepEqual(advanceThreat(runtime, 7, { maxHp: 1000, safe: true }), []);
});

test("0.8.80：矿尘 / 腐雾倍率只在野外生效", () => {
  const dust = createThreatRuntime({ id: "dust" });
  assert.equal(threatDamageMultiplier(dust), THREAT_RULES.dust.damageMult);
  assert.equal(threatDamageMultiplier(dust, true), 1);
  const rot = createThreatRuntime({ id: "rot" });
  assert.equal(threatPotionMultiplier(rot), THREAT_RULES.rot.potionMult);
  assert.equal(threatPotionMultiplier(rot, true), 1);
  assert.equal(threatHealMultiplier(rot), THREAT_RULES.rot.healMult);
  assert.equal(threatHealMultiplier(rot, true), 1);
  assert.equal(threatHealMultiplier(dust), 1);
});
