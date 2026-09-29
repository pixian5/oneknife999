// 帧率探测：无头 Chrome + 关闭垂直同步，独立 rAF 采样 8 秒真实操作（移动 + 普攻 + 技能）。
// 运行方式：npm run perf（需先 npm run serve）；结果同时输出到 stdout 与 .test-artifacts/perf-probe.json。
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("./browser-options.cjs");

const BASE_URL = process.env.ONEKNIFE_URL || "http://127.0.0.1:4174/?e2e=1";
const DURATION_MS = Number(process.env.ONEKNIFE_PERF_DURATION || 8000);
const ARTIFACT_DIR = path.join(__dirname, "..", ".test-artifacts");

const round2 = (value) => Math.round(value * 100) / 100;

// 采集一组帧间隔，换算为平均 / 高分位帧率与长帧计数。
function summarize(frames) {
  const sorted = [...frames].sort((a, b) => a - b);
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)))];
  const total = frames.reduce((sum, value) => sum + value, 0);
  return {
    frames: frames.length,
    durationMs: Math.round(total),
    avgFps: round2(frames.length / (total / 1000)),
    p95FrameMs: round2(percentile(0.95)),
    p99FrameMs: round2(percentile(0.99)),
    p95Fps: round2(1000 / percentile(0.95)),
    p99Fps: round2(1000 / percentile(0.99)),
    over20ms: frames.filter((value) => value > 20).length,
    over33ms: frames.filter((value) => value > 33).length,
    worstFrameMs: round2(sorted.at(-1))
  };
}

(async () => {
  const browser = await chromium.launch({ ...browserLaunchOptions(), args: ["--disable-frame-rate-limit", "--disable-gpu-vsync"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.locator('[data-class="warrior"]').click();
    await page.waitForTimeout(200);

    // 独立 rAF 循环记录帧间隔：与游戏主循环同一帧调度，但不参与绘制逻辑。
    await page.evaluate(() => {
      window.__PERF__ = { frames: [], running: true };
      let last = performance.now();
      const loop = (timestamp) => {
        window.__PERF__.frames.push(timestamp - last);
        last = timestamp;
        if (window.__PERF__.running) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    // 真实操作循环：交替方向移动 + 普攻 + 轮换技能，覆盖移动、战斗、粒子与 HUD 刷新。
    const keys = ["d", "w", "a", "s"];
    const endAt = Date.now() + DURATION_MS;
    let step = 0;
    while (Date.now() < endAt) {
      const key = keys[step % keys.length];
      await page.keyboard.down(key);
      await page.keyboard.press("j");
      await page.waitForTimeout(600);
      await page.keyboard.up(key);
      await page.keyboard.press(String((step % 4) + 1));
      step += 1;
    }

    const frames = await page.evaluate(() => {
      window.__PERF__.running = false;
      return window.__PERF__.frames.slice(1); // 去掉首帧（页面加载后的第一个间隔不稳定）
    });
    const report = { url: BASE_URL, classId: "warrior", steps: step, ...summarize(frames) };
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACT_DIR, "perf-probe.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`PERF PROBE ${JSON.stringify(report)}\n`);
    if (errors.length) throw new Error(`页面异常：${errors.join(" | ")}`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
