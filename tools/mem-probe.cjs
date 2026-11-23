// 内存探针：判断「连续游玩后浏览器被内存压死」是游戏自身泄漏还是脚本轮询导致
// 两组对照：A 只推进虚拟时钟（模拟挂机/正常玩，少量快照）；B 高频 snapshot（模拟脚本轮询）
const fs = require("fs");
const { chromium } = require("playwright");
const { browserLaunchOptions } = require("../tests/browser-options.cjs");

const MODE = process.env.PROBE_MODE || "idle";
const MINUTES = Number(process.env.PROBE_MINUTES || 6);
const BASE_URL = "http://127.0.0.1:4174/?e2e=1";

function rssMB() {
  // 读 cgroup 当前占用（容器内最直观）
  try {
    return Math.round(Number(fs.readFileSync("/sys/fs/cgroup/memory.current", "utf8")) / 1048576);
  } catch {
    return null;
  }
}

(async () => {
  const browser = await chromium.launch(browserLaunchOptions());
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.clock.install({ time: new Date("2026-11-20T12:00:00Z") });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.clock.runFor(600);
  await page.locator('[data-class="warrior"]').click();
  await page.clock.runFor(900);
  const start = rssMB();
  const size = (mb) => mb === null ? "未测得" : `${mb}MB`;
  process.stdout.write(`模式 ${MODE} 起始内存 ${size(start)}\n`);
  const totalMs = MINUTES * 60 * 1000;
  for (let t = 0; t < totalMs; t += 5000) {
    await page.clock.runFor(5000);
    if (MODE === "poll") {
      // 高频轮询：每 5 秒虚拟时间里塞 20 次快照（≈脚本里的密度）
      for (let i = 0; i < 20; i += 1) await page.evaluate(() => window.__ONEKNIFE_E2E__?.snapshot());
    }
    if (t % 30000 === 0) {
      const mb = rssMB();
      process.stdout.write(`t=${(t + 5000) / 1000}s 内存 ${size(mb)} 增量 ${size(start === null || mb === null ? null : mb - start)}\n`);
    }
  }
  const end = rssMB();
  const change = start === null || end === null ? null : end - start;
  process.stdout.write(`\n结论 ${MODE}: 起始 ${size(start)} 结束 ${size(end)} 增量 ${size(change)}，平均每虚拟分钟 ${size(change === null ? null : Math.round(change / MINUTES))}\n`);
  await browser.close();
})().catch((e) => {
  process.stdout.write(`FATAL ${e.message}\n`);
  process.exit(1);
});
