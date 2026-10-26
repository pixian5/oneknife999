// 铭牌可读性回归用例（0.4.2）：把 0.4.1 排查「血条被遮挡」时的一次性插桩固化为常驻测试。
// 做法：在页面加载前插桩 CanvasRenderingContext2D，按帧记录主画布上的 fillText / fillRect /
// arc / roundRect 以及绘制顺序，再用铭牌矩形与「铭牌之后绘制的世界内容」做相交检测。
// 断言：飘字、粒子、特效环命中铭牌 = 0；铭牌自身的三行文字与血条不计入（那是铭牌内容）。
// 运行方式：npm run test:ui:nameplate（需先 npm run serve，或由 CI 启动静态服务）。
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const VIEWPORT = { width: 1440, height: 900 };
// 场景要求：至少采集到这么多「有铭牌」的帧，避免没画出铭牌就空跑通过。
const MIN_FRAMES = 120;
const MIN_PLATES = 100;
// 单轮接近 + 攻击的循环上限（每轮约 120ms），足够打出伤害飘字、前摇环与技能特效。
const FIGHT_GUARD = 90;

// 在页面上下文执行：插桩 + 逐帧审计。
function installAudit() {
  const MAIN_CANVAS_ID = "gameCanvas";
  const audit = { frames: 0, plates: 0, maxPlates: 0, hits: 0, samples: [] };
  window.__NAMEPLATE_AUDIT__ = audit;

  const proto = CanvasRenderingContext2D.prototype;
  const isMain = (context) => Boolean(context.canvas && context.canvas.id === MAIN_CANVAS_ID);

  let ops = [];
  let depth = 0;
  let worldStarted = false;
  let worldClosed = false;
  let measuring = null;

  const fontSizes = (font) => {
    const match = /(\d+(?:\.\d+)?)px/.exec(font || "");
    return match ? Number(match[1]) : 13;
  };

  const measureWidth = (op) => {
    if (!measuring) measuring = document.createElement("canvas").getContext("2d");
    measuring.font = op.font || `${op.size}px sans-serif`;
    return measuring.measureText(op.text).width;
  };

  // 铭牌底板：drawNameplate / drawPlayerNameplate 的 roundedRect（radius 3，高 31 / 24）。
  const isPlateBackground = (op) =>
    op.type === "round" && Math.abs(op.radius - 3) < 0.01 && (Math.abs(op.h - 31) < 0.01 || Math.abs(op.h - 24) < 0.01);

  // 铭牌自身内容：名字 / 血量两行文字与血条底 / 血量条，属于铭牌三行，不应算作遮挡。
  // 其他铭牌的底板与文字同样按内容处理（铭牌互相重叠是独立议题，本用例只守「非铭牌内容」）。
  const isPlateContent = (op, plates) => {
    if (isPlateBackground(op)) return true;
    if (op.type === "text") {
      if (/^Lv\./.test(op.text)) return true;
      if (/^\d+(?:\.\d+)? \/ \d+$/.test(op.text)) return true;
      return false;
    }
    if (op.type === "rect") {
      return plates.some((plate) => {
        const insideX = op.x >= plate.rect.x - 1 && op.x + op.w <= plate.rect.x + plate.rect.w + 1;
        const barRow = Math.abs(op.y - (plate.rect.y + 25)) < 0.5 || Math.abs(op.y - (plate.rect.y + 15)) < 0.5;
        return insideX && barRow && op.h <= 6;
      });
    }
    return false;
  };

  const inkBox = (op) => {
    if (op.type === "text") {
      const width = measureWidth(op);
      const left = op.align === "center" ? op.x - width / 2 : op.align === "right" ? op.x - width : op.x;
      return { x: left, y: op.y - op.size * 0.85, w: width, h: op.size * 1.1 };
    }
    if (op.type === "rect" || op.type === "round") {
      return { x: Math.min(op.x, op.x + op.w), y: Math.min(op.y, op.y + op.h), w: Math.abs(op.w), h: Math.abs(op.h) };
    }
    if (op.type === "arc" && op.r > 0) return { x: op.x - op.r - 2, y: op.y - op.r - 2, w: op.r * 2 + 4, h: op.r * 2 + 4 };
    return null;
  };

  const overlaps = (box, rect) => box.x + box.w > rect.x && box.x < rect.x + rect.w && box.y + box.h > rect.y && box.y < rect.y + rect.h;

  const inspect = (list) => {
    const plates = [];
    list.forEach((op, index) => {
      if (op.world && isPlateBackground(op)) plates.push({ index, rect: { x: op.x, y: op.y, w: op.w, h: op.h } });
    });
    const hits = [];
    for (const plate of plates) {
      for (let index = plate.index + 1; index < list.length; index += 1) {
        const op = list[index];
        // 世界块 restore 之后的绘制是屏幕坐标 HUD（连击数等），与铭牌不在同一坐标系，直接结束。
        if (!op.world) break;
        if (isPlateContent(op, plates)) continue;
        const box = inkBox(op);
        if (box && overlaps(box, plate.rect)) hits.push({ type: op.type, text: op.text || null, box });
      }
    }
    return { plates: plates.length, hits };
  };

  // 自检：保证审计逻辑真的能抓到遮挡（否则用例会「空跑通过」）。
  // clean 是纯铭牌内容，dirty 额外加了一个粒子、一个特效环与一段伤害飘字。
  audit.selfTest = () => {
    const base = { world: true, depth: 1, align: "center" };
    const clean = [
      { ...base, type: "round", x: 0, y: 0, w: 118, h: 31, radius: 3 },
      { ...base, type: "text", text: "Lv.5 矿工", x: 59, y: 11, size: 9, font: "9px sans-serif" },
      { ...base, type: "text", text: "80 / 120", x: 59, y: 21, size: 8, font: "8px sans-serif" },
      { ...base, type: "rect", x: 7, y: 25, w: 104, h: 4 },
      { ...base, type: "rect", x: 7, y: 25, w: 104, h: 4 }
    ];
    const dirty = [
      ...clean,
      { ...base, type: "rect", x: 50, y: 12, w: 3, h: 3 },
      { ...base, type: "arc", x: 59, y: 40, r: 14 },
      { ...base, type: "text", text: "-128", x: 59, y: 16, size: 13, font: "700 13px sans-serif" }
    ];
    return { cleanHits: inspect(clean).hits.length, dirtyHits: inspect(dirty).hits.length };
  };

  const record = (op) => {
    op.world = depth > 0 && !worldClosed;
    ops.push(op);
    if (ops.length > 8000) ops.shift();
  };

  const wrapInk = (name, build) => {
    const native = proto[name];
    proto[name] = function (...args) {
      if (isMain(this)) {
        const op = build(this, args);
        if (op) record(op);
      }
      return native.apply(this, args);
    };
  };

  wrapInk("fillText", (context, [text, x, y]) => ({
    type: "text",
    text: String(text),
    x,
    y,
    size: fontSizes(context.font),
    font: context.font,
    align: context.textAlign
  }));
  wrapInk("fillRect", (context, [x, y, w, h]) => ({ type: "rect", x, y, w, h }));
  wrapInk("arc", (context, [x, y, r]) => ({ type: "arc", x, y, r }));
  wrapInk("roundRect", (context, [x, y, w, h, radius]) => ({ type: "round", x, y, w, h, radius }));

  const nativeSave = proto.save;
  proto.save = function () {
    if (isMain(this)) {
      depth += 1;
      if (depth === 1 && !worldClosed) worldStarted = true;
    }
    return nativeSave.call(this);
  };
  const nativeRestore = proto.restore;
  proto.restore = function () {
    if (isMain(this)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && worldStarted) worldClosed = true;
    }
    return nativeRestore.call(this);
  };

  const finishFrame = () => {
    if (!ops.length) return;
    const result = inspect(ops);
    if (!result.plates) return;
    audit.frames += 1;
    audit.plates += result.plates;
    audit.maxPlates = Math.max(audit.maxPlates, result.plates);
    if (result.hits.length) {
      audit.hits += result.hits.length;
      if (audit.samples.length < 8) audit.samples.push({ plates: result.plates, hits: result.hits.slice(0, 2) });
    }
  };

  // 帧边界：drawWorld 每帧在一个 rAF 回调里完成，用 rAF 包装器重置并结算这一帧的绘制日志。
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    nativeRaf((timestamp) => {
      ops = [];
      depth = 0;
      worldStarted = false;
      worldClosed = false;
      try {
        return callback(timestamp);
      } finally {
        try {
          finishFrame();
        } catch {
          // 审计失败不能影响游戏本身的渲染
        }
      }
    });
}

