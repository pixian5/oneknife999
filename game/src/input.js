import { state, keys, joystick, pointer, setMoveTarget, primaryExit, mapProgress, keybindCapture, activeHero } from "./runtime.js";
import { canvas, canvasPoint, showToast, objectiveView, renderAll, renderKeybindPanel } from "./render.js";
import { $, distance } from "./util.js";
import { isMuted, toggleMute, unlockAudio } from "./audio.js";
import { loadKeybinds, actionForKey, setKeybind, resetKeybinds } from "./keybinds.js";
import {
  normalAttack,
  collectDrops,
  usePotion,
  oneMoment,
  tryTravel,
  confirmTravel,
  cancelTravel,
  castSkill,
  selectTarget,
  equipItem,
  salvageItem,
  enhanceItem,
  buyGoods,
  reforgeEquipped,
  toggleReforgeLock,
  closeShop,
  upgradeSkill,
  saveGame,
  resetGame,
  exportSave,
  importSave
} from "./main.js";

// 《一刀999》输入层：键盘 / 鼠标 / 触屏（虚拟摇杆）与所有 HUD 按钮的事件绑定。
// 从 main.js 拆出：与 main 的循环引用只发生在事件回调里（函数声明提升后绑定安全）。

// 虚拟摇杆：Pointer Events 同时支持触屏与鼠标；超出半径按比例夹紧，抬手 / 取消立即归零。
// 摇杆只写入 runtime 的 joystick 状态，实际移动仍在 movePlayer 中统一处理。
function setupJoystick() {
  const pad = $("joystickPad");
  const knob = $("joystickKnob");
  const deadZone = 0.15; // 死区：偏移比例小于该值视为静止，避免手指微抖导致角色漂移
  let activePointerId = null;
  const apply = (event) => {
    const rect = pad.getBoundingClientRect();
    const limit = rect.width / 2;
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > limit) {
      dx = (dx / length) * limit;
      dy = (dy / length) * limit;
    }
    const x = dx / limit;
    const y = dy / limit;
    joystick.x = Math.abs(x) < deadZone ? 0 : x;
    joystick.y = Math.abs(y) < deadZone ? 0 : y;
    joystick.active = true;
    knob.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    pad.classList.add("active");
  };
  const release = (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    joystick.x = 0;
    joystick.y = 0;
    joystick.active = false;
    knob.style.transform = "translate(0, 0)";
    pad.classList.remove("active");
  };
  pad.addEventListener("pointerdown", (event) => {
    if (activePointerId !== null) return;
    activePointerId = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    apply(event);
    event.preventDefault();
  });
  pad.addEventListener("pointermove", (event) => {
    if (event.pointerId === activePointerId) apply(event);
  });
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);
}

function refreshMuteLabel() {
  $("muteBtn").textContent = isMuted() ? "静音中" : "音效";
}

