// 纯函数单元测试：键位配置（keybinds.js）。运行方式：npm run test:unit
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_KEYBINDS,
  KEYBIND_ACTIONS,
  isBindableKey,
  validateKeybindChange,
  sanitizeKeybinds,
  actionForKey,
  keybinds,
  setKeybind,
  resetKeybinds
} from "../../game/src/keybinds.js";

test("默认键位：普攻为 X，紧邻技能键 1-4", () => {
  assert.equal(DEFAULT_KEYBINDS.attack, "x");
  assert.deepEqual(
    [DEFAULT_KEYBINDS.skill1, DEFAULT_KEYBINDS.skill2, DEFAULT_KEYBINDS.skill3, DEFAULT_KEYBINDS.skill4],
    ["1", "2", "3", "4"]
  );
  assert.equal(KEYBIND_ACTIONS.length, Object.keys(DEFAULT_KEYBINDS).length, "设置面板应覆盖全部可改动作");
});

test("isBindableKey：单字母 / 数字 / F1-F12 可绑定，移动键与组合键拒绝", () => {
  assert.equal(isBindableKey("x"), true);
  assert.equal(isBindableKey("7"), true);
  assert.equal(isBindableKey("F12"), true);
  assert.equal(isBindableKey("w"), false, "移动键保留");
  assert.equal(isBindableKey("arrowup"), false);
  assert.equal(isBindableKey("escape"), false);
  assert.equal(isBindableKey("shift+a"), false);
  assert.equal(isBindableKey(""), false);
});

test("validateKeybindChange：拒绝保留键、未知动作与其他动作已占用的键", () => {
  const bindings = { ...DEFAULT_KEYBINDS };
  assert.equal(validateKeybindChange(bindings, "attack", "w").ok, false);
  assert.equal(validateKeybindChange(bindings, "not-exist", "z").ok, false);
  assert.equal(validateKeybindChange(bindings, "attack", "1").error, "该键已被「技能 1」使用");
  assert.deepEqual(validateKeybindChange(bindings, "attack", "Z"), { ok: true, key: "z" });
});

test("sanitizeKeybinds：非法与重复键回退默认，且动作之间不冲突", () => {
  const result = sanitizeKeybinds({ attack: "w", skill1: "2", skill2: "2", potion: "花" });
  assert.equal(result.attack, "x", "保留键回退默认");
  assert.equal(result.skill1, "2", "先出现的合法自定义键保留");
  assert.notEqual(result.skill2, "2", "重复键被改到未被占用的候补键");
  assert.equal(result.potion, "q");
  const used = Object.values(result);
  assert.equal(new Set(used).size, used.length, "规范化后不应存在重复绑定");
});

test("sanitizeKeybinds：空输入得到完整默认键位", () => {
  assert.deepEqual(sanitizeKeybinds(null), { ...DEFAULT_KEYBINDS });
});

test("setKeybind / actionForKey：改键后反向查表立即生效，恢复默认可还原", () => {
  resetKeybinds();
  assert.equal(actionForKey("x"), "attack");
  const changed = setKeybind("attack", "z");
  assert.equal(changed.ok, true);
  assert.equal(keybinds.attack, "z");
  assert.equal(actionForKey("z"), "attack");
  assert.equal(actionForKey("x"), null);
  resetKeybinds();
  assert.equal(keybinds.attack, "x");
  assert.equal(actionForKey("1"), "skill1");
});
