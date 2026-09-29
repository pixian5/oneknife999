// 纯函数单元测试：地图数据契约与成长曲线。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAPS,
  MAP_ORDER,
  CHAPTERS,
  campaignGrowth,
  mapsPerLevel,
  generatedLayout,
  mapLayoutSignature,
  siteNodeDefinition,
  SITE_NODE_EFFECTS
} from "../../game/src/maps.js";

const ALL_MAPS = MAP_ORDER.map((id) => MAPS[id]);

test("地图目录：100 张唯一地图，前 4 张为手工地图", () => {
  assert.equal(MAP_ORDER.length, 100);
  assert.equal(new Set(MAP_ORDER).size, 100);
  assert.deepEqual(MAP_ORDER.slice(0, 4), ["ash_outskirts", "pine_forest", "black_rock_mine", "red_sand_desert"]);
  for (const id of MAP_ORDER) assert.ok(MAPS[id], `缺少地图数据：${id}`);
});

test("每张地图都有出口链、首领与剧情字段", () => {
  ALL_MAPS.forEach((map, index) => {
    assert.ok(map.exits.length >= 1, `${map.id} 缺少出口`);
    assert.ok(map.boss && map.boss.name && map.boss.hp > 0, `${map.id} 首领数据不完整`);
    assert.ok([2, 3].includes(map.boss.phases), `${map.id} 首领阶段数异常：${map.boss.phases}`);
    assert.ok(map.monsterSpawns.length >= 12, `${map.id} 刷怪点过少：${map.monsterSpawns.length}`);
    assert.equal(map.stageNumber, index + 1, `${map.id} 关卡序号不一致`);
    assert.ok(map.story?.chapterTitle && map.story?.objective && map.story?.dialogue, `${map.id} 剧情字段缺失`);
    assert.ok(map.landmarks.length > 0, `${map.id} 缺少地标`);
  });
});

test("每张地图固定三个战术节点：篝火、秘藏补给箱、场景节点", () => {
  ALL_MAPS.forEach((map) => {
    const kinds = map.tacticalPoints.map((point) => point.kind).sort();
    assert.deepEqual(kinds, ["resource", "rest", "site"], `${map.id} 战术节点异常`);
    for (const point of map.tacticalPoints) {
      assert.ok(point.radius > 0 && Number.isFinite(point.x) && Number.isFinite(point.y), `${map.id} 节点坐标异常`);
    }
  });
});

test("章节结构：十章、每章 10 图，章末地图战区更大", () => {
  assert.equal(CHAPTERS.length, 10);
  ALL_MAPS.forEach((map, index) => {
    const expectedChapter = Math.floor(index / 10) + 1;
    assert.equal(map.chapter, expectedChapter, `${map.id} 章节归属错误`);
  });
  const chapterEnd = MAPS.stage_010;
  const standard = MAPS.stage_009;
  assert.ok(chapterEnd.specialRect.w >= 620 && chapterEnd.specialRect.h >= 520, "章末战区未扩大");
  assert.ok(standard.specialRect.w <= 520 + 1, "普通地图战区不应等同于章末战区");
});

test("成长曲线：分段升级与文档基线一致（100 图 Lv.41）", () => {
  assert.equal(campaignGrowth(0).level, 1);
  assert.equal(campaignGrowth(10).level, 11);
  assert.equal(campaignGrowth(30).level, 21);
  assert.equal(campaignGrowth(60).level, 31);
  assert.equal(campaignGrowth(100).level, 41);
  assert.equal(mapsPerLevel(10), 1);
  assert.equal(mapsPerLevel(11), 2);
  assert.equal(mapsPerLevel(31), 3);
  assert.equal(mapsPerLevel(61), 4);
});

test("地图生成确定性：同关卡重复生成得到一致布局与签名", () => {
  const first = generatedLayout(50, CHAPTERS[4]);
  const second = generatedLayout(50, CHAPTERS[4]);
  assert.deepEqual(first, second);
  assert.equal(MAPS.stage_005.boss.x, 1976);
  assert.equal(MAPS.stage_005.boss.y, 833);
  assert.equal(mapLayoutSignature(MAPS.stage_050), mapLayoutSignature(MAPS.stage_050));
});

test("场景节点按十种场所母题轮转", () => {
  const effects = new Set();
  for (let stage = 1; stage <= 100; stage += 1) effects.add(siteNodeDefinition(stage).effect);
  assert.equal(effects.size, SITE_NODE_EFFECTS.length);
  assert.equal(effects.size, 10);
});
