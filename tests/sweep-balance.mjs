// 数值调参砂锅（sweep harness）：不碰仓库，复制一份 game/ 到临时目录改常量、跑 sim、打指标。
//
// 为什么需要它：调一个数值要跑 100 关 × 3 职业（约 40–60s），手改仓库再 git checkout 很容易把半成品提交进去；
// 这里每次实验都是独立目录，跑完即弃，`--keep` 可保留现场。
//
// 用法：
//   node tests/sweep-balance.mjs --name=cap0028 \
//     --patch="game/src/combat.js|fastForward ? 0.18 : 0.035|fastForward ? 0.18 : 0.028" \
//     --classes=warrior
//   node tests/sweep-balance.mjs --name=hp012 --patch="game/src/maps.js|(stageNumber - 4) * 0.0097|(stageNumber - 4) * 0.12"
//
// 输出：每职业一行的百图指标 + 封套判定（与 balance-envelope.mjs 同一套阈值）。
import { cpSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const NAME = argOf("name", `sweep-${Date.now()}`);
const CLASSES = argOf("classes", "warrior");
const KEEP = args.includes("--keep");
const PATCHES = args
  .filter((item) => item.startsWith("--patch="))
  .map((item) => {
    const [file, from, to] = item.slice("--patch=".length).split("|");
    if (!file || !from || to === undefined) {
      console.error(`--patch 格式错误：${item}\n应为 --patch="文件|原文|新值"`);
      process.exit(2);
    }
    return { file, from, to };
  });

const THRESHOLDS = { deaths: [6, 25], zeroDeathMaps: 55, last90: [30, 48], bossShare: [0.4, 0.58] };

const root = join(tmpdir(), `oneknife-sweep-${NAME}`);
if (existsSync(root)) rmSync(root, { recursive: true, force: true });
mkdirSync(join(root, "tests"), { recursive: true });
cpSync("game", join(root, "game"), { recursive: true });
cpSync("tests/balance-sim.mjs", join(root, "tests/balance-sim.mjs"));

for (const patch of PATCHES) {
  const path = join(root, patch.file);
  const source = readFileSync(path, "utf8");
  if (!source.includes(patch.from)) {
    console.error(`补丁没命中：${patch.file} 里找不到\n  ${patch.from}`);
    process.exit(2);
  }
  const replaced = source.split(patch.from).join(patch.to);
  const hits = source.split(patch.from).length - 1;
  cpSync(path, `${path}.orig`);
  writeFileSync(path, replaced, "utf8");
  console.log(`patch ${patch.file} ×${hits}: ${patch.from.slice(0, 60)} → ${patch.to.slice(0, 60)}`);
}

const run = spawnSync(process.execPath, ["tests/balance-sim.mjs", `--classes=${CLASSES}`], {
  cwd: root,
  stdio: "inherit",
  timeout: 600000
});
if (run.status !== 0) {
  console.error("sim 失败", run.status);
  process.exit(run.status || 1);
}

const csv = readFileSync(join(root, "tests/balance-out.csv"), "utf8").trim().split(/\r?\n/);
const keys = csv[0].split(",");
const rows = csv.slice(1).map((line) => {
  const cells = line.split(",");
  const row = {};
  keys.forEach((key, index) => (row[key] = cells[index]));
  for (const key of ["index", "deaths", "potionUsed", "clearTime", "bossTime", "totalTime"]) row[key] = Number(row[key]);
  return row;
});

const failures = [];
console.log("\n===== 结果 =====");
for (const classId of [...new Set(rows.map((row) => row.classId))]) {
  const list = rows.filter((row) => row.classId === classId).sort((a, b) => a.index - b.index);
  const total = list.reduce((sum, row) => sum + row.totalTime, 0);
  const bossShare = list.reduce((sum, row) => sum + row.bossTime, 0) / total;
  const last90 = list.slice(10).reduce((sum, row) => sum + row.totalTime, 0) / Math.max(1, list.slice(10).length);
  const deaths = list.reduce((sum, row) => sum + row.deaths, 0);
  const zero = list.filter((row) => row.deaths === 0).length;
  const chapterDeaths = [];
  for (let start = 0; start < list.length; start += 10)
    chapterDeaths.push(list.slice(start, start + 10).reduce((sum, row) => sum + row.deaths, 0));
  console.log(
    `${classId.padEnd(8)} ${(total / 60).toFixed(1)}min  死${String(deaths).padStart(2)}  零死${String(zero).padStart(3)}  ` +
      `后90关${last90.toFixed(1)}s  Boss${(bossShare * 100).toFixed(0)}%  药${list.reduce((sum, row) => sum + row.potionUsed, 0)}  章死亡[${chapterDeaths.join(" ")}]`
  );
  if (deaths < THRESHOLDS.deaths[0] || deaths > THRESHOLDS.deaths[1]) failures.push(`${classId} 死亡 ${deaths}`);
  if (zero > THRESHOLDS.zeroDeathMaps) failures.push(`${classId} 零死图 ${zero}`);
  if (last90 < THRESHOLDS.last90[0] || last90 > THRESHOLDS.last90[1]) failures.push(`${classId} 后90关 ${last90.toFixed(1)}s`);
  if (bossShare < THRESHOLDS.bossShare[0] || bossShare > THRESHOLDS.bossShare[1])
    failures.push(`${classId} Boss ${(bossShare * 100).toFixed(0)}%`);
}

console.log(failures.length ? `封套：${failures.length} 项不达标 → ${failures.join("；")}` : "封套：全绿");
console.log(`现场：${root}${KEEP ? "（--keep 保留）" : ""}`);
if (!KEEP) rmSync(root, { recursive: true, force: true });
process.exit(0); // 砂锅只做观测，不因超标退出 1，避免 CI 误判
