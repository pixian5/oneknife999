// 0.8.80 地图威胁 / 专属精英 UI 回归：
// 1) 五类威胁必须真的改变运行时（灼热扣血、雷暴落圈、潮汐减速、腐雾压低药水、矿尘有伤害倍率）；
// 2) 安全区必须免疫环境伤害；
// 3) 每章 3 张图的专属精英必须落到实体上，且名字牌读得到称号。
// 这里用 testApi 直接把玩家放到营地外，不依赖真实走位；只改威胁计时器，不注入战斗逻辑。

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const ROOT = BASE_URL.split("?")[0];
const MAPS = {
  rot: "stage_005",
  storm: "stage_007",
  tide: "stage_009",
  dust: "stage_018",
  heat: "stage_019",
  exclusive: "stage_005"
};

async function boot(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(BASE_URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.testApi, { timeout: 20000 });
  // 新档会弹职业选择；选第一个职业后进入灰烬边境。
  if (await page.locator("#classOptions button").count()) await page.click("#classOptions button");
  await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot()?.currentMapId, { timeout: 20000 });
  return errors;
}

async function loadOutside(page, mapId) {
  return page.evaluate(
    async ({ mapId }) => {
      const api = window.__ONEKNIFE_E2E__.testApi;
      const { MAPS: all } = await import("./src/maps.js");
      const map = all[mapId];
      // 0.55/0.55 是布局里的野外中段，避开城镇 / 水井 / 篝火安全区。
      api.loadMap(mapId, map.width * 0.55, map.height * 0.55);
      api.setPaused(false);
      const state = api.state();
      state.player.invulnerable = 999;
      state.player.hp = state.player.maxHp;
      return { threat: state.threat ? state.threat.id : null, maxHp: state.player.maxHp };
    },
    { mapId }
  );
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = await boot(page);

  // 专属精英：固定刷怪点、唯一称号、固定词缀，不能只是地图数据里有个名字。
  const elite = await page.evaluate(
    async ({ mapId }) => {
      const api = window.__ONEKNIFE_E2E__.testApi;
      const { MAPS: all } = await import("./src/maps.js");
      const map = all[mapId];
      api.loadMap(mapId, map.width * 0.55, map.height * 0.55);
      const state = api.state();
      const found = state.entities.filter((entity) => entity.elite?.exclusive);
      return found.map((entity) => ({
        name: entity.name,
        title: entity.elite.title,
        affixes: entity.elite.affixes,
        x: entity.x,
        y: entity.y
      }));
    },
    { mapId: MAPS.exclusive }
  );
  assert.equal(elite.length, 1, "每张专属精英图应有且只有 1 只专属精英");
  assert.equal(elite[0].title, "焦土督军");
  assert.deepEqual(elite[0].affixes, ["guardian", "enrage"]);

  // 灼热：营地外每 5 秒扣 2% 最大生命；这里只把计时器拨到临界点。
  const heat = await loadOutside(page, MAPS.heat);
  assert.equal(heat.threat, "heat");
  await page.evaluate(() => {
    const state = window.__ONEKNIFE_E2E__.testApi.state();
    state.threat.heatTimer = 0.01;
    state.player.hp = state.player.maxHp;
  });
  await page.waitForFunction(
    (maxHp) => {
      const state = window.__ONEKNIFE_E2E__.testApi.state();
      return state.player.hp <= maxHp - Math.max(1, Math.round(maxHp * 0.02));
    },
    heat.maxHp,
    { timeout: 2000 }
  );

  // 雷暴：营地外落一个 1.2 秒预警圈，诊断计数 +1。
  const storm = await loadOutside(page, MAPS.storm);
  assert.equal(storm.threat, "storm");
  await page.evaluate(() => {
    const state = window.__ONEKNIFE_E2E__.testApi.state();
    state.threat.stormTimer = 0.01;
    state.hazards.length = 0;
    state.hazardsSpawned = 0;
  });
  await page.waitForFunction(
    () => {
      const state = window.__ONEKNIFE_E2E__.testApi.state();
      return state.hazards.some((hazard) => hazard.kind === "storm") && state.hazardsSpawned >= 1;
    },
    { timeout: 2000 }
  );

  // 潮汐：营地外周期性减速 1.6 秒到 65%。
  const tide = await loadOutside(page, MAPS.tide);
  assert.equal(tide.threat, "tide");
  await page.evaluate(() => {
    const state = window.__ONEKNIFE_E2E__.testApi.state();
    state.threat.tideTimer = 0.01;
  });
  await page.waitForFunction(
    () => {
      const state = window.__ONEKNIFE_E2E__.testApi.state();
      return state.player.slowTimer > 0.5 && state.player.slowFactor === 0.65;
    },
    { timeout: 2000 }
  );

  // 腐雾：药水恢复从 32% 压到 72%；用真实按钮触发 usePotion，避免只测纯函数。
  const rot = await loadOutside(page, MAPS.rot);
  assert.equal(rot.threat, "rot");
  const potion = await page.evaluate(() => {
    const state = window.__ONEKNIFE_E2E__.testApi.state();
    state.player.hp = Math.max(1, state.player.maxHp - 100);
    state.player.potion = 3;
    return { before: state.player.hp, maxHp: state.player.maxHp };
  });
  await page.click("#potionBtn");
  await page.waitForTimeout(80);
  const potionAfter = await page.evaluate(() => {
    const state = window.__ONEKNIFE_E2E__.testApi.state();
    return { hp: state.player.hp, potion: state.player.potion };
  });
  const expectedGain = Math.round(potion.maxHp * 0.32 * 0.72);
  assert.equal(potionAfter.potion, potion.before < potion.maxHp ? 2 : 3, "药水次数应消耗一次");
  assert.ok(
    Math.abs(potionAfter.hp - Math.min(potion.maxHp, potion.before + expectedGain)) <= 2,
    `腐雾药水恢复异常：${potion.before} -> ${potionAfter.hp}，期望 +${expectedGain}`
  );

  // 安全区：同一张灼热图，把玩家放回城镇中心，灼热计时器到点也不应扣血。
  const safe = await page.evaluate(
    async ({ mapId }) => {
      const api = window.__ONEKNIFE_E2E__.testApi;
      const { MAPS: all } = await import("./src/maps.js");
      const map = all[mapId];
      api.loadMap(mapId, map.townRect.x + map.townRect.w / 2, map.townRect.y + map.townRect.h / 2);
      const state = api.state();
      state.player.invulnerable = 999;
      state.player.hp = state.player.maxHp;
      state.threat.heatTimer = 0.01;
      return { hp: state.player.hp };
    },
    { mapId: MAPS.heat }
  );
  await page.waitForTimeout(400);
  const safeAfter = await page.evaluate(() => window.__ONEKNIFE_E2E__.testApi.state().player.hp);
  assert.equal(safeAfter, safe.hp, "安全区内不应结算灼热伤害");

  // 矿尘：倍率由纯函数测试覆盖；这里确认运行时确实是 dust，避免 UI 标签与运行时错位。
  const dust = await loadOutside(page, MAPS.dust);
  assert.equal(dust.threat, "dust");

  assert.deepEqual(errors, [], `页面存在运行错误：${errors.join(" | ")}`);
  await browser.close();
  console.log("0.8.80 威胁 / 专属精英 UI 回归通过：heat / storm / tide / rot / safe / elite / dust");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
