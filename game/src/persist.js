import { CLASSES, STORAGE_KEY, LEGACY_STORAGE_KEY } from "./config.js";
import { state } from "./runtime.js";

// 《一刀999》存档读写：localStorage 存档落盘、版本迁移表驱动的 schema 升级与清理。

// 当前存档 schema 版本：每次结构变化 +1，并在下方迁移表补一个纯函数即可。
export const CURRENT_SAVE_VERSION = 3;

// 迁移表：键 = 源版本号，值 = 把存档从「键版本」升级到「键版本 + 1」的纯函数。
// 约定：纯函数只读写传入对象（可返回新对象），不触碰 localStorage 与游戏状态。
const SAVE_MIGRATIONS = {
  // v2 → v3：v2 存档没有 saveVersion 字段；迁移时记录等级下限，
  // 避免旧档在百图等级公式稀释后被降级（main.js 的 syncCampaignGrowth 会读取该字段）。
  2: (saved) => {
    saved.player ||= {};
    saved.player.migrationLevelFloor = Math.max(1, Number(saved.player.level) || 1);
    return saved;
  }
};

// 纯函数：把任意版本的存档逐级迁移到 CURRENT_SAVE_VERSION。
// 返回 { saved, migrated, fromVersion }；无可用迁移路径或版本高于当前（拒绝降级）时返回 null。
export function migrateSave(saved) {
  if (!saved || typeof saved !== "object") return null;
  // 版本缺失视为 v2：v2 存档不写 saveVersion 字段。
  let version = Number(saved.saveVersion) || 2;
  if (version > CURRENT_SAVE_VERSION) return null;
  const fromVersion = version;
  let migrated = false;
  while (version < CURRENT_SAVE_VERSION) {
    const migration = SAVE_MIGRATIONS[version];
    if (!migration) return null;
    saved = migration(saved);
    version += 1;
    migrated = true;
  }
  saved.saveVersion = CURRENT_SAVE_VERSION;
  return { saved, migrated, fromVersion };
}

export function persistGame() {
  if (!state) return false;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      saveVersion: CURRENT_SAVE_VERSION,
      classId: state.classId,
      currentMapId: state.currentMapId,
      player: state.player,
      inventory: state.inventory || [],
      equipment: state.player.equipment,
      mapProgress: state.mapProgress
    })
  );
  return true;
}

// 读取存档并升级到当前版本：优先当前 key，没有时读取 v2 旧 key（不删除旧档）。
// 返回 { saved, migrated, fromVersion }，无存档或无法迁移时返回 null。
export function readSavedGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !CLASSES[parsed.classId]) return null;
    return migrateSave(parsed);
  } catch {
    return null;
  }
}

// 清除 v3 当前存档与 v2 旧存档。
export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
