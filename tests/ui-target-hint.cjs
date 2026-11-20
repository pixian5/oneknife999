// 0.8.48 窄屏目标栏回归：320/360px 下“血/距/射程/自动接近中”必须两行完整显示，
// 不能被省略号吃掉；动作条高度也不能因此明显变高。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 390, height: 844 }
    ]) {
      const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
        await page.locator('[data-class="warrior"]').click();
        await page.waitForTimeout(220);
        const result = await page.evaluate(async () => {
          const runtime = await import("/src/runtime.js");
          const s = runtime.state;
          const entity = s.entities.find((item) => item.alive && !item.friendly && !item.npc && !item.boss);
          if (!entity) return null;
          s.player.x = entity.x + 150;
          s.player.y = entity.y;
          s.player.targetId = entity.id;
          s.player.autoAttackId = entity.id;
          await new Promise((resolve) => setTimeout(resolve, 120));
          const hint = document.querySelector("#targetHint");
          const bar = document.querySelector(".action-bar");
          return {
            text: hint.textContent,
            clientWidth: hint.clientWidth,
            scrollWidth: hint.scrollWidth,
            clientHeight: hint.clientHeight,
            scrollHeight: hint.scrollHeight,
            actionBarHeight: Math.round(bar.getBoundingClientRect().height)
          };
        });
        assert.ok(result, `宽 ${viewport.width}：第 1 关没有普通怪`);
        assert.match(result.text, /自动接近中/, `宽 ${viewport.width}：目标栏文案缺少自动接近：${result.text}`);
        assert.ok(
          result.scrollWidth <= result.clientWidth + 1,
          `宽 ${viewport.width}：目标栏横向被截断 ${result.scrollWidth}/${result.clientWidth}：${result.text}`
        );
        assert.ok(
          result.scrollHeight <= result.clientHeight + 1,
          `宽 ${viewport.width}：目标栏纵向被截断 ${result.scrollHeight}/${result.clientHeight}：${result.text}`
        );
        if (viewport.width <= 360) {
          assert.ok(result.clientHeight >= 24, `宽 ${viewport.width}：窄屏应换成两行，实际高 ${result.clientHeight}`);
        }
        assert.ok(
          result.actionBarHeight >= 145 && result.actionBarHeight <= 165,
          `宽 ${viewport.width}：动作条高度异常 ${result.actionBarHeight}`
        );
        assert.deepEqual(errors, [], `宽 ${viewport.width}：页面异常`);
        process.stdout.write(
          `TARGET HINT ${viewport.width}x${viewport.height}: PASS · 高 ${result.clientHeight} · 动作条 ${result.actionBarHeight}\n`
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})();
