// 0.8.54 契约：第一关首领必须是 Lv2 无装备可开荒的入门首领，且小怪提示半径与冻结区一致。
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const maps = readFileSync(new URL("../../game/src/maps.js", import.meta.url), "utf8");
const render = readFileSync(new URL("../../game/src/render.js", import.meta.url), "utf8");

test("第一关首领 720 HP / 30 攻 / 12 防", () => {
  const block = maps.slice(maps.indexOf('name: "裂碑领主"'), maps.indexOf("drops:", maps.indexOf('name: "裂碑领主"')));
  assert.match(block, /hp: 720/);
  assert.match(block, /attack: 30/);
  assert.match(block, /defense: 12/);
});

test("小怪提示半径与首领战冻结半径一致为 260", () => {
  assert.match(render, /distance\(entity, boss\) < 260/);
  assert.match(render, /首领附近还有 \$\{adds\} 只小怪/);
});
