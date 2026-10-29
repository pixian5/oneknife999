const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

// 致盲被动接线回归（0.7.2，U-ABIL-01）：
// `blind`（无名雾 / 雪隐）此前只有定义没有消费点，0.7.1 接通后这里做端到端确认：
// 把玩家放在带 blind 的怪旁边不还手，等它命中 → snapshot().player.blind 必须 > 0，
// 且 blindMissChance 等于该被动的默认失手概率（0.3）。用例不攻击，避免把怪打死或干扰判定。
const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const ROOT = BASE_URL.split("?")[0];
const STORAGE_KEY = "oneknife999-prototype-save-v4";
const BLIND_MONSTER = process.env.ONEKNIFE_BLIND_MONSTER || "雪原猎手";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeSavedRun({ mapId, x, y }) {
  // 12 槽位装备（全空）与 v4 存档字段：只保留恢复所需的最小集合。
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
    currentMapId: mapId,
    player: {
      x,
      y,
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

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
    // 必须先进入游戏（未存档时职业弹窗会挡住场景），再从 E2E 目录里挑一张含致盲怪的地图。
    await page.waitForSelector('[data-class="warrior"]', { timeout: 15000 });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });

    const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__.catalog());
    const targetMap = catalog.find((map) => map.monsterProfiles.some((profile) => profile.name.includes(BLIND_MONSTER)));
    assert.ok(targetMap, `关卡目录里找不到含「${BLIND_MONSTER}」的地图`);
    // 刷怪点的 type 是怪物类型下标（不是名字），需要经 monsterProfiles 映射成名字。
    const spawn = targetMap.monsterSpawns.find((item) => (targetMap.monsterProfiles[item.type]?.name || "").includes(BLIND_MONSTER));
    assert.ok(spawn, `地图 ${targetMap.id} 的刷怪点里找不到「${BLIND_MONSTER}」`);
    const spawnName = targetMap.monsterProfiles[spawn.type].name;

    // 站在刷怪点旁边（留 40px，避免与怪重叠），不还手，等它主动命中。
    const save = makeSavedRun({ mapId: targetMap.id, x: spawn.x + 40, y: spawn.y + 40 });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: save });
    await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
    await page.waitForFunction(
      ({ mapId }) => {
        const snapshot = window.__ONEKNIFE_E2E__?.snapshot();
        return snapshot && snapshot.currentMapId === mapId && document.querySelector("#classModal").classList.contains("hidden");
      },
      { mapId: targetMap.id },
      { timeout: 15000 }
    );

    const hpStart = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player.hp);
    let blinded = null;
    let hpEnd = hpStart;
    for (let i = 0; i < 60; i += 1) {
      await sleep(500);
      const player = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player);
      hpEnd = player.hp;
      if ((player.blind || 0) > 0) {
        blinded = player;
        break;
      }
    }

    assert.ok(blinded, `「${BLIND_MONSTER}」在 30 秒内没有命中玩家（hp ${hpStart} → ${hpEnd}），致盲未写入`);
    assert.ok(blinded.blind > 0, `致盲计时必须为正，实际 ${blinded.blind}`);
    assert.equal(blinded.blindMissChance, 0.3, `失手概率应为 0.3，实际 ${blinded.blindMissChance}`);
    assert.ok(blinded.hp < hpStart, `致盲必须来自一次真实命中（hp ${hpStart} → ${blinded.hp}）`);
    assert.deepEqual(errors, [], `页面报错：${errors.join("；")}`);
    process.stdout.write(
      `UI blind passive: PASS（${spawnName} · ${targetMap.id} · 第 ${targetMap.stageNumber} 关 · blind=${blinded.blind.toFixed(2)}s · hp ${hpStart} → ${blinded.hp}）\n`
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
