// 纯函数单元测试：资产解析层。核心目的：防止「地图数据名 → 素材文件名」再次脱节，
// 导致运行时 404 并静默回退几何图形。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MAPS, MAP_ORDER } from "../../game/src/maps.js";
import {
  ACTION_MONSTERS,
  MONSTER_ALIASES,
  BOSS_PORTRAITS,
  ARENA_ELITE_PORTRAITS,
  resolveMonsterSpriteName,
  resolveBossSprite,
  resolveBossUiPortrait,
  resolveMapBackgroundName
} from "../../game/src/assets.js";

const ASSETS = new URL("../../game/assets/", import.meta.url);
const exists = (name) => Boolean(name) && fs.existsSync(new URL(name, ASSETS));
const ALL_MAPS = MAP_ORDER.map((id) => MAPS[id]);

test("别名表：目标物种全部在 50 个动作帧物种内", () => {
  for (const [base, target] of Object.entries(MONSTER_ALIASES)) {
    assert.ok(ACTION_MONSTERS.has(target), `${base} → ${target} 不在 ACTION_MONSTERS`);
  }
});

test("普通怪：106 个地图怪物名 × 四动作全部解析到真实文件", () => {
  const actions = ["idle", "walk", "attack", "hit"];
  const names = new Set();
  ALL_MAPS.forEach((map) => {
    map.monsterTypes.forEach((type) => {
      names.add(type.name);
      actions.forEach((action) => {
        const name = resolveMonsterSpriteName(type.name, action, map);
        assert.ok(exists(name), `${map.id} / ${type.name} / ${action} 贴图不存在：${name}`);
      });
    });
  });
  assert.equal(names.size, 106, "地图怪物名应为 106 个");
});

test("Boss：100 个 Boss 都有战场贴图与情报头像", () => {
  ALL_MAPS.forEach((map) => {
    const sprite = resolveBossSprite(map);
    assert.ok(sprite && exists(sprite.path), `${map.id} Boss 战场贴图不存在：${sprite?.path}`);
    if (BOSS_PORTRAITS.has(map.boss.name)) assert.equal(sprite.tint, null);
    else assert.ok(sprite.tint, `${map.id} 通用领主应叠章节色调`);
    const portrait = resolveBossUiPortrait(map);
    assert.ok(exists(portrait), `${map.id} Boss 情报头像不存在：${portrait}`);
  });
});

test("每图底图：100 张地图都解析到真实 map-cXX-YY.jpg", () => {
  ALL_MAPS.forEach((map) => {
    const name = resolveMapBackgroundName(map);
    assert.match(name, /^map-c\d{2}-\d{2}\.jpg$/);
    assert.ok(exists(name), `${map.id} 底图不存在：${name}`);
  });
});

test("精英立绘：10 个场所母题全部有真实 PNG", () => {
  for (const name of Object.values(ARENA_ELITE_PORTRAITS)) {
    assert.ok(exists(`monster-full-精英-${name}.png`), `精英立绘不存在：${name}`);
  }
});
