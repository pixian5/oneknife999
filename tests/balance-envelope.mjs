// 百图数值封套（0.8.40 / T-03、T-09、T-10、T-21）
// 读 balance-out.csv（由 `node tests/balance-sim.mjs` 生成），断言"难度曲线/职业平衡/经济"落在设计区间。
// 两种模式（0.8.40 起）：
//   node tests/balance-envelope.mjs            # 回归模式：与 tests/balance-baseline.json 比，只禁止"比上次实测更差"
//   node tests/balance-envelope.mjs --strict   # 设计模式：按下方 ENVELOPE 的设计目标断言（当前 44 项未达标）
//   node tests/balance-envelope.mjs --json     # 机器可读输出
//   node tests/balance-envelope.mjs --baseline=path
// 为什么分两种：设计目标（后90关 30–48s / 每章 ≥1 死 / 职业极差 ≤1.25×）是**未达成**的北极星，
// 拿它当 CI 门禁会让每次改动都红一片；回归模式守"不许变坏"，--strict 用来量"离目标还有多远"。
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const CSV = argOf("csv", "tests/balance-out.csv");
const AS_JSON = args.includes("--json");
const STRICT = args.includes("--strict");

// 设计目标（0.8.40）：改动后必须落在这里；改数值时先跑 --sim 看趋势再定稿。
export const ENVELOPE = {
  // 0.8.40 用 sweep 实测校准过（见文档 §10）：
  // 零死图与死亡数存在数学关系——100 张图里最多 35 次死亡，零死图至少 65 张；
  // 所以"零死图 ≤55"是自相矛盾的指标，改成 80，配合"每章 ≥1 死"才可达成。
  deaths: [15, 35], // 单职业百图总死亡
  zeroDeathMaps: 80, // 零死亡关卡上限（死亡 ≤35 时的现实下限约 65）
  last90Seconds: [30, 48], // 后 90 关平均单关耗时
  bossShare: [0.4, 0.58], // Boss 战占总时长
  classSpread: 1.25, // 三职业总时长 max/min
  warriorPotion: 12000, // 战士百图药水上限（基线 8857，pkg1 11185）
  potionRatio: 3, // 战士 / 法师 药水比
  goldRetained: 15000, // 终局未消费金币上限
  chapterDeaths: 1 // 第 2..10 章每章至少 1 次死亡
};

function loadRows() {
  const text = readFileSync(CSV, "utf8").trim();
  const [header, ...lines] = text.split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row = {};
    keys.forEach((key, index) => (row[key] = cells[index]));
    for (const key of ["index", "level", "clearTime", "bossTime", "totalTime", "deaths", "potionUsed", "weaponPower", "gold"]) {
      row[key] = Number(row[key]);
    }
    return row;
  });
}

const rows = loadRows();
const classes = [...new Set(rows.map((row) => row.classId))];
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const sum = (list) => list.reduce((a, b) => a + b, 0);

const stats = classes.map((classId) => {
  const list = rows.filter((row) => row.classId === classId).sort((a, b) => a.index - b.index);
  const totalTime = sum(list.map((row) => row.totalTime));
  const last90 = list.slice(10);
  const chapters = [];
  for (let start = 0; start < list.length; start += 10) chapters.push(sum(list.slice(start, start + 10).map((row) => row.deaths)));
  return {
    classId,
    maps: list.length,
    totalMinutes: +(totalTime / 60).toFixed(1),
    deaths: sum(list.map((row) => row.deaths)),
    zeroDeathMaps: list.filter((row) => row.deaths === 0).length,
    last90Avg: +mean(last90.map((row) => row.totalTime)).toFixed(1),
    bossShare: +(sum(list.map((row) => row.bossTime)) / totalTime).toFixed(3),
    potion: sum(list.map((row) => row.potionUsed)),
    goldEnd: list[list.length - 1].gold,
    chapters
  };
});

