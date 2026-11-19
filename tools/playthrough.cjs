// 实际游玩全流程记录器（0.8.40 体验分析用）
// 用真实速度（不带 fast 参数）+ Playwright 虚拟时钟推进，跑完 100 关并记录体验数据。
// 与 tests/e2e-ten-clear-runs.cjs 的区别：不做断言，只采集数据（时长/死亡/药水/金币/首领战），
// 同时捕获所有 404 素材请求与页面报错，用于判断「实际玩起来有什么问题」。
const fs = require("fs");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("../tests/browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const CLASS_ID = process.env.ONEKNIFE_CLASS || "warrior";
const MAX_MAP = Number(process.env.ONEKNIFE_MAX_MAP || 100);
const OUT = process.env.ONEKNIFE_OUT || "/home/user/land/playthrough.json";
const SHOT_DIR = process.env.ONEKNIFE_SHOTS || "/home/user/land/shots";
const SHOT_MAPS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

let MAP_ORDER = [];
let MAP_NEEDS = {};
let SAFE_POINTS = {};
let BOSS_POINTS = {};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let cdp = null;
async function heapMB(page) {
  try {
    if (!cdp) return -1;
    const m = await cdp.send("Performance.getMetrics");
    const row = m.metrics.find((x) => x.name === "JSHeapUsedSize");
    return row ? Math.round(row.value / 1048576) : -1;
  } catch {
    return -1;
  }
}

async function snapshot(page) {
  return page.evaluate(() => window.__ONEKNIFE_E2E__?.snapshot());
}
// 虚拟时钟累计量：当前 Playwright 版本没有 page.clock.now()，自己累加
let VMS = 0;
async function advance(page, ms) {
  await page.clock.runFor(ms);
  VMS += ms;
}
async function now() {
  return VMS;
}

async function canvasGeometry(page, worldPoint) {
  const snap = await snapshot(page);
  const rect = await page.locator("#gameCanvas").boundingBox();
  const scale = Math.min(rect.width / 940, rect.height / 590);
  const halfW = rect.width / scale / 2;
  const halfH = rect.height / scale / 2;
  const cameraX = clamp(snap.player.x - halfW, 0, 2400 - halfW * 2);
  const cameraY = clamp(snap.player.y - halfH, 0, 1500 - halfH * 2);
  return { snap, rect, x: rect.x + (worldPoint.x - cameraX) * scale, y: rect.y + (worldPoint.y - cameraY) * scale };
}

// 把目标移进视野：按方位键分块推进，斜向同时按两个键
async function approach(page, target, mapId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snap = await snapshot(page);
    if (snap.currentMapId !== mapId) return "left-map";
    const entity = snap.entities.find((e) => e.id === target.id && e.alive);
    if (!entity) return "gone";
    const geo = await canvasGeometry(page, entity);
    const margin = 30;
    const visible =
      geo.x > geo.rect.x + margin &&
      geo.x < geo.rect.x + geo.rect.width - margin &&
      geo.y > geo.rect.y + margin &&
      geo.y < geo.rect.y + geo.rect.height - margin;
    if (visible && Math.hypot(entity.x - snap.player.x, entity.y - snap.player.y) <= 260) return "ready";
    const dx = entity.x - snap.player.x;
    const dy = entity.y - snap.player.y;
    const hk = dx < 0 ? "a" : "d";
    const vk = dy < 0 ? "w" : "s";
    if (Math.abs(dx) > 22) await page.keyboard.down(hk);
    if (Math.abs(dy) > 22) await page.keyboard.down(vk);
    await advance(page, 480);
    if (Math.abs(dx) > 22) await page.keyboard.up(hk);
    if (Math.abs(dy) > 22) await page.keyboard.up(vk);
  }
  return "timeout";
}

