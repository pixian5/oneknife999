// 纯函数单元测试：0.8.83 死亡后普通怪最高保留 50% 最大生命，且只降不升。
import test from "node:test";
import assert from "node:assert/strict";
import { restoreDamagedAbyssMonsters } from "../../game/src/runtime.js";

const mob = (id, hp, maxHp = 1000) => ({ id, hp, maxHp, alive: true, boss: false, friendly: false, npc: false });
const boss = (id, hp, maxHp = 5000) => ({ id, hp, maxHp, alive: true, boss: true });

test("restoreDamagedAbyssMonsters：死亡后压到 50% 最大生命，且只降不升", () => {
  const previous = [mob("mob-1", 600), mob("mob-2", 1000), mob("mob-3", 400)];
  const next = [mob("mob-1", 1000), mob("mob-2", 1000), mob("mob-3", 1000)];
  assert.equal(restoreDamagedAbyssMonsters(next, previous, 0.5), 2);
  assert.equal(next[0].hp, 500, "600/1000 应压到 500");
  assert.equal(next[1].hp, 1000, "满血怪不变");
  assert.equal(next[2].hp, 400, "400 已低于 500，保持 400，不回升");
});

test("restoreDamagedAbyssMonsters：重复死亡不会把普通怪回血（0.8.83 回归）", () => {
  const previous = [mob("mob-1", 8302, 21828), mob("mob-2", 17361, 21828)];
  const next = [mob("mob-1", 21828, 21828), mob("mob-2", 21828, 21828)];
  assert.equal(restoreDamagedAbyssMonsters(next, previous, 0.5), 2);
  assert.equal(next[0].hp, 8302, "8302 低于 10914，保持 8302，不能回到 17361");
  assert.equal(next[1].hp, 10914, "17361 高于 10914，压到 10914，不能回到满血");
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
  assert.equal(next[1].hp, 500);
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
