// 0.8.14 布局回归：把「一屏内能不能看全、有没有被静默裁切」变成断言。
//
// 背景：ui-smoke 只覆盖 1440 / 390 / 360 三个视口，且只校验顶栏按钮不溢出，
// 所以 1024×768、900×700、768×1024 三个常见尺寸里「保存/重置」跑出视口、
// 桌面侧栏 7 个面板有 6 个被 overflow:hidden 裁掉，一直没被发现。
// 这个脚本把视口矩阵铺开，校验四件事：
//   1. 一屏之内：document 不出现纵向/横向滚动，动作条不越界；
//   2. 顶栏：可见按钮不溢出、单行、中心点可命中；
//   3. 侧栏：≥761px 下面板内容不被裁切（装备 12 格全部可见）；
//   4. 画布：每个视口都留出可玩面积。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900, minCanvasHeight: 420 },
  { name: "laptop-1280", width: 1280, height: 720, minCanvasHeight: 320 },
  { name: "ipad-land-1024", width: 1024, height: 768, minCanvasHeight: 320 },
  { name: "mid-900", width: 900, height: 700, minCanvasHeight: 300 },
  { name: "tablet-768", width: 768, height: 1024, minCanvasHeight: 420 },
  { name: "phone-lg-430", width: 430, height: 932, minCanvasHeight: 360 },
  { name: "phone-390", width: 390, height: 844, minCanvasHeight: 340 },
  { name: "phone-sm-360", width: 360, height: 640, minCanvasHeight: 220 },
  { name: "phone-xs-320", width: 320, height: 568, minCanvasHeight: 190 }
];

