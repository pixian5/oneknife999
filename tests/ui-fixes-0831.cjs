// 0.8.31 回归：技能升级后按钮等级刷新 + 骨卫不会被锁定为目标。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const ROOT = (process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1").split("?")[0];
const STORAGE_KEY = "oneknife999-prototype-save-v4";

function makeSave(classId, extra = {}) {
  const slots = {
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
    classId,
    currentMapId: "ash_outskirts",
    player: {
      x: 480,
      y: 780,
      hp: 9999,
      resource: 240,
      level: 10,
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
      equipment: slots,
      poison: 0,
      skillPoints: 0,
      skillLevels: [0, 0, 0, 0],
      sin: 0,
      visitedMaps: { ash_outskirts: true },
      ...extra
    },
    inventory: [],
    equipment: slots,
    mapProgress: { ash_outskirts: { kills: 0, need: 8, bossDefeated: false, completed: false, rewardClaimed: false } }
  };
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const loadSave = async (save) => {
    await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: save });
    await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });
  };

  // A. 技能升级后按钮 Lv 必须刷新（此前骨架签名不含 skillLevels）
  await loadSave(makeSave("taoist", { skillPoints: 1 }));
  const before = await page.locator('#skillBar [data-skill="0"]').getAttribute("aria-label");
  assert.ok(!/Lv\./.test(before), `升级前不应带等级：${before}`);
  await page.keyboard.press("k");
  await page.waitForTimeout(200);
  await page.locator('[data-upgrade-skill="0"]').click();
  await page.waitForTimeout(300);
  const after = await page.locator('#skillBar [data-skill="0"]').getAttribute("aria-label");
  assert.ok(/Lv\.1/.test(after), `升级后按钮应显示 Lv.1，实际 ${after}`);
  await page.keyboard.press("k");

  // B. 召唤骨卫后按 X 不应把骨卫设为目标（此前 nearestAlive/target 恢复不过滤 friendly）
  await loadSave(makeSave("taoist"));
  await page.keyboard.press("2");
  await page.waitForTimeout(500);
  // snapshot.entities 只暴露敌对实体，骨卫不在其中；用时间线判定召唤成功，
  // 「不被锁定」由单测 computeSiteEffect 覆盖（友军即使更近也不成为目标）。
  const summoned = await page.evaluate(() => window.__ONEKNIFE_E2E__.timeline(30).some((entry) => entry.text.includes("骨卫在场景中现身")));
  assert.ok(summoned, "骨卫应已召唤（时间线缺少「骨卫在场景中现身」）");

  assert.deepEqual(errors, [], `页面异常：${errors.join(" | ")}`);
  process.stdout.write(`FIXES PASS 技能按钮 ${before} → ${after}；骨卫召唤事件已记录\n`);
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
