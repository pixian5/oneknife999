// 0.8.43 真人试玩修复的源码契约：锁定命中区、射程提示、首杀保底掉落、重生间隔。
// 这些行为跨 input/main/render 三处，用源码契约防止后续重构把玩家反馈又改回去。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const input = readFileSync(new URL("../../game/src/input.js", import.meta.url), "utf8");
const main = readFileSync(new URL("../../game/src/main.js", import.meta.url), "utf8");
const render = readFileSync(new URL("../../game/src/render.js", import.meta.url), "utf8");

test("点击锁定按立绘胶囊判定而非只按脚底半径", () => {
  assert.match(input, /function entityClickHit\s*\(point, entity\)/);
  assert.match(input, /spriteHeight\(entity\) \* 0\.62/);
  const pad = input.match(/< entity\.radius \+ (\d+)/);
  assert.ok(pad, "胶囊命中要有横向补值");
  assert.ok(Number(pad[1]) >= 30, `补值 ${pad[1]} 太小，点立绘边缘仍会变成走位`);
  assert.match(input, /\.find\(\(entity\) => entityClickHit\(point, entity\)\)/);
});

test("悬停可锁定目标时给 pointer 光标", () => {
  assert.match(input, /canvas\.style\.cursor = hovered \? "pointer"/);
});

test("普攻无目标时报告最近敌人距离", () => {
  assert.match(main, /最近的 \$\{nearest\.name\} 距离 \$\{dist\}/);
  assert.match(main, /进入 \$\{hero\.range\} 内才出手/);
});

test("目标栏同时显示血量、距离与射程状态", () => {
  assert.match(render, /距 \$\{dist\}/);
  assert.match(render, /超射程 \$\{range\}/);
});

test("首杀保底掉落只触发一次", () => {
  assert.match(main, /guideFirstKill/);
  assert.match(main, /guideKillDrop/);
  assert.match(main, /Math\.max\(1, rollDropCount\(target\)\)/);
});

test("普通怪重生间隔不低于 28 秒", () => {
  const respawn = main.match(/target\.boss \? 42 : target\.npc \? 90 : rand\((\d+), (\d+)\)/);
  assert.ok(respawn, "重生赋值存在");
  assert.ok(Number(respawn[1]) >= 28, `重生下限 ${respawn[1]} 太快`);
});
