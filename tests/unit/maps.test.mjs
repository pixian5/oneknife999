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

test("数值衔接：第 5 关怪物与装备不低于第 4 关水平（关4→5 无断崖）", () => {
  const fourth = MAPS.red_sand_desert;
  const fifth = MAPS.stage_005;
  const mobAttacks = (map) => map.monsterTypes.map((type) => type.attack);
  const mobHps = (map) => map.monsterTypes.map((type) => type.hp);
  const bestPower = (map, slot) => Math.max(0, ...map.drops.filter((drop) => drop.slot === slot).map((drop) => drop.power));
  // 第 5 关怪攻区间应覆盖第 4 关区间（衔接而非跌落），Boss 攻击不下降。
  assert.ok(Math.min(...mobAttacks(fifth)) <= Math.max(...mobAttacks(fourth)), "第 5 关最低怪攻应与第 4 关最高值衔接");
  assert.ok(Math.max(...mobAttacks(fifth)) >= Math.max(...mobAttacks(fourth)) - 2, "第 5 关最高怪攻不应明显低于第 4 关");
  assert.ok(Math.min(...mobHps(fifth)) >= Math.min(...mobHps(fourth)) - 6, "第 5 关怪血不应低于第 4 关");
  assert.ok(fifth.boss.attack >= fourth.boss.attack - 2 && fifth.boss.hp >= fourth.boss.hp, "第 5 关 Boss 数值应与第 4 关衔接");
  // 装备 power 不再倒退：第 5 关掉落不低于第 4 关（容差 4）。
  for (const slot of ["weapon", "neck", "boots"])
    assert.ok(
      bestPower(fifth, slot) >= bestPower(fourth, slot) - 4,
      `第 5 关 ${slot} power 不应倒退：${bestPower(fifth, slot)} vs ${bestPower(fourth, slot)}`
    );
  // 第 100 关峰值与旧曲线设计值一致（怪攻 123 / Boss 血 9480 / 武器 210）。
  const hundredth = MAPS.stage_100;
  assert.equal(Math.max(...mobAttacks(hundredth)), 123);
  assert.equal(hundredth.boss.hp, 9480);
  assert.equal(bestPower(hundredth, "weapon"), 210);
});

test("分段计数：encounterBands 声明与实际刷怪营位一致（生成图）", () => {
  for (const map of ALL_MAPS.slice(4)) {
    assert.ok(map.encounterBands.length >= 3, `${map.id} 分段缺失`);
    for (const band of map.encounterBands) {
      const actual = map.monsterSpawns.filter(
        ([, , , route, progress]) => route === band.route && progress >= band.from && progress <= band.to
      ).length;
      assert.equal(actual, band.count, `${map.id}/${band.id} 声明 ${band.count} 只、实际 ${actual} 只`);
      assert.ok(band.count >= 1, `${map.id}/${band.id} 分段为空`);
    }
  }
  // 手工图 spawn 无 progress 元组，只校验分段计数总和等于刷怪数。
  for (const map of ALL_MAPS.slice(0, 4)) {
    const total = map.encounterBands.reduce((sum, band) => sum + band.count, 0);
    assert.equal(total, map.monsterSpawns.length, `${map.id} 手工图分段计数与刷怪数不一致`);
  }
});

test("生成怪命名不重复拼接章节前缀", () => {
  for (const map of ALL_MAPS.slice(4)) {
    const short = CHAPTERS[map.chapter - 1].short;
    for (const type of map.monsterTypes)
      assert.ok(!type.name.slice(short.length).startsWith(short), `${map.id} 怪物名前缀重复：${type.name}`);
  }
});
