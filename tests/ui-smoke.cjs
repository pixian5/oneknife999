const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator('[data-class="warrior"]').click();
  await page.waitForTimeout(150);

  const layout = await page.evaluate(() => {
    const canvas = document.querySelector("#gameCanvas");
    const actionBar = document.querySelector(".action-bar").getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let coloredPixels = 0;
    for (let index = 0; index < pixels.length; index += 64) {
      if (pixels[index] || pixels[index + 1] || pixels[index + 2]) coloredPixels += 1;
    }
    return {
      documentScrollHeight: document.documentElement.scrollHeight,
      documentClientHeight: document.documentElement.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
      actionBarBottom: actionBar.bottom,
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
      coloredPixels
    };
  });

  assert.ok(layout.documentScrollHeight <= layout.documentClientHeight, `${viewport.name} document 出现纵向滚动：${JSON.stringify(layout)}`);
  assert.ok(layout.bodyScrollHeight <= layout.bodyClientHeight, `${viewport.name} body 出现纵向滚动：${JSON.stringify(layout)}`);
  assert.ok(layout.actionBarBottom <= viewport.height + 1, `${viewport.name} 底部技能栏超出视口：${JSON.stringify(layout)}`);
  assert.ok(layout.canvasWidth > 100 && layout.canvasHeight > 100 && layout.coloredPixels > 100, `${viewport.name} Canvas 空白或尺寸异常：${JSON.stringify(layout)}`);

  const areaSkill = page.locator('[data-skill="1"]');
  await areaSkill.hover();
  const tooltip = areaSkill.locator(".skill-tooltip");
  await assert.doesNotReject(() => tooltip.waitFor({ state: "visible" }));
  assert.match(await tooltip.textContent(), /范围：以角色为中心/);
  const previewSkill = await page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot().player.previewSkill);
  assert.equal(previewSkill, 1, `${viewport.name} 范围技能悬停未启用角色中心范围预览`);

  assert.deepEqual(errors, [], `${viewport.name} 页面异常`);
  process.stdout.write(`UI ${viewport.name} ${viewport.width}x${viewport.height}: PASS\n`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) await verifyViewport(browser, viewport);
    process.stdout.write("ALL UI SMOKE TESTS PASSED\n");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
