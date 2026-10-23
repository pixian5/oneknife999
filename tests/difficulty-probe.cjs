// 非快进难度探针（0.3.6）：抽样关卡在「真实伤害」下通关，测量单关死亡数与模拟耗时。
// 背景：百图 e2e 走 fast 模式（玩家伤害 ×25），怪物常在前摇期间被击杀，死亡数不能代表真实难度。
// 本探针不携带 fast 参数，只快进「虚拟时间」（page.clock），伤害与怪物出手完全按正式数值结算。
// 运行方式：npm run test:difficulty（需先 npm run serve）。
// 可调环境变量：
//   ONEKNIFE_PROBE_STAGES=5,15          抽样关卡号（默认 5,15；单关约 5~10 分钟真实耗时，
//                                       ONEKNIFE_PROBE_STAGES=5,15,25 可用于发布前全量抽样）
//   ONEKNIFE_PROBE_CLASS=warrior        职业（warrior / mage / taoist）
//   ONEKNIFE_PROBE_MAX_DEATHS=6         单关死亡上限（默认 6）
//   ONEKNIFE_PROBE_MAX_SECONDS=900      单关模拟耗时上限，单位秒（默认 900）
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

// maps.js 是 ES Module，CJS 脚本用动态 import 读取关卡掉落表（只读数据，不启动游戏）。
const mapsModulePromise = import(pathToFileURL(path.join(__dirname, "../game/src/maps.js")).href);

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const CLASS_ID = process.env.ONEKNIFE_PROBE_CLASS || "warrior";
const STAGE_NUMBERS = (process.env.ONEKNIFE_PROBE_STAGES || "5,15")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
const MAX_DEATHS = Number(process.env.ONEKNIFE_PROBE_MAX_DEATHS || 6);
const MAX_SECONDS = Number(process.env.ONEKNIFE_PROBE_MAX_SECONDS || 900);
const SAVE_KEY = "oneknife999-prototype-save-v4";
const BASE_HP = { warrior: 350, mage: 235, taoist: 280 };
const BASE_ATTACK = { warrior: 33, mage: 41, taoist: 30 };
// 与 config.js 的职业普攻距离保持一致：决定「贴脸」还是「停在射程边缘」。
const ATTACK_RANGE = { warrior: 70, mage: 220, taoist: 185 };
// 技能轮换序列：普攻与技能交替使用，避免只靠普攻导致耗时失真。
const SKILL_CYCLE = ["1", "2", "3", "4"];

if (!STAGE_NUMBERS.length) throw new Error("ONEKNIFE_PROBE_STAGES 至少需要一个正整数关卡号");

// 主线等级曲线：与 e2e-ten-clear-runs.cjs 的 expectedGrowth 同源（只取等级）。
function mainlineLevel(clearedMaps) {
  if (clearedMaps <= 10) return 1 + clearedMaps;
  if (clearedMaps <= 30) return 11 + Math.floor((clearedMaps - 10) / 2);
  if (clearedMaps <= 60) return 21 + Math.floor((clearedMaps - 30) / 3);
  return 31 + Math.floor((clearedMaps - 60) / 4);
}

async function snapshot(page) {
  return page.evaluate(() => window.__ONEKNIFE_E2E__?.snapshot());
}

async function meta(page) {
  return page.evaluate(() => window.__ONEKNIFE_E2E__.meta());
}

async function canvasGeometry(page, worldPoint) {
  const [snap, info, rect] = await Promise.all([snapshot(page), meta(page), page.locator("#gameCanvas").boundingBox()]);
  return {
    snap,
    rect,
    x: rect.x + (worldPoint.x - info.camera.x) * info.viewScale,
    y: rect.y + (worldPoint.y - info.camera.y) * info.viewScale
  };
}

// 基线装备：直接穿戴本关掉落表里的 4 件装备（maps.js 的 power 随关卡线性成长）。
// 这是「玩家正常推进到本关、捡到当前关掉落」的最低配，避免裸装被首领反复秒杀——
// 裸装会让「死亡 → 复活 → 首领满血重置」形成死循环，探针永远打不完。
function buildStageGear(map) {
  const gear = {};
  for (const drop of (map.drops || []).slice(0, 4)) {
    gear[drop.slot] = {
      id: `probe-${drop.slot}`,
      name: drop.name,
      slot: drop.slot,
      quality: drop.quality,
      glyph: drop.glyph,
      power: drop.power,
      value: drop.value || 0,
      color: drop.color,
      desc: drop.desc || "",
      enhance: 0,
      affixes: []
    };
  }
  return gear;
}

