const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

// 界面渲染与输入回归（U-PERF-01）：
// 1) 首领刷新倒计时必须随实体递减，不能固定显示 0s；
// 2) 技能/背包/装备/导航/日志/关卡卡在静止帧内不得被每帧重建；
// 3) 大写字母与方向键（Shift/CapsLock 状态）必须可以移动。
const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const ROOT = BASE_URL.split("?")[0];
const STORAGE_KEY = "oneknife999-prototype-save-v4";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pressKey = (page, key, down) =>
  page.evaluate(
    ({ key, down }) => {
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key }));
    },
    { key, down }
  );

// 0.7.7：朝目标走到指定距离内。0.4.4 起装备必须站到 85px 内按 F 才能拾取，
// 首领战结束后玩家常被击退到范围外，因此用例需要真的走过去，而不是盲按 F。
async function walkToward(page, target, stopDistance = 60, maxMs = 6000) {
  const startedAt = Date.now();
  let held = [];
  const release = async () => {
    for (const key of held) await pressKey(page, key, false);
    held = [];
  };
  while (Date.now() - startedAt < maxMs) {
    const position = await page.evaluate(() => {
      const snap = window.__ONEKNIFE_E2E__.snapshot();
      return { x: snap.player.x, y: snap.player.y };
    });
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    if (Math.hypot(dx, dy) <= stopDistance) break;
    const keys = [];
    if (Math.abs(dx) > 12) keys.push(dx > 0 ? "d" : "a");
    if (Math.abs(dy) > 12) keys.push(dy > 0 ? "s" : "w");
    if (keys.join() !== held.join()) {
      await release();
      for (const key of keys) await pressKey(page, key, true);
      held = keys;
    }
    await sleep(150);
  }
  await release();
}

function makeSavedRun() {
  // v4 存档格式：12 装备槽位 + 技能点 / 技能等级 / 罪恶值字段。
  const equipment = {
    weapon: {
      id: "test-weapon",
      slot: "weapon",
      quality: "orange",
      glyph: "刀",
      name: "测试利刃",
      color: "#e7b36b",
      power: 9999,
      value: 1,
      desc: "回归测试用"
    },
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
    currentMapId: "ash_outskirts",
    player: {
      x: 1980,
      y: 760,
      hp: 999999,
      resource: 100,
      level: 5,
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
      skillPoints: 4,
      skillLevels: [0, 0, 0, 0],
      sin: 0,
      visitedMaps: { ash_outskirts: true }
    },
    inventory: [
      {
        id: "test-item-1",
        slot: "material",
        quality: "blue",
        glyph: "矿",
        name: "测试材料一",
        color: "#78b6ec",
        value: 1,
        desc: "回归测试用"
      },
      {
        id: "test-item-2",
        slot: "material",
        quality: "purple",
        glyph: "核",
        name: "测试材料二",
        color: "#a88ce3",
        value: 1,
        desc: "回归测试用"
      }
    ],
    equipment,
    mapProgress: { ash_outskirts: { kills: 0, need: 8, bossDefeated: false, completed: false, rewardClaimed: false } }
  };
}

