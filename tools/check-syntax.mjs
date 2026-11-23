// 语法检查入口：扫描项目内全部 JS / CJS / MJS，避免 package.json 手工清单漏掉新模块。
// 用法：node tools/check-syntax.mjs
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const TARGET_DIRS = ["game/src", "tests", "tools"];
const EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
const EXTRA_FILES = ["game/sw.js"];

function walk(dir, result = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过依赖、缓存和历史目录，只检查仓库自己的源码与测试。
      if (["node_modules", ".git", ".test-artifacts", "coverage", "tmp"].includes(entry.name)) continue;
      walk(path, result);
      continue;
    }
    if (entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      result.push(path);
    }
  }
  return result;
}

const files = TARGET_DIRS.flatMap((dir) => walk(join(ROOT, dir))).concat(EXTRA_FILES.map((file) => join(ROOT, file)));
files.sort();

let failures = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    failures += 1;
    console.error(`\n[语法失败] ${relative(ROOT, file)}`);
    if (error.stderr) console.error(String(error.stderr).trim());
  }
}

if (failures) {
  console.error(`\n语法检查失败：${failures}/${files.length} 个文件有问题`);
  process.exit(1);
}
console.log(`语法检查通过：${files.length} 个文件`);