// 注入存档：把目标关卡之前的所有关卡标记为已通关，玩家等级对齐主线曲线，
// 装备使用本关掉落基线（见 buildStageGear）。
async function injectStageSave(page, stageNumber, mapId, needs, gear) {
  await page.evaluate(
    ({ key, stageNumber, mapId, needs, classId, level, baseHp, baseAttack, gear }) => {
      const cleared = {};
      for (const [id, need] of Object.entries(needs)) {
        if (id === mapId) break;
        cleared[id] = { kills: need, bossDefeated: true, completed: true, siteClaimed: true, resourceClaimed: true };
      }
      const visitedMaps = { ash_outskirts: true };
      for (const id of Object.keys(cleared)) visitedMaps[id] = true;
      // 技能点按等级均分到四个技能（真实玩家点满技能再进关，不点技能会让探针误判难度）。
      const skillPoints = Math.max(0, level - 1);
      const skillLevels = [0, 0, 0, 0];
      for (let index = 0; index < skillPoints; index += 1) skillLevels[index % 4] += 1;
      // 存档里装备写两处（顶层与 player），loadGame 优先读顶层。
      const equipment = gear;
      const save = {
        saveVersion: 4,
        classId,
        currentMapId: mapId,
        player: {
          level,
          exp: 0,
          nextExp: 100,
          hp: baseHp + level * 18,
          resource: { warrior: 100, mage: 240, taoist: 160 }[classId],
          potion: 6,
          gold: 4000,
          marks: 200,
          deaths: 0,
          sin: 0,
          charge: 0,
          poison: 0,
          poisonTimer: 0,
          attack: baseAttack,
          skillPoints: 0,
          skillLevels,
          equipment,
          visitedMaps,
          targetId: null
        },
        inventory: [],
        equipment,
        mapProgress: cleared
      };
      localStorage.setItem(key, JSON.stringify(save));
      return stageNumber;
    },
    {
      key: SAVE_KEY,
      stageNumber,
      mapId,
      needs,
      classId: CLASS_ID,
      level: mainlineLevel(stageNumber - 1),
      baseHp: BASE_HP[CLASS_ID],
      baseAttack: BASE_ATTACK[CLASS_ID],
      gear
    }
  );
}

// approachDistance 按职业攻击距离取值：法师 / 道士停在射程边缘，不主动贴脸送死。
async function moveEntityIntoView(page, entityId, expectedMap, approachDistance = 280) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const snap = await snapshot(page);
    if (snap.currentMapId !== expectedMap) return false;
    const entity = snap.entities.find((item) => item.id === entityId && item.alive);
    if (!entity) return false;
    const geometry = await canvasGeometry(page, entity);
    const margin = 35;
    if (
      Math.hypot(entity.x - snap.player.x, entity.y - snap.player.y) <= approachDistance &&
      geometry.x > geometry.rect.x + margin &&
      geometry.x < geometry.rect.x + geometry.rect.width - margin &&
      geometry.y > geometry.rect.y + margin &&
      geometry.y < geometry.rect.y + geometry.rect.height - margin
    )
      return true;
    const dx = entity.x - snap.player.x;
    const dy = entity.y - snap.player.y;
    const horizontalKey = dx < 0 ? "a" : "d";
    const verticalKey = dy < 0 ? "w" : "s";
    const horizontalNeeded = Math.abs(dx) > 24;
    const verticalNeeded = Math.abs(dy) > 24;
    if (horizontalNeeded) await page.keyboard.down(horizontalKey);
    if (verticalNeeded) await page.keyboard.down(verticalKey);
    await page.clock.runFor(520);
    if (horizontalNeeded) await page.keyboard.up(horizontalKey);
    if (verticalNeeded) await page.keyboard.up(verticalKey);
  }
  // 60 次尝试仍未接近（常见于低血量职业被反复击退 / 复活后重走），返回 false 交给外层继续，
  // 不直接抛错——探针要的是「测得死亡数与耗时」，而不是一有卡顿就整体失败。
  return false;
}

async function moveToPoint(page, point, expectedMap, radius = 54) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const geometry = await canvasGeometry(page, point);
    if (geometry.snap.currentMapId !== expectedMap) return false;
    if (Math.hypot(point.x - geometry.snap.player.x, point.y - geometry.snap.player.y) <= radius) return true;
    const margin = 42;
    if (
      geometry.x < geometry.rect.x + margin ||
      geometry.x > geometry.rect.x + geometry.rect.width - margin ||
      geometry.y < geometry.rect.y + margin ||
      geometry.y > geometry.rect.y + geometry.rect.height - margin
    ) {
      const dx = point.x - geometry.snap.player.x;
      const dy = point.y - geometry.snap.player.y;
      const key = Math.abs(dx) > Math.abs(dy) * 0.45 ? (dx < 0 ? "a" : "d") : dy < 0 ? "w" : "s";
      await page.keyboard.down(key);
      await page.clock.runFor(720);
      await page.keyboard.up(key);
      continue;
    }
    await page.mouse.click(geometry.x, geometry.y);
    const distance = Math.hypot(point.x - geometry.snap.player.x, point.y - geometry.snap.player.y);
    await page.clock.runFor(Math.max(420, Math.min(1800, (distance / 190) * 1000 + 240)));
  }
  return false;
}