async function verifyLayoutStability(page) {
  await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load" });
  await page.waitForSelector('[data-class="warrior"]', { timeout: 15000 });
  await page.locator('[data-class="warrior"]').click();
  await page.waitForSelector("#skillBar [data-skill]", { timeout: 15000 });

  assert.equal(await page.locator("#skillBar [data-skill]").count(), 4, "技能栏应渲染 4 个技能");

  const stable = await page.evaluate(async () => {
    const snapshot = () => ({
      skill: document.querySelector('#skillBar [data-skill="0"]'),
      inv: document.querySelector('#inventoryGrid [data-item-index="0"]'),
      equip: document.querySelector("#equipmentGrid button"),
      region: document.querySelector("#regionList [data-map-id]"),
      log: document.querySelector("#eventLog .event-entry"),
      objective: document.querySelector("#mapObjectiveChecks span")
    });
    const before = snapshot();
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const after = snapshot();
    const report = {};
    Object.keys(before).forEach((key) => {
      report[key] = Boolean(before[key]) && before[key] === after[key];
    });
    return report;
  });
  assert.deepEqual(Object.values(stable), [true, true, true, true, true, true], `面板在静止帧内被重建：${JSON.stringify(stable)}`);

  // 0.6.8：共享 runner 帧率低，主循环 dt 被钳在 0.05s，固定 sleep(650) 可能只推进几帧，
  // 位移达不到阈值。改为「按住按键轮询，直到位移达标或超时」，与帧率解耦。
  const playerY = () => page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player.y);
  const holdUntil = async (key, reached, timeoutMs = 8000) => {
    await pressKey(page, key, true);
    const start = Date.now();
    let ok = false;
    while (Date.now() - start < timeoutMs) {
      await sleep(100);
      if (await reached()) {
        ok = true;
        break;
      }
    }
    await pressKey(page, key, false);
    return ok;
  };

  const y0 = await playerY();
  const movedUp = await holdUntil("W", async () => y0 - (await playerY()) > 40);
  const y1 = await playerY();
  assert.ok(movedUp, `大写 W 未移动：y ${y0} -> ${y1}`);

  const movedDown = await holdUntil("ArrowDown", async () => (await playerY()) - y1 > 20);
  const y2 = await playerY();
  assert.ok(movedDown, `大写 ArrowDown 未移动：y ${y1} -> ${y2}`);
}

