// 0.8.58 回归：无尽深层 HUD 与按 T 锁层。
// 旧实现把深层当成“第 0/100 关”，清层后目标卡仍显示“百图征途已通关”，
// 且非首领层可以连续按 T 跳过普通怪。本用例同时守住文案与入口门禁。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const SAVE_KEY = "oneknife999-prototype-save-v4";
const SAVE_PATH = path.join(__dirname, "..", "saves", "taoist-100-complete.json");

function abyssSave(completed = false) {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
  save.currentMapId = "abyss-F2";
  save.abyssFloor = 2;
  save.abyssBest = 2;
  save.player.x = 240;
  save.player.y = 705;
  save.mapProgress = save.mapProgress || {};
  save.mapProgress["abyss-F2"] = {
    kills: completed ? 5 : 0,
    need: 5,
    bossDefeated: completed,
    completed,
    rewardClaimed: false,
    completionAnnounced: false,
    resourceClaimed: false,
    siteClaimed: false,
    killAnnounced: completed
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
      { key: SAVE_KEY, save: abyssSave(false) }
    );
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F2");
    await page.waitForTimeout(180);

    const hud = await page.evaluate(() => ({
      region: document.querySelector(".region-tip")?.textContent,
      objective: document.querySelector("#mapObjectiveTitle")?.textContent,
      description: document.querySelector("#questDescription")?.textContent,
      tag: document.querySelector("#questTag")?.textContent,
      chain: document.querySelector("#questChainTitle")?.textContent
    }));
    assert.equal(hud.region, "第 2 层 / 最深 2 层", `深层区域导航错误：${hud.region}`);
    assert.equal(hud.objective, "清剿区域怪物", `深层目标标题错误：${hud.objective}`);
    assert.ok(!hud.description.includes("玄烬帝尊"), `深层任务描述复用了终局文案：${hud.description}`);
    assert.equal(hud.tag, "进行中", `深层未完成标签错误：${hud.tag}`);
    assert.equal(hud.chain, "无尽深层 · 第 2 层", `深层任务链标题错误：${hud.chain}`);

    // 0.8.60：本层 completion 为 true 时，已死首领不能倒计时复活。
    // 在未完成档上临时改 completed，跑一次 updateEntities 后恢复，避免污染后续门禁测试。
    const respawn = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      const main = await import("/src/main.js");
      const progress = runtime.mapProgress();
      const oldCompleted = progress.completed;
      const boss = runtime.state.entities.find((entity) => entity.boss);
      if (!boss) return { skipped: true };
      const oldKills = progress.kills;
      const oldBoss = progress.bossDefeated;
      progress.kills = progress.need;
      progress.bossDefeated = true;
      boss.alive = false;
      boss.respawn = 0.1;
      main.updateEntities(0.2);
      const aliveAfterTick = boss.alive;
      const residualAlive = runtime.state.entities.filter((entity) => !entity.friendly && !entity.npc && entity.alive).length;
      progress.kills = oldKills;
      progress.bossDefeated = oldBoss;
      progress.completed = oldCompleted;
      boss.alive = true;
      boss.hp = boss.maxHp;
      boss.respawn = 0;
      return { skipped: false, alive: aliveAfterTick, residualAlive };
    });
    assert.equal(respawn.skipped, false, "深层测试层没有首领实体");
    assert.equal(respawn.alive, false, "已通关深层首领仍然复活");
    assert.equal(respawn.residualAlive, 0, `已通关深层仍残留 ${respawn.residualAlive} 只敌怪`);

    await page.keyboard.press("t");
    await page.waitForTimeout(220);
    const blocked = await page.evaluate(() => ({
      map: window.__ONEKNIFE_E2E__.snapshot().currentMapId,
      toast: document.querySelector("#toast")?.textContent
    }));
    assert.equal(blocked.map, "abyss-F2", "未完成本层却能按 T 跳层");
    assert.ok(blocked.toast.includes("尚未完成"), `锁层提示缺失：${blocked.toast}`);

    // 0.8.59：持久化必须保留“当前深层”进度，刷新后不能回到 0/5。
    const persisted = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      const persist = await import("/src/persist.js");
      const progress = runtime.mapProgress();
      progress.kills = progress.need;
      progress.bossDefeated = true;
      progress.completed = true;
      persist.persistGame();
      return JSON.parse(localStorage.getItem("oneknife999-prototype-save-v4")).mapProgress;
    });
    assert.equal(persisted["abyss-F2"]?.completed, true, "当前深层进度没有写入存档");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F2");
    await page.waitForTimeout(180);
    const afterReload = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().progress["abyss-F2"]);
    assert.equal(afterReload?.completed, true, "刷新后当前深层进度丢失");

    await page.evaluate(
      ({ key, save }) => {
        localStorage.setItem(key, JSON.stringify(save));
        location.reload();
      },
      { key: SAVE_KEY, save: abyssSave(true) }
    );
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F2");
    await page.waitForTimeout(180);
    // 0.8.60：已通关深层读档后不应再生成任何敌怪。
    const cleared = await page.evaluate(() => ({
      title: document.querySelector("#mapObjectiveTitle")?.textContent,
      text: document.querySelector("#mapObjectiveText")?.textContent,
      tag: document.querySelector("#questTag")?.textContent,
      dynamics: document.querySelector("#mapDynamics")?.textContent,
      reward: document.querySelector("#questReward")?.textContent,
      bossAlertHidden: document.querySelector("#bossAlert")?.classList.contains("hidden")
    }));
    assert.equal(cleared.title, "按 T 深入第 3 层", `清层后目标标题错误：${cleared.title}`);
    assert.ok(cleared.text.includes("第 2 层目标已完成"), `清层后目标描述错误：${cleared.text}`);
    assert.ok(cleared.text.includes("不再重生"), `清层后未说明怪物不再重生：${cleared.text}`);
    assert.equal(cleared.tag, "本层已通关", `清层后关卡标签错误：${cleared.tag}`);
    assert.ok(!cleared.dynamics.includes("100/100 通关"), `深层错误显示百图通关：${cleared.dynamics}`);
    assert.ok(cleared.dynamics.includes("不再重生"), `清层后动态栏仍在倒计时重生：${cleared.dynamics}`);
    assert.ok(!cleared.reward.includes("60 金币"), `深层错误显示主线固定通关奖励：${cleared.reward}`);
    assert.equal(cleared.bossAlertHidden, true, `清层读档后首领情报卡未收起`);

    const hostiles = await page.evaluate(() =>
      window.__ONEKNIFE_E2E__
        .snapshot()
        .entities.filter((entity) => !entity.friendly && !entity.npc)
        .map((entity) => entity.name)
    );
    assert.deepEqual(hostiles, [], `已通关深层仍生成敌怪：${hostiles.join("、")}`);

    await page.keyboard.press("t");
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F3");
    assert.deepEqual(errors, [], "深层 HUD 测试期间页面异常");

    // 0.8.60：第 10 层里程碑文案与深层专属奖励说明。
    const milestoneSave = abyssSave(true);
    milestoneSave.currentMapId = "abyss-F10";
    milestoneSave.abyssFloor = 10;
    milestoneSave.abyssBest = 10;
    milestoneSave.mapProgress["abyss-F10"] = { ...milestoneSave.mapProgress["abyss-F2"] };
    await page.evaluate(
      ({ key, save }) => {
        localStorage.setItem(key, JSON.stringify(save));
        location.reload();
      },
      { key: SAVE_KEY, save: milestoneSave }
    );
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F10");
    await page.waitForTimeout(180);
    const milestone = await page.evaluate(() => ({
      region: document.querySelector(".region-tip")?.textContent,
      nodes: document.querySelector("#regionList")?.textContent,
      text: document.querySelector("#mapObjectiveText")?.textContent,
      reward: document.querySelector("#questReward")?.textContent
    }));
    assert.equal(milestone.region, "第 10 层 / 最深 10 层", `里程碑区域导航错误：${milestone.region}`);
    assert.ok(milestone.nodes.includes("里程碑 F10"), `里程碑卡片缺失：${milestone.nodes}`);
    assert.ok(milestone.text.includes("里程碑已达成"), `里程碑目标描述错误：${milestone.text}`);
    assert.ok(!milestone.reward.includes("60 金币"), `里程碑仍在显示主线奖励：${milestone.reward}`);

    const milestoneToast = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      const main = await import("/src/main.js");
      runtime.mapProgress().completionAnnounced = false;
      main.checkMapCompletion();
      return document.querySelector("#toast")?.textContent || "";
    });
    assert.ok(milestoneToast.includes("深层里程碑"), `第 10 层里程碑没有播报：${milestoneToast}`);

    // 0.8.58 深层 HUD 在窄屏同样不能把页面撑出纵向滚动条。
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobile.newPage();
    const mobileErrors = [];
    mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
    await mobilePage.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await mobilePage.evaluate(
      ({ key, save }) => {
        localStorage.setItem(key, JSON.stringify(save));
        location.reload();
      },
      { key: SAVE_KEY, save: abyssSave(false) }
    );
    await mobilePage.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F2");
    await mobilePage.waitForTimeout(180);
    const mobileLayout = await mobilePage.evaluate(() => ({
      region: document.querySelector(".region-tip")?.textContent,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight
    }));
    assert.equal(mobileLayout.region, "第 2 层 / 最深 2 层", "窄屏深层区域导航错误");
    assert.ok(
      mobileLayout.scrollHeight <= mobileLayout.clientHeight + 1,
      `窄屏深层 HUD 撑出滚动条：${mobileLayout.scrollHeight} > ${mobileLayout.clientHeight}`
    );
    assert.deepEqual(mobileErrors, [], "窄屏深层 HUD 页面异常");
    await mobile.close();
    process.stdout.write("UI abyss HUD/gate: PASS\n");
  } finally {
    await context.close();
    await browser.close();
  }
})();