async function audit(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator('[data-class="warrior"]').click();
  await page.waitForTimeout(400);

  const data = await page.evaluate(() => {
    const visible = (element) => element.getBoundingClientRect().width > 0;
    const canvasRect = document.querySelector("#gameCanvas").getBoundingClientRect();
    const actionBar = document.querySelector(".action-bar").getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".top-actions .icon-button")].filter(visible);
    const side = document.querySelector(".side-panel");
    const slots = [...document.querySelectorAll(".equipment-slot")].map((slot) => slot.getBoundingClientRect());
    const sections = [...side.querySelectorAll(":scope > section")].filter(visible).map((section) => ({
      name: (section.className || "").split(" ")[0],
      overflow: section.scrollHeight - section.clientHeight,
      height: Math.round(section.getBoundingClientRect().height)
    }));
    return {
      doc: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight
      },
      bodyScroll: [document.body.scrollHeight, document.body.clientHeight],
      canvas: { width: canvasRect.width, height: canvasRect.height },
      actionBar: { top: actionBar.top, bottom: actionBar.bottom, height: actionBar.height },
      buttons: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          label: button.textContent.trim(),
          left: rect.left,
          right: rect.right,
          height: rect.height,
          hit: hit === button || (hit && button.contains(hit))
        };
      }),
      archiveVisibleInTopbar:
        !!document.querySelector(".top-actions .icon-button.top-archive") &&
        document.querySelector(".top-actions .icon-button.top-archive").getBoundingClientRect().width > 0,
      sideOverflowY: side.scrollHeight - side.clientHeight,
      sections,
      slotCount: slots.length,
      slotsVisible: slots.filter((rect) => rect.width > 0 && rect.height >= 22).length,
      slotMinHeight: Math.min(...slots.map((rect) => rect.height))
    };
  });

  const tag = `${viewport.name} ${viewport.width}x${viewport.height}`;
  assert.deepEqual(errors, [], `${tag} 页面异常`);

  // 1. 一屏之内
  assert.ok(data.doc.scrollWidth <= data.doc.clientWidth, `${tag} 出现横向滚动：${JSON.stringify(data.doc)}`);
  assert.ok(data.doc.scrollHeight <= data.doc.clientHeight, `${tag} document 纵向滚动：${JSON.stringify(data.doc)}`);
  assert.ok(data.bodyScroll[0] <= data.bodyScroll[1], `${tag} body 纵向滚动：${JSON.stringify(data.bodyScroll)}`);
  assert.ok(data.actionBar.bottom <= viewport.height + 1, `${tag} 动作条越界：${JSON.stringify(data.actionBar)}`);

  // 2. 顶栏
  for (const button of data.buttons) {
    assert.ok(button.left >= -0.5 && button.right <= viewport.width + 0.5, `${tag} 顶栏按钮「${button.label}」溢出视口`);
    assert.ok(button.height <= 40, `${tag} 顶栏按钮「${button.label}」被压成 ${Math.round(button.height)}px 多行`);
    assert.ok(button.hit, `${tag} 顶栏按钮「${button.label}」中心点不可命中`);
  }

  // 3. 侧栏：>=761 是整列面板，任何面板都不该被裁；手机是横滑卡片，固定高度裁切是设计。
  if (viewport.width > 760) {
    for (const section of data.sections) {
      assert.ok(section.overflow <= 2, `${tag} 侧栏面板 ${section.name} 被裁切 ${section.overflow}px（可视 ${section.height}px）`);
      // 面板被压成一条边（高度 < 40px）与裁切一样是信息丢失，单独拦一层。
      assert.ok(section.height >= 40, `${tag} 侧栏面板 ${section.name} 被压到 ${section.height}px`);
    }
    // 侧栏允许滚动，但必须真的能滚到最后一个面板（背包），否则等于藏起来了。
    const reachable = await page.evaluate(() => {
      const side = document.querySelector(".side-panel");
      side.scrollTop = side.scrollHeight;
      // shop-card 等面板平时 display:none，最后一块要取「最后一个可见面板」。
      const visible = [...side.querySelectorAll(":scope > section")].filter((section) => section.getBoundingClientRect().height > 0);
      const last = visible[visible.length - 1].getBoundingClientRect();
      const box = side.getBoundingClientRect();
      return last.bottom <= box.bottom + 2 && last.height >= 40;
    });
    assert.ok(reachable, `${tag} 侧栏滚到底仍看不到最后一个面板`);
    await page.evaluate(() => {
      document.querySelector(".side-panel").scrollTop = 0;
    });
  }
  assert.equal(data.slotCount, 12, `${tag} 装备格数量异常：${data.slotCount}`);
  // 手机横滑卡片只有 198px 宽，6 列均分后单格约 26px；桌面必须留出可点面积。
  const minSlot = viewport.width > 760 ? 28 : 22;
  assert.equal(
    data.slotsVisible,
    12,
    `${tag} 装备格有 ${12 - data.slotsVisible} 个不可见或矮于 ${minSlot}px（最小 ${Math.round(data.slotMinHeight)}px）`
  );

  // 4. 画布可玩面积
  assert.ok(data.canvas.width > 260, `${tag} 画布宽度不足：${Math.round(data.canvas.width)}px`);
  assert.ok(
    data.canvas.height >= viewport.minCanvasHeight,
    `${tag} 画布高度 ${Math.round(data.canvas.height)}px 低于基线 ${viewport.minCanvasHeight}px`
  );

  // 5. 存档入口：顶栏看不到时必须能在设置面板里找到
  if (!data.archiveVisibleInTopbar) {
    await page.locator("#settingsBtn").click();
    assert.ok(await page.locator(".settings-save-row").isVisible(), `${tag} 顶栏隐藏存档按钮但设置面板没有入口`);
    await page.locator("[data-close-settings]").click();
  }

  process.stdout.write(
    `LAYOUT ${tag}: PASS  画布 ${Math.round(data.canvas.width)}×${Math.round(data.canvas.height)} · 动作条高 ${Math.round(data.actionBar.height)}\n`
  );
  await context.close();
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    for (const viewport of VIEWPORTS) await audit(browser, viewport);
    process.stdout.write("ALL LAYOUT TESTS PASSED\n");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
