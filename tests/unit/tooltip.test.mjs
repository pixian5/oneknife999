// 0.8.49 回归：点击普攻/技能后，悬浮说明必须被抑制样式隐藏。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const input = readFileSync(new URL("../../game/src/input.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../game/game.css", import.meta.url), "utf8");

test("普攻与技能点击后加上 tooltip-suppressed", () => {
  assert.match(input, /normalAttackBtn"\)\.classList\.add\("tooltip-suppressed"\)/);
  assert.match(input, /button\.classList\.add\("tooltip-suppressed"\)/);
});

test("tooltip-suppressed 时隐藏说明，移出按钮清理状态", () => {
  assert.match(css, /\.skill-button\.tooltip-suppressed \.skill-tooltip/);
  assert.match(css, /\.normal-attack-button\.tooltip-suppressed \.skill-tooltip/);
  assert.match(input, /normalAttackBtn"\)\.classList\.remove\("tooltip-suppressed"\)/);
  assert.match(input, /button\.classList\.remove\("tooltip-suppressed"\)/);
});
