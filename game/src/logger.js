// 0.8.7 结构化诊断日志：把「发生了什么」按类别沉淀到内存环形缓冲区，
// 出问题时可以直接 dump 最近 N 条定位，而不是靠复述现象猜。
//
// 设计目标：
//   1) 零依赖、可在 Node 单测中导入；浏览器里不写 localStorage（避免配额与存档污染）。
//   2) 分为 debug / info / warn / error 四级。生产默认 info，`?log=debug` 或 `?e2e=1` 开 debug。
//   3) 环形缓冲固定容量，满了丢最旧的一条，只累加 dropped，不阻塞主循环。
//   4) 支持「同键节流」与「每 N 次采样」，高频事件（伤害 / 毒跳 / 存档）不会刷爆缓冲区。
//   5) 支持全局上下文注入（地图 / 关卡 / 职业 / 等级 / 血量 / 帧号），每条日志自动带现场。
//   6) 捕获未处理异常与 Promise 拒绝，避免「页面白屏但控制台什么都没有」。
//
// 使用约定：
//   logInfo("map", "load", { mapId, stage, keepBossHp })     关键状态变化
//   logDebug("combat", "hit", { attacker, damage })           高频细节（默认不落缓冲）
//   logWarn("save", "failed", { reason })                     可恢复异常
//   logError("boot", "crash", { error })                      致命异常
//   logThrottled("autosave", 5000, "info", "save", "auto")    同键 5 秒内只记一次
//   logSample("dmg", 10, "debug", "combat", "hit", data)      每 10 次记一次（带 sample 计数）

export const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const DEFAULT_CAPACITY = 600;
const DEFAULT_LEVEL = "info";
const DATA_STRING_LIMIT = 240;

const state = {
  capacity: DEFAULT_CAPACITY,
  /** @type {"debug"|"info"|"warn"|"error"} */
  level: DEFAULT_LEVEL,
  mirrorConsole: false,
  entries: [],
  seq: 0,
  dropped: 0,
  stats: {},
  contextProvider: null
};

const throttles = new Map();
const samples = new Map();
const errorSeen = new Set();