async function verifyBossRespawnCountdown(page) {
  await page.evaluate(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: STORAGE_KEY, save: makeSavedRun() });
  await page.goto(`${ROOT}/?e2e=1&fast=1`, { waitUntil: "load" });
  // 0.6.8：同理由固定等待改为等状态就绪，避免慢机器上存档还没恢复完就断言。
  await page.waitForFunction(
    () => {
      const e2e = window.__ONEKNIFE_E2E__;
      if (!e2e) return false;
      const modal = document.querySelector("#classModal");
      const count = document.querySelector("#inventoryCount");
      return Boolean(modal) && modal.classList.contains("hidden") && Boolean(count) && count.textContent === "2/12";
    },
    { timeout: 15000 }
  );

  const restore = await page.evaluate(() => {
    const snapshot = window.__ONEKNIFE_E2E__.snapshot();
    const slot = document.querySelector('#inventoryGrid [data-item-index="0"]');
    return {
      map: snapshot.currentMapId,
      modalHidden: document.querySelector("#classModal").classList.contains("hidden"),
      invCount: document.querySelector("#inventoryCount").textContent,
      gridSlots: document.querySelectorAll("#inventoryGrid [data-item-index]").length,
      slotFilled: Boolean(slot) && !slot.classList.contains("empty")
    };
  });
  assert.equal(restore.map, "ash_outskirts", "存档恢复地图错误");
  assert.ok(restore.modalHidden, "存档恢复后职业弹窗应关闭");
  assert.equal(restore.invCount, "2/12", "背包数量应为 2/12");
  assert.equal(restore.gridSlots, 12, "背包应渲染 12 个格位");
  assert.ok(restore.slotFilled, "首个背包格应显示预置物品");

  await page.evaluate(() => {
    window.__autoAttack = setInterval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" })), 660);
  });
  let bossDead = false;
  // 0.6.8：慢机器上 dt 被钳制，冷却推进慢，30 秒可能打不死首领，放宽到 60 秒。
  for (let i = 0; i < 240 && !bossDead; i += 1) {
    await sleep(250);
    bossDead = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().entities.some((entity) => entity.boss && !entity.alive));
  }
  await page.evaluate(() => clearInterval(window.__autoAttack));
  assert.ok(bossDead, "首领未在 60 秒内被击杀");

  const readRespawn = () =>
    page.evaluate(() => {
      const text = document.querySelector("#mapDynamics").textContent.replace(/\s+/g, " ").trim();
      const match = text.match(/首领已击破 · (\d+)s 后刷新/);
      return { respawn: match ? Number(match[1]) : null, alert: document.querySelector("#bossAlertText").textContent };
    });
  const first = await readRespawn();
  await sleep(3200);
  const second = await readRespawn();
  assert.ok(Number.isFinite(first.respawn) && Number.isFinite(second.respawn), `区域动态未显示刷新读秒：${JSON.stringify(first)}`);
  assert.ok(second.respawn < first.respawn && first.respawn <= 42, `倒计时未递减：${first.respawn}s -> ${second.respawn}s`);
  assert.match(second.alert, /已击破 · \d+ 秒后刷新/, `首领情报条读秒异常：${second.alert}`);

  // 拾取路径：背包/药水/日志必须按需刷新（验证签名缓存不漏更新）。
  // 0.7.7 修复用例缺陷：0.4.4 起装备必须站到 85px 内按 F 才能拾取，而首领的击退常把玩家推出范围；
  // 旧逻辑盲按 F 会命中「附近没有可拾取物品」的提示，而提示里也含「拾取」二字，被误判成拾取成功，
  // 随后面板当然不会变化。现在改为「走到最近的装备掉落点 → 按 F → 只认资产 / 日志真的变化」。
  const readPanels = () =>
    page.evaluate(() => ({
      inv: document.querySelector("#inventoryCount").textContent,
      potion: document.querySelector("#potionCount").textContent,
      gold: document.querySelector("#goldText").textContent,
      marks: document.querySelector("#markText").textContent,
      log: document.querySelector("#eventLog").textContent,
      objective: document.querySelector("#mapObjectiveChecks").textContent
    }));
  const countOf = (text) => Number(String(text).replace(/[^\d]/g, ""));
  const gearDrop = await page.evaluate(() => {
    const snap = window.__ONEKNIFE_E2E__.snapshot();
    const player = snap.player;
    return (
      (snap.drops || [])
        .filter((drop) => drop.slot)
        .map((drop) => ({ ...drop, distance: Math.hypot(drop.x - player.x, drop.y - player.y) }))
        .sort((a, b) => a.distance - b.distance)[0] || null
    );
  });
  assert.ok(gearDrop, "首领击杀后应留下可拾取的装备掉落");
  await walkToward(page, gearDrop, 60);
  const before = await readPanels();
  let after = before;
  let picked = false;
  for (let i = 0; i < 12 && !picked; i += 1) {
    await pressKey(page, "f", true);
    await pressKey(page, "f", false);
    // 面板走按帧刷新：每按一次 F 都轮询一小段，拾到即退出（不再依赖 Toast 文案判断）。
    for (let j = 0; j < 20 && !picked; j += 1) {
      await sleep(100);
      after = await readPanels();
      picked =
        countOf(after.inv) > countOf(before.inv) ||
        countOf(after.potion) > countOf(before.potion) ||
        countOf(after.gold) > countOf(before.gold) ||
        countOf(after.marks) > countOf(before.marks) ||
        after.log !== before.log;
    }
    // 被击退或掉落被推到边缘：朝掉落点再走一步后重试。
    if (!picked) await walkToward(page, gearDrop, 55, 900);
  }
  assert.ok(picked, "按 F 未拾取到任何地面掉落");
  const gainedAsset =
    countOf(after.inv) > countOf(before.inv) ||
    countOf(after.potion) > countOf(before.potion) ||
    countOf(after.gold) > countOf(before.gold) ||
    countOf(after.marks) > countOf(before.marks);
  assert.ok(
    gainedAsset,
    `拾取后资产未增加：背包 ${before.inv} → ${after.inv}，药水 ${before.potion} → ${after.potion}，金币 ${before.gold} → ${after.gold}，印记 ${before.marks} → ${after.marks}`
  );
  assert.match(after.objective, /✓/, `首领击破后关卡卡未更新：${after.objective}`);
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|404|Failed to load resource/i.test(message.text())) errors.push(message.text());
  });

  try {
    await verifyLayoutStability(page);
    process.stdout.write("UI render/input stability: PASS\n");
    await verifyBossRespawnCountdown(page);
    process.stdout.write("UI boss respawn countdown + pickup refresh: PASS\n");
    assert.deepEqual(errors, [], `页面异常：${errors.join(" ;; ")}`);
    process.stdout.write("ALL UI REGRESSION TESTS PASSED\n");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
