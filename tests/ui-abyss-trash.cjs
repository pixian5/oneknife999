// 0.8.90 深层清残余回归：
// 清完 5 只任务怪后，第六个营位的巡逻杂兵必须退出回响战；
// 包括正在死亡倒计时的杂兵，且 2 秒内不得复活。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const SAVE_KEY = "oneknife999-prototype-save-v4";
const SAVE_PATH = path.join(__dirname, "..", "saves", "taoist-100-complete.json");

function f110Save() {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
  save.currentMapId = "abyss-F110";
  save.abyssFloor = 110;
  save.abyssBest = 110;
  save.player.potion = 5;
  save.mapProgress = save.mapProgress || {};
  save.mapProgress["abyss-F110"] = {
    kills: 0,
    need: 5,
    bossDefeated: false,
    completed: false,
    rewardClaimed: false,
    completionAnnounced: false,
    resourceClaimed: true,
    siteClaimed: false,
    killAnnounced: false,
    echoEarlyDefeated: false,
    bossMarksAwarded: false
  };
  return save;
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ key, save }) => {
        localStorage.setItem(key, JSON.stringify(save));
        location.reload();
      },
      { key: SAVE_KEY, save: f110Save() }
    );
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F110");
    await page.waitForTimeout(260);

    // 只打前 5 只任务怪，保留第六个营位的巡逻压力。
    for (let index = 0; index < 5; index += 1) {
      await page.evaluate((id) => window.__ONEKNIFE_E2E__.strike(id, 99999), `mob-${index}`);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(400);

    const afterClear = await page.evaluate(() => {
      const state = window.__ONEKNIFE_E2E__.testApi.state();
      return state.entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        alive: entity.alive,
        boss: Boolean(entity.boss),
        npc: Boolean(entity.npc),
        respawnInfinity: entity.respawn === Infinity,
        elite: entity.elite ? entity.elite.affixes : null
      }));
    });
    const trash = afterClear.filter((entity) => !entity.boss && !entity.npc);
    assert.equal(trash.length, 6, "F110 应有 6 个非首领营位实体");
    for (const entity of trash) {
      assert.equal(entity.alive, false, `${entity.id} 清层后仍存活`);
      assert.equal(entity.respawnInfinity, true, `${entity.id} 的 respawn 必须是 Infinity`);
    }
    const boss = afterClear.find((entity) => entity.boss);
    assert.ok(boss && boss.alive, "回响必须保留");
    assert.equal(await page.evaluate(() => window.__ONEKNIFE_E2E__.testApi.state().quest.kills), 5, "击杀计数必须到 5");

    // 20 秒级复活周期未到，先确认 2 秒内没有任何杂兵站起来。
    await page.waitForTimeout(2000);
    const revived = await page.evaluate(() => {
      const state = window.__ONEKNIFE_E2E__.testApi.state();
      return state.entities
        .filter((entity) => !entity.boss && !entity.npc)
        .filter((entity) => entity.alive)
        .map((entity) => entity.id);
    });
    assert.deepEqual(revived, [], "清层后 2 秒内不得有杂兵复活");
    assert.deepEqual(errors, [], `页面错误：${errors.join(" | ")}`);
    console.log("0.8.90 深层清残余回归通过（5 杀清杂兵 / respawn Infinity / 2 秒不复活）");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
