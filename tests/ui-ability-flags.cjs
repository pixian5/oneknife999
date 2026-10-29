const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

// 细粒度行为开关回归（0.7.3，U-ABIL-02）：
// 难度探针用 `noabishapes / noabipassives / noabideath` 分别消融一类怪物行为，
// 这里证明三个开关真的独立生效，且不会误伤另外两类：
// 基准臂（松林图，同时含冲锋形态 / 毒与减速被动 / 孢子亡语）先记录每只怪的
// { attackShape, passives, onDeath } 签名，再逐臂对比——目标维度被关掉，其余维度必须逐只一致。
const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const ROOT = BASE_URL.split("?")[0];
const STORAGE_KEY = "oneknife999-prototype-save-v4";
// 雾松林：灰鬃狼（charge + packHunt）、林皮蛛（poison + slow）、
// 松鸦盗（ranged + firstHitReduce）、枯木菇人（lowHpReduce + deathPoison），三类行为齐备。
const MAP_ID = process.env.ONEKNIFE_FLAGS_MAP || "pine_forest";

function makeSavedRun({ x, y }) {
  const equipment = {
    weapon: null,
    helmet: null,
    neck: null,
    armor: null,
    braceletL: null,
    braceletR: null,
    ringL: null,
    ringR: null,
    belt: null,
    boots: null,
    medal: null,
    talisman: null
  };
  return {
    saveVersion: 4,
    classId: "warrior",
    currentMapId: MAP_ID,
    player: {
      x,
      y,
      hp: 999999,
      resource: 100,
      level: 12,
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
      visitedMaps: { [MAP_ID]: true }
    },
    inventory: [],
    equipment,
    mapProgress: { [MAP_ID]: { kills: 0, need: 8, bossDefeated: false, completed: false, rewardClaimed: false } }
  };
}

// 用「实体 id」做键：刷怪点顺序固定，三个臂的实体一一对应。
async function readSignatures(page, query) {
  await page.goto(`${ROOT}/?e2e=1${query}`, { waitUntil: "load" });
  await page.waitForFunction(
    ({ mapId }) => {
      const snapshot = window.__ONEKNIFE_E2E__?.snapshot();
      return snapshot && snapshot.currentMapId === mapId && document.querySelector("#classModal").classList.contains("hidden");
    },
    { mapId: MAP_ID },
    { timeout: 15000 }
  );
  const entities = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().entities);
  return entities.map((entity) => ({
    id: entity.id,
    attackShape: entity.attackShape,
    passives: [...entity.passives].sort(),
    onDeath: entity.onDeath
  }));
}

function assertOnlyDimension(fallback, armName, baseline, arm, dimension) {
  arm.forEach((entity, index) => {
    const base = baseline[index];
    assert.equal(entity.id, base.id, `${armName}：实体顺序必须与基线一致`);
    for (const key of ["attackShape", "passives", "onDeath"]) {
      if (key === dimension) continue;
      assert.deepEqual(entity[key], base[key], `${armName}：只应关闭「${dimension}」，但 ${entity.id} 的 ${key} 被误改`);
    }
  });
  assert.ok(
    baseline.some((entity) => JSON.stringify(entity[dimension]) !== JSON.stringify(fallback[dimension])),
    `基线缺少「${dimension}」样本，用例无法证明开关生效`
  );
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    // 先进入游戏拿到安全区坐标（未存档时职业弹窗会挡住场景）。
    await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
    await page.waitForSelector('[data-class="warrior"]', { timeout: 15000 });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });
    const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__.catalog());
    const map = catalog.find((entry) => entry.id === MAP_ID);
    assert.ok(map, `关卡目录里找不到地图 ${MAP_ID}`);
    const save = makeSavedRun({ x: map.safePoint.x, y: map.safePoint.y });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: save });

    const baseline = await readSignatures(page, "");
    assert.ok(
      baseline.some((entity) => entity.attackShape !== "normal"),
      `基线 ${MAP_ID} 里没有非普通攻击形态，用例选图失效`
    );
    assert.ok(
      baseline.some((entity) => entity.passives.length > 0),
      `基线 ${MAP_ID} 里没有带被动的怪，用例选图失效`
    );
    assert.ok(
      baseline.some((entity) => entity.onDeath !== null),
      `基线 ${MAP_ID} 里没有带亡语的怪，用例选图失效`
    );

    const shapesOff = await readSignatures(page, "&noabishapes=1");
    shapesOff.forEach((entity) => assert.equal(entity.attackShape, "normal", `noabishapes 后 ${entity.id} 仍为 ${entity.attackShape}`));
    assertOnlyDimension({ attackShape: "normal" }, "noabishapes", baseline, shapesOff, "attackShape");

    const passivesOff = await readSignatures(page, "&noabipassives=1");
    passivesOff.forEach((entity) => assert.deepEqual(entity.passives, [], `noabipassives 后 ${entity.id} 仍带被动 ${entity.passives}`));
    assertOnlyDimension({ passives: [] }, "noabipassives", baseline, passivesOff, "passives");

    const deathOff = await readSignatures(page, "&noabideath=1");
    deathOff.forEach((entity) => assert.equal(entity.onDeath, null, `noabideath 后 ${entity.id} 仍有亡语 ${entity.onDeath}`));
    assertOnlyDimension({ onDeath: null }, "noabideath", baseline, deathOff, "onDeath");

    // 总闸必须仍然等于「三类全关」，避免细粒度开关改变旧语义（0.7.2 及以前的消融数据可比）。
    const allOff = await readSignatures(page, "&noabilities=1");
    allOff.forEach((entity) => {
      assert.equal(entity.attackShape, "normal", `noabilities 后 ${entity.id} 攻击形态未回落`);
      assert.deepEqual(entity.passives, [], `noabilities 后 ${entity.id} 仍带被动`);
      assert.equal(entity.onDeath, null, `noabilities 后 ${entity.id} 仍有亡语`);
    });

    assert.deepEqual(errors, [], `页面报错：${errors.join("；")}`);
    process.stdout.write(
      `UI ability flags: PASS（${MAP_ID} · ${baseline.length} 只怪 · 形态 ${baseline.filter((e) => e.attackShape !== "normal").length} / 被动 ${baseline.filter((e) => e.passives.length).length} / 亡语 ${baseline.filter((e) => e.onDeath).length}）\n`
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