// 玩家模型：普攻与技能交替、低血喝药、近战躲首领前摇、远程停在射程边缘。
// 这套模型刻意「不菜也不神」：能反映数值回退，又不追求极限操作。
// 返回本次消耗的模拟毫秒数，供探针统计单关耗时。
async function defeatEntity(page, entityId, mapId, safePoint) {
  const isBoss = entityId.startsWith("boss-");
  let elapsed = 0;
  const spend = async (milliseconds) => {
    await page.clock.runFor(milliseconds);
    elapsed += milliseconds;
  };
  for (let guard = 0; guard < 1600; guard += 1) {
    // 单个目标最多消耗 MAX_SECONDS 模拟时间：超出说明战斗推进异常（或数值被改坏），直接失败。
    if (elapsed > MAX_SECONDS * 1000) throw new Error(`${entityId} 单个目标消耗超过 ${MAX_SECONDS}s，战斗无法推进`);
    if (guard > 0 && guard % 50 === 0) {
      const progress = await snapshot(page);
      const target = progress.entities.find((item) => item.id === entityId);
      process.stdout.write(
        `PROBE FIGHT ${entityId} guard=${guard} elapsed=${Math.round(elapsed / 1000)}s hp=${target ? `${Math.round(target.hp)}/${Math.round(target.maxHp)}` : "gone"} playerHp=${Math.round(progress.player.hp)} deaths=${progress.player.deaths}\n`
      );
    }
    let snap = await snapshot(page);
    if (snap.currentMapId !== mapId) return elapsed;
    const entity = snap.entities.find((item) => item.id === entityId);
    if (!entity || !entity.alive) return elapsed;
    const attackRange = ATTACK_RANGE[snap.classId] || 160;
    const movedIntoView = await moveEntityIntoView(page, entityId, mapId, Math.max(60, attackRange - 12));
    if (!movedIntoView) {
      await spend(1200);
      continue;
    }
    snap = await snapshot(page);
    const current = snap.entities.find((item) => item.id === entityId && item.alive);
    if (!current) return elapsed;
    // 真实最大生命由游戏侧给出（含装备生命加成）；漏算装备会把「半血」误判成「满血」。
    const maxHp = snap.player.maxHp || (BASE_HP[snap.classId] || 280) + snap.player.level * 18;
    // 药水：血量掉到 55% 就喝（每 4 个循环检查一次，避免无意义连按）。
    if (guard % 4 === 0 && (snap.player.potion || 0) > 0 && snap.player.hp < maxHp * 0.55) await page.keyboard.press("q");
    const nearSafePoint = Math.hypot(snap.player.x - safePoint.x, snap.player.y - safePoint.y) <= 54;
    // 阈值放到 60% / 3 层毒：85% 就撤退会让「撤退—回营地—再进场」无限循环，反而测不出 DPS。
    const needsRecovery = snap.player.poison >= 3 || snap.player.hp < maxHp * 0.6;
    // 首领：掉到 60% 或中毒 3 层就回营地脱战回血（真实玩家在非快进下的常规打法）。
    if (current.boss && !nearSafePoint && needsRecovery) {
      if (await moveToPoint(page, safePoint, mapId)) {
        await spend(1800);
        continue;
      }
    }
    const geometry = await canvasGeometry(page, current);
    await page.mouse.click(geometry.x, geometry.y);
    // 出手：普攻与技能交替，避免只靠普攻导致耗时失真。
    await page.keyboard.press(guard % 2 === 0 ? "x" : SKILL_CYCLE[guard % SKILL_CYCLE.length]);
    await page.keyboard.press("f");
    const inAttackRange = Math.hypot(current.x - snap.player.x, current.y - snap.player.y) <= attackRange + 18;
    // 近战打首领走「一刀一撤」：首领攻击距离 = radius + 70 ≈ 104px，
    // 出手后后撤 0.32s（约 70px）即可让 0.6s 蓄力环落空——这是设计上给出的走位躲前摇解法。
    // 只横移不后撤会一直站在首领攻击距离内（踩过这个坑：横移 240ms 仍被连续命中）。
    if (current.boss && inAttackRange && attackRange < 100) {
      const dx = current.x - snap.player.x;
      const dy = current.y - snap.player.y;
      const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "a" : "d") : dy > 0 ? "w" : "s";
      await page.keyboard.down(key);
      await spend(320);
      await page.keyboard.up(key);
    } else await spend(current.boss ? 420 : 650);
  }
  throw new Error(`探针击杀 ${entityId} 超时（模拟 ${Math.round(elapsed / 1000)}s）：${JSON.stringify(await snapshot(page))}`);
}

