// 0.8.7 日志基础设施单测：级别过滤、环形缓冲、采样、节流与上下文注入。
// 这些性质决定了「出问题时日志是否可信」——容量算错会丢关键现场，
// 采样/节流算错则可能把高频事件刷爆缓冲区或干脆不记录。
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  configureLogger,
  loggerConfig,
  setLogContext,
  logDebug,
  logInfo,
  logWarn,
  logError,
  logThrottled,
  logSample,
  dumpLogs,
  logsText,
  logStats,
  clearLogs,
  installGlobalErrorHooks,
  exposeLogConsole
} from "../../game/src/logger.js";

beforeEach(() => {
  clearLogs();
  setLogContext(null);
  configureLogger({ level: "debug", capacity: 600, mirrorConsole: false });
});

test("级别过滤：info 档只保留 info/warn/error", () => {
  configureLogger({ level: "info" });
  logDebug("combat", "hit", { damage: 1 });
  logInfo("map", "load", { mapId: "a" });
  logWarn("save", "failed", { reason: "quota" });
  logError("runtime", "crash", { message: "boom" });
  const entries = dumpLogs({ limit: 100 });
  assert.deepEqual(
    entries.map((entry) => entry.level),
    ["info", "warn", "error"]
  );
  assert.equal(logStats().total, 3);
});

test("环形缓冲：超过容量时丢弃最旧条目并累计 dropped", () => {
  configureLogger({ level: "debug", capacity: 3 });
  for (let index = 0; index < 5; index += 1) logInfo("test", "seq", { index });
  const entries = dumpLogs({ limit: 100 });
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => entry.data.index),
    [2, 3, 4]
  );
  assert.equal(logStats().dropped, 2);
});

test("采样：每 N 次只落一条，并带 sample 计数", () => {
  for (let index = 0; index < 6; index += 1) logSample("hit", 3, "debug", "combat", "sample", { index });
  const entries = dumpLogs({ limit: 100 });
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => entry.data.sample),
    [3, 6]
  );
});

test("节流：同键窗口内只记一次，不同键互不影响", () => {
  assert.equal(logThrottled("frame", 1000, "warn", "perf", "slow", { n: 1 }), true);
  assert.equal(logThrottled("frame", 1000, "warn", "perf", "slow", { n: 2 }), false);
  assert.equal(logThrottled("other", 1000, "warn", "perf", "slow", { n: 3 }), true);
  assert.equal(dumpLogs({ limit: 100 }).length, 2);
});

test("上下文注入：每条日志自动带上下文，provider 抛错时降级为 ctxError", () => {
  setLogContext(() => ({ map: "ash_outskirts", frame: 7 }));
  logInfo("map", "load");
  assert.deepEqual(dumpLogs({ limit: 1 })[0].ctx, { map: "ash_outskirts", frame: 7 });

  setLogContext(() => {
    throw new Error("ctx broke");
  });
  logInfo("map", "load");
  assert.match(dumpLogs({ limit: 1 })[0].ctx.ctxError, /ctx broke/);
});

test("文本导出：包含级别、类别、事件与数据，可按类别过滤", () => {
  logInfo("map", "load", { mapId: "ash_outskirts" });
  logWarn("save", "failed", { reason: "quota" });
  const text = logsText({ limit: 100 });
  assert.match(text, /\[info\] \[map\] load/);
  assert.match(text, /ash_outskirts/);
  assert.match(text, /\[warn\] \[save\] failed/);
  const onlySave = logsText({ limit: 100, category: "save" });
  assert.equal(onlySave.split("\n").length, 1);
  assert.match(onlySave, /save/);
});

test("clearLogs：清空条目、统计与采样计数", () => {
  logInfo("test", "one");
  logSample("key", 2, "debug", "test", "sampled");
  clearLogs();
  assert.equal(dumpLogs().length, 0);
  assert.equal(logStats().total, 0);
  // 采样计数被重置：下一次采样应重新从 1 开始计，第 2 次才落。
  logSample("key", 2, "debug", "test", "sampled");
  assert.equal(dumpLogs().length, 0);
  logSample("key", 2, "debug", "test", "sampled");
  assert.equal(dumpLogs().length, 1);
});

test("全局异常钩子：幂等安装且写入 error 日志", () => {
  const handlers = {};
  const target = {
    addEventListener(type, handler) {
      handlers[type] = handler;
    }
  };
  assert.equal(installGlobalErrorHooks(target), true);
  assert.equal(installGlobalErrorHooks(target), false, "重复安装应被拒绝");
  handlers.error({ message: "boom", error: new Error("boom"), filename: "main.js", lineno: 10, colno: 2 });
  const errorEntry = dumpLogs({ level: "error", limit: 10 })[0];
  assert.equal(errorEntry.cat, "runtime");
  assert.equal(errorEntry.event, "uncaught");
  assert.match(errorEntry.data.message, /boom/);
});

test("控制台入口：暴露 dump/text/stats/clear/config", () => {
  const target = {};
  assert.equal(exposeLogConsole(target), true);
  logInfo("test", "console");
  assert.equal(typeof target.__ONEKNIFE_LOG__.text, "function");
  assert.match(target.__ONEKNIFE_LOG__.text(), /console/);
  assert.equal(target.__ONEKNIFE_LOG__.stats().total, 1);
  assert.equal(loggerConfig().capacity, 600);
});
