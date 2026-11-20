import {
  state,
  keys,
  joystick,
  pointer,
  setMoveTarget,
  primaryExit,
  mapProgress,
  keybindCapture,
  activeHero,
  pauseState
} from "./runtime.js";
import {
  canvas,
  canvasPoint,
  showToast,
  objectiveView,
  renderAll,
  renderKeybindPanel,
  spriteHeight,
  getViewZoom,
  setViewZoom
} from "./render.js";
import { $, distance } from "./util.js";
import { isMuted, toggleMute, unlockAudio } from "./audio.js";
import { loadKeybinds, actionForKey, setKeybind, resetKeybinds } from "./keybinds.js";
import { logDebug, logInfo, logThrottled } from "./logger.js";
// 0.8.43：装备格改为两段式强化确认，需要报价与部位中文名。
import { enhanceQuote, EQUIPMENT_SLOTS } from "./config.js";
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
  cycleDifficulty,
  enterAbyss,
  saveGame,
  resetGame,
  exportSave,
  importSave,
  buyMarksGood,
  setPaused,
  togglePause
} from "./main.js";

// 《一刀999》输入层：键盘 / 鼠标 / 触屏（虚拟摇杆）与所有 HUD 按钮的事件绑定。
// 从 main.js 拆出：与 main 的循环引用只发生在事件回调里（函数声明提升后绑定安全）。

// 0.8.43：立绘是“脚在实体坐标、身体向上延伸”的画法。只按 radius 判点击时，
// 点头部/胸甲会落到实体坐标上方几十像素，被判成点地走位。这里用一条从脚到
// 身体 62% 高度的竖直胶囊做命中，点击立绘任何部位都能锁定。
function entityClickHit(point, entity) {
  // 立绘脚底在实体坐标下方（普通怪 +0.55×radius，首领 +0.9×radius），
  // 身体从脚底向上画 spriteHeight。胶囊要覆盖到脚、上到头顶，首领取全高。
  const footY = entity.y + entity.radius * (entity.boss ? 0.9 : 0.55);
  const top = footY - spriteHeight(entity) * (entity.boss ? 1 : 0.9);
  const clampedY = Math.min(footY, Math.max(top, point.y));
  return Math.hypot(point.x - entity.x, point.y - clampedY) < entity.radius + 32;
}

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

