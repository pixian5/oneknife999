// 0.8.84 A 组回归：B 组删除后，深层普通怪死亡必须满血重建；?abyssPreserve=0/1 都不应再改变行为。
// 用 testApi.loadMap(..., keepBossHp=true) 模拟死亡复活，不依赖真实致死。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const SAVE_KEY = "oneknife999-prototype-save-v4";
const SAVE_PATH = path.join(__dirname, "..", "saves", "taoist-100-complete.json");

function f91Save() {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
  save.currentMapId = "abyss-F91";
  save.abyssFloor = 91;
  save.abyssBest = 91;
  save.player.x = 240;
  save.player.y = 705;
  save.mapProgress = save.mapProgress || {};
  save.mapProgress["abyss-F91"] = {
    kills: 0,
    need: 5,
    bossDefeated: false,
    completed: false,
    rewardClaimed: false,
    completionAnnounced: false,
    resourceClaimed: false,
    siteClaimed: false,
    killAnnounced: false,
    echoEarlyDefeated: false,
    bossMarksAwarded: false
  };
  return save;
}

async function runCase(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ key, save }) => {
      localStorage.setItem(key, JSON.stringify(save));
      location.reload();
    },
    { key: SAVE_KEY, save: f91Save() }
  );
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F91");
  await page.waitForTimeout(220);
  const result = await page.evaluate(() => {
    const api = window.__ONEKNIFE_E2E__;
    const st = api.testApi.state();
    const mob = st.entities.find((entity) => !entity.boss && !entity.friendly && !entity.npc && entity.alive);
    const oldHp = Math.round(mob.maxHp * 0.6);
    mob.hp = oldHp;
    const oldMax = mob.maxHp;
    api.testApi.loadMap("abyss-F91", st.player.x, st.player.y, true, true);
    const next = api.testApi.state().entities.find((entity) => entity.id === mob.id);
    const firstHp = next.hp;
    const firstMax = next.maxHp;
    // 第二次死亡：再压到 20%，A 组仍必须满血重建；旧 B 的保留/回血逻辑已删除。
    next.hp = Math.round(next.maxHp * 0.2);
    api.testApi.loadMap("abyss-F91", st.player.x, st.player.y, true, true);
    const second = api.testApi.state().entities.find((entity) => entity.id === mob.id);
    return { oldHp, oldMax, firstHp, firstMax, secondHp: second?.hp, secondMax: second?.maxHp, errors: [] };
  });
  result.errors = errors;
  await context.close();
  return result;
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    for (const suffix of ["", "&abyssPreserve=0", "&abyssPreserve=1"]) {
      const d = await runCase(browser, BASE_URL + suffix);
      assert.equal(d.firstHp, d.firstMax, `0.8.84 应统一 A 组满血重建${suffix}：${d.oldHp}/${d.oldMax} -> ${d.firstHp}/${d.firstMax}`);
      assert.equal(d.secondHp, d.secondMax, `0.8.84 第二次死亡仍应满血${suffix}：${d.secondHp}/${d.secondMax}`);
      assert.deepEqual(d.errors, [], `页面异常${suffix}：${d.errors.join(" | ")}`);
    }
    console.log("0.8.84 A 组死亡重建回归通过：默认 / abyssPreserve=0 / abyssPreserve=1 均满血，第二次死亡不回保留");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
