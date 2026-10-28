// 纯函数单元测试：存档版本迁移表（persist.js）。运行方式：npm run test:unit
// persist.js 只在函数体内访问 localStorage，因此可直接在 Node 中导入。
import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_SAVE_VERSION, migrateSave } from "../../game/src/persist.js";

test("migrateSave：v2 旧档（无 saveVersion）迁移到当前版本并记录等级下限", () => {
  const legacy = { classId: "warrior", currentMapId: "red_sand_desert", player: { level: 16, gold: 999 }, inventory: [], mapProgress: {} };
  const result = migrateSave(legacy);
  assert.ok(result, "v2 存档应能迁移");
  assert.equal(result.migrated, true);
  assert.equal(result.fromVersion, 2);
  assert.equal(result.saved.saveVersion, CURRENT_SAVE_VERSION);
  assert.equal(result.saved.player.migrationLevelFloor, 16, "等级下限应取旧档等级");
  assert.equal(result.saved.player.gold, 999, "迁移不应丢失原有字段");
});

test("migrateSave：v2 旧档缺少等级时等级下限回退为 1", () => {
  const result = migrateSave({ classId: "mage", player: { gold: 0 } });
  assert.equal(result.saved.player.migrationLevelFloor, 1);
});

test("migrateSave：当前版本存档不做迁移但会归一版本号", () => {
  const current = { saveVersion: CURRENT_SAVE_VERSION, classId: "taoist", player: { level: 40 } };
  const result = migrateSave(current);
  assert.ok(result);
  assert.equal(result.migrated, false);
  assert.equal(result.fromVersion, CURRENT_SAVE_VERSION);
  assert.equal(result.saved.saveVersion, CURRENT_SAVE_VERSION);
  assert.equal(result.saved.player.migrationLevelFloor, undefined, "当前版本存档不应被写入迁移字段");
});

test("migrateSave：v3 存档升级到 v4（12 部位补齐、技能点按等级折算、罪恶值归零）", () => {
  const legacyWeapon = { id: "w1", slot: "weapon", power: 20 };
  const legacy = {
    saveVersion: 3,
    classId: "warrior",
    currentMapId: "stage_050",
    player: { level: 31, equipment: { weapon: legacyWeapon, neck: null, boots: null } },
    equipment: { weapon: legacyWeapon, neck: null, boots: null },
    inventory: [],
    mapProgress: {}
  };
  const result = migrateSave(legacy);
  assert.ok(result, "v3 存档应能迁移");
  assert.equal(result.fromVersion, 3);
  assert.equal(result.saved.saveVersion, CURRENT_SAVE_VERSION);
  const equipment = result.saved.equipment;
  assert.equal(Object.keys(equipment).length, 12, "装备应扩展为 12 部位");
  assert.equal(equipment.weapon, legacyWeapon, "既有装备不应丢失");
  for (const slotKey of ["helmet", "armor", "braceletL", "braceletR", "ringL", "ringR", "belt", "medal", "talisman"])
    assert.equal(equipment[slotKey], null, `${slotKey} 应补齐为空位`);
  assert.equal(result.saved.player.skillPoints, 30, "技能点 = (等级-1) × 1");
  assert.deepEqual(result.saved.player.skillLevels, [0, 0, 0, 0]);
  assert.equal(result.saved.player.sin, 0);
});

test("migrateSave：v2 旧档直接迁移到当前版本（跨多级迁移链）", () => {
  const result = migrateSave({ classId: "mage", player: { level: 16 } });
  assert.equal(result.fromVersion, 2);
  assert.equal(result.saved.player.skillPoints, 15, "跨级迁移同样获得技能点折算");
  assert.equal(Object.keys(result.saved.equipment).length, 12);
});

test("migrateSave：拒绝读取更高版本存档（禁止降级）", () => {
  assert.equal(migrateSave({ saveVersion: CURRENT_SAVE_VERSION + 1, classId: "warrior" }), null);
});

test("migrateSave：缺少迁移函数或输入非法时返回 null", () => {
  assert.equal(migrateSave({ saveVersion: 1, classId: "warrior" }), null, "v1 没有迁移函数");
  assert.equal(migrateSave(null), null);
  assert.equal(migrateSave("not-a-save"), null);
});

