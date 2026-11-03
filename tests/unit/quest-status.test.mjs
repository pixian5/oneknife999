// 纯函数单元测试：任务链状态机（runtime.js 的 questStatus / chapterStats）。
// 运行方式：npm run test:unit。状态由 mapProgress + currentMapId 派生，无存档字段新增。
import test from "node:test";
import assert from "node:assert/strict";
import { state, setState, questStatus, chapterStats } from "../../game/src/runtime.js";
import { MAPS, MAP_ORDER } from "../../game/src/maps.js";

// 构造最小 state：state 初始为 null，需先 setState 初始化；后续直接改字段。
const makeState = ({ currentMapId, completedIds = [], partial = {} }) => {
  const mapProgress = {};
  for (const id of completedIds) mapProgress[id] = { completed: true, rewardClaimed: true, kills: 1, need: 1, bossDefeated: true };
  for (const [id, data] of Object.entries(partial))
    mapProgress[id] = { completed: false, rewardClaimed: false, kills: 0, need: 1, bossDefeated: false, ...data };
  if (!state) setState({});
  state.currentMapId = currentMapId;
  state.mapProgress = mapProgress;
};

test("questStatus：未完成且非当前关 = available", () => {
  makeState({ currentMapId: MAP_ORDER[1] });
  const result = questStatus(MAP_ORDER[0]);
  assert.equal(result.status, "available");
  assert.equal(result.completed, false);
});

test("questStatus：未完成且是当前关 = active", () => {
  makeState({ currentMapId: MAP_ORDER[1] });
  const result = questStatus(MAP_ORDER[1]);
  assert.equal(result.status, "active");
  assert.equal(result.completed, false);
});

test("questStatus：已通关 = completed 且含 rewardClaimed", () => {
  makeState({ currentMapId: MAP_ORDER[2], completedIds: [MAP_ORDER[0]] });
  const result = questStatus(MAP_ORDER[0]);
  assert.equal(result.status, "completed");
  assert.equal(result.completed, true);
  assert.equal(result.rewardClaimed, true);
});

test("questStatus：无任何进度记录时按 available 处理", () => {
  makeState({ currentMapId: MAP_ORDER[3] });
  state.mapProgress = {};
  const result = questStatus(MAP_ORDER[0]);
  assert.equal(result.status, "available");
});

test("chapterStats：统计当前章 10 关的完成数与完成状态", () => {
  // 第一章是 MAP_ORDER[0..9]，标记前 3 关完成。
  makeState({ currentMapId: MAP_ORDER[2], completedIds: MAP_ORDER.slice(0, 3) });
  const stats = chapterStats(0);
  assert.equal(stats.total, 10);
  assert.equal(stats.done, 3);
  assert.equal(stats.complete, false);
  assert.deepEqual(stats.ids, MAP_ORDER.slice(0, 10));
});

test("chapterStats：10 关全完成 = 章完成", () => {
  makeState({ currentMapId: MAP_ORDER[9], completedIds: MAP_ORDER.slice(0, 10) });
  const stats = chapterStats(0);
  assert.equal(stats.done, 10);
  assert.equal(stats.complete, true);
});

test("chapterStats：默认按当前关所在章计算", () => {
  makeState({ currentMapId: MAP_ORDER[15] }); // 第二章（索引 10-19）
  const stats = chapterStats();
  assert.equal(stats.chapterIndex, 1);
  assert.equal(stats.total, 10);
  assert.deepEqual(stats.ids, MAP_ORDER.slice(10, 20));
});
