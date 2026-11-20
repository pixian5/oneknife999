// 装备图标路径契约（0.8.42）
// 背景：左右手镯/戒指共用一张图，但 0.8.42 之前只有装备面板做了映射，
// 商店/重铸各写各的，实玩跑到深层拿到戒指后，页面会去请求不存在的
// assets/equip-ringL.png（实测一次百关跑出 10+ 次 404）。
// 这里用源码契约把「所有装备图标都必须经过 equipIconKey」钉死。
import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "game", "src", "render.js"), "utf8");

test("equipIconKey 覆盖左右手镯与左右戒指", () => {
  const body = source.match(/function equipIconKey\(slot\) \{[\s\S]*?\n\}/);
  assert.ok(body, "render.js 必须定义 equipIconKey(slot)");
  for (const slot of ["braceletL", "braceletR"]) assert.ok(body[0].includes(`"${slot}"`), `缺少 ${slot} 映射`);
  for (const slot of ["ringL", "ringR"]) assert.ok(body[0].includes(`"${slot}"`), `缺少 ${slot} 映射`);
  assert.ok(body[0].includes('"bracelet"') && body[0].includes('"ring"'), "必须复用 bracelet / ring 图标");
});

test("装备图标不再直接用 slot 拼路径", () => {
  // 允许 equipIconKey(...) 包裹，禁止裸 slotKey / def.slot 拼 equip-*
  const bare = [...source.matchAll(/assets\/equip-\$\{(?!equipIconKey\(|iconKey|invIcon).*?\}/g)].map((m) => m[0]);
  assert.deepEqual(bare, [], `发现未经过 equipIconKey 的装备图标路径：${bare.join(", ")}`);
});
