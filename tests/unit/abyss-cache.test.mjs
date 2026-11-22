// 纯函数单元测试：深层 F31 以后补给箱药水数量（0.8.65）。
import test from "node:test";
import assert from "node:assert/strict";
import { abyssCachePotionGain } from "../../game/src/runtime.js";

test("补给箱药水：普通图恒为 1 瓶", () => {
  assert.equal(abyssCachePotionGain("ash_outskirts", 0), 1);
  assert.equal(abyssCachePotionGain("stage_100", 100), 1);
});

test("补给箱药水：深层 F30 及以前仍是 1 瓶", () => {
  assert.equal(abyssCachePotionGain("abyss-F1", 1), 1);
  assert.equal(abyssCachePotionGain("abyss-F30", 30), 1);
});

test("补给箱药水：深层 F31 以后变为 2 瓶", () => {
  assert.equal(abyssCachePotionGain("abyss-F31", 31), 2);
  assert.equal(abyssCachePotionGain("abyss-F40", 40), 2);
  assert.equal(abyssCachePotionGain("abyss-F99", 99), 2);
});

test("补给箱药水：异常参数安全回退为 1 瓶", () => {
  assert.equal(abyssCachePotionGain(null, 40), 1);
  assert.equal(abyssCachePotionGain("abyss-F40", "bad"), 1);
  assert.equal(abyssCachePotionGain("abyss-F40", -5), 1);
});
