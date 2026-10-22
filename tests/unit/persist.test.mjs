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
