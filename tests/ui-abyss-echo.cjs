// 0.8.81 深层终局回归：
// 1) F90 回响 B：提前击破不置 bossDefeated、不清小怪、不发印记；清完 5 只后回响重生，再击杀才通关。
// 2) 已完成 F90 读档不回退：不再生成回响，按 T 可进 F91。
// 3) 深层每层入口一次性补给：首次进 F91 +1 药水，刷新不重复领。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const SAVE_KEY = "oneknife999-prototype-save-v4";
const SAVE_PATH = path.join(__dirname, "..", "saves", "taoist-100-complete.json");

function f90Save(potion = 2) {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, "utf8"));
  save.currentMapId = "abyss-F90";
  save.abyssFloor = 90;
  save.abyssBest = 90;
  save.player.marks = 0;
  save.player.potion = potion;
  save.player.x = 240;
  save.player.y = 705;
  save.mapProgress = save.mapProgress || {};
  save.mapProgress["abyss-F90"] = {
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

async function inject(page, save) {
  await page.evaluate(
    ({ key, save }) => {
      localStorage.setItem(key, JSON.stringify(save));
      location.reload();
    },
    { key: SAVE_KEY, save }
  );
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F90");
  await page.waitForTimeout(220);
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await inject(page, f90Save(2));

    const loaded = await page.evaluate(() => {
      const s = window.__ONEKNIFE_E2E__.snapshot();
      return {
        potion: s.player.potion,
        boss: s.entities.find((entity) => entity.boss)?.id || null,
        marks: s.player.marks || 0
      };
    });
    assert.equal(loaded.boss, "boss-abyss-F90", "F90 未生成回响");
    const growth = await page.evaluate(() =>
      [...document.querySelectorAll(".region-node .region-level")].map((node) => node.textContent.trim())
    );
    assert.ok(
      growth.some((text) => text.includes("基础生命")),
      `深层成长文案未写“基础值”：${growth.join(" | ")}`
    );
    assert.ok(!growth.some((text) => text.includes("深层成长 +14%")), `深层成长仍暗示每层复利：${growth.join(" | ")}`);

    // 1) 先杀回响：B 方案应判定“提前击破”，不置 bossDefeated、不清小怪、不发印记。
    const early = await page.evaluate(() => {
      const api = window.__ONEKNIFE_E2E__;
      const boss = api.snapshot().entities.find((entity) => entity.boss);
      const beforeMarks = api.testApi.state().player.marks || 0;
      api.strike(boss.id, 999999);
      const after = api.snapshot();
      return {
        beforeMarks,
        afterMarks: after.player.marks || 0,
        progress: after.progress["abyss-F90"],
        bossAlive: after.entities.find((entity) => entity.id === boss.id)?.alive,
        liveNormals: after.entities.filter((entity) => entity.alive && !entity.boss && !entity.friendly && !entity.npc).length,
        log: document.getElementById("eventLog")?.textContent || ""
      };
    });
    assert.equal(early.progress.bossDefeated, false, "提前击破不应置 bossDefeated");
    assert.equal(early.progress.completed, false, "提前击破不应通关");
    assert.equal(early.progress.echoEarlyDefeated, true, "缺少提前击破标记");
    assert.equal(early.bossAlive, false, "回响应先倒下等待重生");
    assert.ok(early.liveNormals >= 5, `提前击破后周边小怪被清空：${early.liveNormals}`);
    assert.equal(early.afterMarks, early.beforeMarks, "提前击破不应发首领印记");
    assert.match(early.log, /回响提前击破/, "日志缺少提前击破提示");

    // 2) 清完 5 只普通怪，再把回响重生时间压到 0.3 秒，击杀后应通关。
    const cleared = await page.evaluate(() => {
      const api = window.__ONEKNIFE_E2E__;
      const st = api.testApi.state();
      const normals = st.entities.filter((entity) => entity.alive && !entity.boss && !entity.friendly && !entity.npc);
      for (const entity of normals.slice(0, 5)) api.strike(entity.id, 999999);
      const boss = st.entities.find((entity) => entity.boss);
      if (boss) boss.respawn = 0.3;
      return { kills: api.snapshot().progress["abyss-F90"].kills, normals: normals.length };
    });
    assert.equal(cleared.kills, 5, `清怪计数错误：${cleared.kills}/5`);

    await page.waitForTimeout(700);
    const respawned = await page.evaluate(() => {
      const s = window.__ONEKNIFE_E2E__.snapshot();
      return { bossAlive: Boolean(s.entities.find((entity) => entity.boss)?.alive), progress: s.progress["abyss-F90"] };
    });
    assert.equal(respawned.bossAlive, true, "清完 5 只后回响没有重生");
    assert.equal(respawned.progress.completed, false, "回响重生但未击杀就通关了");

    const final = await page.evaluate(() => {
      const api = window.__ONEKNIFE_E2E__;
      const boss = api.snapshot().entities.find((entity) => entity.boss);
      const beforeMarks = api.testApi.state().player.marks || 0;
      api.strike(boss.id, 999999);
      const after = api.snapshot();
      return {
        beforeMarks,
        afterMarks: after.player.marks || 0,
        progress: after.progress["abyss-F90"],
        log: document.getElementById("eventLog")?.textContent || ""
      };
    });
    assert.equal(final.progress.bossDefeated, true, "最终击杀未置 bossDefeated");
    assert.equal(final.progress.completed, true, "最终击杀未通关");
    assert.equal(final.afterMarks - final.beforeMarks, 35, "最终击破应发 35 首领印记");
    assert.match(final.log, /深层第 90 层清层/, "缺少清层日志");

    // 3) 已完成 F90 刷新后不生成敌人，按 T 进 F91；首次进层只补 1 瓶。
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F90");
    await page.waitForTimeout(200);
    const reloaded = await page.evaluate(() => {
      const s = window.__ONEKNIFE_E2E__.snapshot();
      return {
        boss: Boolean(s.entities.find((entity) => entity.boss)),
        completed: s.progress["abyss-F90"].completed,
        potion: s.player.potion
      };
    });
    assert.equal(reloaded.completed, true, "已完成 F90 读档后 completed 丢失");
    assert.equal(reloaded.boss, false, "已完成 F90 读档不应生成回响");
    await page.keyboard.press("t");
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F91");
    await page.waitForTimeout(300);
    const f91 = await page.evaluate(() => {
      const s = window.__ONEKNIFE_E2E__.snapshot();
      const st = window.__ONEKNIFE_E2E__.testApi.state();
      return { potion: s.player.potion, visited: Boolean(st.player.visitedMaps?.["abyss-F91"]) };
    });
    assert.equal(f91.potion, reloaded.potion + 1, `F91 入口补给错误：${reloaded.potion} -> ${f91.potion}`);
    assert.equal(f91.visited, true, "F91 未写 visitedMaps");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot().currentMapId === "abyss-F91");
    await page.waitForTimeout(200);
    const f91Reload = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player.potion);
    assert.equal(f91Reload, f91.potion, "刷新后重复领取了 F91 入口补给");

    assert.deepEqual(errors, [], `页面存在异常：${errors.join(" | ")}`);
    console.log("0.8.81 F90 回响 B / 入口补给回归通过（early / clear / respawn / final / grandfather / supply-once）");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