export function setupInput() {
  // 先载入玩家自定义键位，保证后续 keydown 查表与 HUD 首帧文案就是最新绑定。
  loadKeybinds();
  // 浏览器自动播放策略：首次真实交互解锁 AudioContext。
  const unlock = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    // 改键捕获：设置面板点击某个动作后，下一次按键直接写入该动作（Esc 取消）。
    if (keybindCapture.action) {
      event.preventDefault();
      if (key === "escape") {
        keybindCapture.action = null;
        renderKeybindPanel();
        showToast("已取消改键");
        return;
      }
      const result = setKeybind(keybindCapture.action, key);
      if (!result.ok) {
        // 校验失败保持捕获态，玩家可以直接换一个键重试。
        showToast(result.error);
        return;
      }
      keybindCapture.action = null;
      renderKeybindPanel();
      renderAll();
      showToast(`已绑定：${result.key.toUpperCase()}`);
      return;
    }

    keys[key] = true;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (key === "escape") {
      cancelTravel();
      $("settingsModal").classList.add("hidden");
      $("skillModal").classList.add("hidden");
      renderAll();
    }

    // 0.3.2：动作全部走 keybinds 查表，默认普攻为 X（紧邻 1-4 技能键）。
    const action = actionForKey(key);
    if (!action) return;
    if (action === "attack") normalAttack();
    if (action === "potion") usePotion();
    if (action === "pickup") collectDrops();
    if (action === "ultimate") oneMoment();
    if (action === "skillUpgrade") {
      $("skillModal").classList.toggle("hidden");
      renderAll();
    }
    if (action === "travel") {
      const exit = primaryExit();
      if (exit) tryTravel(exit);
      else showToast(mapProgress().completed ? "100 张地图已全部通关" : objectiveView().text);
    }
    if (/^skill[1-4]$/.test(action)) castSkill(Number(action.slice(5)) - 1);
  });
  window.addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
  });
  canvas.addEventListener("pointerdown", (event) => {
    pointer.down = true;
    const point = canvasPoint(event);
    // 友军（骨卫）不参与点击锁定，点击其位置视为走位指令。
    const target = state?.entities.find((entity) => entity.alive && !entity.friendly && distance(point, entity) < entity.radius + 22);
    if (target) selectTarget(target);
    else setMoveTarget(point);
  });
  canvas.addEventListener("pointerup", () => {
    pointer.down = false;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state) return;
    const point = canvasPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    const hovered = state.entities
      .filter((entity) => entity.alive && !entity.friendly)
      .sort((a, b) => Number(b.boss) - Number(a.boss))
      .find((entity) => distance(point, entity) < entity.radius + 18);
    state.hoveredEntityId = hovered?.id || null;
  });
  canvas.addEventListener("pointerleave", () => {
    if (state) state.hoveredEntityId = null;
  });
  $("skillBar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-skill]");
    if (button) castSkill(Number(button.dataset.skill));
  });
  $("skillBar").addEventListener("pointerover", (event) => {
    const button = event.target.closest("[data-skill]");
    if (button && state) state.player.previewSkill = Number(button.dataset.skill);
  });
  $("skillBar").addEventListener("pointerleave", () => {
    if (state) state.player.previewSkill = null;
  });
  $("normalAttackBtn").addEventListener("click", normalAttack);
  // 0.3.3 移动端长按普攻：按住按钮持续攻击，只在目标进入普攻距离时触发，
  // 避免距离外每 100ms 重复弹「正在接近」提示。抬手 / 取消立即停止。
  let attackHold = null;
  const stopAttackHold = () => {
    if (attackHold) clearInterval(attackHold);
    attackHold = null;
    $("normalAttackBtn").classList.remove("holding");
  };
  $("normalAttackBtn").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (attackHold) return;
    normalAttack();
    attackHold = setInterval(() => {
      if (!state) return;
      const target = state.entities.find((entity) => entity.id === state.player.targetId && entity.alive);
      if (target && distance(state.player, target) <= activeHero().range) normalAttack();
    }, 100);
    $("normalAttackBtn").classList.add("holding");
  });
  window.addEventListener("pointerup", stopAttackHold);
  window.addEventListener("pointercancel", stopAttackHold);
  $("potionBtn").addEventListener("click", usePotion);
  $("saveBtn").addEventListener("click", saveGame);
  $("resetBtn").addEventListener("click", resetGame);
  $("muteBtn").addEventListener("click", () => {
    const muted = toggleMute();
    refreshMuteLabel();
    showToast(muted ? "音效已关闭" : "音效已开启");
  });
  refreshMuteLabel();
  $("exportBtn").addEventListener("click", exportSave);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importSave(file);
    event.target.value = "";
  });
  $("skillBtn").addEventListener("click", () => {
    $("skillModal").classList.toggle("hidden");
    renderAll();
  });
  // 键位设置弹窗：点击动作进入捕获态，下一次按键即绑定（Esc 取消，校验失败保持捕获）。
  $("settingsBtn").addEventListener("click", () => {
    keybindCapture.action = null;
    $("skillModal").classList.add("hidden");
    $("settingsModal").classList.toggle("hidden");
    renderKeybindPanel();
  });
  $("settingsModal").addEventListener("click", (event) => {
    const keyButton = event.target.closest("[data-keybind-action]");
    if (keyButton) {
      keybindCapture.action = keyButton.dataset.keybindAction;
      renderKeybindPanel();
      showToast("请按下新的按键（Esc 取消）");
      return;
    }
    if (event.target.closest("[data-close-settings]")) {
      keybindCapture.action = null;
      $("settingsModal").classList.add("hidden");
      renderKeybindPanel();
    }
  });
  $("keybindReset").addEventListener("click", () => {
    resetKeybinds();
    keybindCapture.action = null;
    renderKeybindPanel();
    renderAll();
    showToast("键位已恢复默认（普攻 X）");
  });
  // 技能升级弹窗内的升级按钮（事件委托，弹窗内容重建不需要重绑）
  $("skillModal").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) {
      $("skillModal").classList.add("hidden");
      renderAll();
      return;
    }
    const button = event.target.closest("[data-upgrade-skill]");
    if (button) upgradeSkill(Number(button.dataset.upgradeSkill));
  });
  // 低等级进图确认弹层（替代 window.confirm）
  $("travelConfirm").addEventListener("click", (event) => {
    if (event.target.closest("[data-travel-ok]")) confirmTravel();
    if (event.target.closest("[data-travel-cancel]")) cancelTravel();
  });
  $("inventoryHint").addEventListener("click", () => showToast("背包装备会影响战力，锁定只防误操作，不提供死亡保护"));
  setupJoystick();
  // 背包点击使用事件委托，只在启动时绑定一次，避免渲染层每帧重建监听器
  $("inventoryGrid").addEventListener("click", (event) => {
    // 拆解按钮优先：点击「拆」拆解该装备（返还基础材料与金币），不触发穿戴。
    const salvageBtn = event.target.closest("[data-salvage-id]");
    if (salvageBtn) {
      salvageItem(salvageBtn.dataset.salvageId);
      return;
    }
    const button = event.target.closest("[data-item-index]");
    if (!button) return;
    equipItem((state.inventory || [])[Number(button.dataset.itemIndex)]);
  });
  // 装备槽点击 = 尝试强化该部位穿戴的装备
  $("equipmentGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-equip-slot]");
    if (button) enhanceItem(button.dataset.equipSlot);
  });
  // 城镇杂货商（0.3.5）：购买与词缀重铸都走事件委托，面板重建不需要重绑。
  $("shopClose").addEventListener("click", closeShop);
  $("shopCard").addEventListener("click", (event) => {
    const buyButton = event.target.closest("[data-buy]");
    if (buyButton) {
      buyGoods(buyButton.dataset.buy);
      return;
    }
    const reforgeButton = event.target.closest("[data-reforge]");
    if (reforgeButton) reforgeEquipped(reforgeButton.dataset.reforge);
    // 0.4.2：词缀锁定芯片（data-reforge-lock="slot:affixIndex"）
    const lockChip = event.target.closest("[data-reforge-lock]");
    if (lockChip) {
      const [slotKey, affixIndex] = lockChip.dataset.reforgeLock.split(":");
      toggleReforgeLock(slotKey, Number(affixIndex));
    }
  });
}
