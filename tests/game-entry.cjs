// 0.8.76：macOS Chrome 偶发首屏不落 DOM / 职业卡不可交互。
// 统一入口只重试「加载页面 + 选职业」，不吞任何业务断言。
async function enterGame(page, baseUrl) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(baseUrl, { waitUntil: "load", timeout: 20000 });
      await page.waitForFunction(
        () => Boolean(document.querySelector('[data-class="warrior"]')) || Boolean(window.__ONEKNIFE_E2E__?.snapshot()),
        { timeout: 15000 }
      );
      // 职业选择只是准备步骤；直接点 DOM，避开 Playwright 对 transform 卡片的 actionability 等待。
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

module.exports = { enterGame };
