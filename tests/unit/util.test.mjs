// 纯函数单元测试：通用工具（util.js）。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { weightedPick } from "../../game/src/util.js";

test("weightedPick：按权重区间命中对应条目", () => {
  const pool = [
    { item: "A", weight: 36 },
    { item: "B", weight: 24 },
    { item: "C", weight: 20 }
  ];
  // 总权重 80：roll=0.5 → 40，越过 A(36) 落在 B(24)。
  assert.equal(
    weightedPick(pool, () => 0.5),
    "B"
  );
  assert.equal(
    weightedPick(pool, () => 0),
    "A"
  );
  assert.equal(
    weightedPick(pool, () => 0.999),
    "C",
    "接近 1 的 roll 应落在最后一个区间"
  );
});

test("weightedPick：零权重条目永远不会被命中", () => {
  const pool = [
    { item: "A", weight: 0 },
    { item: "B", weight: 10 }
  ];
  for (let index = 0; index < 20; index += 1) assert.equal(weightedPick(pool, Math.random), "B");
});

test("weightedPick：空池抛出清晰错误", () => {
  assert.throws(() => weightedPick([], Math.random), /权重池不能为空/);
});

test("weightedPick：负权重抛出清晰错误", () => {
  assert.throws(
    () =>
      weightedPick(
        [
          { item: "A", weight: -5 },
          { item: "B", weight: 3 }
        ],
        Math.random
      ),
    /非法权重/
  );
});

test("weightedPick：权重总和为零或非有限值抛出清晰错误", () => {
  assert.throws(
    () =>
      weightedPick(
        [
          { item: "A", weight: 0 },
          { item: "B", weight: 0 }
        ],
        Math.random
      ),
    /权重总和必须为正/
  );
  assert.throws(() => weightedPick([{ item: "A", weight: Number.NaN }], Math.random), /非法权重/);
});
