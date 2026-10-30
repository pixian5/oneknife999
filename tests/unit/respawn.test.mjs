// 纯函数单元测试：复活保留首领已损失生命（0.4.2 runtime.restoreDamagedBoss）。
// 背景：死亡复活会重建实体表（createEntities），此前首领一律满血重置，
// 玩家一次失误就要把整条首领血条重打一遍，也是难度探针 0/1/5 死波动的来源。
import test from "node:test";
import assert from "node:assert/strict";
import { restoreDamagedBoss, createDiagnostics, createState } from "../../game/src/runtime.js";

const boss = (hp, maxHp) => ({ id: "boss-1", boss: true, alive: true, hp, maxHp });

test("restoreDamagedBoss：受伤首领回填已损失生命，普通怪不受影响", () => {
  const previous = [boss(300, 900), { id: "mob-1", boss: false, alive: true, hp: 10, maxHp: 120 }];
  const next = [boss(900, 900), { id: "mob-2", boss: false, alive: true, hp: 120, maxHp: 120 }];
  assert.equal(restoreDamagedBoss(next, previous), true);
  assert.equal(next[0].hp, 300);
  // 普通怪在新表里仍是满血（不参与回填）
  assert.equal(next[1].hp, 120);
});

test("restoreDamagedBoss：首领满血时不动，返回 false", () => {
  const next = [boss(900, 900)];
  assert.equal(restoreDamagedBoss(next, [boss(900, 900)]), false);
  assert.equal(next[0].hp, 900);
});

test("restoreDamagedBoss：首领已阵亡时不复活它，新首领保持满血", () => {
  const previous = [{ id: "boss-1", boss: true, alive: false, hp: 0, maxHp: 900 }];
  const next = [boss(900, 900)];
  assert.equal(restoreDamagedBoss(next, previous), false);
  assert.equal(next[0].hp, 900);
});

test("restoreDamagedBoss：旧表没有首领或新表缺少首领时安全返回 false", () => {
  assert.equal(restoreDamagedBoss([boss(900, 900)], []), false);
  assert.equal(restoreDamagedBoss([], [boss(120, 900)]), false);
  assert.equal(restoreDamagedBoss([boss(900, 900)], null), false);
});

test("restoreDamagedBoss：回填生命被夹在新表上限内，至少保留 1 点", () => {
  const next = [boss(500, 500)];
  assert.equal(restoreDamagedBoss(next, [boss(880, 900)]), true);
  assert.equal(next[0].hp, 500);
  const next2 = [boss(500, 500)];
  assert.equal(restoreDamagedBoss(next2, [boss(0.2, 900)]), true);
  assert.equal(next2[0].hp, 1);
});

// 0.8.6：承伤来源诊断容器必须每次新建——复用一个对象会让「换图 / 重开」后旧数据残留。
test("createDiagnostics：形状完整且每次返回独立对象", () => {
  const first = createDiagnostics();
  assert.deepEqual(first.damage, { monster: 0, hazard: 0, poison: 0 });
  assert.deepEqual(first.hits, { monster: 0, hazard: 0, poison: 0 });
  assert.deepEqual(first.hazards, {});
  assert.deepEqual(first.deaths, []);
  first.damage.hazard = 999;
  first.deaths.push({ killer: "地面危险区" });
  const second = createDiagnostics();
  assert.equal(second.damage.hazard, 0);
  assert.equal(second.deaths.length, 0);
});

test("createState：新档自带诊断容器，且不写入玩家数据", () => {
  const state = createState("warrior");
  assert.ok(state.diagnostics, "缺少 diagnostics");
  assert.equal(state.diagnostics.deaths.length, 0);
  assert.equal(JSON.stringify(state.player).includes("diagnostics"), false, "诊断不应进入玩家数据（避免写档）");
});