test("migrateSave：结果可安全序列化（迁移字段随存档落盘）", () => {
  const result = migrateSave({ classId: "warrior", player: { level: 7 } });
  const roundTrip = JSON.parse(JSON.stringify(result.saved));
  assert.equal(roundTrip.saveVersion, CURRENT_SAVE_VERSION);
  assert.equal(roundTrip.player.migrationLevelFloor, 7);
});

// ============ 0.4.4 导入存档净化（修复：导入是唯一外部存档入口的注入面） ============
import { sanitizeSavedGame } from "../../game/src/persist.js";

test("sanitizeSavedGame：物品字符串字段剥除 HTML 注入字符，颜色校验，数值强制", () => {
  const saved = {
    classId: "warrior",
    inventory: [
      {
        id: "x1",
        name: "<img src=x onerror=alert(1)>",
        desc: '含"引号"<标签>&与号',
        glyph: "矿<script>",
        color: "red",
        amount: "37.6",
        affixes: [{ key: "defense", label: "<b>防御</b>", value: "15" }]
      }
    ],
    equipment: { weapon: { id: "w1", name: "剑<svg onload=alert(2)>", color: "#a88ce3" } },
    player: { equipment: { weapon: { id: "w1", name: "剑<svg onload=alert(2)>", color: "#a88ce3" } } }
  };
  const cleaned = sanitizeSavedGame(saved);
  const item = cleaned.inventory[0];
  assert.ok(!item.name.includes("<"), "物品名中的标签必须被剥除");
  assert.ok(!item.desc.includes('"') && !item.desc.includes("<"), "描述中的引号与标签必须被剥除");
  assert.ok(!item.glyph.includes("<"), "字形中的标签必须被剥除");
  assert.equal(item.color, "#78b6ec", "非法颜色格式回退默认色");
  assert.equal(item.amount, 38, "数值字符串强制为四舍五入整数");
  assert.equal(item.affixes[0].label, "b防御/b", "标签字符被剥除后仅剩安全文本，无尖括号即无注入能力");
  assert.ok(!item.affixes[0].label.includes("<"), "词缀标签不得残留尖括号");
  assert.equal(item.affixes[0].value, 15, "词缀数值字符串强制数字");
  assert.ok(!cleaned.equipment.weapon.name.includes("<svg"), "顶层装备名剥除注入");
  assert.ok(!cleaned.player.equipment.weapon.name.includes("<svg"), "player.equipment 同步净化");
  assert.equal(cleaned.equipment.weapon.color, "#a88ce3", "合法 6 位色保留");
});

test("sanitizeSavedGame：非对象物品被剔除，装备按 12 槽位白名单重建", () => {
  const cleaned = sanitizeSavedGame({
    classId: "warrior",
    inventory: [null, "junk", 42, { id: "m1", name: "黑铁矿石", slot: "material" }],
    equipment: { weapon: null, helmet: { id: "h1", name: "头盔" }, hackSlot: { id: "evil", name: "伪造槽位" } },
    player: {}
  });
  assert.equal(cleaned.inventory.length, 1, "null / 字符串 / 数字条目全部剔除");
  assert.equal(cleaned.inventory[0].name, "黑铁矿石");
  assert.equal(cleaned.equipment.weapon, null, "空槽保持 null");
  assert.ok(cleaned.equipment.helmet.name === "头盔");
  assert.equal(cleaned.equipment.hackSlot, undefined, "非 12 槽位的键被丢弃");
  assert.equal(Object.keys(cleaned.equipment).length, 12, "装备重建后恰为 12 槽位");
});

test("sanitizeSavedGame：缺 id 物品补生成导入 id，词缀超过 4 条截断", () => {
  const cleaned = sanitizeSavedGame({
    classId: "warrior",
    inventory: [{ name: "无 id 物品", affixes: [1, 2, 3, 4, 5, 6].map((n) => ({ key: `k${n}`, label: `词${n}`, value: n })) }],
    equipment: {}
  });
  assert.ok(cleaned.inventory[0].id.startsWith("imported-"), "缺 id 时补生成导入前缀 id");
  assert.equal(cleaned.inventory[0].affixes.length, 4, "词缀最多保留 4 条");
});
