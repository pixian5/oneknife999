const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

// 铭牌可读性回归（0.4.2，P0-3）：
// 把 0.4.1 的插桩检测固化为常驻用例。在页面里包装 CanvasRenderingContext2D 的
// fillText / arc，按采样窗口记录绘制顺序，断言三件事：
//   1) 飘字（数字类 fillText）不会在铭牌之后绘制并命中铭牌矩形（0.4.1 的主 bug）；
//   2) 特效环（r ≥ 16 的 arc）不会在铭牌之后绘制并命中铭牌（移除小半径的移动目标圈，r=13）；
//   3) 铭牌之间互不遮挡（0.4.2 阶梯避让生效；容许极少量 3 级台阶仍不够的贴脸场景）。
const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const SAMPLE_MS = 900;
const RUN_SECONDS = Number(process.env.ONEKNIFE_NAMEPLATE_SECONDS || 6);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // 插桩必须在游戏脚本加载前注入。
  await page.addInitScript(() => {
    window.__PLATE_AUDIT__ = { ops: [], report: null };
    const proto = CanvasRenderingContext2D.prototype;
    const fillText = proto.fillText;
    const arc = proto.arc;
    proto.fillText = function (text, x, y) {
      window.__PLATE_AUDIT__.ops.push({
        kind: "text",
        order: window.__PLATE_AUDIT__.ops.length,
        text: String(text),
        x,
        y,
        font: this.font
      });
      return fillText.apply(this, arguments);
    };
    proto.arc = function (x, y, radius) {
      window.__PLATE_AUDIT__.ops.push({ kind: "ring", order: window.__PLATE_AUDIT__.ops.length, x, y, radius });
      return arc.apply(this, arguments);
    };
    window.__PLATE_AUDIT__.collect = () => {
      const ops = window.__PLATE_AUDIT__.ops;
      window.__PLATE_AUDIT__.ops = [];
      // 铭牌矩形：以「Lv.x 名字」这一行为锚点，反推整块铭牌带（top+11 为名字基线）。
      const plates = [];
      const floats = [];
      const rings = [];
      for (const op of ops) {
        if (op.kind === "text") {
          const size = Number(/(\d+)px/.exec(op.font)?.[1] || 10);
          if (/^Lv\.\d+/.test(op.text)) plates.push({ ...op, size, rect: textRect(op, size) });
          else if (/^[+-]?\d+(\.\d+)?(%|s)?$/.test(op.text.trim())) floats.push({ ...op, size, rect: textRect(op, size) });
        } else if (op.radius >= 16)
          rings.push({ ...op, rect: { left: op.x - op.radius, top: op.y - op.radius, right: op.x + op.radius, bottom: op.y + op.radius } });
      }
      const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const hits = { floatOnPlate: 0, ringOnPlate: 0, plateOnPlate: 0 };
      for (const plate of plates) {
        for (const float of floats) if (float.order > plate.order && intersects(float.rect, plate.rect)) hits.floatOnPlate += 1;
        for (const ring of rings) if (ring.order > plate.order && intersects(ring.rect, plate.rect)) hits.ringOnPlate += 1;
      }
      for (let i = 0; i < plates.length; i += 1)
        for (let j = i + 1; j < plates.length; j += 1) if (intersects(plates[i].rect, plates[j].rect)) hits.plateOnPlate += 1;
      return { plates: plates.length, floats: floats.length, rings: rings.length, hits };
      function textRect(op, size) {
        const width = op.text.length * size * 0.78;
        return { left: op.x - width / 2, top: op.y - size - 2, right: op.x + width / 2, bottom: op.y + 3 };
      }
    };
  });

  await page.goto(BASE_URL, { waitUntil: "load" });
  await sleep(500);
  await page.locator('[data-class="warrior"]').click();
  await sleep(500);

  // 场景：先直行进入出生点右侧的怪群（贴脸聚集是铭牌遮挡的高发场景），
  // 再小幅度左右交错聚怪，持续普攻产生飘字与特效环。
  // 普攻默认键为 X（0.3.2 键位系统），不要用旧版的 J。
  const autoAttack = () =>
    page.evaluate(() => (window.__autoAttack = setInterval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" })), 620)));
  await autoAttack();
  await page.keyboard.down("d");
  await sleep(2300);
  await page.keyboard.up("d");
  const deadline = Date.now() + RUN_SECONDS * 1000;
  let toggle = true;
  const totals = { plates: 0, floats: 0, rings: 0, floatOnPlate: 0, ringOnPlate: 0, plateOnPlate: 0 };
  while (Date.now() < deadline) {
    await page.keyboard.down(toggle ? "d" : "a");
    await sleep(350);
    await page.keyboard.up(toggle ? "d" : "a");
    toggle = !toggle;
    const sample = await page.evaluate(() => window.__PLATE_AUDIT__.collect());
    for (const key of Object.keys(totals)) totals[key] += sample[key] || 0;
  }
  await page.evaluate(() => clearInterval(window.__autoAttack));

  const endLogs = await page.evaluate(() => window.__ONEKNIFE_E2E__?.snapshot().logs.slice(-3));
  process.stdout.write(`NAMEPLATE LOGS ${JSON.stringify(endLogs)}\n`);
  process.stdout.write(`NAMEPLATE AUDIT ${JSON.stringify(totals)}\n`);
  assert.equal(errors.length, 0, `页面异常：${errors.join(" | ")}`);
  assert.ok(totals.floats > 10, `采样内飘字过少（${totals.floats}），场景未覆盖战斗`);
  assert.ok(totals.plates > 30, `采样内铭牌过少（${totals.plates}），场景未覆盖怪群`);
  assert.equal(totals.floatOnPlate, 0, `飘字压铭牌 ${totals.floatOnPlate} 次（0.4.1 回归）`);
  assert.equal(totals.ringOnPlate, 0, `特效环压铭牌 ${totals.ringOnPlate} 次`);
  assert.equal(totals.plateOnPlate, 0, `铭牌互压 ${totals.plateOnPlate} 次（阶梯避让失效或 3 级台阶不够）`);
  process.stdout.write("ALL NAMEPLATE READABILITY TESTS PASSED\n");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
