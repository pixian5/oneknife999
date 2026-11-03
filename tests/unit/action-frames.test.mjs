// 纯函数单元测试：动作帧选择（render.js 导出的 monsterAction / playerSpriteAction）。
// 0.6.0 P1：怪物四动作、玩家六动作的状态判定，保证「打人时是 attack 帧、走路时是 walk 帧」。
// 说明：render.js 在模块顶层访问 document，测试里用最小 DOM 桩隔离（仅节点查询与 canvas 上下文）。
import test from "node:test";
import assert from "node:assert/strict";

// ---- 最小 DOM / Canvas 桩：只为让 render.js 能 import，不参与断言 ----
const noop = () => {};
const makeEl = () => ({
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: {},
  dataset: {},
  textContent: "",
  innerHTML: "",
  title: "",
  clientWidth: 1200,
  clientHeight: 700,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 700 }),
  addEventListener: noop,
  querySelectorAll: () => [],
  querySelector: () => null,
  getContext: () => new Proxy({}, { get: () => () => ({}) })
});
globalThis.document = {
  getElementById: makeEl,
  querySelector: makeEl,
  querySelectorAll: () => [],
  createElement: makeEl,
  addEventListener: noop
};
globalThis.window = { devicePixelRatio: 1, addEventListener: noop, location: { search: "", hostname: "127.0.0.1" } };
globalThis.performance = globalThis.performance || { now: () => 0 };

const { monsterAction, playerSpriteAction } = await import("../../game/src/render.js");

test("monsterAction：受击 > 前摇 > 出手 > 移动 > 待机", () => {
  assert.equal(monsterAction({ hitFlash: 0.1 }), "hit", "受击优先");
  assert.equal(monsterAction({ windup: 0.2, windupTotal: 0.45 }), "attack", "前摇中");
  assert.equal(monsterAction({ attackCooldown: 0.2 }), "attack", "出手瞬间");
  assert.equal(monsterAction({ attackCooldown: 1.5, moving: true }), "walk", "冷却中且在移动");
  assert.equal(monsterAction({ attackCooldown: 1.5 }), "idle", "静止待机");
  assert.equal(monsterAction({}), "idle", "空实体不抛错");
});

test("playerSpriteAction：死亡 > 受击 > 施法 > 普攻 > 移动 > 待机", () => {
  assert.equal(playerSpriteAction({ hp: 0 }), "death");
  assert.equal(playerSpriteAction({ hp: 100, hitFlash: 0.1 }), "hit");
  assert.equal(playerSpriteAction({ hp: 100, castTimer: 0.2 }), "cast");
  assert.equal(playerSpriteAction({ hp: 100, attackTimer: 0.3 }), "attack");
  assert.equal(playerSpriteAction({ hp: 100, moving: true }), "walk");
  assert.equal(playerSpriteAction({ hp: 100 }), "idle");
  assert.equal(playerSpriteAction({}), "idle", "缺字段不抛错");
});
