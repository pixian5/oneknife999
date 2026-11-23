// 纯函数单元测试：0.8.81 死亡保留普通怪已损生命。
import test from "node:test";
import assert from "node:assert/strict";
import { restoreDamagedAbyssMonsters } from "../../game/src/runtime.js";

const mob = (id, hp, maxHp = 1000) => ({ id, hp, maxHp, alive: true, boss: false, friendly: false, npc: false });
const boss = (id, hp, maxHp = 5000) => ({ id, hp, maxHp, alive: true, boss: true });

test("restoreDamagedAbyssMonsters：保留存活受伤普通怪的一半已损生命", () => {
  const previous = [mob("mob-1", 600), mob("mob-2", 1000), mob("mob-3", 400)];
  const next = [mob("mob-1", 1000), mob("mob-2", 1000), mob("mob-3", 1000)];
  assert.equal(restoreDamagedAbyssMonsters(next, previous, 0.5), 2);
  assert.equal(next[0].hp, 800, "已损 400，保留一半伤害");
  assert.equal(next[1].hp, 1000, "满血怪不变");
  assert.equal(next[2].hp, 700, "已损 600，保留一半伤害");
});

test("restoreDamagedAbyssMonsters：ratio=0 时恢复旧行为（全部满血）", () => {
  const previous = [mob("mob-1", 600)];
  const next = [mob("mob-1", 1000)];
  assert.equal(restoreDamagedAbyssMonsters(next, previous, 0), 0);
  assert.equal(next[0].hp, 1000);
});

test("restoreDamagedAbyssMonsters：不碰 Boss、友军、NPC、召唤物与已死怪", () => {
  const previous = [
    boss("boss-1", 2000),
    mob("mob-1", 600),
    { ...mob("mob-2", 300), friendly: true },
    { ...mob("mob-3", 300), npc: true },
    { ...mob("mob-4", 300), summoned: true },
    { ...mob("mob-5", 300), alive: false }
  ];
  const next = [boss("boss-1", 5000), mob("mob-1", 1000), mob("mob-2", 1000), mob("mob-3", 1000), mob("mob-4", 1000), mob("mob-5", 1000)];
  assert.equal(restoreDamagedAbyssMonsters(next, previous, 0.5), 1, "只有 mob-1 应被恢复");
  assert.equal(next[0].hp, 5000, "Boss 不在此函数处理");
  assert.equal(next[1].hp, 800);
  assert.equal(next[2].hp, 1000);
  assert.equal(next[3].hp, 1000);
  assert.equal(next[4].hp, 1000);
  assert.equal(next[5].hp, 1000, "已死怪不复活、不保留");
});

test("restoreDamagedAbyssMonsters：空表 / 缺参数安全", () => {
  assert.equal(restoreDamagedAbyssMonsters(null, [], 0.5), 0);
  assert.equal(restoreDamagedAbyssMonsters([mob("mob-1", 1000)], null, 0.5), 0);
  assert.equal(restoreDamagedAbyssMonsters([mob("mob-1", 1000)], [], 0.5), 0);
});
