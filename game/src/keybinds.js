// 《一刀999》键位配置：默认键位、校验与本地持久化。
// 键位独立存储（不进 v4 存档），重置游戏不会清掉玩家自定义键位。
// 纯函数（sanitizeKeybinds / validateKeybindChange）可在 Node 单测中直接引用。

import { logDebug, logInfo, logWarn } from "./logger.js";

export const KEYBINDS_STORAGE_KEY = "oneknife999-keybinds-v1";

// 默认键位：普攻改为 X，紧邻技能键 1-4，避免 J 与数字键跨度过大。
// 移动键固定为 WASD / 方向键，不开放自定义（见 RESERVED_KEYS）。
export const DEFAULT_KEYBINDS = {
  attack: "x",
  skill1: "1",
  skill2: "2",
  skill3: "3",
  skill4: "4",
  potion: "q",
  pickup: "f",
  ultimate: "r",
  travel: "t",
  skillUpgrade: "k"
};

// 设置面板展示顺序与中文说明。default 值仅用于「恢复默认」提示。
export const KEYBIND_ACTIONS = [
  { id: "attack", label: "普通攻击", hint: "默认 X，靠近目标后连续攻击" },
  { id: "skill1", label: "技能 1", hint: "职业技能栏第 1 格" },
  { id: "skill2", label: "技能 2", hint: "职业技能栏第 2 格" },
  { id: "skill3", label: "技能 3", hint: "职业技能栏第 3 格" },
  { id: "skill4", label: "技能 4", hint: "职业技能栏第 4 格" },
  { id: "potion", label: "生命药水", hint: "恢复生命，消耗背包药水" },
  { id: "pickup", label: "拾取 / 交互", hint: "优先拾取掉落，其次补给箱与场景节点" },
  { id: "ultimate", label: "一刀时刻", hint: "破势槽满后释放" },
  { id: "travel", label: "前往出口", hint: "走向当前关卡东侧出口" },
  { id: "skillUpgrade", label: "技能升级面板", hint: "打开 / 关闭技能升级弹窗" }
];

// 保留键：移动、取消、浏览器切焦等。绑定时直接拒绝，避免与固定操作冲突。
export const RESERVED_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "escape",
  "tab",
  " ",
  "enter"
]);

// 冲突时的候补键（按顺序找第一个未被占用的键），保证坏存档也能恢复成可用键位。
const FALLBACK_KEYS = "xzcvbnmghyuiop567890".split("");

export function normalizeKey(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

// 可绑定范围：单个字母 / 数字，或 F1-F12。避免把组合键、浏览器快捷键绑进游戏。
export function isBindableKey(key) {
  const value = normalizeKey(key);
  if (!value || RESERVED_KEYS.has(value)) return false;
  return /^[a-z0-9]$/.test(value) || /^f([1-9]|1[0-2])$/.test(value);
}

// 校验一次改键：动作必须存在、键必须可绑定、不能与其他动作重复。
export function validateKeybindChange(bindings, action, rawKey) {
  const key = normalizeKey(rawKey);
  const target = KEYBIND_ACTIONS.find((entry) => entry.id === action);
  if (!target) return { ok: false, error: "未知的按键动作" };
  if (!key) return { ok: false, error: "无效按键" };
  if (RESERVED_KEYS.has(key)) return { ok: false, error: "该键被移动或系统操作占用" };
  if (!isBindableKey(key)) return { ok: false, error: "只支持单个字母、数字或 F1-F12" };
  const conflict = KEYBIND_ACTIONS.find((entry) => entry.id !== action && bindings?.[entry.id] === key);
  if (conflict) return { ok: false, error: `该键已被「${conflict.label}」使用` };
  return { ok: true, key };
}

// 规范化任意来源（本地存储 / 导入）的键位：非法键回退默认，默认键被占用时取候补键。
export function sanitizeKeybinds(raw) {
  const result = {};
  const used = new Set();
  for (const action of KEYBIND_ACTIONS) {
    const candidate = normalizeKey(raw?.[action.id]);
    if (isBindableKey(candidate) && !used.has(candidate)) {
      result[action.id] = candidate;
      used.add(candidate);
      continue;
    }
    const fallback = DEFAULT_KEYBINDS[action.id];
    if (isBindableKey(fallback) && !used.has(fallback)) {
      result[action.id] = fallback;
      used.add(fallback);
      continue;
    }
    const spare = FALLBACK_KEYS.find((key) => !used.has(key) && isBindableKey(key));
    result[action.id] = spare || fallback;
    used.add(result[action.id]);
  }
  return result;
}

// 运行时活引用：input / render 直接读取，改键后原位更新，避免到处传参。
export const keybinds = { ...DEFAULT_KEYBINDS };

const hasStorage = () => typeof localStorage !== "undefined";

export function loadKeybinds() {
  let raw = null;
  if (hasStorage()) {
    try {
      raw = JSON.parse(localStorage.getItem(KEYBINDS_STORAGE_KEY) || "null");
    } catch (error) {
      raw = null;
      logWarn("keybind", "readRejected", { reason: String(error && error.message ? error.message : error) });
    }
  }
  const sanitized = sanitizeKeybinds(raw);
  Object.assign(keybinds, sanitized);
  logDebug("keybind", "load", { stored: Boolean(raw), binds: { ...keybinds } });
  return keybinds;
}

export function persistKeybinds() {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(keybinds));
  } catch (error) {
    // 隐私模式 / 配额满时静默失败：本局键位仍然生效，只是无法跨刷新保留。
    logWarn("keybind", "writeFailed", { reason: String(error && error.message ? error.message : error) });
  }
}

// 修改单个键位：校验通过才写入并持久化，返回 { ok, error } 供 UI 提示。
export function setKeybind(action, rawKey) {
  const checked = validateKeybindChange(keybinds, action, rawKey);
  if (!checked.ok) {
    logInfo("keybind", "setBlocked", { action, key: normalizeKey(rawKey), reason: checked.error });
    return checked;
  }
  const previous = keybinds[action];
  keybinds[action] = checked.key;
  persistKeybinds();
  logInfo("keybind", "set", { action, from: previous, to: checked.key });
  return checked;
}

export function resetKeybinds() {
  Object.assign(keybinds, DEFAULT_KEYBINDS);
  persistKeybinds();
  logInfo("keybind", "reset", { binds: { ...keybinds } });
}

// 显示用标签：字母统一大写，F 键保持大写。
export function keyLabel(action) {
  const key = keybinds[action] || DEFAULT_KEYBINDS[action] || "";
  return key.toUpperCase();
}

// 反向查表：按下的键对应哪个动作（找不到返回 null）。
export function actionForKey(rawKey) {
  const key = normalizeKey(rawKey);
  return KEYBIND_ACTIONS.find((entry) => keybinds[entry.id] === key)?.id || null;
}