async function probeStage(page, stage) {
  const mapId = stage.mapId;
  const { MAPS } = await mapsModulePromise;
  const map = MAPS[mapId];
  if (!map) throw new Error(`maps.js 中不存在关卡 ${mapId}`);
  const gear = buildStageGear(map);
  const gearName = Object.values(gear)
    .map((item) => `${item.slot}:${item.name}(战力 ${Math.round(item.power)})`)
    .join("、");
  process.stdout.write(
    `PROBE START stage ${stage.stageNumber} (${mapId}) Lv.${mainlineLevel(stage.stageNumber - 1)} class=${CLASS_ID} gear=${gearName}\n`
  );
  await injectStageSave(page, stage.stageNumber, mapId, stage.needs, gear);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.clock.runFor(400);
  const started = await snapshot(page);
  if (started.currentMapId !== mapId) throw new Error(`存档未停放在 ${mapId}：${started.currentMapId}`);
  const deathsBefore = started.player.deaths || 0;
  let elapsedMs = 0;
  let snap = started;
  while ((snap.progress[mapId]?.kills || 0) < stage.need) {
    const target = snap.entities.find((entity) => entity.alive && !entity.boss);
    if (!target) {
      await page.clock.runFor(12000);
      elapsedMs += 12000;
      snap = await snapshot(page);
      continue;
    }
    elapsedMs += await defeatEntity(page, target.id, mapId, stage.safePoint);
    snap = await snapshot(page);
  }
  const boss = snap.entities.find((entity) => entity.alive && entity.boss);
  if (!boss) throw new Error(`${mapId} 清怪后首领已消失，无法测量首领战`);
  if (snap.progress[mapId]?.bossDefeated) throw new Error(`${mapId} 首领在清怪阶段被提前击杀`);
  elapsedMs += await defeatEntity(page, boss.id, mapId, stage.safePoint);
  snap = await snapshot(page);
  if (!snap.progress[mapId]?.completed) throw new Error(`${mapId} 未进入完成状态`);
  const deaths = (snap.player.deaths || 0) - deathsBefore;
  const seconds = Math.round(elapsedMs / 1000);
  process.stdout.write(
    `PROBE RESULT stage ${stage.stageNumber} ${mapId} class=${CLASS_ID} Lv.${snap.player.level} deaths=${deaths} seconds=${seconds}\n`
  );
  if (deaths > MAX_DEATHS) throw new Error(`${mapId} 非快进死亡 ${deaths} 次，超过上限 ${MAX_DEATHS}（难度可能被改坏）`);
  if (seconds > MAX_SECONDS) throw new Error(`${mapId} 非快进耗时 ${seconds}s，超过上限 ${MAX_SECONDS}s（关卡可能无法正常推进）`);
  return { stageNumber: stage.stageNumber, mapId, deaths, seconds };
}

// 每关用全新的 context + page：连续在同一页面注入存档时，上一关的虚拟时钟 /
// 自动推进 / 存档写回会干扰下一关（实测同页连跑第 15 关死亡数会从 2 次暴涨到 17 次）。
async function runStageInFreshPage(browser, stage) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-08-10T12:00:00Z") });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    const result = await probeStage(page, stage);
    if (errors.length) throw new Error(`第 ${stage.stageNumber} 关页面异常：` + errors.join(" | "));
    return result;
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const bootstrap = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bootPage = await bootstrap.newPage();
    await bootPage.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    const catalog = await bootPage.evaluate(() => window.__ONEKNIFE_E2E__.catalog());
    await bootstrap.close();
    const needs = Object.fromEntries(catalog.map((entry) => [entry.id, entry.need]));
    const stages = STAGE_NUMBERS.map((stageNumber) => {
      const entry = catalog.find((item) => item.stageNumber === stageNumber);
      if (!entry) throw new Error(`catalog 中不存在第 ${stageNumber} 关`);
      return { stageNumber, mapId: entry.id, need: entry.need, needs, safePoint: entry.safePoint };
    });
    const results = [];
    for (const stage of stages) results.push(await runStageInFreshPage(browser, stage));
    const totalDeaths = results.reduce((sum, item) => sum + item.deaths, 0);
    process.stdout.write(
      `DIFFICULTY PROBE PASS stages=${results.map((item) => `${item.stageNumber}:${item.deaths}死/${item.seconds}s`).join(" ")} totalDeaths=${totalDeaths}\n`
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error("DIFFICULTY PROBE FAIL:", error);
  process.exit(1);
});