async function snapshot(page) {
  return page.evaluate(() => window.__ONEKNIFE_E2E__.snapshot());
}

function nearestMonster(snap) {
  return snap.entities
    .filter((entity) => entity.alive && !entity.npc)
    .sort((a, b) => Math.hypot(a.x - snap.player.x, a.y - snap.player.y) - Math.hypot(b.x - snap.player.x, b.y - snap.player.y))[0];
}

// 键盘接近最近的怪并开打：不用鼠标，避免 hover 出怪物 tooltip（tooltip 会压住铭牌，属于既有设计）。
async function fightForFrames(page) {
  for (let guard = 0; guard < FIGHT_GUARD; guard += 1) {
    const snap = await snapshot(page);
    const target = nearestMonster(snap);
    if (!target) break;
    const dx = target.x - snap.player.x;
    const dy = target.y - snap.player.y;
    if (Math.hypot(dx, dy) > 56) {
      const horizontal = Math.abs(dx) > 16 ? (dx < 0 ? "a" : "d") : null;
      const vertical = Math.abs(dy) > 16 ? (dy < 0 ? "w" : "s") : null;
      if (horizontal) await page.keyboard.down(horizontal);
      if (vertical) await page.keyboard.down(vertical);
      await page.waitForTimeout(150);
      if (horizontal) await page.keyboard.up(horizontal);
      if (vertical) await page.keyboard.up(vertical);
    } else {
      await page.keyboard.press("x");
      // 偶尔补一个技能：让技能环、技能飘字也进入审计样本。
      if (guard % 9 === 0) await page.keyboard.press(String(1 + (guard % 4)));
      await page.waitForTimeout(70);
    }
  }
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(installAudit);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForTimeout(300);

    const selfTest = await page.evaluate(() => window.__NAMEPLATE_AUDIT__.selfTest());
    assert.equal(selfTest.cleanHits, 0, `审计自检失败：纯铭牌内容被误判为遮挡 ${JSON.stringify(selfTest)}`);
    assert.ok(selfTest.dirtyHits >= 1, `审计自检失败：粒子 / 特效环 / 飘字压住铭牌却未被检测到 ${JSON.stringify(selfTest)}`);

    await fightForFrames(page);

    const audit = await page.evaluate(() => window.__NAMEPLATE_AUDIT__);
    assert.deepEqual(errors, [], "页面运行异常");
    assert.ok(audit.frames >= MIN_FRAMES, `采样帧数不足：${audit.frames} < ${MIN_FRAMES}`);
    assert.ok(audit.plates >= MIN_PLATES, `采样铭牌数不足：${audit.plates} < ${MIN_PLATES}`);
    assert.ok(audit.maxPlates >= 2, `视野内从未同时出现 2 个以上铭牌：${audit.maxPlates}`);
    assert.equal(audit.hits, 0, `铭牌被非铭牌内容遮挡 ${audit.hits} 次，样例：${JSON.stringify(audit.samples.slice(0, 3))}`);
    process.stdout.write(`NAMEPLATE PASS frames=${audit.frames} plates=${audit.plates} maxPlates=${audit.maxPlates} hits=0\n`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
