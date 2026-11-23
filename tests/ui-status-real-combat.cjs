// 0.8.76 回归：状态图标必须由真实战斗写入，而不是测试直接改 state。
// 覆盖四条「怪物命中玩家」的被动链路（中毒 / 减速 / 眩晕 / 致盲），
// 以及一条「玩家真实施放破甲斩」的目标减益链路；每次都在 HUD 上核对图标与角标。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const ROOT = BASE_URL.split("?")[0];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 移动端只验证「真实命中」也能正常上屏，布局四档仍由 ui-status-icons.cjs 负责。
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function readCatalog(page) {
  return page.evaluate(() => window.__ONEKNIFE_E2E__.catalog());
}

// macOS 上 Chrome 偶发首屏不落 DOM（同一浏览器连续开新 context 时更明显）。
// 这里给测试入口加重试，但只重试「加载/进游戏」，不吞业务断言。
async function enterGame(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${ROOT}/?e2e=1`, { waitUntil: "load", timeout: 20000 });
      await page.waitForFunction(
        () => Boolean(document.querySelector('[data-class="warrior"]')) || Boolean(window.__ONEKNIFE_E2E__?.snapshot()),
        { timeout: 15000 }
      );
      // 职业选择只是准备步骤；直接点 DOM，避开 macOS Chrome 偶发的 pointer 可交互性等待。
      const needClass = await page.evaluate(() => {
        const card = document.querySelector('[data-class="warrior"]');
        return Boolean(card && !document.querySelector("#classModal")?.classList.contains("hidden"));
      });
      if (needClass) await page.evaluate(() => document.querySelector('[data-class="warrior"]')?.click());
      await page.waitForFunction(() => window.__ONEKNIFE_E2E__?.snapshot() !== null, { timeout: 15000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await page.reload({ waitUntil: "load", timeout: 20000 }).catch(() => {});
    }
  }
  throw lastError;
}

// 载入真实地图、锁定真实怪物，并把双方摆在攻击距离内。
// 不写任何状态字段，只准备「谁打谁」；状态由 playerDamage / applyOnHitPassives 产生。
async function prepareMonster(page, { mapId, monsterName }) {
  return page.evaluate(
    async ({ mapId, monsterName }) => {
      const main = window.__ONEKNIFE_E2E__.testApi;
      const state = main.state();
      main.setPaused(false, "status-real-combat");
      // 真实地图载入：怪物、首领、刷新点、寻路全部走生产路径。
      main.loadMap(mapId, 100, 100, true);
      state.player.level = 30;
      state.player.invulnerable = 0;
      state.player.attackTimer = 999; // 不还手，避免把测试怪打死或干扰被动采样
      state.player.targetId = null;
      state.player.autoAttackId = null;
      state.player.attackGate = 0;
      state.player.castWindup = 0;
      state.player.recovery = 0;
      state.player.resource = 100;
      state.player.cooldowns = [0, 0, 0, 0];
      const maxHp = window.__ONEKNIFE_E2E__.snapshot().player.maxHp;
      state.player.hp = maxHp;
      const target = state.entities.find(
        (entity) => entity.alive && !entity.boss && !entity.npc && !entity.friendly && entity.name.includes(monsterName)
      );
      if (!target) throw new Error(`地图 ${mapId} 里找不到真实怪物「${monsterName}」`);
      // 隔离：其余怪不接战，避免别的被动混进本次断言。
      for (const entity of state.entities) {
        if (entity === target) continue;
        entity.aggro = false;
        entity.attackCooldown = 999;
        entity.windup = 0;
      }
      // 把怪与玩家放到同一片空地；保留原刷怪坐标为锚点，避免脱战判定把它拉回。
      const battleX = Math.min(Math.max(target.spawnX || target.x, 220), 1400);
      const battleY = Math.min(Math.max(target.spawnY || target.y, 220), 900);
      target.x = battleX;
      target.y = battleY;
      target.spawnX = battleX;
      target.spawnY = battleY;
      state.player.x = battleX + 50;
      state.player.y = battleY;
      target.aggro = true;
      target.attackCooldown = 0;
      target.windup = 0;
      return {
        id: target.id,
        name: target.name,
        passives: (target.abilities?.passives || []).map((passive) => passive.id),
        attackShape: target.abilities?.attack || "normal",
        hp: target.hp,
        maxHp: target.maxHp
      };
    },
    { mapId, monsterName }
  );
}

// 轮询真实战斗结果；命中后立即暂停，避免 0.5 秒眩晕在断言/截图前自然结束。
// 暂停只冻结后续帧，不修改任何状态值。
async function waitForStatus(page, kind, expectedName, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await page.evaluate(
      async ({ statusKind, expectedName }) => {
        const main = window.__ONEKNIFE_E2E__.testApi;
        const state = main.state();
        if (!state?.player) return null;
        const player = state.player;
        // 状态必须和本次命中者同时成立：避免上一场残留计时或旧 lastKiller 造成假阳性。
        const fromExpected = player.lastKiller === expectedName;
        const matched =
          fromExpected &&
          (statusKind === "poison"
            ? (player.poison || 0) > 0
            : statusKind === "slow"
              ? (player.slowTimer || 0) > 0
              : statusKind === "stun"
                ? (player.stunTimer || 0) > 0
                : (player.blindTimer || 0) > 0);
        if (!matched) return null;
        main.setPaused(true, "status-real-combat");
        main.renderAll();
        return {
          poison: player.poison || 0,
          slow: player.slowTimer || 0,
          slowFactor: player.slowFactor || 1,
          stun: player.stunTimer || 0,
          blind: player.blindTimer || 0,
          blindMissChance: player.blindMissChance || 0,
          hp: player.hp,
          lastKiller: player.lastKiller || null
        };
      },
      { statusKind: kind, expectedName }
    );
    if (hit) return hit;
    await sleep(20);
  }
  throw new Error(`等待真实状态「${kind}」超时`);
}

// 真实施放破甲斩：锁定真实目标，走 castSkill(0) 的完整扣资源 / 伤害 / applyArmorBreak 流程。
async function castRealArmorBreak(page, { mapId, monsterName }) {
  return page.evaluate(
    async ({ mapId, monsterName }) => {
      const main = window.__ONEKNIFE_E2E__.testApi;
      const state = main.state();
      main.setPaused(false, "status-real-combat");
      main.loadMap(mapId, 100, 100, true);
      state.player.level = 30;
      state.player.invulnerable = 0;
      state.player.attackTimer = 999;
      state.player.hp = window.__ONEKNIFE_E2E__.snapshot().player.maxHp;
      state.player.resource = 100;
      state.player.cooldowns = [0, 0, 0, 0];
      state.player.castWindup = 0;
      state.player.recovery = 0;
      state.player.skillLock = 0;
      const target = state.entities.find((entity) => entity.alive && !entity.npc && !entity.friendly && entity.name.includes(monsterName));
      if (!target) throw new Error(`地图 ${mapId} 里找不到破甲目标「${monsterName}」`);
      const battleX = Math.min(Math.max(target.x, 220), 1400);
      const battleY = Math.min(Math.max(target.y, 220), 900);
      target.x = battleX;
      target.y = battleY;
      state.player.x = battleX + 60;
      state.player.y = battleY;
      state.player.targetId = target.id;
      state.player.autoAttackId = null;
      // 关掉其余怪，避免它们对破甲断言造成干扰。
      for (const entity of state.entities) {
        if (entity === target) continue;
        entity.aggro = false;
        entity.attackCooldown = 999;
      }
      const hpBefore = target.hp;
      main.castSkill(0);
      main.setPaused(true, "status-real-combat");
      main.renderAll();
      return {
        id: target.id,
        name: target.name,
        hpBefore,
        hpAfter: target.hp,
        armorBreak: target.armorBreakTimer || 0,
        playerResource: state.player.resource,
        playerCooldown: state.player.cooldowns[0]
      };
    },
    { mapId, monsterName }
  );
}

async function readHud(page) {
  return page.evaluate(() => {
    const visible = (element) => Boolean(element && !element.classList.contains("hidden") && element.getBoundingClientRect().width > 0);
    // 与 ui-status-icons 相同的裁切检查：仅看 width 会把被 overflow 裁掉的图标当成成功。
    const clipped = (element) => {
      if (!element) return false;
      let node = element.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(hidden|auto|scroll|clip)/.test(style.overflowY)) {
          const rect = element.getBoundingClientRect();
          const nodeRect = node.getBoundingClientRect();
          if (rect.bottom > nodeRect.bottom + 1 || rect.top < nodeRect.top - 1) return true;
        }
        node = node.parentElement;
      }
      return false;
    };
    const strip = document.querySelector("#playerStatusStrip");
    const targetStatus = document.querySelector("#targetStatus");
    const chips = [...document.querySelectorAll("#playerStatusStrip .status-chip")];
    return {
      stripVisible: visible(strip),
      stripClipped: clipped(strip),
      visibleChips: chips.filter(visible).map((chip) => chip.id),
      clippedChips: chips.filter((chip) => visible(chip) && clipped(chip)).map((chip) => chip.id),
      poisonCount: document.querySelector("#statusPoisonCount")?.textContent || "",
      slowCount: document.querySelector("#statusSlowCount")?.textContent || "",
      blindCount: document.querySelector("#statusBlindCount")?.textContent || "",
      targetVisible: visible(targetStatus),
      targetClipped: clipped(targetStatus),
      armorBreakCount: document.querySelector("#statusArmorBreakCount")?.textContent || "",
      icons: [...document.querySelectorAll("#playerStatusStrip img, #targetStatus img")].map((image) => ({
        src: image.getAttribute("src"),
        complete: image.complete,
        naturalWidth: image.naturalWidth
      }))
    };
  });
}

async function cleanShot(page, path) {
  await page.evaluate(() => {
    // 截图只看 HUD：隐藏新手条、toast 和暂停遮罩，不恢复游戏。
    document.querySelector("#guideBanner")?.classList.add("hidden");
    document.querySelector("#toast")?.classList.add("hidden");
    document.querySelector("#pauseOverlay")?.classList.add("hidden");
  });
  await page.screenshot({ path });
}

async function runDesktop(browser, catalog) {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    // 确定性只针对随机判定：Math.random 固定为 0，让 35%/40%/25% 的被动每击必中。
    // 状态仍由真实怪物命中、真实 applyOnHitPassives 写入，不是测试直写字段。
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await enterGame(page);

    // 1) 中毒：黑岩矿坑的腐毒僵尸（毒液 + 资源压制）。
    const poisonTarget = await prepareMonster(page, { mapId: "black_rock_mine", monsterName: "腐毒僵尸" });
    assert.ok(poisonTarget.passives.includes("poison"), `腐毒僵尸必须带 poison 被动，实际 ${poisonTarget.passives.join(",")}`);
    const poisonState = await waitForStatus(page, "poison", poisonTarget.name);
    const poisonHud = await readHud(page);
    assert.equal(poisonState.lastKiller, poisonTarget.name, `中毒必须来自真实命中（lastKiller=${poisonState.lastKiller}）`);
    assert.equal(poisonState.poison, 1, `腐毒僵尸一次命中应叠 1 层毒，实际 ${poisonState.poison}`);
    assert.equal(poisonHud.stripVisible, true, "中毒后玩家状态条未显示");
    assert.equal(poisonHud.stripClipped, false, "中毒状态条被裁切");
    assert.ok(poisonHud.visibleChips.includes("statusPoison"), "中毒图标未上屏");
    assert.equal(poisonHud.poisonCount, "×1", `中毒角标应为 ×1，实际 ${poisonHud.poisonCount}`);
    await cleanShot(page, "试玩截图-真实状态-中毒.png");
    process.stdout.write(`真实中毒: PASS（${poisonTarget.name} · 层数 ${poisonState.poison}）\n`);

    // 2) 眩晕：黑岩矿坑的矿脉蝙蝠（冲锋 + 眩晕）。
    const stunTarget = await prepareMonster(page, { mapId: "black_rock_mine", monsterName: "矿脉蝙蝠" });
    assert.ok(stunTarget.passives.includes("stun"), `矿脉蝙蝠必须带 stun 被动，实际 ${stunTarget.passives.join(",")}`);
    const stunState = await waitForStatus(page, "stun", stunTarget.name);
    const stunHud = await readHud(page);
    assert.ok(stunState.stun > 0, `眩晕计时必须为正，实际 ${stunState.stun}`);
    assert.equal(stunState.lastKiller, stunTarget.name, `眩晕必须来自真实命中（lastKiller=${stunState.lastKiller}）`);
    assert.equal(stunHud.stripVisible, true, "眩晕后玩家状态条未显示");
    assert.ok(stunHud.visibleChips.includes("statusStun"), "眩晕图标未上屏");
    assert.equal(stunHud.clippedChips.length, 0, `眩晕图标被裁切：${stunHud.clippedChips.join(",")}`);
    await cleanShot(page, "试玩截图-真实状态-眩晕.png");
    process.stdout.write(`真实眩晕: PASS（${stunTarget.name} · ${stunState.stun.toFixed(2)}s）\n`);

    // 3) 减速：冰封北境的霜牙狼（冲锋 + 减速）。
    const snowMap = catalog.find((map) => map.monsterProfiles.some((profile) => profile.name.includes("霜牙狼")));
    assert.ok(snowMap, "关卡目录里找不到含霜牙狼的冰封地图");
    const slowTarget = await prepareMonster(page, { mapId: snowMap.id, monsterName: "霜牙狼" });
    assert.ok(slowTarget.passives.includes("slow"), `霜牙狼必须带 slow 被动，实际 ${slowTarget.passives.join(",")}`);
    const slowState = await waitForStatus(page, "slow", slowTarget.name);
    const slowHud = await readHud(page);
    assert.ok(slowState.slow > 0, `减速计时必须为正，实际 ${slowState.slow}`);
    assert.equal(slowState.lastKiller, slowTarget.name, `减速必须来自真实命中（lastKiller=${slowState.lastKiller}）`);
    assert.equal(slowHud.stripVisible, true, "减速后玩家状态条未显示");
    assert.ok(slowHud.visibleChips.includes("statusSlow"), "减速图标未上屏");
    assert.equal(slowHud.slowCount, `${Math.ceil(slowState.slow)}s`, `减速角标错误：${slowHud.slowCount}`);
    await cleanShot(page, "试玩截图-真实状态-减速.png");
    process.stdout.write(`真实减速: PASS（${slowTarget.name} · ${slowState.slow.toFixed(2)}s）\n`);

    // 4) 致盲：冰封北境的雪原猎手（远程 + 致盲）。
    const blindTarget = await prepareMonster(page, { mapId: snowMap.id, monsterName: "雪原猎手" });
    assert.ok(blindTarget.passives.includes("blind"), `雪原猎手必须带 blind 被动，实际 ${blindTarget.passives.join(",")}`);
    const blindState = await waitForStatus(page, "blind", blindTarget.name);
    const blindHud = await readHud(page);
    assert.ok(blindState.blind > 0, `致盲计时必须为正，实际 ${blindState.blind}`);
    assert.equal(blindState.lastKiller, blindTarget.name, `致盲必须来自真实命中（lastKiller=${blindState.lastKiller}）`);
    assert.equal(blindState.blindMissChance, 0.3, `失手概率应为 0.3，实际 ${blindState.blindMissChance}`);
    assert.equal(blindHud.stripVisible, true, "致盲后玩家状态条未显示");
    assert.ok(blindHud.visibleChips.includes("statusBlind"), "致盲图标未上屏");
    assert.equal(blindHud.blindCount, `${Math.ceil(blindState.blind)}s`, `致盲角标错误：${blindHud.blindCount}`);
    await cleanShot(page, "试玩截图-真实状态-致盲.png");
    process.stdout.write(`真实致盲: PASS（${blindTarget.name} · ${blindState.blind.toFixed(2)}s）\n`);

    // 5) 破甲：真实施放破甲斩命中冰封北境的高血量怪，不直接写 armorBreakTimer。
    // 用该图首领作为破甲靶：血量足够高，不会一次破甲斩就死亡；首领本身也是真实实体。
    const armorTarget = await castRealArmorBreak(page, { mapId: snowMap.id, monsterName: snowMap.boss });
    const armorHud = await readHud(page);
    assert.ok(armorTarget.armorBreak > 0, `破甲计时必须为正，实际 ${armorTarget.armorBreak}`);
    assert.ok(armorTarget.hpAfter < armorTarget.hpBefore, "破甲斩未造成真实伤害，施法链路异常");
    assert.ok(armorTarget.playerResource < 100, "破甲斩未扣除怒气，施法链路未真正执行");
    assert.ok(armorTarget.playerCooldown > 0, "破甲斩未进入冷却，施法链路未真正执行");
    assert.equal(armorHud.targetVisible, true, "目标破甲图标未显示");
    assert.equal(armorHud.targetClipped, false, "目标破甲图标被裁切");
    assert.equal(armorHud.armorBreakCount, `${Math.ceil(armorTarget.armorBreak)}s`, `破甲角标错误：${armorHud.armorBreakCount}`);
    assert.equal(armorHud.stripVisible, false, "破甲不应混入玩家自身状态条");
    await cleanShot(page, "试玩截图-真实状态-破甲.png");
    process.stdout.write(
      `真实破甲: PASS（${armorTarget.name} · ${armorTarget.armorBreak.toFixed(2)}s · 资源 ${armorTarget.playerResource} · CD ${armorTarget.playerCooldown}s）\n`
    );

    assert.deepEqual(errors, [], `桌面状态回归页面异常：${errors.join(" | ")}`);
  } finally {
    await context.close();
  }
}

async function runMobile(browser) {
  const context = await browser.newContext({ viewport: MOBILE });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await enterGame(page);

    // 林皮蛛一次命中同时带毒与减速，适合在 390px 下确认「真实触发的多枚图标」不互相挤掉。
    const target = await prepareMonster(page, { mapId: "pine_forest", monsterName: "林皮蛛" });
    assert.ok(target.passives.includes("poison"), "林皮蛛必须带 poison 被动");
    assert.ok(target.passives.includes("slow"), "林皮蛛必须带 slow 被动");
    await waitForStatus(page, "poison", target.name);
    await waitForStatus(page, "slow", target.name);
    const hud = await readHud(page);
    assert.equal(hud.stripVisible, true, "移动端真实状态条未显示");
    assert.equal(hud.stripClipped, false, "移动端真实状态条被滚动容器裁切");
    assert.equal(hud.clippedChips.length, 0, `移动端真实状态图标被裁切：${hud.clippedChips.join(",")}`);
    assert.ok(hud.visibleChips.includes("statusPoison"), "移动端中毒图标未上屏");
    assert.ok(hud.visibleChips.includes("statusSlow"), "移动端减速图标未上屏");
    assert.ok(
      hud.icons.every((icon) => icon.complete && icon.naturalWidth === 128),
      "移动端状态图标未加载"
    );
    await cleanShot(page, "试玩截图-真实状态-移动端.png");
    assert.deepEqual(errors, [], `移动端状态回归页面异常：${errors.join(" | ")}`);
    process.stdout.write(`真实状态移动端: PASS（${target.name} · ${hud.visibleChips.join(",")}）\n`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const catalogPage = await browser.newPage();
    await enterGame(catalogPage);
    const catalog = await readCatalog(catalogPage);
    await catalogPage.close();
    await runDesktop(browser, catalog);
    await runMobile(browser);
    process.stdout.write("真实战斗状态回归通过\n");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
