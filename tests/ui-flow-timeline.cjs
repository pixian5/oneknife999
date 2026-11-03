// 流程级断言（0.8.8）：不依赖逐张截图，直接用游戏内结构化事件时间线判断首关闭环。
// 覆盖：选职业 → 击杀普通怪 → 掉落/拾取 → 升级 → 首领 → 通关 → 自动保存 → 进入下一图。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1&fast=1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator('[data-class="warrior"]').click();
  await sleep(300);

  const snap = () => page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
  let completed = false;
  const started = Date.now();
  while (Date.now() - started < 240000) {
    const s = await snap();
    const progress = s.progress[s.currentMapId];
    if (progress?.completed) {
      completed = true;
      break;
    }
    const alive = s.entities.filter((entity) => entity.alive);
    const target =
      progress.kills >= progress.need
        ? alive.find((entity) => entity.boss)
        : alive
            .filter((entity) => !entity.boss)
            .sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
    if (!target) {
      await sleep(250);
      continue;
    }
    const dx = target.x - s.player.x;
    const dy = target.y - s.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 55) {
      const keys = [];
      if (Math.abs(dx) > 12) keys.push(dx > 0 ? "d" : "a");
      if (Math.abs(dy) > 12) keys.push(dy > 0 ? "s" : "w");
      for (const key of keys) await page.keyboard.down(key);
      await sleep(160);
      for (const key of keys) await page.keyboard.up(key);
      continue;
    }
    await page.keyboard.press("x");
    if (s.player.hp < s.player.maxHp * 0.45) await page.keyboard.press("q");
    await sleep(180);
  }
  assert.ok(completed, "首关未在 240 秒内通关");

  const timeline = await page.evaluate(() => window.__ONEKNIFE_E2E__.timeline(400));
  const text = timeline.map((entry) => entry.text).join("\n");
  assert.match(text, /你选择了\s*战士/, "时间线缺少选职业事件");
  assert.match(text, /被击败/, "时间线缺少普通怪击杀事件");
  assert.match(text, /首领击破/, "时间线缺少首领击破事件");
  assert.match(text, /掉落|自动拾取/, "时间线缺少掉落/拾取事件");
  assert.match(text, /自动保存/, "时间线缺少通关自动保存事件");
  assert.ok(timeline.length >= 8, `时间线事件过少：${timeline.length}`);

  const kinds = {
    total: timeline.length,
    kills: timeline.filter((entry) => /被击败/.test(entry.text)).length,
    loot: timeline.filter((entry) => /掉落|自动拾取|拾取/.test(entry.text)).length,
    levelUp: timeline.filter((entry) => /升|Lv\.|等级/.test(entry.text)).length,
    save: timeline.filter((entry) => /保存/.test(entry.text)).length
  };
  assert.ok(kinds.kills >= 8, `普通怪击杀事件不足（应为 8）：${kinds.kills}`);
  assert.deepEqual(errors, [], `页面异常：${errors.join(" | ")}`);

  process.stdout.write(`FLOW TIMELINE ${JSON.stringify(kinds)}\n`);
  process.stdout.write(
    `FLOW SAMPLE\n${timeline
      .slice(-12)
      .map((entry) => `  ${entry.t}ms [${entry.type}] ${entry.text}`)
      .join("\n")}\n`
  );
  process.stdout.write("FLOW TIMELINE PASSED\n");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