// 0.8.45：设置面板的缩放按钮高亮当前档位（localStorage 记住选择）。
function refreshViewZoomButtons() {
  const current = getViewZoom();
  document.querySelectorAll("[data-view-zoom]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.viewZoom) === current);
  });
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
      $("bestiaryModal").classList.add("hidden");
      // 0.8.45：Esc 既关设置也恢复游戏；设置触发的暂停不能把玩家锁在暂停里。
      if (pauseState.paused) setPaused(false);
      renderAll();
    }

    // 0.3.2：动作全部走 keybinds 查表，默认普攻为 X（紧邻 1-4 技能键）。
    const action = actionForKey(key);
    if (!action) return;
    // 0.8.7：按键触发的动作按动作键 250ms 节流记录——「按了没反应」时先看动作有没有派发。
    logThrottled(`key-${action}`, 250, "debug", "input", "action", { action, key });
    // 0.8.31：职业选择页 / 重置后 state 为空，R/T/F 等游戏动作会直接访问空状态而抛 TypeError。
    // 面板类动作（K 技能面板、M 静音、改键）不依赖 state，仍允许使用。
    const panelOnly = action === "skillUpgrade" || action === "mute" || action === "keybind";
    if (!state && !panelOnly) {
      showToast("请先选择职业开始游戏");
      return;
    }
    // 0.8.45 暂停期间只允许开面板/静音/改键；攻击、技能、药水、拾取、传送全部拒绝。
    if (pauseState.paused && !panelOnly) {
      showToast("游戏已暂停，点击画面或按 Esc 继续");
      return;
    }
    if (action === "attack") normalAttack();
    if (action === "potion") usePotion();
    if (action === "pickup") collectDrops();
    if (action === "ultimate") oneMoment();
    if (action === "skillUpgrade") {
      $("skillModal").classList.toggle("hidden");
      renderAll();
    }
    if (action === "travel") {
      // 0.8.31：深层模式下 T 必须进入下一层。此前先判普通出口，而复用的主线地图几乎都有出口，
      // 导致按 T 回到主线下一图、abyssFloor 不变但深层倍率仍在，流程与难度错位。
      if ((state.abyssFloor || 0) > 0) {
        enterAbyss();
        return;
      }
      const exit = primaryExit();
      if (exit) tryTravel(exit);
      else if (mapProgress().completed) {
        // 0.6.0 P2：百图全部通关后，T 改为进入无尽深层下一层。
        enterAbyss();
      } else showToast(objectiveView().text);
    }
    if (/^skill[1-4]$/.test(action)) castSkill(Number(action.slice(5)) - 1);
  });
  window.addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
  });
  canvas.addEventListener("pointerdown", (event) => {
    // 0.8.45 暂停遮罩通常已盖住画布；这里再兜一层，避免遮罩点掉后误下走位指令。
    if (pauseState.paused) return;
    pointer.down = true;
    const point = canvasPoint(event);
    // 友军（骨卫）不参与点击锁定，点击其位置视为走位指令。
    // 0.8.43：点击锁定命中区按立绘包围盒放大（原先 radius+22 只有约 30px，
    // 实测点立绘边缘会被判成“点地移动”，玩家会直接走进怪堆）。
    // 0.8.45 修复：普通怪没有 boss 字段，Number(undefined)=NaN 会让排序整段失效，
    // 首领与小怪立绘重叠时会锁到小怪。显式转成 1/0 再排。
    const target = state?.entities
      .filter((entity) => entity.alive && !entity.friendly)
      .sort((a, b) => (b.boss ? 1 : 0) - (a.boss ? 1 : 0))
      .find((entity) => entityClickHit(point, entity));
    if (target) selectTarget(target);
    else {
      // 0.8.47：玩家主动点地面走位，优先于“射程外自动接近”的旧意图。
      if (state?.player) state.player.autoAttackId = null;
      logThrottled("click-move", 200, "debug", "input", "moveOrder", { x: Math.round(point.x), y: Math.round(point.y) });
      setMoveTarget(point);
    }
  });
  canvas.addEventListener("pointerup", () => {
    pointer.down = false;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state || pauseState.paused) return;
    const point = canvasPoint(event);
    pointer.x = point.x;
    pointer.y = point.y;
    const hovered = state.entities
      .filter((entity) => entity.alive && !entity.friendly)
      .sort((a, b) => (b.boss ? 1 : 0) - (a.boss ? 1 : 0))
      .find((entity) => entityClickHit(point, entity));
    state.hoveredEntityId = hovered?.id || null;
    // 0.8.43：悬停可锁定目标时给指针手型，让“这里能点”可见。
    canvas.style.cursor = hovered ? "pointer" : "crosshair";
  });
  canvas.addEventListener("pointerleave", () => {
    if (state) state.hoveredEntityId = null;
    canvas.style.cursor = "crosshair";
  });
  // 0.8.49：技能键同理，施法后光标停在技能上时收起说明。
  $("skillBar").addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-skill]");
    if (button) button.classList.add("tooltip-suppressed");
  });
  $("skillBar").addEventListener("pointerout", (event) => {
    const button = event.target.closest("[data-skill]");
    if (button && !button.contains(event.relatedTarget)) button.classList.remove("tooltip-suppressed");
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
    // 0.8.49：鼠标点普攻后光标通常停在按钮上，悬浮说明会一直挡住目标栏/引导。
    // 点过一次就暂时收起，移出按钮再恢复，避免战斗时视线被挡。
    $("normalAttackBtn").classList.add("tooltip-suppressed");
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
  $("normalAttackBtn").addEventListener("pointerleave", () => {
    $("normalAttackBtn").classList.remove("tooltip-suppressed");
  });
  $("potionBtn").addEventListener("click", usePotion);
  $("saveBtn").addEventListener("click", saveGame);
  $("resetBtn").addEventListener("click", resetGame);
  $("muteBtn").addEventListener("click", () => {
    const muted = toggleMute();
    refreshMuteLabel();
    refreshViewZoomButtons();
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
  // 0.8.14：窄屏顶栏只留高频按钮，导出/导入/保存/重置移入设置面板。
  // 这里做点击代理而不是复制逻辑，保证两条入口永远走同一段代码。
  document.querySelectorAll("[data-save-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const source = { export: "exportBtn", import: "importBtn", save: "saveBtn", reset: "resetBtn" }[button.dataset.saveAction];
      if (source) $(source).click();
    });
  });
  $("skillBtn").addEventListener("click", () => {
    $("skillModal").classList.toggle("hidden");
    renderAll();
  });
  // 键位设置弹窗：点击动作进入捕获态，下一次按键即绑定（Esc 取消，校验失败保持捕获）。
  // 0.6.0 P2：难度切换按钮（百图通关后可用）。
  $("difficultyBtn").addEventListener("click", cycleDifficulty);
  // 0.6.0 P2：怪物图鉴面板。
  $("bestiaryBtn").addEventListener("click", () => {
    $("bestiaryModal").classList.toggle("hidden");
    renderAll();
  });
  $("bestiaryModal").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-bestiary]")) {
      $("bestiaryModal").classList.add("hidden");
      renderAll();
    }
  });
  $("settingsBtn").addEventListener("click", () => {
    keybindCapture.action = null;
    $("skillModal").classList.add("hidden");
    $("settingsModal").classList.toggle("hidden");
    // 0.8.45：打开设置即暂停，避免玩家看键位/存档时被怪打死；关闭设置再恢复。
    if (state) {
      if (!$("settingsModal").classList.contains("hidden")) setPaused(true, "settings");
      else if (pauseState.reason === "settings") setPaused(false);
    }
    refreshViewZoomButtons();
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
    const zoomButton = event.target.closest("[data-view-zoom]");
    if (zoomButton) {
      setViewZoom(Number(zoomButton.dataset.viewZoom));
      refreshViewZoomButtons();
      renderAll();
      showToast(`画面缩放 ${Math.round(getViewZoom() * 100)}%`);
      return;
    }
    if (event.target.closest("[data-close-settings]")) {
      keybindCapture.action = null;
      $("settingsModal").classList.add("hidden");
      if (pauseState.reason === "settings") setPaused(false);
      renderKeybindPanel();
    }
  });
  // 0.8.45 暂停按钮/遮罩/后台自动暂停。
  $("pauseBtn").addEventListener("click", () => {
    togglePause();
    renderAll();
  });
  $("pauseOverlay").addEventListener("click", () => setPaused(false));
  $("pauseOverlay").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") setPaused(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state && !pauseState.paused) setPaused(true, "background");
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
  // 0.8.43：装备槽不再“点一下就扣钱强化”。首次点击只显示报价，3 秒内再点一次才执行，
  // 避免玩家想查看装备时误触强化（旧版单击直接扣金币且可能失败）。
  $("equipmentGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-equip-slot]");
    if (!button) return;
    const slot = button.dataset.equipSlot;
    const item = state?.player?.equipment?.[slot];
    if (!item) {
      showToast(`${EQUIPMENT_SLOTS[slot]?.label || slot}部位还没有穿戴装备`);
      return;
    }
    if (button.dataset.confirm !== "1") {
      const quote = enhanceQuote(item, state.player.gold, state.inventory || []);
      if (!quote.canEnhance) {
        showToast(quote.reason);
        return;
      }
      button.dataset.confirm = "1";
      button.classList.add("confirming");
      showToast(
        `再次点击「${EQUIPMENT_SLOTS[slot]?.label || slot}」强化 +${(item.enhance || 0) + 1}：消耗 ${quote.cost} 金币，成功率 ${Math.round(quote.rate * 100)}%`
      );
      setTimeout(() => {
        if (!button.isConnected) return;
        delete button.dataset.confirm;
        button.classList.remove("confirming");
      }, 3000);
      return;
    }
    delete button.dataset.confirm;
    button.classList.remove("confirming");
    enhanceItem(slot);
  });
  // 城镇杂货商（0.3.5）：购买与词缀重铸都走事件委托，面板重建不需要重绑。
  $("shopClose").addEventListener("click", closeShop);
  $("shopCard").addEventListener("click", (event) => {
    const buyButton = event.target.closest("[data-buy]");
    if (buyButton) {
      buyGoods(buyButton.dataset.buy);
      return;
    }
    // 0.8.25：印记兑换（data-buy-marks="slot"）。
    const marksButton = event.target.closest("[data-buy-marks]");
    if (marksButton) {
      buyMarksGood(marksButton.dataset.buyMarks);
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
