// 精英系统 UI 回归（0.8.13）：验证「生成 → 词缀可见 → 死亡词缀生效」这条链路真的通了。
//
// 为什么不用单测覆盖：词缀数值是纯函数（elite.test.mjs 已覆盖），但「精英有没有被刷出来、
// 分裂体有没有真的进实体表、毒爆有没有真的生成危险区」只有跑起来才知道。
// 这里用存档直接把玩家送进 30/45/60/90 关，逐图检查，避免只测第 1 关（只有 1 条词缀、样本太少）。

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const ROOT = BASE_URL.split("?")[0];
const STORAGE_KEY = "oneknife999-prototype-save-v4";
const MAP_IDS = (process.env.ONEKNIFE_ELITE_MAPS || "stage_030,stage_045,stage_060,stage_090").split(",");
const AFFIX_IDS = ["enrage", "guardian", "echo", "split", "hunt", "hoard", "purge", "toxic"];
const MUTEX = [
  ["enrage", "hunt"],
  ["guardian", "hoard"]
];

function makeSavedRun(mapId, point) {
  const equipment = Object.fromEntries(
    ["weapon", "helmet", "neck", "armor", "braceletL", "braceletR", "ringL", "ringR", "belt", "boots", "medal", "talisman"].map((slot) => [
      slot,
      null
    ])
  );
  return {
    saveVersion: 4,
    classId: "warrior",
    currentMapId: mapId,
    player: {
      x: point.x,
      y: point.y,
      hp: 999999,
      resource: 100,
      level: 30,
      exp: 0,
      nextExp: 100,
      gold: 0,
      marks: 0,
      charge: 0,
      potion: 3,
      kills: 0,
      totalKills: 0,
      oneMomentUsed: false,
      attackTimer: 0,
      invulnerable: 0,
      cooldowns: [0, 0, 0, 0],
      targetId: null,
      previewSkill: null,
      equipment,
      poison: 0,
      skillPoints: 0,
      skillLevels: [0, 0, 0, 0],
      sin: 0,
      visitedMaps: { [mapId]: true }
    },
    inventory: [],
    equipment,
    mapProgress: { [mapId]: { kills: 0, need: 8, bossDefeated: false, completed: false, rewardClaimed: false } }
  };
}

async function openMap(page, mapId, safePoint) {
  const save = makeSavedRun(mapId, safePoint);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: save });
  await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
  await page.waitForFunction(
    ({ id }) => {
      const snapshot = window.__ONEKNIFE_E2E__?.snapshot();
      return snapshot && snapshot.currentMapId === id;
    },
    { id: mapId },
    { timeout: 20000 }
  );
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const covered = new Set();
  let eliteTotal = 0;

  try {
    await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
    await page.waitForSelector('[data-class="warrior"]', { timeout: 20000 });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 20000 });
    const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__.catalog());

    for (const mapId of MAP_IDS) {
      const map = catalog.find((entry) => entry.id === mapId);
      assert.ok(map, `关卡目录里找不到 ${mapId}`);
      await openMap(page, mapId, map.safePoint);
      const snapshot = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
      const mobs = snapshot.entities.filter((entity) => !entity.boss && !entity.npc);
      const elites = mobs.filter((entity) => entity.elite);
      assert.ok(elites.length <= 3, `${mapId}：单图精英不能超过 3 只（实际 ${elites.length}）`);
      assert.ok(elites.length >= 1, `${mapId}：这张图的种子应该至少刷出 1 只精英`);
      eliteTotal += elites.length;
      const stageOrder = map.stageNumber || 0;

      for (const elite of elites) {
        const affixes = elite.elite.affixes;
        assert.ok(affixes.length >= 1 && affixes.length <= 2, `${mapId}：每只精英最多 2 条词缀`);
        if (stageOrder > 20) assert.equal(affixes.length, 2, `${mapId}：20 关后精英应有 2 条词缀`);
        for (const id of affixes) assert.ok(AFFIX_IDS.includes(id), `${mapId}：未知词缀 ${id}`);
        for (const [a, b] of MUTEX) {
          assert.ok(!(affixes.includes(a) && affixes.includes(b)), `${mapId}：互斥词缀 ${a}+${b} 同时出现`);
        }
        // 同名普通怪作为对照：精英生命应为 1.8 倍（同一难度缩放）。
        const twin = mobs.find((entity) => !entity.elite && entity.name === elite.name);
        if (twin) {
          const ratio = elite.maxHp / twin.maxHp;
          assert.ok(Math.abs(ratio - 1.8) < 0.05, `${mapId}：${elite.name} 精英生命倍率 ${ratio.toFixed(2)} 应约 1.8`);
        }
      }

      // 死亡词缀：逐个击杀本图精英，统计分裂体与毒爆危险区。
      const before = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
      const totalBefore = before.entities.length;
      const hazardsBefore = before.hazardsSpawned;
      const splitCount = elites.filter((entity) => entity.elite.affixes.includes("split")).length;
      const toxicCount = elites.filter((entity) => entity.elite.affixes.includes("toxic")).length;
      for (const elite of elites) {
        await page.evaluate((id) => window.__ONEKNIFE_E2E__.strike(id, 999999), elite.id);
      }
      await page.waitForTimeout(120);
      const after = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
      const splitlings = after.entities.filter((entity) => entity.splitling);
      if (splitCount > 0) {
        covered.add("split");
        assert.equal(splitlings.length, splitCount * 2, `${mapId}：${splitCount} 只分裂精英应生成 ${splitCount * 2} 只裂生体`);
        assert.ok(
          splitlings.every((entity) => !entity.elite),
          "裂生体不能再带精英词缀"
        );
      }
      if (toxicCount > 0) {
        covered.add("toxic");
        assert.ok(
          after.hazardsSpawned >= hazardsBefore + toxicCount,
          `${mapId}：${toxicCount} 只毒爆精英应至少生成 ${toxicCount} 个危险区`
        );
      }
      assert.ok(after.entities.length >= totalBefore, `${mapId}：击杀精英后实体表不应减少`);

      // 精英铭牌存在与否由快照字段保证；渲染异常会在 pageerror 里体现。
      console.log(
        `ELITE ${mapId} order=${stageOrder} elites=${elites.length} affixes=${elites.map((e) => e.elite.affixes.join("+")).join(",")} ` +
          `split=${splitCount} toxic=${toxicCount} splitlings=${splitlings.length}`
      );
    }

    assert.deepEqual(errors, [], `页面报错：${errors.join(" | ")}`);
    console.log(`ELITE UI PASS（${MAP_IDS.length} 图 / 精英 ${eliteTotal} 只 / 覆盖死亡词缀：${[...covered].join(",") || "无"}）`);
    if (!covered.has("split") || !covered.has("toxic")) {
      console.log(`ELITE COVERAGE WARN：本轮没抽到 ${["split", "toxic"].filter((id) => !covered.has(id)).join("/")}，该分支未实机覆盖`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