// 撤退到本图补给点（安全区）回血：真实玩家低血时会这么做
async function restAtSafePoint(page, mapId) {
  const safe = SAFE_POINTS[mapId];
  for (let i = 0; i < 26; i += 1) {
    const snap = await snapshot(page);
    if (snap.currentMapId !== mapId) return false;
    if (Math.hypot(snap.player.x - safe.x, snap.player.y - safe.y) <= 46) {
      // 到达后待机回血，最多 12 秒
      for (let t = 0; t < 16; t += 1) {
        await advance(page, 700);
        const inner = await snapshot(page);
        if (inner.player.hp / inner.player.maxHp > 0.8 || inner.player.hp <= 0) break;
      }
      return true;
    }
    const geo = await canvasGeometry(page, safe);
    const dx = safe.x - snap.player.x;
    const dy = safe.y - snap.player.y;
    const hk = dx < 0 ? "a" : "d";
    const vk = dy < 0 ? "w" : "s";
    if (Math.abs(dx) > 20) await page.keyboard.down(hk);
    if (Math.abs(dy) > 20) await page.keyboard.down(vk);
    await advance(page, 480);
    if (Math.abs(dx) > 20) await page.keyboard.up(hk);
    if (Math.abs(dy) > 20) await page.keyboard.up(vk);
  }
  return false;
}

// 技能加点：真人升级后会把技能点用掉，否则技能伤害一直停在 1 级
async function spendSkillPoints(page) {
  const snap = await snapshot(page);
  if (!snap.player.skillPoints) return;
  await page.keyboard.press("k");
  await advance(page, 220);
  for (let guard = 0; guard < 40; guard += 1) {
    const btn = page.locator("#skillModalList .skill-row .link-button:not([disabled])").first();
    if (!(await btn.count())) break;
    await btn.click();
    await advance(page, 120);
  }
  await page.keyboard.press("k");
  await advance(page, 160);
}

// 背包管理：读每件装备 title 里的「装备后：攻击 X→Y · 生命 … · 防御 …」预览，
// 有任一属性变高就穿上（等同真人看绿字），其余全部拆解回收材料与金币。
async function manageBag(page) {
  for (let pass = 0; pass < 30; pass += 1) {
    const items = await page.evaluate(() =>
      [...document.querySelectorAll("#inventoryGrid .inventory-slot")].map((el) => {
        const title = el.getAttribute("title") || "";
        const m = /装备后：攻击 (\d+)(?:→(\d+))? · 生命 (\d+)(?:→(\d+))? · 防御 (\d+)(?:→(\d+))?/.exec(title);
        const nums = m ? [m[1], m[2], m[3], m[4], m[5], m[6]].map((v) => (v === undefined ? null : Number(v))) : null;
        const upgrade = nums ? [0, 2, 4].some((i) => nums[i + 1] !== null && nums[i + 1] > nums[i]) : false;
        return {
          index: el.dataset.itemIndex,
          salvageId: el.querySelector("[data-salvage-id]")?.dataset.salvageId || null,
          upgrade
        };
      })
    );
    const equipment = items.filter((it) => it.salvageId);
    const total = items.length;
    if (!equipment.length || total < 10) return; // 背包还宽裕，不必整理
    const better = equipment.find((it) => it.upgrade);
    if (better) {
      await page.locator(`#inventoryGrid .inventory-slot[data-item-index="${better.index}"]`).click();
      await advance(page, 120);
      continue;
    }
    // 没有更好的了：逐件拆解，留 4 格给后续掉落
    const junk = equipment.slice(0, Math.max(0, equipment.length - 2));
    if (!junk.length) return;
    for (const it of junk) {
      const btn = page.locator(`[data-salvage-id="${it.salvageId}"]`);
      if (await btn.count()) {
        await btn.click();
        await advance(page, 80);
      }
    }
    return;
  }
}

