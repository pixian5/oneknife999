import { CLASSES, STORAGE_KEY, LEGACY_STORAGE_KEY } from "./config.js";
import { state } from "./runtime.js";

// 《一刀999》存档读写：localStorage 存档落盘、v2 → v3 迁移判定与清理。

export function persistGame() {
  if (!state) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ saveVersion: 3, classId: state.classId, currentMapId: state.currentMapId, player: state.player, inventory: state.inventory || [], equipment: state.player.equipment, mapProgress: state.mapProgress }));
  return true;
}

// 读取当前 v3 存档；若只有 v2 旧存档，则返回待迁移内容（不删除旧档）。
export function readSavedGame() {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    const legacyRaw = currentRaw ? null : localStorage.getItem(LEGACY_STORAGE_KEY);
    const saved = JSON.parse(currentRaw || legacyRaw);
    if (!saved || !CLASSES[saved.classId]) return null;
    return { saved, migratedFromV2: !currentRaw && Boolean(legacyRaw) };
  } catch { return null; }
}

// 清除 v3 当前存档与 v2 旧存档。
export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
