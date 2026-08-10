(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const wrap = document.querySelector("#canvasWrap");
  const WORLD = { width: 2400, height: 1500 };
  const STORAGE_KEY = "oneknife999-prototype-save-v1";

  const CLASSES = {
    warrior: {
      name: "战士", glyph: "刃", color: "#e7b36b", subtitle: "贴身爆发 · 追击 · 承伤", hp: 350, resource: 100, resourceName: "怒气", attack: 33, defense: 22, speed: 218, range: 70, cooldown: 0.62,
      skills: [
        { name: "破甲斩", cost: 10, cd: 3, damage: 1.45, range: 90, kind: "破甲" },
        { name: "旋风扫", cost: 20, cd: 6, damage: 1.08, range: 125, kind: "范围" },
        { name: "震地冲", cost: 25, cd: 12, damage: 1.25, range: 180, kind: "冲锋" },
        { name: "焚天斩", cost: 40, cd: 10, damage: 2.4, range: 105, kind: "爆发" }
      ]
    },
    mage: {
      name: "法师", glyph: "焰", color: "#78b6ec", subtitle: "远程群攻 · 区域控制 · 清怪", hp: 235, resource: 240, resourceName: "法力", attack: 41, defense: 10, speed: 205, range: 220, cooldown: 0.86,
      skills: [
        { name: "雷矛术", cost: 14, cd: 2.5, damage: 1.65, range: 260, kind: "穿透" },
        { name: "焰痕地带", cost: 35, cd: 10, damage: 1.15, range: 180, kind: "范围" },
        { name: "烈焰震环", cost: 25, cd: 12, damage: 1.2, range: 125, kind: "推开" },
        { name: "天火陨星", cost: 90, cd: 18, damage: 3.1, range: 300, kind: "爆发" }
      ]
    },
    taoist: {
      name: "道士", glyph: "符", color: "#a88ce3", subtitle: "持续输出 · 治疗 · 召唤", hp: 280, resource: 160, resourceName: "符力", attack: 30, defense: 16, speed: 210, range: 185, cooldown: 0.74,
      skills: [
        { name: "蚀骨咒", cost: 18, cd: 6, damage: 1.1, range: 205, kind: "削弱" },
        { name: "召唤骨卫", cost: 35, cd: 20, damage: 0.8, range: 180, kind: "召唤" },
        { name: "生息法阵", cost: 50, cd: 15, damage: 0, range: 120, kind: "治疗" },
        { name: "镇魂符", cost: 10, cd: 2, damage: 1.55, range: 220, kind: "爆发" }
      ]
    }
  };

  const MONSTER_TYPES = [
    { name: "腐烬矿工", color: "#bd8b68", hp: 84, attack: 13, defense: 3, exp: 28, gold: 8, radius: 17 },
    { name: "赤牙猎犬", color: "#ca6b63", hp: 68, attack: 17, defense: 2, exp: 32, gold: 10, radius: 15 },
    { name: "裂脊尸卫", color: "#71898a", hp: 132, attack: 19, defense: 8, exp: 52, gold: 15, radius: 20 },
    { name: "灰烬侦察者", color: "#b49b61", hp: 104, attack: 22, defense: 4, exp: 48, gold: 18, radius: 16 }
  ];

  const LOOT_TABLE = [
    { name: "矿道旧刃", slot: "weapon", quality: "blue", glyph: "刀", power: 12, value: 22, color: "#78b6ec", desc: "攻击 12 · 破甲斩伤害 +3%" },
    { name: "灰烬护符", slot: "neck", quality: "purple", glyph: "玉", power: 18, value: 46, color: "#a88ce3", desc: "生命 +45 · 一刀充能 +4%" },
    { name: "矿脉战靴", slot: "boots", quality: "blue", glyph: "靴", power: 9, value: 28, color: "#78b6ec", desc: "防御 +8 · 移速 +4" },
    { name: "裂碑余烬", slot: "material", quality: "orange", glyph: "核", power: 0, value: 120, color: "#e7b36b", desc: "首领铸魂材料 · 可交易" }
  ];

  let state = null;
  let dpr = 1;
  let lastTime = 0;
  let keys = {};
  let pointer = { x: 0, y: 0, down: false };
  let moveTarget = null;
  let toastTimer = null;

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pick = (array) => array[Math.floor(Math.random() * array.length)];
  const formatNumber = (value) => Math.floor(value).toLocaleString("zh-CN");

  function createState(classId) {
    const hero = CLASSES[classId];
    return {
      classId,
      player: { x: 480, y: 780, hp: hero.hp, resource: hero.resource * .68, level: 1, exp: 0, nextExp: 120, gold: 40, marks: 0, charge: 0, potion: 3, kills: 0, totalKills: 0, oneMomentUsed: false, attackTimer: 0, invulnerable: 0, cooldowns: [0, 0, 0, 0], targetId: null, equipment: { weapon: null, neck: null, boots: null } },
      entities: createEntities(),
      drops: [], particles: [], texts: [], logs: [],
      boss: { id: "boss-1", active: true, defeated: false, respawn: 0 },
      startedAt: Date.now(),
      quest: { kills: 0, need: 8, completed: false }
    };
  }

  function createEntities() {
    const result = [];
    const points = [
      [820, 560], [1010, 700], [1180, 510], [1360, 820], [1550, 610], [1740, 510], [1930, 690], [2100, 850], [920, 1040], [1140, 1120], [1430, 1040], [1700, 1060], [2010, 1110], [690, 1140], [1510, 420], [1880, 390]
    ];
    points.forEach((point, index) => {
      const type = MONSTER_TYPES[index % MONSTER_TYPES.length];
      result.push({ id: `mob-${index}`, ...type, x: point[0], y: point[1], maxHp: type.hp, respawn: 0, alive: true, hitFlash: 0, wander: Math.random() * 6 });
    });
    result.push({ id: "boss-1", name: "裂碑领主", color: "#e99b5f", hp: 2100, maxHp: 2100, attack: 36, defense: 18, exp: 480, gold: 260, radius: 34, x: 1980, y: 760, alive: true, boss: true, hitFlash: 0, phase: 1, respawn: 0 });
    return result;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = getViewScale();
    const view = getCamera();
    return { x: (event.clientX - rect.left) / scale + view.x, y: (event.clientY - rect.top) / scale + view.y };
  }

  function getViewScale() {
    return Math.min(canvas.clientWidth / 940, canvas.clientHeight / 590);
  }

  function getCamera() {
    const scale = getViewScale();
    const halfW = canvas.clientWidth / scale / 2;
    const halfH = canvas.clientHeight / scale / 2;
    return { x: clamp(state.player.x - halfW, 0, WORLD.width - halfW * 2), y: clamp(state.player.y - halfH, 0, WORLD.height - halfH * 2) };
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function log(message, type = "") {
    state.logs.push({ message, type });
    state.logs = state.logs.slice(-8);
    renderLog();
  }

  function textAt(message, x, y, color = "#eef3f4", size = 13) {
    state.texts.push({ message, x, y, color, size, life: 1, vy: -26 });
  }

  function spark(x, y, color, count = 8) {
    for (let i = 0; i < count; i += 1) state.particles.push({ x, y, vx: rand(-70, 70), vy: rand(-95, 20), life: rand(.35, .7), color, size: rand(2, 4) });
  }

  function chooseClass(classId) {
    state = createState(classId);
    $("classModal").classList.add("hidden");
    log(`你选择了 <b>${CLASSES[classId].name}</b>，矿道深处传来石碑碎裂声。`);
    log("短目标：击败 8 只矿道怪物，找到第一件可用装备。", "loot");
    showToast("出城后会自动记录目标，点击怪物即可锁定");
    renderAll();
  }

  function activeHero() { return CLASSES[state.classId]; }

  function findTarget() {
    if (state.player.targetId) {
      const current = state.entities.find((entity) => entity.id === state.player.targetId && entity.alive);
      if (current && distance(state.player, current) < 330) return current;
    }
    return state.entities.filter((entity) => entity.alive && distance(state.player, entity) < 310).sort((a, b) => distance(state.player, a) - distance(state.player, b))[0] || null;
  }

  function selectTarget(entity) {
    state.player.targetId = entity ? entity.id : null;
    moveTarget = null;
    if (entity) {
      log(`锁定目标：<b>${entity.name}</b>${entity.boss ? "，贡献按五类行为统计" : ""}`);
      showToast(`${entity.name} 已锁定，按 J 或点击普攻攻击`);
    }
    renderTarget();
  }

  function resolveDamage(target, multiplier, skillName, kind) {
    const hero = activeHero();
    const weaponPower = Object.values(state.player.equipment).reduce((sum, item) => sum + (item?.power || 0), 0);
    const base = hero.attack + state.player.level * 4 + weaponPower * .9;
    const variance = rand(.9, 1.1);
    const defense = target.defense || 0;
    const reduction = defense / (defense + 100 + state.player.level * 5);
    let damage = Math.max(1, Math.round(base * multiplier * variance * (1 - reduction)));
    if (kind === "爆发" && state.player.charge >= 100) damage = Math.round(damage * 1.55);
    if (target.boss) damage = Math.min(damage, Math.ceil(target.maxHp * .035));
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = .12;
    state.player.charge = clamp(state.player.charge + (target.boss ? 7 : 10), 0, 100);
    spark(target.x, target.y, activeHero().color, kind === "范围" ? 14 : 7);
    textAt(`${damage}`, target.x, target.y - target.radius - 12, kind === "爆发" ? "#e7b36b" : "#eff4ef", kind === "爆发" ? 18 : 13);
    if (skillName) log(`${skillName} 命中 <b>${target.name}</b>，造成 ${damage} 点伤害。`);
    if (target.hp <= 0) defeat(target);
    return damage;
  }

  function nearestTargets(range, limit = 1) {
    return state.entities.filter((entity) => entity.alive && distance(state.player, entity) <= range).sort((a, b) => distance(state.player, a) - distance(state.player, b)).slice(0, limit);
  }

  function normalAttack() {
    if (!state) return;
    const hero = activeHero();
    if (state.player.attackTimer > 0) return;
    const target = findTarget();
    if (!target) { showToast("附近没有可攻击目标，点击地图移动或按 Space 搜索"); return; }
    if (distance(state.player, target) > hero.range) {
      state.player.targetId = target.id;
      moveTarget = { x: target.x, y: target.y };
      showToast(`正在接近 ${target.name}`);
      return;
    }
    state.player.attackTimer = hero.cooldown;
    state.player.resource = clamp(state.player.resource + (state.classId === "warrior" ? 6 : state.classId === "taoist" ? 4 : -8), 0, hero.resource);
    resolveDamage(target, 1, "普攻", "普通");
  }

  function castSkill(index) {
    if (!state) return;
    const hero = activeHero();
    const skill = hero.skills[index];
    if (!skill || state.player.cooldowns[index] > 0) return;
    if (state.player.resource < skill.cost) { showToast(`${hero.resourceName}不足，击杀怪物或使用药水恢复`); return; }
    const target = findTarget();
    if (skill.kind === "治疗") {
      state.player.resource -= skill.cost;
      state.player.hp = clamp(state.player.hp + Math.round(hero.hp * .28), 0, hero.hp + equipmentHp());
      state.player.cooldowns[index] = skill.cd;
      textAt(`+${Math.round(hero.hp * .28)}`, state.player.x, state.player.y - 30, "#a88ce3", 15);
      log("生息法阵恢复生命，并为一刀时刻积累势能。", "loot");
      state.player.charge = clamp(state.player.charge + 18, 0, 100);
      return;
    }
    if (!target) { showToast("先锁定一个目标"); return; }
    if (distance(state.player, target) > skill.range) { moveTarget = { x: target.x, y: target.y }; showToast(`正在进入 ${skill.name} 的施法距离`); return; }
    state.player.resource -= skill.cost;
    state.player.cooldowns[index] = skill.cd;
    if (skill.kind === "召唤") { log("骨卫在矿道中现身，接下来 12 秒会协助攻击。", "loot"); state.player.charge = clamp(state.player.charge + 12, 0, 100); }
    if (skill.kind === "范围") {
      nearestTargets(skill.range, 5).forEach((entity) => resolveDamage(entity, skill.damage, skill.name, skill.kind));
    } else resolveDamage(target, skill.damage, skill.name, skill.kind);
  }

  function oneMoment() {
    if (!state || state.player.charge < 100) { showToast("破势槽未满，先用职业行为积累一刀时刻"); return; }
    const target = findTarget();
    if (!target || distance(state.player, target) > 330) { showToast("锁定一个目标再释放一刀时刻"); return; }
    state.player.charge = 0;
    const firstDisplay = !state.player.oneMomentUsed;
    state.player.oneMomentUsed = true;
    const actual = resolveDamage(target, state.classId === "warrior" ? 3.2 : state.classId === "mage" ? 2.7 : 2.35, "一刀时刻", "爆发");
    if (firstDisplay) {
      textAt("999", target.x, target.y - target.radius - 42, "#e7b36b", 25);
      log("<b>一刀时刻</b>首次触发：剧情飘字显示 999，实际结算仍为服务器伤害。", "loot");
    } else log(`一刀时刻完成真实结算：${actual} 点伤害。`, "loot");
    showToast("一刀时刻：下一次核心爆发已命中");
  }

  function equipmentHp() { return Object.values(state.player.equipment).reduce((sum, item) => sum + (item?.slot === "neck" ? 45 : 0), 0); }

  function defeat(target) {
    target.alive = false; target.respawn = target.boss ? 42 : rand(11, 20); target.hp = target.maxHp;
    const hero = activeHero();
    const expGain = target.exp + state.player.level * (target.boss ? 8 : 2);
    state.player.exp += expGain; state.player.gold += target.gold;
    state.player.totalKills += 1; state.player.kills += 1;
    state.quest.kills = Math.min(state.quest.need, state.quest.kills + (target.boss ? 3 : 1));
    state.player.resource = clamp(state.player.resource + hero.resource * .08, 0, hero.resource);
    state.player.charge = clamp(state.player.charge + (target.boss ? 32 : 12), 0, 100);
    if (target.boss) {
      state.player.marks += 35;
      log(`<b>首领击破</b>：裂碑领主倒下，个人获得 35 首领印记。`, "loot");
      showToast("首领结算完成：贡献快照已锁定");
      state.boss.defeated = true;
    } else log(`${target.name} 被击败，获得 ${expGain} 经验与 ${target.gold} 金币。`);
    spark(target.x, target.y, target.boss ? "#e7b36b" : "#d8e8dc", target.boss ? 30 : 16);
    if (Math.random() < (target.boss ? .95 : .28)) spawnDrop(target);
    if (state.quest.kills >= state.quest.need && !state.quest.completed) {
      state.quest.completed = true; state.player.gold += 60; state.player.marks += 8;
      log("<b>委托完成</b>：黑铁 ×3、60 金币、8 首领印记已发放。", "loot"); showToast("委托完成：你的第一件橙装距离更近了");
    }
    levelCheck();
    state.player.targetId = null;
  }

  function spawnDrop(source) {
    const item = { ...pick(LOOT_TABLE), id: `item-${Date.now()}-${Math.random()}`, x: source.x + rand(-22, 22), y: source.y + rand(-18, 18), source: source.name };
    state.drops.push(item);
    log(`${source.name} 掉落 <b style="color:${item.color}">${item.name}</b>，靠近后按 F 拾取。`, "loot");
  }

  function collectDrops() {
    const nearby = state.drops.filter((drop) => distance(state.player, drop) < 85);
    if (!nearby.length) { showToast("附近没有可拾取物品"); return; }
    nearby.forEach((drop) => { state.drops = state.drops.filter((entry) => entry.id !== drop.id); state.inventory = state.inventory || []; state.inventory.push(drop); log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，点击背包查看属性。`, "loot"); });
    renderInventory();
  }

  function equipItem(item) {
    if (!item || item.slot === "material") { showToast("材料可交易或用于铸魂，暂不能穿戴"); return; }
    const previous = state.player.equipment[item.slot];
    state.player.equipment[item.slot] = item;
    state.inventory = (state.inventory || []).filter((entry) => entry.id !== item.id);
    if (previous) state.inventory.push(previous);
    log(`穿戴 <b style="color:${item.color}">${item.name}</b>，战力提升 ${item.power}。`, "loot");
    showToast(`${item.name} 已装备，死亡掉落资格仍按绑定与区域规则判定`);
    renderAll();
  }

  function levelCheck() {
    const hero = activeHero();
    while (state.player.exp >= state.player.nextExp && state.player.level < 10) {
      state.player.exp -= state.player.nextExp; state.player.level += 1; state.player.nextExp = Math.round(state.player.nextExp * 1.24);
      state.player.hp = hero.hp + equipmentHp(); state.player.resource = hero.resource;
      log(`<b>等级提升</b>：你已达到 Lv.${state.player.level}，新的技能和地图目标正在解锁。`, "loot");
      showToast(`升级成功：Lv.${state.player.level}`);
    }
  }

  function playerDamage(dt) {
    if (state.player.invulnerable > 0) return;
    const attacker = state.entities.filter((entity) => entity.alive && distance(state.player, entity) < entity.radius + 70).sort((a, b) => distance(state.player, a) - distance(state.player, b))[0];
    if (!attacker || Math.random() > dt * (attacker.boss ? .6 : .32)) return;
    const amount = Math.max(1, Math.round(attacker.attack * (1 - activeHero().defense / (activeHero().defense + 100))));
    state.player.hp = Math.max(0, state.player.hp - amount);
    textAt(`-${amount}`, state.player.x, state.player.y - 30, "#f16d66", 13); spark(state.player.x, state.player.y, "#f16d66", 4);
    if (state.player.hp <= 0) die();
  }

  function die() {
    state.player.hp = Math.round((activeHero().hp + equipmentHp()) * .55); state.player.resource = activeHero().resource * .45; state.player.x = 480; state.player.y = 780; state.player.invulnerable = 3; state.player.targetId = null; moveTarget = null;
    log("<b>你在野外倒下</b>，本原型保留成长资产，实际游戏会按区域与名字状态结算爆装。", "warn"); showToast("已在灰烬村复活：重新整理状态后再出发");
  }

  function movePlayer(dt) {
    const hero = activeHero();
    let dx = 0, dy = 0;
    if (keys.w || keys.ArrowUp) dy -= 1; if (keys.s || keys.ArrowDown) dy += 1; if (keys.a || keys.ArrowLeft) dx -= 1; if (keys.d || keys.ArrowRight) dx += 1;
    if (!dx && !dy && moveTarget) { dx = moveTarget.x - state.player.x; dy = moveTarget.y - state.player.y; if (Math.hypot(dx, dy) < 8) moveTarget = null; }
    const length = Math.hypot(dx, dy) || 1; if (dx || dy) { state.player.x += (dx / length) * hero.speed * dt; state.player.y += (dy / length) * hero.speed * dt; }
    state.player.x = clamp(state.player.x, 55, WORLD.width - 55); state.player.y = clamp(state.player.y, 55, WORLD.height - 55);
  }

  function updateEntities(dt) {
    state.entities.forEach((entity) => {
      entity.hitFlash = Math.max(0, entity.hitFlash - dt);
      if (!entity.alive) { entity.respawn -= dt; if (entity.respawn <= 0) { entity.alive = true; entity.hp = entity.maxHp; if (entity.boss) { state.boss.defeated = false; log("<b>首领情报</b>：裂碑领主重新进入矿道深处。", "warn"); } } return; }
      if (!entity.boss) { entity.wander += dt; const drift = Math.sin(entity.wander * .7) * 3; entity.x = clamp(entity.x + drift * dt, 90, WORLD.width - 90); }
      if (entity.boss) { entity.phase = entity.hp < entity.maxHp * .55 ? 2 : 1; }
    });
  }

  function update(dt) {
    if (!state) return;
    const hero = activeHero();
    state.player.attackTimer = Math.max(0, state.player.attackTimer - dt); state.player.invulnerable = Math.max(0, state.player.invulnerable - dt);
    state.player.cooldowns = state.player.cooldowns.map((cd) => Math.max(0, cd - dt));
    if (state.player.resource < hero.resource) state.player.resource = clamp(state.player.resource + hero.resource * .008 * dt, 0, hero.resource);
    movePlayer(dt); updateEntities(dt); playerDamage(dt);
    state.particles.forEach((particle) => { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 90 * dt; particle.life -= dt; }); state.particles = state.particles.filter((particle) => particle.life > 0);
    state.texts.forEach((text) => { text.y += text.vy * dt; text.life -= dt; }); state.texts = state.texts.filter((text) => text.life > 0);
    renderAll();
  }

  function roundedRect(x, y, width, height, radius) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }

  function drawWorld() {
    const scale = getViewScale(); const view = getCamera(); const width = canvas.clientWidth / scale; const height = canvas.clientHeight / scale;
    ctx.save(); ctx.scale(scale, scale); ctx.translate(-view.x, -view.y);
    ctx.fillStyle = "#1a2c23"; ctx.fillRect(view.x, view.y, width, height);
    // Ground bands and the mining road create readable navigation without relying on a texture.
    ctx.fillStyle = "#21362a"; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.strokeStyle = "rgba(173, 147, 90, .12)"; ctx.lineWidth = 70; ctx.beginPath(); ctx.moveTo(240, 1120); ctx.bezierCurveTo(780, 1040, 870, 760, 1270, 790); ctx.bezierCurveTo(1620, 820, 1650, 500, 2190, 330); ctx.stroke();
    ctx.strokeStyle = "rgba(232, 206, 139, .15)"; ctx.lineWidth = 30; ctx.beginPath(); ctx.moveTo(240, 1120); ctx.bezierCurveTo(780, 1040, 870, 760, 1270, 790); ctx.bezierCurveTo(1620, 820, 1650, 500, 2190, 330); ctx.stroke();
    // Town perimeter, mine entrance and water line.
    ctx.fillStyle = "rgba(98, 213, 198, .08)"; ctx.fillRect(150, 950, 360, 300); ctx.strokeStyle = "rgba(98, 213, 198, .22)"; ctx.lineWidth = 3; ctx.strokeRect(150, 950, 360, 300);
    ctx.fillStyle = "rgba(34, 64, 65, .42)"; ctx.fillRect(1760, 230, 440, 370); ctx.strokeStyle = "rgba(231, 179, 107, .22)"; ctx.strokeRect(1760, 230, 440, 370);
    ctx.strokeStyle = "rgba(114, 173, 178, .16)"; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(20, 300); ctx.bezierCurveTo(500, 420, 680, 250, 1050, 390); ctx.bezierCurveTo(1470, 550, 1660, 210, 2390, 280); ctx.stroke();
    // Grid gives the scene a deliberate tactical quality.
    ctx.strokeStyle = "rgba(205, 219, 183, .035)"; ctx.lineWidth = 1; for (let x = 0; x < WORLD.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); } for (let y = 0; y < WORLD.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
    drawLandmarks();
    state.drops.forEach(drawDrop); state.entities.filter((entity) => entity.alive).forEach(drawEntity); drawPlayer(); state.particles.forEach(drawParticle); state.texts.forEach(drawText);
    if (moveTarget) { ctx.strokeStyle = "rgba(98, 213, 198, .7)"; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.arc(moveTarget.x, moveTarget.y, 13, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }

  function drawLandmarks() {
    ctx.save();
    [[218, 1016], [282, 1100], [388, 1060], [1870, 326], [2020, 394], [2150, 310]].forEach(([x, y], index) => { ctx.fillStyle = index < 3 ? "#4b6b55" : "#354d4c"; ctx.beginPath(); ctx.arc(x, y, index < 3 ? 18 : 25, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(236, 202, 134, .35)"; ctx.fillRect(x - 3, y - 28, 6, 13); });
    ctx.fillStyle = "rgba(231, 179, 107, .55)"; ctx.font = "12px Georgia"; ctx.fillText("村口篝火", 214, 1190); ctx.fillText("裂碑矿道", 1908, 565);
    ctx.restore();
  }

  function drawEntity(entity) {
    ctx.save(); const selected = entity.id === state.player.targetId; const scale = entity.boss ? 1.22 : 1; if (selected) { ctx.strokeStyle = activeHero().color; ctx.globalAlpha = .8; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.radius + 9, 0, Math.PI * 2); ctx.stroke(); } if (entity.hitFlash > 0) ctx.globalAlpha = .45;
    ctx.fillStyle = entity.boss ? "#bf654f" : entity.color; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.radius * scale, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = entity.boss ? "#f4c484" : "rgba(242, 220, 174, .7)"; ctx.beginPath(); ctx.arc(entity.x - entity.radius * .28, entity.y - entity.radius * .3, entity.boss ? 6 : 4, 0, Math.PI * 2); ctx.fill(); if (entity.boss) { ctx.strokeStyle = "rgba(241, 109, 102, .65)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.radius * scale + 8, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore(); drawNameplate(entity);
  }

  function drawNameplate(entity) {
    const width = entity.boss ? 134 : 92; const left = entity.x - width / 2; const top = entity.y - entity.radius - (entity.boss ? 40 : 27); ctx.fillStyle = "rgba(9, 16, 19, .76)"; roundedRect(left, top, width, entity.boss ? 22 : 17, 3); ctx.fill(); ctx.fillStyle = entity.boss ? "#f3b1a8" : "#c7d2cb"; ctx.font = `${entity.boss ? 11 : 9}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(entity.name, entity.x, top + (entity.boss ? 14 : 11)); ctx.fillStyle = "#0c1518"; ctx.fillRect(left + 7, top + (entity.boss ? 25 : 20), width - 14, 3); ctx.fillStyle = entity.boss ? "#f16d66" : "#8fc7a2"; ctx.fillRect(left + 7, top + (entity.boss ? 25 : 20), (width - 14) * (entity.hp / entity.maxHp), 3); ctx.textAlign = "start";
  }

  function drawDrop(drop) { ctx.save(); ctx.translate(drop.x, drop.y); ctx.rotate(Math.PI / 4); ctx.fillStyle = drop.color; ctx.globalAlpha = .9; ctx.fillRect(-6, -6, 12, 12); ctx.globalAlpha = .28; ctx.fillRect(-11, -11, 22, 22); ctx.restore(); }
  function drawPlayer() { const hero = activeHero(); ctx.save(); ctx.globalAlpha = state.player.invulnerable > 0 && Math.floor(state.player.invulnerable * 8) % 2 === 0 ? .45 : 1; ctx.fillStyle = hero.color; ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 19, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 25, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#102027"; ctx.beginPath(); ctx.arc(state.player.x + 6, state.player.y - 5, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  function drawParticle(particle) { ctx.save(); ctx.globalAlpha = clamp(particle.life * 2, 0, 1); ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, particle.size, particle.size); ctx.restore(); }
  function drawText(text) { ctx.save(); ctx.globalAlpha = clamp(text.life * 2, 0, 1); ctx.fillStyle = text.color; ctx.font = `700 ${text.size}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(text.message, text.x, text.y); ctx.restore(); }

  function renderTarget() { const target = state?.entities.find((entity) => entity.id === state.player.targetId && entity.alive); $("targetText").textContent = target ? target.name : "未锁定目标"; $("targetHint").textContent = target ? `${Math.max(0, Math.round(target.hp))} / ${target.maxHp} HP` : "靠近怪物开始战斗"; }
  function renderLog() { $("eventLog").innerHTML = state.logs.slice().reverse().map((entry) => `<div class="event-entry ${entry.type}">${entry.message}</div>`).join(""); }

  function renderPlayer() {
    const hero = activeHero(); const maxHp = hero.hp + equipmentHp(); const maxResource = hero.resource; const power = hero.attack + state.player.level * 4 + Object.values(state.player.equipment).reduce((sum, item) => sum + (item?.power || 0), 0) + hero.defense * 2;
    $("avatar").textContent = hero.glyph; $("avatar").style.color = hero.color; $("avatar").style.borderColor = hero.color; $("className").textContent = hero.name; $("playerName").textContent = `${hero.name} · 灰烬旅人`; $("levelText").textContent = `Lv.${state.player.level}`; $("powerText").textContent = formatNumber(power); $("hpText").textContent = `${Math.ceil(state.player.hp)} / ${maxHp}`; $("hpBar").style.width = `${clamp(state.player.hp / maxHp * 100, 0, 100)}%`; $("resourceText").textContent = `${Math.ceil(state.player.resource)} / ${maxResource}`; $("resourceBar").style.width = `${clamp(state.player.resource / maxResource * 100, 0, 100)}%`; $("expText").textContent = `${state.player.exp} / ${state.player.nextExp}`; $("expBar").style.width = `${clamp(state.player.exp / state.player.nextExp * 100, 0, 100)}%`; $("goldText").textContent = formatNumber(state.player.gold); $("markText").textContent = `${state.player.marks} / 800`; $("potionCount").textContent = state.player.potion;
    const questProgress = state.quest.kills / state.quest.need * 100; $("questBar").style.width = `${questProgress}%`; $("questText").textContent = state.quest.completed ? "已完成 · 领取奖励" : `${state.quest.kills} / ${state.quest.need} 击杀`;
  }

  function renderSkills() { const hero = activeHero(); $("skillBar").innerHTML = hero.skills.map((skill, index) => `<button class="skill-button" data-skill="${index}" title="${skill.name} · ${skill.kind}"><span class="skill-key">${index + 1}</span><strong>${skill.name}</strong><small>${skill.cost} ${hero.resourceName}</small>${state.player.cooldowns[index] > 0 ? `<span class="cooldown">${Math.ceil(state.player.cooldowns[index])}</span>` : ""}</button>`).join(""); $("skillBar").querySelectorAll("button").forEach((button) => { button.disabled = state.player.cooldowns[Number(button.dataset.skill)] > 0; }); }

  function renderEquipment() { const labels = { weapon: "武器", neck: "项链", boots: "靴子" }; $("equipmentGrid").innerHTML = Object.keys(labels).map((slot) => { const item = state.player.equipment[slot]; return `<button class="equipment-slot ${item ? "filled" : ""}" title="${item ? `${item.name}：${item.desc}` : `${labels[slot]}空位`}">${item ? `<span class="slot-glyph">${item.glyph}</span><span class="slot-name">${labels[slot]}</span>` : `<span class="slot-glyph">+</span><span class="slot-name">${labels[slot]}</span>`}</button>`; }).join(""); }
  function renderInventory() { const inventory = state.inventory || []; $("inventoryCount").textContent = `${inventory.length}/12`; $("inventoryGrid").innerHTML = Array.from({ length: 12 }, (_, index) => { const item = inventory[index]; return `<button class="inventory-slot ${item ? "" : "empty"}" data-item-index="${index}" title="${item ? `${item.name}：${item.desc}` : "空背包格"}">${item ? `<span class="quality-line" style="color:${item.color}"></span><span class="slot-glyph" style="color:${item.color}">${item.glyph}</span>${item.enhance ? `<span class="enhance">+${item.enhance}</span>` : ""}` : ""}</button>`; }).join(""); $("inventoryGrid").querySelectorAll("[data-item-index]").forEach((button) => { button.addEventListener("click", () => equipItem(inventory[Number(button.dataset.itemIndex)])); }); }
  function renderBoss() { const boss = state.entities.find((entity) => entity.id === "boss-1"); $("bossAlertText").textContent = boss.alive ? `裂碑领主 · ${Math.ceil(boss.hp / boss.maxHp * 100)}% 生命` : `已击破 · ${Math.ceil(boss.respawn)} 秒后刷新`; }
  function renderAll() { if (!state) return; drawWorld(); renderPlayer(); renderTarget(); renderSkills(); renderEquipment(); renderInventory(); renderLog(); renderBoss(); $("coords").textContent = `坐标 ${Math.round(state.player.x)}, ${Math.round(state.player.y)}`; }

  function saveGame() { if (!state) return; localStorage.setItem(STORAGE_KEY, JSON.stringify({ classId: state.classId, player: state.player, inventory: state.inventory || [], equipment: state.player.equipment, quest: state.quest })); showToast("进度已保存在本机浏览器"); log("进度已保存：下次打开可继续当前职业与装备。", "loot"); }
  function loadGame() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (!saved || !CLASSES[saved.classId]) return false; state = createState(saved.classId); Object.assign(state.player, saved.player); state.player.equipment = saved.equipment || saved.player.equipment || {}; state.inventory = saved.inventory || []; state.quest = saved.quest || state.quest; $("classModal").classList.add("hidden"); log("已恢复本机进度：服务器规则仍以当前版本为准。", "loot"); return true; } catch { return false; } }
  function resetGame() { localStorage.removeItem(STORAGE_KEY); state = null; $("classModal").classList.remove("hidden"); showToast("请选择职业开始新的边境旅程"); }
  function setupClasses() { $("classOptions").innerHTML = Object.entries(CLASSES).map(([id, hero]) => `<button class="class-option" data-class="${id}" style="--class-color:${hero.color}"><span class="class-glyph">${hero.glyph}</span><span><h3>${hero.name}</h3><p>${hero.subtitle}</p><span class="class-stat">生命 ${hero.hp} · ${hero.resourceName} ${hero.resource}</span></span></button>`).join(""); $("classOptions").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => chooseClass(button.dataset.class))); }

  function setupInput() {
    window.addEventListener("keydown", (event) => { keys[event.key] = true; const key = event.key.toLowerCase(); if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault(); if (key === "j") normalAttack(); if (key === "f") collectDrops(); if (key === "q") usePotion(); if (key === "r") oneMoment(); if (/^[1-4]$/.test(key)) castSkill(Number(key) - 1); }); window.addEventListener("keyup", (event) => { keys[event.key] = false; });
    canvas.addEventListener("pointerdown", (event) => { pointer.down = true; const point = canvasPoint(event); const target = state?.entities.find((entity) => entity.alive && distance(point, entity) < entity.radius + 22); if (target) selectTarget(target); else moveTarget = point; }); canvas.addEventListener("pointerup", () => { pointer.down = false; });
    $("skillBar").addEventListener("click", (event) => { const button = event.target.closest("[data-skill]"); if (button) castSkill(Number(button.dataset.skill)); }); $("potionBtn").addEventListener("click", usePotion); $("saveBtn").addEventListener("click", saveGame); $("resetBtn").addEventListener("click", resetGame); $("inventoryHint").addEventListener("click", () => showToast("背包装备会影响战力，锁定只防误操作，不提供死亡保护")); document.querySelectorAll("[data-move]").forEach((button) => { button.addEventListener("pointerdown", () => { keys[{ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[button.dataset.move]] = true; }); button.addEventListener("pointerup", () => { keys[{ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[button.dataset.move]] = false; }); button.addEventListener("pointerleave", () => { keys[{ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[button.dataset.move]] = false; }); });
  }

  function usePotion() { if (!state || state.player.potion <= 0) { showToast("生命药水已用完"); return; } const maxHp = activeHero().hp + equipmentHp(); if (state.player.hp >= maxHp) { showToast("生命值已满"); return; } state.player.potion -= 1; const restore = Math.round(maxHp * .32); state.player.hp = clamp(state.player.hp + restore, 0, maxHp); textAt(`+${restore}`, state.player.x, state.player.y - 32, "#78b6ec", 15); log(`使用生命药水，恢复 ${restore} 点生命。`); }

  function frame(timestamp) { const dt = Math.min((timestamp - lastTime) / 1000 || 0, .05); lastTime = timestamp; update(dt); requestAnimationFrame(frame); }
  setupClasses(); setupInput(); resizeCanvas(); window.addEventListener("resize", resizeCanvas); if (!loadGame()) { $("classModal").classList.remove("hidden"); } requestAnimationFrame(frame);
})();