async function backToMap(page, mapId) {
  for (let i = 0; i < 6; i += 1) {
    const snap = await snapshot(page);
    if (snap.currentMapId === mapId) return true;
    await page.keyboard.press("t");
    await advance(page, 200);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const pageErrors = [];
  const missing = {};
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));
  page.on("crash", () => {
    process.stdout.write("PAGE_CRASH\n");
    fs.writeFileSync("/home/user/land/crash-flag.txt", String(Date.now()));
  });
  page.on("response", (r) => {
    if (r.status() === 404) {
      const url = r.url().split("/").slice(-1)[0];
      missing[url] = (missing[url] || 0) + 1;
    }
  });
  page.on("dialog", (d) => d.accept());
  await page.clock.install({ time: new Date("2026-11-20T12:00:00Z") });
  const SAVE_KEY = "oneknife999-prototype-save-v4";
  const saveIn = process.env.ONEKNIFE_SAVE_IN;
  if (saveIn && fs.existsSync(saveIn)) {
    const raw = fs.readFileSync(saveIn, "utf8");
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, raw]);
    process.stdout.write(`RESUME 存档 ${raw.length} 字节\n`);
  }
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await advance(page, 600);

  // 无存档才需要选职业
  if (!(saveIn && fs.existsSync(saveIn))) {
    await page.locator(`[data-class="${CLASS_ID}"]`).click();
    await advance(page, 900);
  }

  const catalog = await page.evaluate(() => window.__ONEKNIFE_E2E__?.catalog());
  MAP_ORDER = catalog.map((c) => c.id);
  for (const c of catalog) {
    MAP_NEEDS[c.id] = c.need;
    SAFE_POINTS[c.id] = c.safePoint;
    BOSS_POINTS[c.id] = c.bossPoint;
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const records = [];
  const wallStart = Date.now();
  const t0 = await now();

  const firstSnap = await snapshot(page);
  let startIndex = Math.max(0, MAP_ORDER.indexOf(firstSnap.currentMapId));
  // 存档里的当前图若已通关，就从下一关开始，避免重复跑出 0 秒记录
  while (startIndex < MAP_ORDER.length && firstSnap.progress?.[MAP_ORDER[startIndex]]?.completed) startIndex += 1;
  const segLen = Number(process.env.ONEKNIFE_MAPS_PER_SEG || 0);
  const endIndex = segLen
    ? Math.min(startIndex + segLen - 1, MAP_ORDER.length - 1)
    : Number(process.env.ONEKNIFE_END_INDEX || MAX_MAP) - 1;
  process.stdout.write(`起点第 ${startIndex + 1} 关（${MAP_ORDER[startIndex]}），目标跑到第 ${endIndex + 1} 关\n`);
  for (let index = startIndex; index <= Math.min(endIndex, MAP_ORDER.length - 1); index += 1) {
    const mapId = MAP_ORDER[index];
    const startWall = Date.now();
    const startVirtual = await now();
    await backToMap(page, mapId);
    let snap = await snapshot(page);
    const deaths0 = snap.player.deaths || 0;
    const potion0 = snap.player.potion;
    const gold0 = snap.player.gold;
    const level0 = snap.player.level;
    let minHpRatio = 1;
    let travelVirtual = 0; // 纯跑图耗时（虚拟秒），用于判断「走路占多少」
    let restVirtual = 0; // 回补给点待机/折返耗时
    let bossStart = null;
    let bossDeaths = 0;
    let heapPeak = 0;
    let addsDuringBoss = 0; // 首领战期间同时存活的小怪数量峰值（验证刷新是否打断 boss 战）
    let addsNearBoss = 0; // 首领身边 260px 内小怪峰值（真正干扰战斗）
    let bossSeconds = 0;
    let ok = true;
    let reason = "";
    const screenshot = SHOT_MAPS.includes(index + 1);

    await spendSkillPoints(page);
    await manageBag(page);
    if (screenshot) await page.screenshot({ path: `${SHOT_DIR}/map-${String(index + 1).padStart(3, "0")}-start.png` });

    try {
      // 清小怪
      let guard = 0;
      while ((snap.progress[mapId]?.kills || 0) < MAP_NEEDS[mapId]) {
        guard += 1;
        if (guard > 900) throw new Error("清怪超时");
        const target = snap.entities.find((e) => e.alive && !e.boss);
        if (!target) {
          await advance(page, 8000);
          snap = await snapshot(page);
          continue;
        }
        const tv0 = VMS;
        const approachResult = await approach(page, target, mapId);
        travelVirtual += VMS - tv0;
        if (approachResult !== "ready") {
          await advance(page, 300);
          snap = await snapshot(page);
          continue;
        }
        snap = await snapshot(page);
        const cur = snap.entities.find((e) => e.id === target.id && e.alive);
        if (!cur) continue;
        minHpRatio = Math.min(minHpRatio, snap.player.hp / snap.player.maxHp);
        const hpRatio = snap.player.hp / snap.player.maxHp;
        // 真实玩家行为：低血先喝药，没药就退到补给点回血
        if (hpRatio < 0.70 && snap.player.potion > 0) {
          await page.keyboard.press("q");
          await advance(page, 260);
          snap = await snapshot(page);
        }
        if (snap.player.hp / snap.player.maxHp < 0.5 && snap.player.potion <= 0) {
          const rv0 = VMS;
          const rested = await restAtSafePoint(page, mapId);
          if (!rested) await advance(page, 600);
          restVirtual += VMS - rv0;
          snap = await snapshot(page);
          continue;
        }
        const geo = await canvasGeometry(page, cur);
        await page.mouse.click(geo.x, geo.y);
        await page.keyboard.press("x");
        // 真人手感：技能冷却一好就按（引擎自身会拦怒气/冷却不足）
        await page.keyboard.press(String(((guard - 1) % 4) + 1));
        await page.keyboard.press("f");
        await advance(page, 520);
        snap = await snapshot(page);
      }

      // 首领
      snap = await snapshot(page);
      const boss = snap.entities.find((e) => e.alive && e.boss);
      if (boss) {
        bossStart = await now();
        const bd0 = snap.player.deaths || 0;
        let bguard = 0;
        while (bguard < 900) {
          bguard += 1;
          snap = await snapshot(page);
          if (snap.progress[mapId]?.bossDefeated) break;
          addsDuringBoss = Math.max(addsDuringBoss, snap.entities.filter((e) => e.alive && !e.boss && !e.npc).length);
          const b = snap.entities.find((e) => e.alive && e.boss);
          if (b) {
            // 首领身边 260px 内的小怪才算真正干扰战斗
            addsNearBoss = Math.max(
              addsNearBoss,
              snap.entities.filter((e) => e.alive && !e.boss && !e.npc && Math.hypot(e.x - b.x, e.y - b.y) < 260).length
            );
          }
          if (!b) {
            await advance(page, 900);
            snap = await snapshot(page);
            continue;
          }
          minHpRatio = Math.min(minHpRatio, snap.player.hp / snap.player.maxHp);
          const hpRatio = snap.player.hp / snap.player.maxHp;
          if (hpRatio < 0.72 && snap.player.potion > 0) {
            await page.keyboard.press("q");
            await advance(page, 300);
          } else if (hpRatio < 0.55) {
            const rested = await restAtSafePoint(page, mapId);
            if (!rested) await advance(page, 600);
            continue;
          }
          if (bguard % 10 === 0) {
            heapPeak = Math.max(heapPeak, await heapMB(page));
          }
          if (screenshot && bguard === 8) await page.screenshot({ path: `${SHOT_DIR}/map-${String(index + 1).padStart(3, "0")}-boss.png` });
          const bv0 = VMS;
          const ar = await approach(page, b, mapId);
          travelVirtual += VMS - bv0;
          if (ar !== "ready") {
            await advance(page, 300);
            continue;
          }
          const geo = await canvasGeometry(page, b);
          await page.mouse.click(geo.x, geo.y);
          await page.keyboard.press("x");
          await page.keyboard.press(String(((bguard - 1) % 4) + 1));
          if (snap.player.charge >= 100) await page.keyboard.press("r");
          await advance(page, bguard % 10 === 0 ? 900 : 520);
        }
        bossDeaths = (await snapshot(page)).player.deaths - bd0;
        bossSeconds = ((await now()) - bossStart) / 1000;
        if (!(await snapshot(page)).progress[mapId]?.bossDefeated) throw new Error("首领未击杀");
      }

      snap = await snapshot(page);
      if (!snap.progress[mapId]?.completed) {
        await advance(page, 1200);
        snap = await snapshot(page);
      }
      if (screenshot) await page.screenshot({ path: `${SHOT_DIR}/map-${String(index + 1).padStart(3, "0")}-clear.png` });
    } catch (error) {
      ok = false;
      reason = String(error.message).slice(0, 120);
      snap = await snapshot(page);
    }

    const endVirtual = await now();
    records.push({
      index: index + 1,
      mapId,
      ok,
      reason,
      virtualSeconds: Math.round((endVirtual - startVirtual) / 1000),
      wallSeconds: Math.round((Date.now() - startWall) / 1000),
      deaths: (snap.player.deaths || 0) - deaths0,
      bossDeaths,
      addsDuringBoss,
      addsNearBoss,
      bossSeconds: Math.round(bossSeconds),
      potionUsed: potion0 - snap.player.potion,
      potionStart: potion0,
      potionEnd: snap.player.potion,
      goldGain: snap.player.gold - gold0,
      levelBefore: level0,
      levelAfter: snap.player.level,
      minHpRatio: Number(minHpRatio.toFixed(2)),
      kills: snap.progress[mapId]?.kills || 0,
      need: MAP_NEEDS[mapId],
      classId: snap.classId,
      inventoryCount: snap.inventoryCount,
      monsterHpAvg: Math.round(
        (snap.entities.filter((e) => e.alive && !e.boss && !e.npc).reduce((a, e) => a + e.maxHp, 0) || 0) /
          Math.max(1, snap.entities.filter((e) => e.alive && !e.boss && !e.npc).length)
      ),
      bossMaxHp: snap.entities.find((e) => e.boss && e.alive)?.maxHp || 0,
      maxHp: snap.player.maxHp,
      goldTotal: snap.player.gold,
      marks: snap.player.marks,
      hpAfter: Math.round(snap.player.hp),
      travelSeconds: Math.round(travelVirtual / 1000),
      restSeconds: Math.round(restVirtual / 1000)
    });
    records.at(-1).heapMB = await heapMB(page);
    records.at(-1).sprite = await page.evaluate(() => window.__ONEKNIFE_E2E__?.spriteStats?.() || null);
    const saveOut = process.env.ONEKNIFE_SAVE_OUT;
    if (saveOut) {
      const raw = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
      if (raw) fs.writeFileSync(saveOut, raw);
    }
    process.stdout.write(
      `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] MAP ${index + 1}/${MAX_MAP} ${mapId} ${ok ? "OK" : "FAIL:" + reason} ${records.at(-1).virtualSeconds}s 死${records.at(-1).deaths} 药${records.at(-1).potionUsed} 金${records.at(-1).goldGain} lv${records.at(-1).levelBefore}->${records.at(-1).levelAfter} 最低血${records.at(-1).minHpRatio} 堆${records.at(-1).heapMB}MB 贴图${JSON.stringify(records.at(-1).sprite)}\n`
    );
  }

  const totalVirtual = Math.round(((await now()) - t0) / 1000);
  const summary = {
    classId: CLASS_ID,
    maps: records.length,
    totalVirtualSeconds: totalVirtual,
    totalWallSeconds: Math.round((Date.now() - wallStart) / 1000),
    totalDeaths: records.reduce((s, r) => s + r.deaths, 0),
    totalPotion: records.reduce((s, r) => s + r.potionUsed, 0),
    failedMaps: records.filter((r) => !r.ok).map((r) => `${r.index}:${r.reason}`),
    slowestMaps: records.slice().sort((a, b) => b.virtualSeconds - a.virtualSeconds).slice(0, 10),
    bossHeavy: records.filter((r) => r.bossSeconds >= 40).map((r) => `${r.index}:${r.bossSeconds}s`),
    missing404: missing,
    pageErrors,
    records
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
  process.stdout.write(
    `\nDONE ${CLASS_ID} 关卡${records.length} 虚拟时长${Math.round(totalVirtual / 60)}min 实际耗时${summary.totalWallSeconds}s 总死亡${summary.totalDeaths} 总药水${summary.totalPotion} 失败${summary.failedMaps.length}\n`
  );
  process.stdout.write(`404素材 ${Object.keys(missing).length} 种；页面报错 ${pageErrors.length} 条\n`);
  await browser.close();
})().catch((e) => {
  process.stdout.write(`FATAL ${String(e.message).slice(0, 300)}\n`);
  process.exit(1);
});
