// 素材缺口审计（0.8.42 起）：把「地图怪物名 → 解析后的动作帧文件」与「素材库实际文件」对齐，
// 输出三类缺口：解析失败、部分帧未接入白名单、仅静态图/无素材的复用怪。
//
// 用法：
//   node tools/asset-audit.mjs          # 人类可读清单
//   node tools/asset-audit.mjs --json   # 机器可读 JSON
//
// 判据与运行时保持一致：直接用 assets.js 的 resolveMonsterSpriteName(name, action, map)，
// 不自己拼文件名，避免审计结论与浏览器实际加载脱节。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAPS, MAP_ORDER } from "../game/src/maps.js";
import { ACTION_MONSTERS, CHAPTER_SHORTS, MONSTER_ALIASES, resolveMonsterSpriteName, stripChapterPrefix } from "../game/src/assets.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "game", "assets");
const ACTIONS = ["idle", "walk", "attack", "hit"];
const exists = (name) => Boolean(name) && fs.existsSync(path.join(ASSETS, name));

const byName = new Map();
for (const id of MAP_ORDER) {
  const map = MAPS[id];
  for (const type of map.monsterTypes) {
    const rec = byName.get(type.name) || {
      name: type.name,
      maps: new Set(),
      actions: {},
      resolved: {}
    };
    rec.maps.add(`${map.id}(第${map.chapter}章)`);
    for (const action of ACTIONS) {
      const file = resolveMonsterSpriteName(type.name, action, map);
      rec.resolved[action] = file;
      rec.actions[action] = exists(file);
    }
    byName.set(type.name, rec);
  }
}

const rows = [...byName.values()].map((rec) => {
  const okCount = ACTIONS.filter((a) => rec.actions[a]).length;
  // 名字可能带任意章节前缀（苍月/龙脉/…），逐个章节尝试剥离，取第一个真正变化的结果。
  const base = CHAPTER_SHORTS.map((_, i) => stripChapterPrefix(rec.name, i + 1)).find((v) => v !== rec.name) || rec.name;
  // 别名表以「去章节前缀的基础名」为键：先查全名，再查 base。
  const alias = MONSTER_ALIASES[rec.name] || MONSTER_ALIASES[base] || null;
  const species = alias || (ACTION_MONSTERS.has(rec.name) ? rec.name : ACTION_MONSTERS.has(base) ? base : null);
  return {
    name: rec.name,
    maps: [...rec.maps],
    okCount,
    missing: ACTIONS.filter((a) => !rec.actions[a]),
    resolved: rec.resolved,
    base,
    species,
    whitelisted: Boolean(species),
    ownFrames: ACTIONS.filter((a) => exists(`monster-full-${base}-${a}.png`)).length,
    staticFrame: exists(`monster-full-${base}.png`)
  };
});

const speciesFiles = fs
  .readdirSync(ASSETS)
  .filter((f) => /^monster-full-.+-(idle|walk|attack|hit)\.png$/.test(f))
  .map((f) => f.replace(/^monster-full-/, "").replace(/-(idle|walk|attack|hit)\.png$/, ""));

const species = new Map();
for (const f of speciesFiles) species.set(f, (species.get(f) || 0) + 0);
for (const f of new Set(speciesFiles)) species.set(f, 0);
for (const f of speciesFiles) species.set(f, species.get(f) + 1);

const summary = {
  monsterNames: rows.length,
  resolvedAllFrames: rows.filter((r) => r.okCount === 4).length,
  resolvedWithMissing: rows.filter((r) => r.okCount < 4).length,
  whitelistedNames: rows.filter((r) => r.whitelisted).length,
  ownFrameSpecies: [...species.keys()].length,
  aliasReusedNames: rows.filter((r) => r.species && r.species !== r.name).length,
  partialOwnFrames: rows.filter((r) => r.ownFrames > 0 && r.ownFrames < 4).length,
  staticOnly: rows.filter((r) => r.ownFrames === 0 && r.staticFrame).length,
  noOwnArt: rows.filter((r) => r.ownFrames === 0 && !r.staticFrame).length
};

const report = {
  summary,
  partialFrames: rows
    .filter((r) => r.ownFrames > 0 && r.ownFrames < 4)
    .map((r) => ({
      name: r.name,
      base: r.base,
      have: ACTIONS.filter((a) => exists(`monster-full-${r.base}-${a}.png`)),
      missing: ACTIONS.filter((a) => !exists(`monster-full-${r.base}-${a}.png`)),
      whitelisted: r.whitelisted,
      maps: r.maps
    })),
  aliasReused: rows.filter((r) => r.species && r.species !== r.name).map((r) => ({ name: r.name, species: r.species, maps: r.maps })),
  noOwnArt: rows.filter((r) => r.ownFrames === 0 && !r.staticFrame).map((r) => ({ name: r.name, base: r.base, maps: r.maps })),
  unresolved: rows.filter((r) => r.okCount < 4).map((r) => ({ name: r.name, missing: r.missing, resolved: r.resolved }))
};

// 门禁：任何怪物出现四帧缺失或完全无素材，都让 CI 失败；仅静态原画属于质量提示，不阻断。
if (summary.resolvedWithMissing || summary.noOwnArt) process.exitCode = 1;

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(report, null, 1));
} else {
  const p = (s) => process.stdout.write(s + "\n");
  p(`素材审计（${ROOT}）`);
  p(`地图怪物名 ${summary.monsterNames} 个：四帧解析成功 ${summary.resolvedAllFrames}，有缺失 ${summary.resolvedWithMissing}`);
  p(`白名单/别名覆盖 ${summary.whitelistedNames} 个；素材库独立物种（有动作帧）${summary.ownFrameSpecies} 个`);
  p(
    `复用别名（外观与别的怪相同）${summary.aliasReusedNames} 个；部分帧未接入 ${summary.partialOwnFrames} 个；仅静态图 ${summary.staticOnly} 个；完全无自有素材 ${summary.noOwnArt} 个`
  );
  if (report.partialFrames.length) {
    p("\n[部分帧未接入]");
    for (const r of report.partialFrames)
      p(`- ${r.name}（${r.base}）有 ${r.have.join("/")}，缺 ${r.missing.join("/")}，白名单=${r.whitelisted}`);
  }
  if (report.aliasReused.length) {
    p("\n[复用别名（需独立原画才能去重）]");
    for (const r of report.aliasReused) p(`- ${r.name} → ${r.species}`);
  }
  if (report.noOwnArt.length) {
    p("\n[完全无自有素材（运行时走静态回退，需生成）]");
    for (const r of report.noOwnArt) p(`- ${r.name}（${r.base}）`);
  }
  if (report.unresolved.length) {
    p("\n[解析后仍缺文件（会 404）]");
    for (const r of report.unresolved) p(`- ${r.name}: 缺 ${r.missing.join("/")}`);
  }
}
