// 0.8.82 A/B：默认 A 组满血；B 组保留一半已损生命，用 ?abyssPreserve=1 显式开启。
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
    return { oldHp, oldMax, newHp: next?.hp, newMax: next?.maxHp, errors: [] };
  });
  result.errors = errors;
  await context.close();
  return result;
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const d = await runCase(browser, BASE_URL);
    assert.equal(d.newHp, d.newMax, `默认应走 A 组满血重建：${d.oldHp}/${d.oldMax} -> ${d.newHp}/${d.newMax}`);
    const a = await runCase(browser, `${BASE_URL}&abyssPreserve=0`);
    assert.equal(a.newHp, a.newMax, `A 组应满血重建：${a.oldHp}/${a.oldMax} -> ${a.newHp}/${a.newMax}`);
    const b = await runCase(browser, `${BASE_URL}&abyssPreserve=1`);
    const expected = Math.max(1, Math.round(b.newMax - (b.oldMax - b.oldHp) * 0.5));
    assert.equal(b.newHp, expected, `B 组应保留一半已损生命：${b.oldHp}/${b.oldMax} -> ${b.newHp}/${b.newMax}，期望 ${expected}`);
    assert.deepEqual(a.errors, [], `A 组页面异常：${a.errors.join(" | ")}`);
    assert.deepEqual(b.errors, [], `B 组页面异常：${b.errors.join(" | ")}`);
    console.log(`0.8.82 死亡保留 A/B 回归通过：默认A=${d.newHp}/${d.newMax}，A=${a.newHp}/${a.newMax}，B=${b.newHp}/${b.newMax}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
