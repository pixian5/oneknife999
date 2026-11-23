// 0.8.48 回归：320/360 窄屏目标栏必须允许两行，否则“自动接近中”会被省略号吃掉。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../game/game.css", import.meta.url), "utf8");

test("窄屏目标栏启用两行并限制为两行", () => {
  const block = css.slice(css.indexOf("@media (max-width: 380px)"));
  assert.ok(block, "缺少 380px 窄屏媒体查询");
  // 0.8.75：目标栏新增破甲状态容器后，targetHint 不再是最后一个子元素；
  // 选择器改用 id，窄屏两行规则跟随，避免被 span:last-child 失效。
  assert.match(block, /\.target-block #targetHint\s*\{[\s\S]*?white-space:\s*normal/);
  assert.match(block, /-webkit-line-clamp:\s*2/);
  assert.match(block, /-webkit-box-orient:\s*vertical/);
});
