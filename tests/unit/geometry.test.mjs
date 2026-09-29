// 纯函数单元测试：几何工具。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import { seededRandom, cubicPoint, distanceToPath, pathLength, pointOnPath, routePoint } from "../../game/src/geometry.js";

// 一条水平直线路径（两段贝塞尔，起点 0,0 终点 600,0），便于手算期望值。
// 注意：地图路径统一使用 14 个数值（两段曲线），单段路径不受 pointOnPath 支持。
const STRAIGHT = [0, 0, 100, 0, 200, 0, 300, 0, 400, 0, 500, 0, 600, 0];

test("seededRandom：相同种子产生相同序列，不同种子产生不同序列", () => {
  const first = seededRandom(42);
  const second = seededRandom(42);
  const other = seededRandom(43);
  const firstValues = Array.from({ length: 5 }, () => first());
  const secondValues = Array.from({ length: 5 }, () => second());
  assert.deepEqual(firstValues, secondValues);
  assert.notDeepEqual(firstValues, Array.from({ length: 5 }, () => other()));
  for (const value of firstValues) assert.ok(value >= 0 && value < 1, `随机值应在 [0,1)：${value}`);
});

test("cubicPoint：端点为 t=0 与 t=1 的控制结果", () => {
  const start = cubicPoint(0, 0, 10, 10, 20, 10, 30, 0, 0);
  const end = cubicPoint(0, 0, 10, 10, 20, 10, 30, 0, 1);
  assert.deepEqual(start, { x: 0, y: 0 });
  assert.deepEqual(end, { x: 30, y: 0 });
});

test("pathLength：直线路径长度接近几何长度且可复现", () => {
  const length = pathLength(STRAIGHT);
  assert.ok(Math.abs(length - 600) < 1, `期望约 600，实际 ${length}`);
  assert.equal(length, pathLength(STRAIGHT));
});

test("pointOnPath：进度 0 与 1 落在路径两端", () => {
  const start = pointOnPath(STRAIGHT, 0);
  const middle = pointOnPath(STRAIGHT, 0.5);
  const end = pointOnPath(STRAIGHT, 1);
  assert.deepEqual(start, { x: 0, y: 0 });
  assert.ok(Math.abs(middle.x - 300) < 1, `中点 x 期望约 300，实际 ${middle.x}`);
  assert.ok(Math.abs(end.x - 600) < 1, `终点 x 期望约 600，实际 ${end.x}`);
});

test("routePoint：横向偏移沿路径法线方向", () => {
  const point = routePoint(STRAIGHT, 0.5, 10);
  assert.ok(Math.abs(point.x - 300) < 1, `x 不应因横向偏移改变：${point.x}`);
  assert.ok(Math.abs(point.y - 10) < 1, `水平路径的正向偏移应落在 +y：${point.y}`);
});

test("distanceToPath：点到路径的最短距离", () => {
  assert.ok(Math.abs(distanceToPath({ x: 300, y: 40 }, STRAIGHT) - 40) < 1);
  assert.ok(Math.abs(distanceToPath({ x: 0, y: 0 }, STRAIGHT)) < 1);
  assert.ok(Math.abs(distanceToPath({ x: -60, y: 0 }, STRAIGHT) - 60) < 1);
});