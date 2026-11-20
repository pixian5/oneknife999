// 0.8.51 回归：真实受伤后，侧栏生命文本与血条必须同步变化。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForTimeout(150);
    const full = await page.evaluate(() => ({
      text: document.querySelector("#hpStat").textContent.trim(),
      width: document.querySelector("#hpBar").style.width,
      low: document.querySelector("#hpBar").classList.contains("low")
    }));
    assert.match(full.text, /\d+ \/ \d+/, `生命文本格式不对：${full.text}`);
    assert.equal(full.low, false, "满血不应处于低血样式");
    const lowered = await page.evaluate(async () => {
      const runtime = await import("/src/runtime.js");
      runtime.state.player.hp = 77;
      await new Promise((resolve) => setTimeout(resolve, 180));
      return {
        hp: runtime.state.player.hp,
        text: document.querySelector("#hpStat").textContent.trim(),
        width: document.querySelector("#hpBar").style.width,
        low: document.querySelector("#hpBar").classList.contains("low")
      };
    });
    assert.match(lowered.text, /^77 \/ \d+$/, `受伤后生命文本未更新：${lowered.text}`);
    assert.ok(parseFloat(lowered.width) > 10 && parseFloat(lowered.width) < 30, `血条宽度异常：${lowered.width}`);
    assert.equal(lowered.low, true, "低于 25% 未进入低血样式");
    assert.deepEqual(errors, [], "HUD 生命条测试期间页面异常");
    process.stdout.write(`UI hud health: PASS · ${lowered.text} · ${lowered.width}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})();
