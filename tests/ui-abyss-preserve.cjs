// 0.8.83 A/B：默认 A 组满血；B 组死亡后最高 50% 最大生命且只降不升，用 ?abyssPreserve=1 显式开启。
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
    // 第二次死亡：把同一只怪压到 20%，B 组必须保持 20%，不能再回血到 60%。
    const lowHp = Math.round(next.maxHp * 0.2);
    next.hp = lowHp;
    api.testApi.loadMap("abyss-F91", st.player.x, st.player.y, true, true);
    const second = api.testApi.state().entities.find((entity) => entity.id === mob.id);
    return { oldHp, oldMax, newHp: firstHp, newMax: next.maxHp, lowHp, secondHp: second?.hp, errors: [] };
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
    const expected = Math.max(1, Math.round(Math.min(b.oldHp, b.newMax * 0.5)));
    assert.equal(
      b.newHp,
      expected,
      `B 组应压到 50% 最大生命且只降不升：${b.oldHp}/${b.oldMax} -> ${b.newHp}/${b.newMax}，期望 ${expected}`
    );
    assert.equal(b.secondHp, b.lowHp, `B 组第二次死亡不能回血：20%=${b.lowHp}，实际 ${b.secondHp}`);
    assert.equal(a.secondHp, a.newMax, `A 组第二次死亡仍应满血：${a.secondHp}/${a.newMax}`);
    assert.deepEqual(a.errors, [], `A 组页面异常：${a.errors.join(" | ")}`);
    assert.deepEqual(b.errors, [], `B 组页面异常：${b.errors.join(" | ")}`);
    console.log(
      `0.8.83 死亡保留 A/B 回归通过：默认A=${d.newHp}/${d.newMax}，A=${a.newHp}/${a.newMax}，B=${b.newHp}/${b.newMax}，B二次死亡=${b.secondHp}/${b.newMax}`
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