function now() {
  // performance 在 Node 与浏览器都有；退化到 Date.now 保证老环境也能跑。
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function levelWeight(level) {
  return LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

// 从 URL 读取日志级别：`?log=debug` 开详细日志；e2e 默认 debug。
function detectConfig() {
  if (typeof window === "undefined" || !window.location) return { level: DEFAULT_LEVEL, mirror: false };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("log");
  const level = requested && LOG_LEVELS[requested] ? requested : params.get("e2e") ? "debug" : DEFAULT_LEVEL;
  // e2e 默认开 debug 但**不镜像控制台**（每次伤害都 console 会拖慢探针）；
  // 只有显式 `?log=debug` 才逐条打印，供人手调试。
  return { level, mirror: requested === "debug" };
}

export function configureLogger({ level, capacity, mirrorConsole } = {}) {
  if (level && LOG_LEVELS[level]) state.level = level;
  if (Number.isInteger(capacity) && capacity > 0) {
    state.capacity = capacity;
    while (state.entries.length > state.capacity) state.entries.shift();
  }
  if (mirrorConsole !== undefined) state.mirrorConsole = Boolean(mirrorConsole);
  return { level: state.level, capacity: state.capacity, mirrorConsole: state.mirrorConsole };
}

export function loggerConfig() {
  return { level: state.level, capacity: state.capacity, mirrorConsole: state.mirrorConsole };
}

// 全局上下文：由 main.js 注入，返回当前地图 / 关卡 / 职业 / 等级 / 血量 / 帧号。
// 出错时条目仍会写入（用 ctxError 标记），不能让日志本身把游戏打崩。
export function setLogContext(provider) {
  state.contextProvider = typeof provider === "function" ? provider : null;
}

export function logEnabled(level = "debug") {
  return levelWeight(level) >= levelWeight(state.level);
}

function currentContext() {
  if (!state.contextProvider) return null;
  try {
    return state.contextProvider();
  } catch (error) {
    return { ctxError: String(error && error.message ? error.message : error) };
  }
}

function pushEntry(level, category, event, data) {
  if (!logEnabled(level)) return false;
  state.seq += 1;
  const entry = {
    seq: state.seq,
    t: Math.round(now()),
    level,
    cat: category,
    event,
    data: data === undefined ? null : data
  };
  const ctx = currentContext();
  if (ctx) entry.ctx = ctx;
  state.entries.push(entry);
  if (state.entries.length > state.capacity) {
    state.entries.shift();
    state.dropped += 1;
  }
  const key = `${category}.${event}`;
  state.stats[key] = (state.stats[key] || 0) + 1;
  if (state.mirrorConsole && typeof console !== "undefined") {
    const prefix = `[${level}] [${category}] ${event}`;
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    try {
      console[method](prefix, data === undefined ? "" : data);
    } catch {
      // 控制台被重定向时忽略，不影响主循环。
    }
  }
  return true;
}

export function logDebug(category, event, data) {
  return pushEntry("debug", category, event, data);
}

export function logInfo(category, event, data) {
  return pushEntry("info", category, event, data);
}

export function logWarn(category, event, data) {
  return pushEntry("warn", category, event, data);
}

export function logError(category, event, data) {
  return pushEntry("error", category, event, data);
}

// 同键节流：用于每秒都会触发但只在「异常 / 定时」时才有价值的事件（自动存档、帧率告警）。
export function logThrottled(key, intervalMs, level, category, event, data) {
  const stamp = now();
  const last = throttles.get(key);
  // 注意：不能用 `|| 0` 兜底——performance.now() 从页面/进程启动开始计时，
  // 启动后 1 秒内的第一次调用会被误判成「窗口内重复」而丢掉（0.8.7 单测发现）。
  if (last !== undefined && stamp - last < intervalMs) return false;
  throttles.set(key, stamp);
  return pushEntry(level, category, event, data);
}

// 每 N 次采样：高频伤害日志用这个，既保留趋势又不刷爆缓冲。
export function logSample(key, every, level, category, event, data) {
  const count = (samples.get(key) || 0) + 1;
  samples.set(key, count);
  if (count % Math.max(1, every) !== 0) return false;
  return pushEntry(level, category, event, { ...(data || {}), sample: count });
}

function formatData(data) {
  if (data === null || data === undefined) return "";
  if (typeof data === "string") return data;
  try {
    const text = JSON.stringify(data);
    return text.length > DATA_STRING_LIMIT ? `${text.slice(0, DATA_STRING_LIMIT)}…` : text;
  } catch (error) {
    return `[unserializable: ${String(error && error.message ? error.message : error)}]`;
  }
}

// 人类可读的一行格式，探针失败时直接打印，能按时间顺序还原现场。
export function formatEntry(entry) {
  const ctx = entry.ctx ? ` {${formatData(entry.ctx)}}` : "";
  return `[+${entry.t}ms] [${entry.level}] [${entry.cat}] ${entry.event}${ctx} ${formatData(entry.data)}`.trimEnd();
}

export function dumpLogs({ limit = 200, level, category } = {}) {
  let entries = state.entries;
  if (level && LOG_LEVELS[level]) {
    const minimum = levelWeight(level);
    entries = entries.filter((entry) => levelWeight(entry.level) >= minimum);
  }
  if (category) entries = entries.filter((entry) => entry.cat === category);
  return entries.slice(-Math.max(1, limit));
}

export function logsText(options) {
  return dumpLogs(options).map(formatEntry).join("\n");
}

export function logStats() {
  return {
    total: state.seq,
    kept: state.entries.length,
    dropped: state.dropped,
    capacity: state.capacity,
    level: state.level,
    events: { ...state.stats }
  };
}

export function clearLogs() {
  state.entries = [];
  state.seq = 0;
  state.dropped = 0;
  state.stats = {};
  throttles.clear();
  samples.clear();
  errorSeen.clear();
}

// 全局异常兜底：同一错误只记一次（按 message + 首行 stack），避免每帧重复刷屏。
export function installGlobalErrorHooks(target = typeof window !== "undefined" ? window : null) {
  if (!target || target.__ONEKNIFE_LOG_HOOKS__) return false;
  target.__ONEKNIFE_LOG_HOOKS__ = true;
  target.addEventListener?.("error", (event) => {
    const error = event?.error;
    const message = event?.message || (error && error.message) || "unknown error";
    const stackLine = String((error && error.stack) || "").split("\n")[1] || "";
    const key = `${message}|${stackLine}`;
    if (errorSeen.has(key)) return;
    errorSeen.add(key);
    logError("runtime", "uncaught", {
      message,
      source: event?.filename || null,
      line: event?.lineno || null,
      column: event?.colno || null,
      stack: String((error && error.stack) || "").slice(0, 600)
    });
  });
  target.addEventListener?.("unhandledrejection", (event) => {
    const reason = event?.reason;
    const message = (reason && reason.message) || String(reason);
    const key = `promise|${message}`;
    if (errorSeen.has(key)) return;
    errorSeen.add(key);
    logError("runtime", "unhandledRejection", { message, stack: String((reason && reason.stack) || "").slice(0, 600) });
  });
  return true;
}

// 浏览器调试入口：控制台里 `__ONEKNIFE_LOG__.text({limit:100})` 即可拿到最近日志。
export function exposeLogConsole(target = typeof window !== "undefined" ? window : null) {
  if (!target) return false;
  target.__ONEKNIFE_LOG__ = {
    dump: dumpLogs,
    text: logsText,
    stats: logStats,
    clear: clearLogs,
    config: loggerConfig
  };
  return true;
}

// 模块加载即按 URL 决定默认级别；main.js 可在启动后再覆盖。
const detected = detectConfig();
configureLogger({ level: detected.level, mirrorConsole: detected.mirror });
