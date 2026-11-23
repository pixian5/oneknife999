// 0.8.75 回归：状态图标真的上屏，而不是只躺在 assets。
// 通过模块直接写入状态字段，验证 renderStatusIcons 的显隐、角标与目标破甲分离。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");
const { enterGame } = require("./game-entry.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, shot: "试玩截图-状态图标HUD-桌面.png" },
  { name: "mobile", width: 390, height: 844, shot: "试玩截图-状态图标HUD-移动.png" },
  { name: "mobile-sm", width: 360, height: 640, shot: "试玩截图-状态图标HUD-移动360.png" },
  { name: "mobile-xs", width: 320, height: 568, shot: "试玩截图-状态图标HUD-移动320.png" }
];

async function setStatuses(page, values) {
  await page.evaluate(async (next) => {
    const { state } = await import("/src/runtime.js");
    const { renderAll } = await import("/src/render.js");
    Object.assign(state.player, next.player || {});
    if (next.targetArmorBreak !== undefined) {
      const target = state.entities.find((entity) => !entity.boss && entity.alive);
      if (target) {
        state.player.targetId = target.id;
        target.armorBreakTimer = next.targetArmorBreak;
      }
    }
    renderAll();
  }, values);
}

async function readStatusUi(page) {
  return page.evaluate(() => {
    const visible = (el) => Boolean(el && !el.classList.contains("hidden") && el.getBoundingClientRect().width > 0);
    // 上一版只查 width 会假通过：移动端状态条被 .side-panel 的 overflow-y:hidden 裁掉。
    // 这里逐级检查 overflow 祖先，元素超出裁剪框就不算可见。
    const clipped = (el) => {
      if (!el) return false;
      let node = el.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(hidden|auto|scroll|clip)/.test(style.overflowY)) {
          const r = el.getBoundingClientRect();
          const nr = node.getBoundingClientRect();
          if (r.bottom > nr.bottom + 1 || r.top < nr.top - 1) return true;
        }
        node = node.parentElement;
      }
      return false;
    };
    const strip = document.querySelector("#playerStatusStrip");
    const target = document.querySelector("#targetStatus");
    const chips = [...document.querySelectorAll("#playerStatusStrip .status-chip")];
    return {
      stripVisible: visible(strip),
      stripHeight: strip ? strip.getBoundingClientRect().height : 0,
      stripClipped: clipped(strip),
      targetClipped: clipped(target),
      visibleChips: chips.filter(visible).map((chip) => chip.id),
      clippedChips: chips.filter((chip) => visible(chip) && clipped(chip)).map((chip) => chip.id),
      counts: {
        poison: document.querySelector("#statusPoisonCount")?.textContent || "",
        slow: document.querySelector("#statusSlowCount")?.textContent || "",
        blind: document.querySelector("#statusBlindCount")?.textContent || ""
      },
      targetVisible: visible(target),
      targetCount: document.querySelector("#statusArmorBreakCount")?.textContent || "",
      iconLoaded: [...document.querySelectorAll("#playerStatusStrip img, #targetStatus img")].map((img) => ({
        src: img.getAttribute("src"),
        complete: img.complete,
        width: img.naturalWidth
      }))
    };
  });
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enterGame(page, BASE_URL);

  await setStatuses(page, {
    player: { poison: 3, slowTimer: 2.4, stunTimer: 0.6, blindTimer: 1.7 },
    targetArmorBreak: 2.4
  });
  // 不等下一帧太多，避免 0.6s 的眩晕在断言前自然结束；50ms 足够让 DOM 刷新。
  await page.waitForTimeout(50);
  const active = await readStatusUi(page);
  assert.equal(active.stripVisible, true, `${viewport.name} 状态条未显示`);
  assert.equal(active.stripClipped, false, `${viewport.name} 状态条被滚动容器裁切`);
  assert.ok(active.stripHeight >= 30, `${viewport.name} 状态条高度异常：${active.stripHeight}`);
  assert.deepEqual(
    active.visibleChips.sort(),
    ["statusBlind", "statusPoison", "statusSlow", "statusStun"],
    `${viewport.name} 可见状态图标不全`
  );
  assert.deepEqual(active.clippedChips, [], `${viewport.name} 状态图标被裁切：${active.clippedChips.join(",")}`);
  assert.equal(active.counts.poison, "×3", `${viewport.name} 中毒层数错误`);
  assert.equal(active.counts.slow, "3s", `${viewport.name} 减速秒数错误`);
  assert.equal(active.counts.blind, "2s", `${viewport.name} 致盲秒数错误`);
  assert.equal(active.targetVisible, true, `${viewport.name} 目标破甲图标未显示`);
  assert.equal(active.targetClipped, false, `${viewport.name} 目标破甲图标被裁切`);
  assert.equal(active.targetCount, "3s", `${viewport.name} 破甲秒数错误`);
  assert.ok(
    active.iconLoaded.every((icon) => icon.complete && icon.width === 128),
    `${viewport.name} 图标未加载或尺寸不对：${JSON.stringify(active.iconLoaded)}`
  );
  // 去掉新手引导条与底部 toast，避免遮住移动端目标状态条；截图只看 HUD 本身。
  await page.evaluate(() => {
    document.querySelector("#guideBanner")?.classList.add("hidden");
    document.querySelector("#toast")?.classList.add("hidden");
  });
  await page.screenshot({ path: viewport.shot });

  await setStatuses(page, {
    player: { poison: 0, slowTimer: 0, stunTimer: 0, blindTimer: 0 },
    targetArmorBreak: 0
  });
  await page.waitForTimeout(50);
  const cleared = await readStatusUi(page);
  assert.equal(cleared.stripVisible, false, `${viewport.name} 状态结束后状态条仍显示`);
  assert.equal(cleared.targetVisible, false, `${viewport.name} 破甲结束后目标图标仍显示`);
  assert.deepEqual(errors, [], `${viewport.name} 页面异常：${errors.join(" | ")}`);

  console.log(
    `${viewport.name}: 4 chips, 32px strip=${active.stripHeight.toFixed(1)}, target=${active.targetCount}, shot=${viewport.shot}`
  );
  await context.close();
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    for (const viewport of VIEWPORTS) await verifyViewport(browser, viewport);
    console.log("状态图标 HUD 回归通过");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
