import { state, keys, joystick, pointer, setMoveTarget, primaryExit, mapProgress } from "./runtime.js";
import { canvas, canvasPoint, showToast, objectiveView, renderAll } from "./render.js";
import { $, distance } from "./util.js";
import { isMuted, toggleMute, unlockAudio } from "./audio.js";
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
    keys[key] = true;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (key === "escape") cancelTravel();
    if (key === "j") normalAttack();
    if (key === "f") collectDrops();
    if (key === "q") usePotion();
    if (key === "r") oneMoment();
    if (key === "k") {
      // K：打开/关闭技能升级弹窗
      $("skillModal").classList.toggle("hidden");
      renderAll();
    }
    if (key === "t") {
      const exit = primaryExit();
      if (exit) tryTravel(exit);
      else showToast(mapProgress().completed ? "100 张地图已全部通关" : objectiveView().text);
    }
    if (/^[1-4]$/.test(key)) castSkill(Number(key) - 1);
  });
  window.addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
  });
  canvas.addEventListener("pointerdown", (event) => {
    pointer.down = true;
    const point = canvasPoint(event);
    const target = state?.entities.find((entity) => entity.alive && distance(point, entity) < entity.radius + 22);
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
      .filter((entity) => entity.alive)
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
}
