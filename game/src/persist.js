import { CLASSES, STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_STORAGE_KEY_V2, EQUIPMENT_SLOT_KEYS, SKILL_UPGRADE } from "./config.js";
import { state } from "./runtime.js";
import { logDebug, logInfo, logWarn, logError } from "./logger.js";

// 《一刀999》存档读写：localStorage 存档落盘、版本迁移表驱动的 schema 升级与清理。

// 当前存档 schema 版本：每次结构变化 +1，并在下方迁移表补一个纯函数即可。
export const CURRENT_SAVE_VERSION = 4;

// 迁移表：键 = 源版本号，值 = 把存档从「键版本」升级到「键版本 + 1」的纯函数。
// 约定：纯函数只读写传入对象（可返回新对象），不触碰 localStorage 与游戏状态。
const SAVE_MIGRATIONS = {
  // v2 → v3：v2 存档没有 saveVersion 字段；迁移时记录等级下限，
  // 避免旧档在百图等级公式稀释后被降级（main.js 的 syncCampaignGrowth 会读取该字段）。
  2: (saved) => {
    saved.player ||= {};
    saved.player.migrationLevelFloor = Math.max(1, Number(saved.player.level) || 1);
    return saved;
  },
  // v3 → v4：装备从 3 部位扩展到 12 部位（缺失槽位补 null）；
  // 新增技能点（按既有等级折算，官方不直售技能等级，等级本身来自百图通关数）
  // 与技能等级数组、罪恶值字段。
  3: (saved) => {
    saved.player ||= {};
    const equipment = { ...(saved.equipment || saved.player.equipment || {}) };
    for (const slotKey of EQUIPMENT_SLOT_KEYS) equipment[slotKey] = equipment[slotKey] || null;
    saved.equipment = equipment;
    saved.player.equipment = equipment;
    const level = Math.max(1, Number(saved.player.level) || 1);
    saved.player.skillPoints = Math.max(0, (level - 1) * SKILL_UPGRADE.pointsPerLevel);
    saved.player.skillLevels = [0, 0, 0, 0];
    saved.player.sin = 0;
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
  try {
    const payload = JSON.stringify({
      saveVersion: CURRENT_SAVE_VERSION,
      classId: state.classId,
      currentMapId: state.currentMapId,
      player: state.player,
      inventory: state.inventory || [],
      equipment: state.player.equipment,
      mapProgress: state.mapProgress,
      // 0.6.0 P2：终局系统状态（难度档、怪物图鉴、深层最高层）。
      difficulty: state.difficulty || "normal",
      bestiary: state.bestiary || {},
      abyssBest: state.abyssBest || 0
    });
    localStorage.setItem(STORAGE_KEY, payload);
    // 0.8.7：存档字节数进日志——配额不足 / 数据异常膨胀时能直接看到体积变化。
    logDebug("save", "write", { bytes: payload.length, map: state.currentMapId, level: state.player.level });
    return true;
  } catch (error) {
    // 0.8.7：localStorage 可能因隐私模式 / 配额满而抛错，旧实现会直接把主循环打崩。
    logError("save", "writeFailed", { message: String(error && error.message ? error.message : error) });
    return false;
  }
}

// 读取存档并升级到当前版本：优先当前 key，再依次回退 v3 / v2 旧 key（不删除旧档）。
// 返回 { saved, migrated, fromVersion }，无存档或无法迁移时返回 null。
export function readSavedGame() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY_V2);
    if (!raw) {
      logInfo("save", "readEmpty");
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !CLASSES[parsed.classId]) {
      logWarn("save", "readRejected", { bytes: raw.length, classId: parsed?.classId || null });
      return null;
    }
    const result = migrateSave(parsed);
    if (!result) {
      logWarn("save", "migrateFailed", { bytes: raw.length, version: parsed.saveVersion ?? 2 });
      return null;
    }
    // 0.8.7：记录读档来源版本与迁移结果，排查「旧档升级后属性异常」时不用再猜。
    logInfo("save", "read", {
      bytes: raw.length,
      fromVersion: result.fromVersion,
      migrated: result.migrated,
      classId: parsed.classId,
      level: parsed.player?.level ?? null,
      map: parsed.currentMapId || null
    });
    return result;
  } catch (error) {
    // 存档损坏（截断/非法 JSON）按无存档处理，但留下诊断线索而不是静默吞掉。
    logWarn("save", "readFailed", { message: String(error && error.message ? error.message : error) });
    return null;
  }
}

// 清除 v4 当前存档与 v3 / v2 旧存档。
export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY_V2);
}

// ============ 0.4.4 导入存档净化（P3：导入是唯一外部存档入口） ============
// 物品的字符串字段（name / desc / glyph / source / 词缀 label）会被渲染层拼进 innerHTML
// 与 title / style 属性（renderEquipment / renderInventory），伪造存档可注入任意 HTML。
// 导入时统一：剥除 HTML 危险字符、截断长度、校验颜色格式、数值字段强制非负整数。
const cleanText = (value, max = 64) => (typeof value === "string" ? value.replace(/[<>&"']/g, "").slice(0, max) : "");

function sanitizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const cleaned = { ...item };
  cleaned.id = cleanText(item.id, 80) || `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  cleaned.name = cleanText(item.name, 40) || "未知物品";
  cleaned.desc = cleanText(item.desc, 200);
  cleaned.glyph = cleanText(item.glyph, 4);
  cleaned.source = cleanText(item.source, 40);
  cleaned.color = /^#[0-9a-fA-F]{6}$/.test(String(item.color)) ? item.color : "#78b6ec";
  for (const key of ["power", "value", "amount", "enhance", "blessing", "count"])
    if (item[key] !== undefined) cleaned[key] = Math.max(0, Math.round(Number(item[key]) || 0));
  if (Array.isArray(item.affixes))
    cleaned.affixes = item.affixes
      .slice(0, 4)
      .map((affix) =>
        affix && typeof affix === "object"
          ? {
              ...affix,
              group: cleanText(affix.group, 12),
              key: cleanText(affix.key, 20),
              label: cleanText(affix.label, 12),
              value: Math.max(0, Math.round(Number(affix.value) || 0))
            }
          : null
      )
      .filter(Boolean);
  return cleaned;
}

// 净化整份导入存档：背包过滤非对象项，装备按 12 槽位白名单重建（多余键丢弃），
// 顶层 equipment 与 player.equipment 同步净化结果（loadGame 优先读顶层）。
export function sanitizeSavedGame(saved) {
  if (!saved || typeof saved !== "object") return saved;
  const cleaned = { ...saved, player: { ...(saved.player || {}) } };
  if (Array.isArray(saved.inventory)) cleaned.inventory = saved.inventory.map(sanitizeItem).filter(Boolean);
  const equipment = {};
  for (const slotKey of EQUIPMENT_SLOT_KEYS) equipment[slotKey] = sanitizeItem(saved.equipment?.[slotKey]);
  cleaned.equipment = equipment;
  if (cleaned.player.equipment) cleaned.player.equipment = equipment;
  return cleaned;
}
