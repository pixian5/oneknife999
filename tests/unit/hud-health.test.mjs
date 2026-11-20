// 0.8.51 契约：侧栏必须显示当前/最大生命，并随受伤更新，不能只显示最大生命。
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../../game/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../../game/game.css", import.meta.url), "utf8");
const render = readFileSync(new URL("../../game/src/render.js", import.meta.url), "utf8");

test("HUD 有独立生命条与当前/最大文本", () => {
  assert.match(html, /id="hpBar"/);
  assert.match(css, /\.meter\.hp\s+span/);
  assert.match(render, /setText\(\$\("hpStat"\), `\$\{formatNumber\(hpNow\)\} \/ \$\{formatNumber\(hpMax\)\}`\)/);
  assert.match(render, /setStyle\(\$\("hpBar"\), "width"/);
  assert.match(render, /hpNow,\n\s+hpMax,/);
});
