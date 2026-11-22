// 0.8.66 回归：深层清层瞬间死亡首领实体仍在，首领情报卡必须收起。
// 旧实现只处理“读档后无首领实体”，实时击杀后会留下“已击破 · 0 秒后刷新”，
// 与本层“首领不再重生”互相矛盾。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const SAVE_KEY = "oneknife999-prototype-save-v4";
const SAVE_PATH = path.join(__dirname, "..", "saves", "taoist-100-complete.json");

function abyssSave() {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
  save.currentMapId = "abyss-F2";
  save.abyssFloor = 2;
  save.abyssBest = 2;
  save.player.x = 240;
  save.player.y = 705;
  save.mapProgress = save.mapProgress || {};
  save.mapProgress["abyss-F2"] = {
    kills: 0,
    need: 5,
    bossDefeated: false,
    completed: false,
    rewardClaimed: false,
    completionAnnounced: false,
    resourceClaimed: false,
    siteClaimed: false,
    killAnnounced: false
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
      { key: SAVE_KEY, save: abyssSave() }
    );
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F2");
    await page.waitForTimeout(180);

    const result = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      const main = await import("/src/main.js");
      const boss = runtime.state.entities.find((entity) => entity.boss);
      if (!boss) return { skipped: true };
      const progress = runtime.mapProgress();
      progress.kills = progress.need;
      const beforeHidden = document.querySelector("#bossAlert")?.classList.contains("hidden");
      // F2 首领带“残星复起”，第一次倒下会满血复原；第二次才是真正击破。
      main.defeat(boss);
      await new Promise((resolve) => setTimeout(resolve, 120));
      main.defeat(boss);
      await new Promise((resolve) => setTimeout(resolve, 320));
      return {
        skipped: false,
        beforeHidden,
        afterHidden: document.querySelector("#bossAlert")?.classList.contains("hidden"),
        text: document.querySelector("#bossAlertText")?.textContent || "",
        completed: progress.completed,
        bossDefeated: progress.bossDefeated
      };
    });

    assert.equal(result.skipped, false, "深层测试层没有首领实体");
    assert.equal(result.beforeHidden, false, "首领在场时情报卡不应隐藏");
    assert.equal(result.bossDefeated, true, "首领击杀未写入关卡进度");
    assert.equal(result.completed, true, "首领击杀后本层未标记完成");
    assert.equal(result.afterHidden, true, "深层清层后首领情报卡仍然显示");
    assert.ok(!result.text.includes("秒后刷新"), `清层后仍显示重生倒计时：${result.text}`);
    assert.deepEqual(errors, [], "首领情报卡清层测试期间页面异常");
    process.stdout.write("UI boss alert clear: PASS\n");
  } finally {
    await context.close();
    await browser.close();
  }
})();