const byClass = Object.fromEntries(stats.map((item) => [item.classId, item]));
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const times = stats.map((item) => item.totalMinutes);
const spread = Math.max(...times) / Math.min(...times);

if (STRICT) {
  // --strict：按设计封套断言（0.8.40 目标值；当前未达标，见 0.8.40-实施记录.md）
  for (const item of stats) {
    const tag = item.classId;
    check(item.maps === 100, `${tag}: 关卡数 ${item.maps} != 100`);
    check(
      item.deaths >= ENVELOPE.deaths[0] && item.deaths <= ENVELOPE.deaths[1],
      `${tag}: 百图死亡 ${item.deaths} 不在 ${ENVELOPE.deaths.join("~")}`
    );
    check(item.zeroDeathMaps <= ENVELOPE.zeroDeathMaps, `${tag}: 零死亡图 ${item.zeroDeathMaps} > ${ENVELOPE.zeroDeathMaps}`);
    check(
      item.last90Avg >= ENVELOPE.last90Seconds[0] && item.last90Avg <= ENVELOPE.last90Seconds[1],
      `${tag}: 后90关均时 ${item.last90Avg}s 不在 ${ENVELOPE.last90Seconds.join("~")}s`
    );
    check(
      item.bossShare >= ENVELOPE.bossShare[0] && item.bossShare <= ENVELOPE.bossShare[1],
      `${tag}: Boss 占比 ${(item.bossShare * 100).toFixed(0)}% 不在 ${(ENVELOPE.bossShare[0] * 100).toFixed(0)}%~${(ENVELOPE.bossShare[1] * 100).toFixed(0)}%`
    );
    check(item.goldEnd <= ENVELOPE.goldRetained, `${tag}: 终局留存金币 ${item.goldEnd} > ${ENVELOPE.goldRetained}（缺少消费出口）`);
    item.chapters.forEach((deaths, index) => {
      if (index === 0) return;
      check(
        deaths >= ENVELOPE.chapterDeaths,
        `${tag}: 第 ${index + 1} 章（关卡 ${index * 10 + 1}-${index * 10 + 10}）零死亡，难度曲线缺失`
      );
    });
  }
  check(spread <= ENVELOPE.classSpread, `职业总时长极差 ${spread.toFixed(2)}× > ${ENVELOPE.classSpread}×`);
  const w = byClass.warrior;
  const m = byClass.mage;
  if (w && m) {
    check(w.potion <= ENVELOPE.warriorPotion, `战士药水 ${w.potion} > ${ENVELOPE.warriorPotion}`);
    check(
      m.potion > 0 && w.potion / m.potion <= ENVELOPE.potionRatio,
      `战士/法师药水比 ${(w.potion / Math.max(1, m.potion)).toFixed(1)}× > ${ENVELOPE.potionRatio}×`
    );
  }
} else {
  // 回归模式（默认）：不找"离设计目标多远"，只找"比上次实测差多少"。
  // 设计目标的严格断言用 --strict；改数值时先跑 --sim 看趋势，再更新 baseline。
  const file = argOf("baseline", "tests/balance-baseline.json");
  let baseline = null;
  try {
    baseline = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`读不到基线 ${file}：${error.message}（用 --strict 按设计目标断言）`);
  }
  if (baseline) {
    const tol = baseline.tolerance || {};
    const rel = (a, b) => Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
    for (const item of stats) {
      const tag = item.classId;
      const base = baseline.stats?.[tag];
      check(item.maps === 100, `${tag}: 关卡数 ${item.maps} != 100`);
      if (!base) {
        failures.push(`${tag}: 基线里没有这个职业`);
        continue;
      }
      const worseMinutes = rel(item.totalMinutes, base.totalMinutes) > (tol.minutes ?? 0.08) && item.totalMinutes > base.totalMinutes;
      check(
        !worseMinutes,
        `${tag}: 百图时长 ${item.totalMinutes}min 比基线 ${base.totalMinutes}min 慢 ${(rel(item.totalMinutes, base.totalMinutes) * 100).toFixed(0)}%（容差 ${((tol.minutes ?? 0.08) * 100).toFixed(0)}%）`
      );
      const worseLast90 = rel(item.last90Avg, base.last90Avg) > (tol.last90 ?? 0.2) && item.last90Avg > base.last90Avg;
      check(
        !worseLast90,
        `${tag}: 后90关均时 ${item.last90Avg}s 比基线 ${base.last90Avg}s 慢 ${(rel(item.last90Avg, base.last90Avg) * 100).toFixed(0)}%`
      );
      const worseBoss = item.bossShare - base.bossShare > (tol.bossShare ?? 0.05);
      check(
        !worseBoss,
        `${tag}: Boss 占比 ${(item.bossShare * 100).toFixed(0)}% 比基线 ${(base.bossShare * 100).toFixed(0)}% 高 ${((item.bossShare - base.bossShare) * 100).toFixed(0)}pt`
      );
      // 基线药水可能是 0（法师/道士本来不嗑药），此时用绝对阈值，避免除以 0 后的荒谬百分比。
      const worsePotion =
        base.potion === 0
          ? item.potion > (tol.potionAbs ?? 300)
          : rel(item.potion, base.potion) > (tol.potion ?? 0.25) && item.potion > base.potion;
      check(
        !worsePotion,
        base.potion === 0
          ? `${tag}: 药水 ${item.potion} 超过绝对阈值 ${tol.potionAbs ?? 300}（基线为 0）`
          : `${tag}: 药水 ${item.potion} 比基线 ${base.potion} 多 ${(rel(item.potion, base.potion) * 100).toFixed(0)}%`
      );
      const worseGold = rel(item.goldEnd, Math.max(1, base.goldEnd)) > (tol.gold ?? 0.25) && item.goldEnd > base.goldEnd;
      check(
        !worseGold,
        `${tag}: 终局金币 ${item.goldEnd} 比基线 ${base.goldEnd} 多 ${(rel(item.goldEnd, Math.max(1, base.goldEnd)) * 100).toFixed(0)}%`
      );
    }
    const baseSpread = baseline.spread ?? 1.25;
    check(spread <= baseSpread * (tol.spread ?? 1.1), `职业极差 ${spread.toFixed(2)}× 比基线 ${baseSpread.toFixed(2)}× 更失衡`);
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ stats, failures, spread: +spread.toFixed(3) }, null, 2));
} else {
  console.log("===== 百图封套（0.8.40）=====");
  console.log("class     maps  minutes  deaths  zeroDeath  last90  bossShare  potion  goldEnd");
  for (const item of stats) {
    console.log(
      `${item.classId.padEnd(9)} ${String(item.maps).padEnd(5)} ${String(item.totalMinutes).padEnd(8)} ${String(item.deaths).padEnd(7)} ` +
        `${String(item.zeroDeathMaps).padEnd(10)} ${String(item.last90Avg).padEnd(7)} ${(item.bossShare * 100).toFixed(0).padStart(8)}%  ` +
        `${String(item.potion).padEnd(7)} ${item.goldEnd}`
    );
  }
  console.log(
    `职业极差 ${spread.toFixed(2)}×；章节死亡分布 ` +
      stats.map((item) => `${item.classId}=[${item.chapters.map((d) => (d === 0 ? "0" : d)).join(" ")}]`).join("  ")
  );
  if (failures.length) {
    console.log(`\nFAIL ${failures.length} 项：`);
    for (const message of failures) console.log("  ✗ " + message);
  } else {
    console.log("\nPASS 封套全绿");
  }
}

if (args.includes("--sim")) {
  const run = spawnSync(process.execPath, ["tests/balance-sim.mjs"], { stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status || 1);
}

process.exit(failures.length ? 1 : 0);
