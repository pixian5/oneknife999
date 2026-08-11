(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const wrap = document.querySelector("#canvasWrap");
  const STORAGE_KEY = "oneknife999-prototype-save-v2";

  const CLASSES = {
    warrior: {
      name: "战士", glyph: "刃", color: "#e7b36b", subtitle: "贴身爆发 · 追击 · 承伤", hp: 350, resource: 100, resourceName: "怒气", attack: 33, defense: 22, speed: 218, range: 70, cooldown: 0.62,
      skills: [
        { name: "破甲斩", cost: 10, cd: 3, damage: 1.45, range: 90, kind: "破甲", desc: "斩击锁定目标，造成 145% 攻击伤害，并制造短暂破甲窗口。" },
        { name: "旋风扫", cost: 20, cd: 6, damage: 1.08, range: 125, kind: "范围", area: 125, areaLabel: "半径 4 格", desc: "以自身为中心横扫，最多命中 5 个敌人，每个目标承受 108% 攻击伤害。" },
        { name: "震地冲", cost: 25, cd: 12, damage: 1.25, range: 180, kind: "冲锋", desc: "冲向锁定目标并击退，造成 125% 攻击伤害。需要在 6 格内释放。" },
        { name: "焚天斩", cost: 40, cd: 10, damage: 2.4, range: 105, kind: "爆发", desc: "对锁定目标施放重斩，造成 240% 攻击伤害；满破势时可被一刀时刻强化。" }
      ]
    },
    mage: {
      name: "法师", glyph: "焰", color: "#78b6ec", subtitle: "远程群攻 · 区域控制 · 清怪", hp: 235, resource: 240, resourceName: "法力", attack: 41, defense: 10, speed: 205, range: 220, cooldown: 0.86,
      skills: [
        { name: "雷矛术", cost: 14, cd: 2.5, damage: 1.65, range: 260, kind: "穿透", desc: "向锁定目标射出雷矛，造成 165% 魔法伤害；可在 9 格内施放。" },
        { name: "焰痕地带", cost: 35, cd: 10, damage: 1.15, range: 180, kind: "范围", area: 180, areaLabel: "半径 6 格", desc: "以自身为中心铺开焰痕，范围内最多 5 个敌人承受 115% 魔法伤害。" },
        { name: "烈焰震环", cost: 25, cd: 12, damage: 1.2, range: 125, kind: "范围", area: 125, areaLabel: "半径 4 格", desc: "向周围爆开烈焰，造成 120% 魔法伤害并推开近身敌人。" },
        { name: "天火陨星", cost: 90, cd: 18, damage: 3.1, range: 300, kind: "爆发", desc: "召下天火锁定目标，造成 310% 魔法伤害；满破势时获得额外爆发。" }
      ]
    },
    taoist: {
      name: "道士", glyph: "符", color: "#a88ce3", subtitle: "持续输出 · 治疗 · 召唤", hp: 280, resource: 160, resourceName: "符力", attack: 30, defense: 16, speed: 210, range: 185, cooldown: 0.74,
      skills: [
        { name: "蚀骨咒", cost: 18, cd: 6, damage: 1.1, range: 205, kind: "削弱", desc: "对锁定目标施放蚀骨咒，造成 110% 道术伤害并积累一刀势能。" },
        { name: "召唤骨卫", cost: 35, cd: 20, damage: 0.8, range: 180, kind: "召唤", desc: "在身边召唤骨卫协同作战，立刻对锁定目标造成 80% 道术伤害。" },
        { name: "生息法阵", cost: 50, cd: 15, damage: 0, range: 120, kind: "治疗", area: 120, areaLabel: "半径 4 格", desc: "以自身为中心展开法阵，恢复自身生命并积累一刀势能。" },
        { name: "镇魂符", cost: 10, cd: 2, damage: 1.55, range: 220, kind: "爆发", desc: "向锁定目标发射镇魂符，造成 155% 道术伤害；中毒目标更容易被终结。" }
      ]
    }
  };

  // 四张首发地图：灰烬村外 -> 雾松林 -> 黑岩矿坑 -> 赤砂大漠。
  // 每张地图包含等级范围、危险等级、调色板、地标、怪物种类、刷新点、BOSS阶段、掉落表和出口。
  const MAPS = {
    ash_outskirts: {
      id: "ash_outskirts",
      name: "灰烬村外",
      subtitle: "腐烬矿道",
      levelMin: 1, levelMax: 10,
      danger: "safe",
      dangerLabel: "村口保护",
      width: 2400, height: 1500,
      palette: { ground: "#21362a", road: "rgba(173, 147, 90, .12)", roadHi: "rgba(232, 206, 139, .15)", grid: "rgba(205, 219, 183, .035)", town: "rgba(98, 213, 198, .08)", townBorder: "rgba(98, 213, 198, .22)", special: "rgba(34, 64, 65, .42)", specialBorder: "rgba(231, 179, 107, .22)", water: "rgba(114, 173, 178, .16)" },
      townRect: { x: 150, y: 950, w: 360, h: 300 },
      specialRect: { x: 1760, y: 230, w: 440, h: 370 },
      paths: [[240, 1120, 780, 1040, 870, 760, 1270, 790, 1620, 820, 1650, 500, 2190, 330]],
      landmarks: [
        { type: "tower", x: 218, y: 1016, r: 18, color: "#4b6b55" }, { type: "tower", x: 282, y: 1100, r: 18, color: "#4b6b55" }, { type: "tower", x: 388, y: 1060, r: 18, color: "#4b6b55" },
        { type: "rock", x: 1870, y: 326, r: 25, color: "#354d4c" }, { type: "rock", x: 2020, y: 394, r: 25, color: "#354d4c" }, { type: "rock", x: 2150, y: 310, r: 25, color: "#354d4c" }
      ],
      landmarkLabels: [{ text: "村口篝火", x: 214, y: 1190 }, { text: "裂碑矿道", x: 1908, y: 565 }],
      monsterTypes: [
        { name: "腐烬矿工", color: "#bd8b68", hp: 84, attack: 13, defense: 3, exp: 28, gold: 8, radius: 17 },
        { name: "赤牙猎犬", color: "#ca6b63", hp: 68, attack: 17, defense: 2, exp: 32, gold: 10, radius: 15 },
        { name: "裂脊尸卫", color: "#71898a", hp: 132, attack: 19, defense: 8, exp: 52, gold: 15, radius: 20 },
        { name: "灰烬侦察者", color: "#b49b61", hp: 104, attack: 22, defense: 4, exp: 48, gold: 18, radius: 16 }
      ],
      monsterSpawns: [[820, 560, 0], [1010, 700, 1], [1180, 510, 2], [1360, 820, 3], [1550, 610, 0], [1740, 510, 1], [1930, 690, 2], [2100, 850, 3], [920, 1040, 0], [1140, 1120, 1], [1430, 1040, 2], [1700, 1060, 3], [2010, 1110, 0], [690, 1140, 1], [1510, 420, 2], [1880, 390, 3]],
      boss: { id: "boss-ash", name: "裂碑领主", color: "#e99b5f", hp: 900, attack: 36, defense: 18, exp: 480, gold: 260, radius: 34, x: 1980, y: 760, phases: 2, phase1Trigger: 0.55, specialInterval: 7, specialKind: "crack" },
      drops: [
        { name: "矿道旧刃", slot: "weapon", quality: "blue", glyph: "刀", power: 12, value: 22, color: "#78b6ec", desc: "攻击 12 · 破甲斩伤害 +3%" },
        { name: "灰烬护符", slot: "neck", quality: "purple", glyph: "玉", power: 18, value: 46, color: "#a88ce3", desc: "生命 +45 · 一刀充能 +4%" },
        { name: "矿脉战靴", slot: "boots", quality: "blue", glyph: "靴", power: 9, value: 28, color: "#78b6ec", desc: "防御 +8 · 移速 +4" },
        { name: "裂碑余烬", slot: "material", quality: "orange", glyph: "核", power: 0, value: 120, color: "#e7b36b", desc: "首领铸魂材料 · 可交易" }
      ],
      exits: [
        { x: 2330, y: 540, w: 60, h: 360, target: "pine_forest", spawn: { x: 90, y: 760 }, label: "雾松林", sub: "推荐 Lv.8" }
      ]
    },
    pine_forest: {
      id: "pine_forest",
      name: "雾松林",
      subtitle: "翠木回廊",
      levelMin: 8, levelMax: 18,
      danger: "normal",
      dangerLabel: "野外可争夺",
      width: 2400, height: 1500,
      palette: { ground: "#1c2e22", road: "rgba(120, 180, 110, .12)", roadHi: "rgba(160, 220, 130, .15)", grid: "rgba(180, 220, 170, .035)", town: "rgba(98, 213, 198, .08)", townBorder: "rgba(98, 213, 198, .22)", special: "rgba(40, 70, 50, .55)", specialBorder: "rgba(120, 200, 130, .25)", water: "rgba(120, 180, 178, .14)" },
      townRect: { x: 80, y: 950, w: 280, h: 280 },
      specialRect: { x: 1700, y: 220, w: 540, h: 460 },
      paths: [[180, 1080, 620, 1100, 820, 780, 1280, 800, 1620, 720, 1980, 460]],
      landmarks: [
        { type: "tree", x: 180, y: 1010, r: 22, color: "#2a4a32" }, { type: "tree", x: 250, y: 1140, r: 22, color: "#2a4a32" },
        { type: "tree", x: 1750, y: 280, r: 26, color: "#1f3a26" }, { type: "tree", x: 1900, y: 320, r: 26, color: "#1f3a26" }, { type: "tree", x: 2050, y: 260, r: 26, color: "#1f3a26" }, { type: "tree", x: 2150, y: 420, r: 26, color: "#1f3a26" },
        { type: "log", x: 1400, y: 540, r: 18, color: "#3a2a1c" }, { type: "log", x: 1620, y: 880, r: 18, color: "#3a2a1c" }
      ],
      landmarkLabels: [{ text: "采药人营地", x: 150, y: 1255 }, { text: "巨猿巢穴", x: 1900, y: 690 }],
      monsterTypes: [
        { name: "灰鬃狼", color: "#9ca39a", hp: 168, attack: 26, defense: 8, exp: 70, gold: 16, radius: 17 },
        { name: "林皮蛛", color: "#6b8c5a", hp: 142, attack: 30, defense: 5, exp: 78, gold: 18, radius: 15 },
        { name: "松鸦盗", color: "#7d9bb0", hp: 196, attack: 24, defense: 10, exp: 88, gold: 22, radius: 17 },
        { name: "枯木菇人", color: "#a07b54", hp: 232, attack: 22, defense: 14, exp: 96, gold: 20, radius: 19 }
      ],
      monsterSpawns: [[600, 620, 0], [820, 820, 1], [980, 540, 2], [1180, 740, 0], [1360, 480, 1], [1500, 880, 3], [1700, 700, 0], [1840, 540, 2], [1260, 1020, 3], [1480, 1180, 0], [1720, 1080, 1], [1980, 760, 2], [780, 1080, 3], [1100, 280, 0], [1900, 980, 1]],
      boss: { id: "boss-pine", name: "森林巨猿", color: "#5c7d52", hp: 1400, attack: 52, defense: 28, exp: 820, gold: 420, radius: 36, x: 1980, y: 700, phases: 2, phase1Trigger: 0.5, specialInterval: 5.5, specialKind: "logs" },
      drops: [
        { name: "狼皮护腕", slot: "weapon", quality: "blue", glyph: "腕", power: 18, value: 36, color: "#78b6ec", desc: "攻击 18 · 灰鬃狼掉落" },
        { name: "蛛丝项链", slot: "neck", quality: "blue", glyph: "玉", power: 14, value: 32, color: "#78b6ec", desc: "生命 +35 · 暴击 +2%" },
        { name: "采药人短靴", slot: "boots", quality: "purple", glyph: "靴", power: 22, value: 72, color: "#a88ce3", desc: "防御 +14 · 移速 +6" },
        { name: "翠木之心", slot: "material", quality: "purple", glyph: "核", power: 0, value: 180, color: "#a88ce3", desc: "巨猿铸魂材料 · 可交易" }
      ],
      exits: [
        { x: 20, y: 540, w: 50, h: 360, target: "ash_outskirts", spawn: { x: 2280, y: 760 }, label: "灰烬村外", sub: "Lv.1-10" },
        { x: 2330, y: 540, w: 60, h: 360, target: "black_rock_mine", spawn: { x: 90, y: 760 }, label: "黑岩矿坑", sub: "推荐 Lv.15" }
      ]
    },
    black_rock_mine: {
      id: "black_rock_mine",
      name: "黑岩矿坑",
      subtitle: "深井回响",
      levelMin: 15, levelMax: 28,
      danger: "normal",
      dangerLabel: "野外可争夺",
      width: 2400, height: 1500,
      palette: { ground: "#1a1d22", road: "rgba(180, 140, 80, .14)", roadHi: "rgba(220, 170, 100, .18)", grid: "rgba(200, 190, 170, .04)", town: "rgba(98, 213, 198, .08)", townBorder: "rgba(98, 213, 198, .22)", special: "rgba(50, 40, 30, .55)", specialBorder: "rgba(220, 170, 100, .25)", water: "rgba(100, 130, 150, .12)" },
      townRect: { x: 80, y: 950, w: 280, h: 280 },
      specialRect: { x: 1640, y: 220, w: 600, h: 460 },
      paths: [[180, 1080, 620, 1120, 880, 800, 1280, 820, 1640, 760, 2100, 480]],
      landmarks: [
        { type: "lantern", x: 220, y: 1020, r: 14, color: "#d9954a" }, { type: "lantern", x: 320, y: 1140, r: 14, color: "#d9954a" },
        { type: "beam", x: 1700, y: 280, r: 14, color: "#3a3028" }, { type: "beam", x: 1820, y: 320, r: 14, color: "#3a3028" }, { type: "beam", x: 1980, y: 280, r: 14, color: "#3a3028" }, { type: "beam", x: 2120, y: 400, r: 14, color: "#3a3028" }, { type: "beam", x: 2200, y: 540, r: 14, color: "#3a3028" },
        { type: "cart", x: 1400, y: 580, r: 18, color: "#4a3a2c" }
      ],
      landmarkLabels: [{ text: "矿工营", x: 150, y: 1255 }, { text: "尸皇棺室", x: 1980, y: 700 }],
      monsterTypes: [
        { name: "黑岩矿工", color: "#8a7a5a", hp: 320, attack: 48, defense: 18, exp: 130, gold: 26, radius: 18 },
        { name: "落石魔", color: "#6a6258", hp: 460, attack: 42, defense: 26, exp: 150, gold: 30, radius: 22 },
        { name: "矿脉蝙蝠", color: "#4a3a4a", hp: 220, attack: 56, defense: 10, exp: 120, gold: 22, radius: 14 },
        { name: "腐毒僵尸", color: "#5a7050", hp: 380, attack: 50, defense: 14, exp: 158, gold: 28, radius: 19 }
      ],
      monsterSpawns: [[600, 620, 0], [820, 820, 1], [980, 540, 2], [1180, 740, 0], [1360, 480, 1], [1500, 880, 3], [1700, 700, 0], [1840, 540, 2], [1260, 1020, 3], [1480, 1180, 0], [1720, 1080, 1], [1980, 540, 2], [780, 1080, 3], [1100, 280, 0], [2080, 980, 1]],
      boss: { id: "boss-mine", name: "坑道尸皇", color: "#7a5a3a", hp: 2100, attack: 78, defense: 42, exp: 1600, gold: 760, radius: 38, x: 2080, y: 700, phases: 3, phase1Trigger: 0.7, phase2Trigger: 0.35, specialInterval: 5, specialKind: "devour", summonInterval: 8, summonMob: 0, summonMax: 4 },
      drops: [
        { name: "黑铁长剑", slot: "weapon", quality: "purple", glyph: "剑", power: 32, value: 110, color: "#a88ce3", desc: "攻击 32 · 破甲斩伤害 +6%" },
        { name: "矿主项链", slot: "neck", quality: "purple", glyph: "玉", power: 28, value: 96, color: "#a88ce3", desc: "生命 +90 · 怒气 +5" },
        { name: "落石战靴", slot: "boots", quality: "purple", glyph: "靴", power: 26, value: 88, color: "#a88ce3", desc: "防御 +22 · 反伤 +3%" },
        { name: "技能书残页", slot: "material", quality: "orange", glyph: "卷", power: 0, value: 280, color: "#e7b36b", desc: "15-28 级技能书候选 · 可交易" },
        { name: "黑铁矿石", slot: "material", quality: "blue", glyph: "矿", power: 0, value: 60, color: "#78b6ec", desc: "强化材料 +1~+5 必成" }
      ],
      exits: [
        { x: 20, y: 540, w: 50, h: 360, target: "pine_forest", spawn: { x: 2280, y: 760 }, label: "雾松林", sub: "Lv.8-18" },
        { x: 2330, y: 540, w: 60, h: 360, target: "red_sand_desert", spawn: { x: 90, y: 760 }, label: "赤砂大漠", sub: "推荐 Lv.20" }
      ]
    },
    red_sand_desert: {
      id: "red_sand_desert",
      name: "赤砂大漠",
      subtitle: "枯井商道",
      levelMin: 20, levelMax: 35,
      danger: "danger",
      dangerLabel: "危险区·爆装",
      width: 2400, height: 1500,
      palette: { ground: "#3a2a1c", road: "rgba(220, 180, 110, .14)", roadHi: "rgba(240, 200, 130, .18)", grid: "rgba(220, 200, 160, .04)", town: "rgba(98, 213, 198, .08)", townBorder: "rgba(98, 213, 198, .22)", special: "rgba(70, 40, 20, .45)", specialBorder: "rgba(240, 180, 90, .28)", water: "rgba(120, 160, 200, .14)" },
      townRect: { x: 80, y: 950, w: 280, h: 280 },
      specialRect: { x: 1640, y: 220, w: 600, h: 460 },
      paths: [[180, 1080, 620, 1100, 880, 800, 1280, 820, 1640, 760, 2100, 480]],
      landmarks: [
        { type: "well", x: 220, y: 1020, r: 16, color: "#5a7090" }, { type: "well", x: 320, y: 1140, r: 16, color: "#5a7090" },
        { type: "dune", x: 1700, y: 280, r: 30, color: "#5a3a20" }, { type: "dune", x: 1880, y: 320, r: 30, color: "#5a3a20" }, { type: "dune", x: 2040, y: 260, r: 30, color: "#5a3a20" }, { type: "dune", x: 2180, y: 420, r: 30, color: "#5a3a20" },
        { type: "ruin", x: 1400, y: 540, r: 22, color: "#7a5a3a" }, { type: "ruin", x: 1560, y: 880, r: 22, color: "#7a5a3a" },
        { type: "well", x: 1980, y: 540, r: 16, color: "#5a7090" }
      ],
      landmarkLabels: [{ text: "商队驿站", x: 150, y: 1255 }, { text: "蝎王枯井", x: 1980, y: 700 }],
      monsterTypes: [
        { name: "赤砂蝎", color: "#c08a4a", hp: 540, attack: 78, defense: 30, exp: 220, gold: 38, radius: 18 },
        { name: "沙虫", color: "#9a7a4a", hp: 620, attack: 70, defense: 22, exp: 240, gold: 36, radius: 22 },
        { name: "沙盗斥候", color: "#8a5a3a", hp: 480, attack: 92, defense: 18, exp: 260, gold: 48, radius: 16 },
        { name: "枯骨游魂", color: "#9ab0a0", hp: 560, attack: 84, defense: 16, exp: 250, gold: 42, radius: 18 }
      ],
      monsterSpawns: [[600, 620, 0], [820, 820, 1], [980, 540, 2], [1180, 740, 0], [1360, 480, 1], [1500, 880, 3], [1700, 700, 0], [1840, 540, 2], [1260, 1020, 3], [1480, 1180, 0], [1720, 1080, 1], [1980, 540, 2], [780, 1080, 3], [1100, 280, 0], [2080, 980, 1]],
      boss: { id: "boss-desert", name: "沙蝎王", color: "#d09050", hp: 3000, attack: 112, defense: 60, exp: 2400, gold: 1100, radius: 40, x: 2080, y: 700, phases: 2, phase1Trigger: 0.5, specialInterval: 4.5, specialKind: "sting", poisonStacks: true },
      drops: [
        { name: "蝎尾匕首", slot: "weapon", quality: "orange", glyph: "匕", power: 56, value: 280, color: "#e7b36b", desc: "攻击 56 · 暴击 +6% · 沙蝎王掉落" },
        { name: "沙漠之星", slot: "neck", quality: "orange", glyph: "玉", power: 48, value: 240, color: "#e7b36b", desc: "生命 +160 · 毒抗 +12%" },
        { name: "游牧皮靴", slot: "boots", quality: "purple", glyph: "靴", power: 36, value: 130, color: "#a88ce3", desc: "防御 +30 · 移速 +8" },
        { name: "蝎王毒腺", slot: "material", quality: "orange", glyph: "核", power: 0, value: 320, color: "#e7b36b", desc: "橙装铸魂材料 · 可交易" }
      ],
      exits: [
        { x: 20, y: 540, w: 50, h: 360, target: "black_rock_mine", spawn: { x: 2280, y: 760 }, label: "黑岩矿坑", sub: "Lv.15-28" }
      ]
    }
  };

  const MAP_ORDER = ["ash_outskirts", "pine_forest", "black_rock_mine", "red_sand_desert"];

  const MAP_CLEAR_RULES = {
    ash_outskirts: { kills: 8, boss: "裂碑领主", next: "pine_forest", exit: "东侧出口" },
    pine_forest: { kills: 10, boss: "森林巨猿", next: "black_rock_mine", exit: "东侧出口" },
    black_rock_mine: { kills: 10, boss: "坑道尸皇", next: "red_sand_desert", exit: "东侧出口" },
    red_sand_desert: { kills: 10, boss: "沙蝎王", next: null, exit: null }
  };

  const MONSTER_FLAVOR = {
    "腐烬矿工": "被矿尘侵蚀的旧矿工，会挥动沉重矿镐追击闯入者。",
    "赤牙猎犬": "速度很快的矿道猎犬，防御较低但近身攻击频繁。",
    "裂脊尸卫": "披着残破甲片的守卫，生命与防御高于同区怪物。",
    "灰烬侦察者": "在矿道外围巡游的斥候，攻击较高且体型灵活。",
    "灰鬃狼": "雾松林中的群猎者，擅长快速贴近落单目标。",
    "林皮蛛": "伏在林地阴影中的毒蛛，攻击高而护甲薄弱。",
    "松鸦盗": "占据商路的盗匪，攻防均衡并会持续追击。",
    "枯木菇人": "由腐木孢子聚成的怪物，生命与护甲较高。",
    "黑岩矿工": "被深井怨气驱使的矿工，使用重型工具近身攻击。",
    "落石魔": "岩层凝成的厚重魔物，移动迟缓但极难击穿。",
    "矿脉蝙蝠": "盘旋在矿脉上方的袭击者，生命低但攻击凶狠。",
    "腐毒僵尸": "尸皇气息催生的腐尸，靠近后持续制造压力。",
    "赤砂蝎": "赤砂中潜伏的甲蝎，拥有较高防御与稳定伤害。",
    "沙虫": "从沙层下钻出的巨虫，生命高且会紧贴目标。",
    "沙盗斥候": "危险商道上的精锐斥候，攻击力远高于普通怪物。",
    "枯骨游魂": "不受风沙阻挡的游魂，护甲较低但伤害不容忽视。",
    "裂碑领主": "盘踞腐烬矿道的石碑守卫，低血量时会制造地裂危险区。",
    "森林巨猿": "统治雾松林的巨兽，阶段二会在玩家附近召下落木。",
    "坑道尸皇": "深井棺室的统治者，会召唤腐工，并在后续阶段制造地裂与吞噬区。",
    "沙蝎王": "赤砂大漠的高危首领，尾刺会锁定玩家，并可叠加毒层。"
  };

  const COMMON_DROPS = [
    { name: "生命药水", kind: "health_potion", slot: "consumable", quality: "blue", glyph: "药", color: "#f16d66", desc: "拾取后增加 1 瓶生命药水", weight: 36 },
    { name: "回元露", kind: "resource_potion", slot: "consumable", quality: "blue", glyph: "露", color: "#78b6ec", desc: "拾取后恢复 35% 职业资源", weight: 24 },
    { name: "散落金币袋", kind: "gold", slot: "currency", quality: "white", glyph: "金", color: "#e7b36b", desc: "拾取后获得一小袋金币", weight: 20 }
  ];

  let state = null;
  let dpr = 1;
  let lastTime = 0;
  let keys = {};
  let pointer = { x: 0, y: 0, down: false };
  let moveTarget = null;
  let toastTimer = null;
  let pendingTravel = null;
  let skillSignature = "";
  let normalAttackSignature = "";

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pick = (array) => array[Math.floor(Math.random() * array.length)];
  const formatNumber = (value) => Math.floor(value).toLocaleString("zh-CN");

  function weightedPick(entries) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.item;
    }
    return entries.at(-1).item;
  }

  function monsterProfile(entity) {
    if (!entity.boss) {
      return {
        intro: MONSTER_FLAVOR[entity.name] || "游荡在当前区域的敌对生物。",
        skills: [`近身攻击：基础伤害 ${entity.attack}`, `护甲：防御 ${entity.defense}`]
      };
    }
    const kind = activeMap().boss.specialKind;
    const special = kind === "logs" ? "落木狂暴：在玩家附近生成落木圈" : kind === "devour" ? "地裂吞噬：制造延迟爆发危险区" : kind === "sting" ? "锁定尾刺：瞄准玩家位置并叠加毒层" : "碑裂震击：低血量后制造地裂圈";
    const summon = activeMap().boss.summonMob !== undefined ? "召唤腐工：周期召来普通怪物" : `阶段转换：共 ${activeMap().boss.phases} 个阶段`;
    return { intro: MONSTER_FLAVOR[entity.name] || "当前区域的首领。", skills: [special, summon] };
  }

  function activeMap() { return MAPS[state.currentMapId]; }
  function activeHero() { return CLASSES[state.classId]; }

  function createState(classId) {
    const hero = CLASSES[classId];
    return {
      classId,
      currentMapId: "ash_outskirts",
      player: { x: 480, y: 780, hp: hero.hp, resource: hero.resource * .68, level: 1, exp: 0, nextExp: 120, gold: 40, marks: 0, charge: 0, potion: 3, kills: 0, totalKills: 0, oneMomentUsed: false, attackTimer: 0, invulnerable: 0, cooldowns: [0, 0, 0, 0], targetId: null, previewSkill: null, equipment: { weapon: null, neck: null, boots: null }, poison: 0, visitedMaps: { ash_outskirts: true } },
      entities: [],
      drops: [], particles: [], texts: [], logs: [],
      boss: { active: true, defeated: false, respawn: 0 },
      startedAt: Date.now(),
      quest: { kills: 0, need: 8, completed: false },
      mapProgress: {},
      hazards: [],
      hoveredEntityId: null
    };
  }

  function mapProgress(mapId = state.currentMapId) {
    const rule = MAP_CLEAR_RULES[mapId];
    state.mapProgress ||= {};
    state.mapProgress[mapId] ||= { kills: 0, need: rule.kills, bossDefeated: false, completed: false, rewardClaimed: false, completionAnnounced: false };
    const progress = state.mapProgress[mapId];
    progress.need = rule.kills;
    progress.kills = clamp(Number(progress.kills) || 0, 0, rule.kills);
    progress.bossDefeated = Boolean(progress.bossDefeated);
    progress.completed = progress.kills >= rule.kills && progress.bossDefeated;
    return progress;
  }

  function isForwardExit(exit, mapId = state.currentMapId) {
    return MAP_ORDER.indexOf(exit.target) > MAP_ORDER.indexOf(mapId);
  }

  function primaryExit() {
    const map = activeMap();
    return map.exits.find((exit) => isForwardExit(exit)) || null;
  }

  function createEntities(map) {
    const result = [];
    map.monsterSpawns.forEach((spawn, index) => {
      const type = map.monsterTypes[spawn[2]];
      const level = clamp(map.levelMin + spawn[2] * 2 + index % 3, map.levelMin, map.levelMax);
      result.push({ id: `mob-${index}`, ...type, level, x: spawn[0], y: spawn[1], maxHp: type.hp, respawn: 0, alive: true, hitFlash: 0, wander: Math.random() * 6, poisonTimer: 0 });
    });
    const b = map.boss;
    result.push({ id: b.id, name: b.name, level: map.levelMax + 2, color: b.color, hp: b.hp, maxHp: b.hp, attack: b.attack, defense: b.defense, exp: b.exp, gold: b.gold, radius: b.radius, x: b.x, y: b.y, alive: true, boss: true, hitFlash: 0, phase: 1, respawn: 0, phaseTimer: 0, specialTimer: b.specialInterval, summonTimer: b.summonInterval || 0 });
    return result;
  }

  function loadMap(mapId, spawnX, spawnY, silent) {
    const map = MAPS[mapId];
    const fromMap = state.currentMapId;
    state.currentMapId = mapId;
    state.player.x = spawnX;
    state.player.y = spawnY;
    // Each map entry starts in a protected buffer so a death never creates an unrecoverable low-health loop.
    state.player.hp = playerMaxHp();
    state.player.resource = activeHero().resource;
    state.player.targetId = null;
    moveTarget = null;
    state.player.invulnerable = 3;
    state.player.poison = 0;
    state.entities = createEntities(map);
    state.drops = [];
    state.particles = [];
    state.texts = [];
    state.hazards = [];
    state.hoveredEntityId = null;
    state.boss = { active: true, defeated: false, respawn: 0 };
    state.quest = mapProgress(mapId);
    state.player.visitedMaps[mapId] = true;
    if (!silent) {
      log(`进入 <b>${map.name} · ${map.subtitle}</b>：推荐等级 Lv.${map.levelMin}-${map.levelMax}，${map.dangerLabel}。`, "loot");
      showToast(`${map.name} · ${map.subtitle}（Lv.${map.levelMin}-${map.levelMax}）`);
      if (map.danger === "danger" || map.danger === "desolate") log(`本区为<b style="color:#ee9b91">危险区</b>：实际游戏会按规则结算 PK 爆装，本原型仅作地图切换演示。`, "warn");
      const progress = mapProgress(mapId);
      if (!progress.completed) log(`关卡目标：击败 <b>${progress.need} 只普通怪物</b>并击破<b>${MAP_CLEAR_RULES[mapId].boss}</b>。`, "loot");
    }
    renderAll();
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
    const map = activeMap();
    return Math.min(canvas.clientWidth / 940, canvas.clientHeight / 590);
  }

  function getCamera() {
    const map = activeMap();
    const scale = getViewScale();
    const halfW = canvas.clientWidth / scale / 2;
    const halfH = canvas.clientHeight / scale / 2;
    return { x: clamp(state.player.x - halfW, 0, map.width - halfW * 2), y: clamp(state.player.y - halfH, 0, map.height - halfH * 2) };
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
    loadMap("ash_outskirts", 480, 780, true);
    $("classModal").classList.add("hidden");
    log(`你选择了 <b>${CLASSES[classId].name}</b>，矿道深处传来石碑碎裂声。`);
    log("关卡目标：击败 <b>8 只普通怪物</b>并击破<b>裂碑领主</b>。", "loot");
    log("完成两项目标后，前往地图东侧的<b>发光出口</b>进入雾松林。", "loot");
    showToast("出城后会自动记录目标，点击怪物即可锁定");
    renderAll();
  }

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
      log(`锁定目标：<b>${entity.name}</b>${entity.boss ? ` · 阶段 ${entity.phase}/${activeMap().boss.phases}` : ""}`);
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
      state.player.hp = clamp(state.player.hp + Math.round(hero.hp * .28), 0, playerMaxHp());
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
    if (skill.kind === "召唤") { log("骨卫在场景中现身，接下来 12 秒会协助攻击。", "loot"); state.player.charge = clamp(state.player.charge + 12, 0, 100); }
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
    if (!target.boss) state.quest.kills = Math.min(state.quest.need, state.quest.kills + 1);
    state.player.resource = clamp(state.player.resource + hero.resource * .08, 0, hero.resource);
    state.player.charge = clamp(state.player.charge + (target.boss ? 32 : 12), 0, 100);
    if (target.boss) {
      state.player.marks += 35;
      const map = activeMap();
      log(`<b>首领击破</b>：${target.name} 倒下，个人获得 35 首领印记。`, "loot");
      showToast("首领结算完成：贡献快照已锁定");
      state.boss.defeated = true;
      state.quest.bossDefeated = true;
    } else log(`${target.name} 被击败，获得 ${expGain} 经验与 ${target.gold} 金币。`);
    spark(target.x, target.y, target.boss ? "#e7b36b" : "#d8e8dc", target.boss ? 30 : 16);
    const dropRolls = target.boss ? 2 : (Math.random() < .42 ? 1 : 0);
    for (let roll = 0; roll < dropRolls; roll += 1) spawnDrop(target, roll);
    const mapJustCompleted = checkMapCompletion();
    levelCheck();
    if (mapJustCompleted) autoSaveProgress(activeMap().name);
    state.player.targetId = null;
    moveTarget = null;
  }

  function checkMapCompletion() {
    const map = activeMap();
    const rule = MAP_CLEAR_RULES[map.id];
    const progress = mapProgress();
    if (progress.kills >= progress.need && !progress.killAnnounced) {
      progress.killAnnounced = true;
      if (!progress.bossDefeated) {
        log(`清剿完成：下一步击败区域首领 <b>${rule.boss}</b>。`, "loot");
        showToast(`清剿完成，下一步：击败 ${rule.boss}`);
      }
    }
    progress.completed = progress.kills >= progress.need && progress.bossDefeated;
    if (!progress.completed || progress.completionAnnounced) return false;
    progress.completionAnnounced = true;
    if (!progress.rewardClaimed) {
      progress.rewardClaimed = true;
      state.player.gold += 60;
      state.player.marks += 8;
    }
    if (rule.next) {
      const nextMap = MAPS[rule.next];
      log(`<b>${map.name}通关</b>：60 金币、8 首领印记已发放。前往${rule.exit}进入<b>${nextMap.name}</b>。`, "loot");
      showToast(`${map.name}已通关：前往${rule.exit}进入${nextMap.name}`);
    } else {
      log("<b>纵向切片完成</b>：四张地图全部通关，沙蝎王已被击败。", "loot");
      showToast("恭喜通关：一刀999 纵向切片完成");
    }
    return true;
  }

  function spawnDrop(source, roll = 0) {
    const map = activeMap();
    const mapItem = pick(map.drops);
    const pool = COMMON_DROPS.map((item) => ({ item, weight: item.weight }));
    pool.push({ item: mapItem, weight: source.boss ? 62 : 20 });
    if (source.boss) pool.push({ item: { name: "首领印记碎片", kind: "marks", slot: "currency", quality: "purple", glyph: "印", color: "#a88ce3", desc: "拾取后获得 3 枚首领印记" }, weight: 18 });
    const rolled = weightedPick(pool);
    const item = { ...rolled, id: `item-${Date.now()}-${roll}-${Math.random()}`, x: source.x + rand(-30, 30), y: source.y + rand(-24, 24), source: source.name };
    if (item.kind === "gold") item.amount = Math.round(rand(source.boss ? 70 : 12, source.boss ? 150 : 34));
    state.drops.push(item);
    log(`${source.name} 掉落 <b style="color:${item.color}">${item.name}</b>，靠近后按 F 拾取。`, "loot");
  }

  function collectDrops() {
    const nearby = state.drops.filter((drop) => distance(state.player, drop) < 85);
    if (!nearby.length) { showToast("附近没有可拾取物品"); return; }
    state.inventory = state.inventory || [];
    let collected = 0;
    nearby.forEach((drop) => {
      if (!drop.kind && state.inventory.length >= 12) {
        log(`<b>${drop.name}</b> 未拾取：背包已满。`, "warn");
        return;
      }
      state.drops = state.drops.filter((entry) => entry.id !== drop.id);
      collected += 1;
      if (drop.kind === "health_potion") {
        state.player.potion += 1;
        log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，生命药水数量 +1。`, "loot");
      } else if (drop.kind === "resource_potion") {
        const restored = Math.round(activeHero().resource * .35);
        state.player.resource = clamp(state.player.resource + restored, 0, activeHero().resource);
        log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，恢复 ${restored} ${activeHero().resourceName}。`, "loot");
      } else if (drop.kind === "gold") {
        state.player.gold += drop.amount;
        log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，获得 ${drop.amount} 金币。`, "loot");
      } else if (drop.kind === "marks") {
        state.player.marks += 3;
        log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，首领印记 +3。`, "loot");
      } else {
        state.inventory.push(drop);
        log(`拾取 <b style="color:${drop.color}">${drop.name}</b>，点击背包查看属性。`, "loot");
      }
    });
    if (!collected) showToast("背包已满，装备仍保留在地面");
    renderPlayer();
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
    while (state.player.exp >= state.player.nextExp && state.player.level < 30) {
      state.player.exp -= state.player.nextExp; state.player.level += 1; state.player.nextExp = Math.round(state.player.nextExp * 1.22);
      state.player.hp = playerMaxHp(); state.player.resource = hero.resource;
      log(`<b>等级提升</b>：你已达到 Lv.${state.player.level}，新的地图和装备目标正在解锁。`, "loot");
      showToast(`升级成功：Lv.${state.player.level}`);
    }
  }

  function playerMaxHp() { return activeHero().hp + state.player.level * 18 + equipmentHp(); }

  function nearWaterWell() {
    const map = activeMap();
    return map.id === "red_sand_desert" && map.landmarks.some((landmark) => landmark.type === "well" && distance(state.player, landmark) < 70);
  }

  function nearTown() {
    const town = activeMap().townRect;
    return Boolean(town && state.player.x >= town.x + 28 && state.player.x <= town.x + town.w - 28 && state.player.y >= town.y + 28 && state.player.y <= town.y + town.h - 28);
  }

  function playerDamage(dt) {
    if (state.player.invulnerable > 0) return;
    const atWell = nearWaterWell();
    const atSanctuary = atWell || nearTown();
    const attacker = state.entities.filter((entity) => entity.alive && distance(state.player, entity) < entity.radius + 70).sort((a, b) => distance(state.player, a) - distance(state.player, b))[0];
    if (!atSanctuary && attacker && Math.random() <= dt * (attacker.boss ? .6 : .32)) {
      const amount = Math.max(1, Math.round(attacker.attack * (1 - activeHero().defense / (activeHero().defense + 100))));
      state.player.hp = Math.max(0, state.player.hp - amount);
      textAt(`-${amount}`, state.player.x, state.player.y - 30, "#f16d66", 13); spark(state.player.x, state.player.y, "#f16d66", 4);
      if (activeMap().boss.poisonStacks && attacker.boss) {
        state.player.poison = clamp(state.player.poison + 1, 0, 5);
        if (state.player.poison >= 5) showToast("毒层已满，靠近水井净化");
      }
    }
    // 危险区地面危险区伤害（BOSS阶段二以上）
    state.hazards.forEach((h) => {
      if (h.snap) return;
      h.life -= dt;
      if (h.life <= 0) {
        h.snap = true;
        if (!atSanctuary && distance(state.player, h) < h.r) {
          const amount = Math.max(1, Math.round(h.damage * (1 - activeHero().defense / (activeHero().defense + 100))));
          state.player.hp = Math.max(0, state.player.hp - amount);
          textAt(`-${amount}`, state.player.x, state.player.y - 30, "#f16d66", 14);
          spark(state.player.x, state.player.y, "#f16d66", 6);
        }
      }
    });
    state.hazards = state.hazards.filter((h) => !h.snap || h.fade > 0);
    state.hazards.forEach((h) => { if (h.snap) h.fade -= dt; });
    // 中毒持续伤害
    if (state.player.poison > 0 && !atSanctuary) {
      state.player.poisonTimer = (state.player.poisonTimer || 0) - dt;
      if (state.player.poisonTimer <= 0) {
        state.player.poisonTimer = 1.2;
        const amount = state.player.poison * 4;
        state.player.hp = Math.max(0, state.player.hp - amount);
        textAt(`-${amount}`, state.player.x, state.player.y - 30, "#a88ce3", 12);
      }
    } else if (atSanctuary && state.player.poison > 0) {
      state.player.poison = Math.max(0, state.player.poison - Math.max(1, Math.ceil(dt * (atWell ? 2 : 1))));
      state.player.poisonTimer = 1.2;
      textAt(atWell ? "净化" : "安全区", state.player.x, state.player.y - 40, atWell ? "#5a7090" : "#62d5c6", 14);
    }
    if (atSanctuary && state.player.hp < playerMaxHp()) {
      state.player.hp = clamp(state.player.hp + Math.max(1, Math.round(playerMaxHp() * .1 * dt)), 0, playerMaxHp());
      state.player.resource = clamp(state.player.resource + Math.max(1, Math.round(activeHero().resource * .08 * dt)), 0, activeHero().resource);
    }
    if (state.player.hp <= 0) die();
  }

  function die() {
    state.player.hp = Math.round(playerMaxHp() * .55); state.player.resource = activeHero().resource * .45; state.player.x = 480; state.player.y = 780; state.player.invulnerable = 3; state.player.targetId = null; state.player.poison = 0; moveTarget = null;
    log("<b>你在野外倒下</b>，已传送回灰烬村。本原型保留成长资产，实际游戏会按区域与名字状态结算爆装。", "warn"); showToast("已在灰烬村复活：重新整理状态后再出发");
    if (state.currentMapId !== "ash_outskirts") loadMap("ash_outskirts", 480, 780, true);
  }

  function movePlayer(dt) {
    const hero = activeHero();
    const map = activeMap();
    let dx = 0, dy = 0;
    if (keys.w || keys.ArrowUp) dy -= 1; if (keys.s || keys.ArrowDown) dy += 1; if (keys.a || keys.ArrowLeft) dx -= 1; if (keys.d || keys.ArrowRight) dx += 1;
    if (dx || dy) moveTarget = null;
    if (!dx && !dy && moveTarget) { dx = moveTarget.x - state.player.x; dy = moveTarget.y - state.player.y; if (Math.hypot(dx, dy) < 8) moveTarget = null; }
    const length = Math.hypot(dx, dy) || 1; if (dx || dy) { state.player.x += (dx / length) * hero.speed * dt; state.player.y += (dy / length) * hero.speed * dt; }
    state.player.x = clamp(state.player.x, 55, map.width - 55); state.player.y = clamp(state.player.y, 55, map.height - 55);
    // 出口触发
    map.exits.forEach((exit) => {
      if (state.player.x >= exit.x && state.player.x <= exit.x + exit.w && state.player.y >= exit.y && state.player.y <= exit.y + exit.h) {
        tryTravel(exit);
      }
    });
  }

  function tryTravel(exit) {
    if (pendingTravel && pendingTravel.target === exit.target) return;
    if (isForwardExit(exit) && !mapProgress().completed) {
      const rule = MAP_CLEAR_RULES[state.currentMapId];
      const progress = mapProgress();
      const missing = [];
      if (progress.kills < progress.need) missing.push(`再击败 ${progress.need - progress.kills} 只普通怪物`);
      if (!progress.bossDefeated) missing.push(`击败 ${rule.boss}`);
      const message = `前进出口尚未开启：${missing.join("，")}`;
      showToast(message);
      log(message, "warn");
      state.player.x = exit.x < activeMap().width / 2 ? exit.x + exit.w + 70 : exit.x - 70;
      return;
    }
    const target = MAPS[exit.target];
    if (state.player.level < target.levelMin - 2) {
      pendingTravel = exit;
      const ok = window.confirm(`即将进入 ${target.name}（推荐 Lv.${target.levelMin}-${target.levelMax}），你当前 Lv.${state.player.level}。\n危险等级：${target.dangerLabel}\n是否仍要进入？`);
      pendingTravel = null;
      if (!ok) {
        // 把玩家弹回安全方向
        state.player.x = Math.max(60, exit.x - 80);
        showToast("已取消进入");
        return;
      }
    }
    log(`通过出口前往 <b>${target.name}</b>……`, "loot");
    loadMap(exit.target, exit.spawn.x, exit.spawn.y);
  }

  function updateEntities(dt) {
    const map = activeMap();
    state.entities.forEach((entity) => {
      entity.hitFlash = Math.max(0, entity.hitFlash - dt);
      if (!entity.alive) {
        entity.respawn -= dt;
        if (entity.respawn <= 0) { entity.alive = true; entity.hp = entity.maxHp; if (entity.boss) { state.boss.defeated = false; entity.phase = 1; entity.specialTimer = map.boss.specialInterval; entity.summonTimer = map.boss.summonInterval || 0; log(`<b>首领情报</b>：${entity.name} 重新进入场景。`, "warn"); } }
        return;
      }
      if (!entity.boss) { entity.wander += dt; const drift = Math.sin(entity.wander * .7) * 3; entity.x = clamp(entity.x + drift * dt, 90, map.width - 90); }
      if (entity.boss) updateBoss(entity, dt);
    });
  }

  function updateBoss(boss, dt) {
    const map = activeMap();
    const hpRatio = boss.hp / boss.maxHp;
    const def = map.boss;
    let newPhase = 1;
    if (def.phases >= 3) {
      newPhase = hpRatio > def.phase1Trigger ? 1 : (hpRatio > def.phase2Trigger ? 2 : 3);
    } else if (def.phases === 2) {
      newPhase = hpRatio > def.phase1Trigger ? 1 : 2;
    }
    if (newPhase !== boss.phase) {
      boss.phase = newPhase;
      const phaseName = def.phases >= 3 ? (newPhase === 2 ? "地裂逼迫移动" : "吞噬技能书幻影") : (map.id === "pine_forest" ? "落木狂暴" : map.id === "red_sand_desert" ? "水井净化" : "狂暴");
      log(`<b>${boss.name}</b> 进入阶段 ${newPhase}：${phaseName}。`, "warn");
      showToast(`${boss.name} 阶段 ${newPhase}：${phaseName}`);
      spark(boss.x, boss.y, "#e7b36b", 24);
    }
    // 召唤腐工（坑道尸皇阶段1）
    if (def.summonMob !== undefined && boss.phase === 1) {
      boss.summonTimer -= dt;
      if (boss.summonTimer <= 0) {
        boss.summonTimer = def.summonInterval;
        const aliveMobs = state.entities.filter((e) => e.alive && !e.boss).length;
        if (aliveMobs < def.summonMax + 8) {
          const type = map.monsterTypes[def.summonMob];
          const id = `summon-${Date.now()}-${Math.random()}`;
          state.entities.push({ id, ...type, level: map.levelMax, x: boss.x + rand(-80, 80), y: boss.y + rand(-60, 60), maxHp: type.hp, alive: true, hitFlash: 0, wander: Math.random() * 6, poisonTimer: 0 });
          log(`<b>${boss.name}</b> 召唤了一只 ${type.name}。`, "warn");
          spark(boss.x + 60, boss.y, "#7a5a3a", 8);
        }
      }
    }
    // 危险区技能
    boss.specialTimer -= dt;
    if (boss.specialTimer <= 0 && boss.phase >= 2) {
      boss.specialTimer = Math.max(2, def.specialInterval - boss.phase * 0.8);
      spawnHazard(boss);
    }
  }

  function spawnHazard(boss) {
    const map = activeMap();
    const def = map.boss;
    const radius = def.specialKind === "logs" ? 50 : def.specialKind === "devour" ? 70 : 55;
    const damage = Math.round(boss.attack * 1.4);
    let target;
    if (def.specialKind === "logs") {
      // 森林巨猿：在玩家附近随机落木
      target = { x: state.player.x + rand(-100, 100), y: state.player.y + rand(-100, 100) };
    } else if (def.specialKind === "sting") {
      // 沙蝎王：尾刺方向
      target = { x: state.player.x, y: state.player.y };
    } else {
      // 坑道尸皇：地裂/吞噬在前方
      const angle = rand(0, Math.PI * 2);
      target = { x: boss.x + Math.cos(angle) * rand(80, 200), y: boss.y + Math.sin(angle) * rand(80, 200) };
    }
    target.r = radius;
    target.life = 1.2;
    target.snap = false;
    target.fade = 0.5;
    target.damage = damage;
    state.hazards.push(target);
    if (Math.random() < 0.6) log(`<b>${boss.name}</b> 蓄力中：地面危险区即将爆发，离开红圈！`, "warn");
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
    const map = activeMap();
    const scale = getViewScale(); const view = getCamera(); const width = canvas.clientWidth / scale; const height = canvas.clientHeight / scale;
    ctx.save(); ctx.scale(scale, scale); ctx.translate(-view.x, -view.y);
    ctx.fillStyle = "#1a2c23"; ctx.fillRect(view.x, view.y, width, height);
    const p = map.palette;
    ctx.fillStyle = p.ground; ctx.fillRect(0, 0, map.width, map.height);
    // 道路
    ctx.strokeStyle = p.road; ctx.lineWidth = 70; map.paths.forEach((path) => { ctx.beginPath(); ctx.moveTo(path[0], path[1]); ctx.bezierCurveTo(path[2], path[3], path[4], path[5], path[6], path[7]); if (path[8] !== undefined) ctx.bezierCurveTo(path[8], path[9], path[10], path[11], path[12], path[13]); ctx.stroke(); });
    ctx.strokeStyle = p.roadHi; ctx.lineWidth = 30; map.paths.forEach((path) => { ctx.beginPath(); ctx.moveTo(path[0], path[1]); ctx.bezierCurveTo(path[2], path[3], path[4], path[5], path[6], path[7]); if (path[8] !== undefined) ctx.bezierCurveTo(path[8], path[9], path[10], path[11], path[12], path[13]); ctx.stroke(); });
    // 城镇与特殊区
    if (map.townRect) { ctx.fillStyle = p.town; ctx.fillRect(map.townRect.x, map.townRect.y, map.townRect.w, map.townRect.h); ctx.strokeStyle = p.townBorder; ctx.lineWidth = 3; ctx.strokeRect(map.townRect.x, map.townRect.y, map.townRect.w, map.townRect.h); }
    if (map.specialRect) { ctx.fillStyle = p.special; ctx.fillRect(map.specialRect.x, map.specialRect.y, map.specialRect.w, map.specialRect.h); ctx.strokeStyle = p.specialBorder; ctx.strokeRect(map.specialRect.x, map.specialRect.y, map.specialRect.w, map.specialRect.h); }
    // 水道
    ctx.strokeStyle = p.water; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(20, 300); ctx.bezierCurveTo(500, 420, 680, 250, 1050, 390); ctx.bezierCurveTo(1470, 550, 1660, 210, map.width - 10, 280); ctx.stroke();
    // 网格
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1; for (let x = 0; x < map.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, map.height); ctx.stroke(); } for (let y = 0; y < map.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(map.width, y); ctx.stroke(); }
    drawLandmarks(map);
    drawExits(map);
    drawHazards();
    state.drops.forEach(drawDrop); state.entities.filter((entity) => entity.alive).forEach(drawEntity); drawSkillRangePreview(); drawPlayer(); state.particles.forEach(drawParticle); state.texts.forEach(drawText); drawMonsterTooltip(view, width, height);
    if (moveTarget) { ctx.strokeStyle = "rgba(98, 213, 198, .7)"; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.arc(moveTarget.x, moveTarget.y, 13, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }

  function drawLandmarks(map) {
    ctx.save();
    map.landmarks.forEach((l) => {
      ctx.fillStyle = l.color; ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2); ctx.fill();
      if (l.type === "tower" || l.type === "tree" || l.type === "beam" || l.type === "dune" || l.type === "ruin") { ctx.fillStyle = "rgba(236, 202, 134, .35)"; ctx.fillRect(l.x - 3, l.y - l.r - 15, 6, 13); }
      if (l.type === "lantern") { ctx.fillStyle = "rgba(255, 180, 90, .65)"; ctx.beginPath(); ctx.arc(l.x, l.y, l.r + 6, 0, Math.PI * 2); ctx.fill(); }
      if (l.type === "well") { ctx.fillStyle = "rgba(120, 160, 200, .55)"; ctx.beginPath(); ctx.arc(l.x, l.y, l.r - 4, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.fillStyle = "rgba(231, 179, 107, .55)"; ctx.font = "12px Georgia";
    map.landmarkLabels.forEach((l) => ctx.fillText(l.text, l.x, l.y));
    ctx.restore();
  }

  function drawExits(map) {
    ctx.save();
    map.exits.forEach((exit) => {
      const target = MAPS[exit.target];
      const forward = isForwardExit(exit, map.id);
      const unlocked = !forward || mapProgress(map.id).completed;
      const pulse = 0.4 + Math.sin(Date.now() / 400) * 0.2;
      const color = unlocked ? (forward ? "231, 179, 107" : "98, 213, 198") : "241, 109, 102";
      ctx.fillStyle = `rgba(${color}, ${unlocked ? pulse * 0.35 : 0.12})`;
      ctx.fillRect(exit.x, exit.y, exit.w, exit.h);
      ctx.strokeStyle = `rgba(${color}, ${unlocked ? 0.5 + pulse * 0.3 : 0.55})`;
      ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(exit.x, exit.y, exit.w, exit.h); ctx.setLineDash([]);
      // 标签
      ctx.fillStyle = "rgba(9, 16, 19, .8)";
      const labelW = 110, labelH = 38;
      const lx = exit.x + exit.w / 2 - labelW / 2;
      const ly = exit.y + exit.h / 2 - labelH / 2;
      roundedRect(lx, ly, labelW, labelH, 4); ctx.fill();
      ctx.strokeStyle = `rgba(${color}, .5)`; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = unlocked ? (forward ? "#e7b36b" : "#62d5c6") : "#ee9b91"; ctx.font = "600 12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`${forward ? "→" : "←"} ${exit.label}`, exit.x + exit.w / 2, ly + 16);
      ctx.fillStyle = "#8d9ca0"; ctx.font = "10px sans-serif";
      ctx.fillText(unlocked ? (forward ? "已开启 · 进入下一关" : "返回上一关") : "未开启 · 完成当前关卡", exit.x + exit.w / 2, ly + 30);
      ctx.textAlign = "start";
    });
    ctx.restore();
  }

  function drawHazards() {
    ctx.save();
    state.hazards.forEach((h) => {
      const alpha = h.snap ? Math.max(0, h.fade * 2) : (1.2 - h.life) / 1.2;
      if (h.snap) {
        // 爆发瞬间
        ctx.fillStyle = `rgba(241, 109, 102, ${alpha * 0.7})`;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255, 200, 100, ${alpha})`; ctx.lineWidth = 3; ctx.stroke();
      } else {
        // 蓄力预警
        ctx.fillStyle = `rgba(241, 109, 102, ${alpha * 0.25})`;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(241, 109, 102, ${alpha * 0.8})`; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        // 倒计时圆环
        const progress = h.life / 1.2;
        ctx.strokeStyle = `rgba(255, 180, 90, ${alpha})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r - 4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawEntity(entity) {
    ctx.save(); const selected = entity.id === state.player.targetId; const scale = entity.boss ? 1.22 : 1; if (selected) { ctx.strokeStyle = activeHero().color; ctx.globalAlpha = .8; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.radius + 9, 0, Math.PI * 2); ctx.stroke(); } if (entity.hitFlash > 0) ctx.globalAlpha = .45;
    ctx.fillStyle = entity.boss ? entity.color : entity.color; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.radius * scale, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = entity.boss ? "#f4c484" : "rgba(242, 220, 174, .7)"; ctx.beginPath(); ctx.arc(entity.x - entity.radius * .28, entity.y - entity.radius * .3, entity.boss ? 6 : 4, 0, Math.PI * 2); ctx.fill(); if (entity.boss) { ctx.strokeStyle = "rgba(241, 109, 102, .65)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.radius * scale + 8, 0, Math.PI * 2); ctx.stroke(); if (entity.phase >= 2) { ctx.strokeStyle = "rgba(255, 180, 90, .8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(entity.x, entity.y, entity.radius * scale + 14, 0, Math.PI * 2); ctx.stroke(); } }
    ctx.restore(); drawNameplate(entity);
  }

  function drawNameplate(entity) {
    const width = entity.boss ? 160 : 118;
    const left = entity.x - width / 2;
    const top = entity.y - entity.radius - (entity.boss ? 48 : 39);
    ctx.fillStyle = "rgba(9, 16, 19, .82)";
    roundedRect(left, top, width, 31, 3);
    ctx.fill();
    ctx.fillStyle = entity.boss ? "#f3b1a8" : "#c7d2cb";
    ctx.font = `${entity.boss ? 11 : 9}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`Lv.${entity.level} ${entity.name}${entity.boss ? ` · P${entity.phase}` : ""}`, entity.x, top + 11);
    ctx.fillStyle = "#8d9ca0";
    ctx.font = "8px sans-serif";
    ctx.fillText(`${Math.ceil(entity.hp)} / ${entity.maxHp}`, entity.x, top + 21);
    ctx.fillStyle = "#0c1518";
    ctx.fillRect(left + 7, top + 25, width - 14, 4);
    ctx.fillStyle = entity.boss ? "#f16d66" : "#8fc7a2";
    ctx.fillRect(left + 7, top + 25, (width - 14) * (entity.hp / entity.maxHp), 4);
    ctx.textAlign = "start";
  }

  function drawMonsterTooltip(view, viewWidth, viewHeight) {
    const entity = state.entities.find((entry) => entry.id === state.hoveredEntityId && entry.alive);
    if (!entity) return;
    const profile = monsterProfile(entity);
    const width = 244;
    const height = entity.boss ? 112 : 104;
    const x = clamp(entity.x + entity.radius + 18, view.x + 12, view.x + viewWidth - width - 12);
    const y = clamp(entity.y - entity.radius - 18, view.y + 12, view.y + viewHeight - height - 12);
    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 20, .96)";
    ctx.strokeStyle = entity.boss ? "rgba(241, 109, 102, .55)" : "rgba(98, 213, 198, .42)";
    ctx.lineWidth = 1;
    roundedRect(x, y, width, height, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = entity.boss ? "#f3b1a8" : "#eef3f4";
    ctx.font = "600 11px sans-serif";
    ctx.fillText(`Lv.${entity.level} ${entity.name}${entity.boss ? " · 区域首领" : ""}`, x + 11, y + 17);
    ctx.fillStyle = "#e7b36b";
    ctx.font = "9px sans-serif";
    ctx.fillText(`生命 ${Math.ceil(entity.hp)}/${entity.maxHp} · 攻击 ${entity.attack} · 防御 ${entity.defense}`, x + 11, y + 33);
    ctx.fillStyle = "#9fadaf";
    ctx.fillText(profile.intro, x + 11, y + 49, width - 22);
    ctx.fillStyle = "#62d5c6";
    ctx.fillText("技能", x + 11, y + 67);
    ctx.fillStyle = "#c7d2cb";
    profile.skills.forEach((skill, index) => ctx.fillText(`· ${skill}`, x + 11, y + 83 + index * 14));
    ctx.restore();
  }

  function drawDrop(drop) { ctx.save(); ctx.translate(drop.x, drop.y); ctx.rotate(Math.PI / 4); ctx.fillStyle = drop.color; ctx.globalAlpha = .9; ctx.fillRect(-6, -6, 12, 12); ctx.globalAlpha = .28; ctx.fillRect(-11, -11, 22, 22); ctx.restore(); }
  function drawSkillRangePreview() {
    const index = state.player.previewSkill;
    if (!Number.isInteger(index)) return;
    const skill = activeHero().skills[index];
    if (!skill?.area) return;
    const hero = activeHero();
    ctx.save();
    ctx.fillStyle = `${hero.color}22`;
    ctx.strokeStyle = hero.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, skill.area, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hero.color;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${skill.name} · ${skill.areaLabel}`, state.player.x, state.player.y + skill.area + 16);
    ctx.restore();
  }

  function drawPlayer() {
    const hero = activeHero();
    const maxHp = playerMaxHp();
    const left = state.player.x - 44;
    const top = state.player.y - 56;
    ctx.save();
    ctx.globalAlpha = state.player.invulnerable > 0 && Math.floor(state.player.invulnerable * 8) % 2 === 0 ? .45 : 1;
    ctx.fillStyle = "rgba(8, 15, 18, .82)";
    roundedRect(left, top, 88, 24, 3);
    ctx.fill();
    ctx.fillStyle = "#eef3f4";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Lv.${state.player.level} 灰烬旅人`, state.player.x, top + 10);
    ctx.fillStyle = "#0c1518";
    ctx.fillRect(left + 6, top + 15, 76, 5);
    ctx.fillStyle = "#f16d66";
    ctx.fillRect(left + 6, top + 15, 76 * clamp(state.player.hp / maxHp, 0, 1), 5);
    ctx.fillStyle = hero.color;
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, 25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#102027";
    ctx.beginPath();
    ctx.arc(state.player.x + 6, state.player.y - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    if (state.player.poison > 0) {
      ctx.fillStyle = `rgba(168, 140, 227, ${0.3 + state.player.poison * 0.12})`;
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, 28, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.player.charge >= 100) {
      ctx.strokeStyle = "#e7b36b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawParticle(particle) { ctx.save(); ctx.globalAlpha = clamp(particle.life * 2, 0, 1); ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, particle.size, particle.size); ctx.restore(); }
  function drawText(text) { ctx.save(); ctx.globalAlpha = clamp(text.life * 2, 0, 1); ctx.fillStyle = text.color; ctx.font = `700 ${text.size}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(text.message, text.x, text.y); ctx.restore(); }

  function renderTarget() { const target = state?.entities.find((entity) => entity.id === state.player.targetId && entity.alive); $("targetText").textContent = target ? target.name : "未锁定目标"; $("targetHint").textContent = target ? `${Math.max(0, Math.round(target.hp))} / ${target.maxHp} HP` : "靠近怪物开始战斗"; }
  function renderLog() { $("eventLog").innerHTML = state.logs.slice().reverse().map((entry) => `<div class="event-entry ${entry.type}">${entry.message}</div>`).join(""); }

  function renderPlayer() {
    const hero = activeHero(); const maxHp = playerMaxHp(); const maxResource = hero.resource; const power = hero.attack + state.player.level * 4 + Object.values(state.player.equipment).reduce((sum, item) => sum + (item?.power || 0), 0) + hero.defense * 2;
    $("avatar").textContent = hero.glyph; $("avatar").style.color = hero.color; $("avatar").style.borderColor = hero.color; $("className").textContent = hero.name; $("playerName").textContent = `${hero.name} · 灰烬旅人`; $("powerText").textContent = formatNumber(power); $("actionResourceName").textContent = hero.resourceName; $("actionResourceText").textContent = `${Math.ceil(state.player.resource)} / ${maxResource}`; $("actionResourceBar").style.width = `${clamp(state.player.resource / maxResource * 100, 0, 100)}%`; $("expText").textContent = `${state.player.exp} / ${state.player.nextExp}`; $("expBar").style.width = `${clamp(state.player.exp / state.player.nextExp * 100, 0, 100)}%`; $("goldText").textContent = formatNumber(state.player.gold); $("markText").textContent = `${state.player.marks} / 800`; $("potionCount").textContent = state.player.potion;
    const questProgress = state.quest.completed ? 100 : state.quest.kills / state.quest.need * 70 + (state.quest.bossDefeated ? 30 : 0); $("questBar").style.width = `${questProgress}%`; $("questText").textContent = `${state.quest.kills} / ${state.quest.need} 普通怪 · Boss ${state.quest.bossDefeated ? "已击败" : "未击败"}`;
  }

  function objectiveView() {
    const map = activeMap();
    const rule = MAP_CLEAR_RULES[map.id];
    const progress = mapProgress();
    if (progress.completed && !rule.next) return { step: "全部完成", title: "纵向切片已通关", text: "四张地图与四名区域首领均已完成。", complete: true };
    if (progress.completed) return { step: "步骤 3 / 3", title: `前往${rule.exit}`, text: `走入金色出口，进入下一关 ${MAPS[rule.next].name}。`, complete: true };
    if (progress.kills < progress.need) return { step: "步骤 1 / 3", title: "清剿区域怪物", text: `击败 ${progress.need} 只普通怪物，当前 ${progress.kills}/${progress.need}。`, complete: false };
    return { step: "步骤 2 / 3", title: `击败 ${rule.boss}`, text: "普通怪清剿已完成，前往首领区域完成关卡。", complete: false };
  }

  function renderMapObjective() {
    const map = activeMap();
    const rule = MAP_CLEAR_RULES[map.id];
    const progress = mapProgress();
    const view = objectiveView();
    $("mapObjective").classList.toggle("complete", view.complete);
    $("mapObjectiveState").textContent = view.step;
    $("mapObjectiveTitle").textContent = view.title;
    $("mapObjectiveText").textContent = view.text;
    $("mapObjectiveChecks").innerHTML = `<span class="${progress.kills >= progress.need ? "done" : "current"}">${progress.kills >= progress.need ? "✓" : "○"} 普通怪 ${progress.kills}/${progress.need}</span><span class="${progress.bossDefeated ? "done" : progress.kills >= progress.need ? "current" : ""}">${progress.bossDefeated ? "✓" : "○"} ${rule.boss}</span>${rule.next ? `<span class="${progress.completed ? "current" : ""}">${progress.completed ? "→" : "○"} ${rule.exit}</span>` : `<span class="${progress.completed ? "done" : ""}">${progress.completed ? "✓" : "○"} 最终结算</span>`}`;
    $("questTitle").textContent = `肃清${map.name}`;
    $("questDescription").textContent = rule.next ? `完成清怪与首领目标，解锁${rule.exit}并进入${MAPS[rule.next].name}。` : "完成清怪与首领目标，结束本次四图纵向切片。";
    $("questTag").textContent = progress.completed ? (rule.next ? "出口已开启" : "已通关") : "进行中";
    $("questReward").textContent = progress.rewardClaimed ? "通关奖励已领取" : "通关奖励：60 金币 · 8 印记";
  }

  function renderMapHeader() {
    const map = activeMap();
    $("mapTitle").textContent = `${map.name} · ${map.subtitle}`;
    $("mapLevelRange").textContent = `推荐 Lv.${map.levelMin}-${map.levelMax}`;
    const dangerEl = $("mapDanger");
    dangerEl.textContent = map.dangerLabel;
    dangerEl.className = `pill ${map.danger === "safe" ? "safe" : map.danger === "danger" || map.danger === "desolate" ? "danger" : ""}`;
    // 区域动态
    const dynamics = [];
    if (state.boss.defeated) dynamics.push(`<span class="world-event"><i></i> 首领已击破 · ${Math.ceil(state.boss.respawn)}s 后刷新</span>`);
    else dynamics.push(`<span class="world-event"><i></i> 首领在场 · 阶段 ${state.entities.find((e) => e.boss)?.phase || 1}</span>`);
    const rule = MAP_CLEAR_RULES[map.id];
    const progress = mapProgress();
    if (!rule.next && progress.completed) dynamics.push(`<span class="world-event ready"><i class="gold"></i> 四图通关 · 纵向切片完成</span>`);
    else if (rule.next) dynamics.push(`<span class="world-event ${progress.completed ? "ready" : "locked"}"><i class="gold"></i> ${rule.exit}${progress.completed ? `已开启 · 前往 ${MAPS[rule.next].name}` : "未开启 · 完成清怪与首领目标"}</span>`);
    $("mapDynamics").innerHTML = dynamics.join("");
  }

  function renderRegion() {
    const map = activeMap();
    const idx = MAP_ORDER.indexOf(map.id);
    const html = MAP_ORDER.map((id, i) => {
      const m = MAPS[id];
      const isCurrent = id === map.id;
      const isVisited = state.player.visitedMaps[id];
      const accessible = Math.abs(i - idx) <= 1;
      const progress = mapProgress(id);
      const progressLabel = progress.completed ? "已通关" : isCurrent || progress.kills > 0 || progress.bossDefeated ? `进行中 ${progress.kills}/${progress.need}` : "未开始";
      const dangerCls = m.danger === "safe" ? "safe" : m.danger === "danger" || m.danger === "desolate" ? "danger" : "";
      return `<button class="region-node ${isCurrent ? "current" : ""} ${isVisited ? "visited" : ""} ${accessible ? "accessible" : ""}" data-map-id="${id}" title="${m.name}：推荐 Lv.${m.levelMin}-${m.levelMax}，${m.dangerLabel}${isVisited ? "" : "（未到访）"}">
        <span class="region-name">${m.name}</span>
        <span class="region-level">Lv.${m.levelMin}-${m.levelMax}</span>
        <span class="region-danger ${dangerCls}">${m.dangerLabel}</span>
        <span class="region-progress ${progress.completed ? "done" : ""}">${progressLabel}</span>
      </button>`;
    }).join("");
    $("regionList").innerHTML = html;
    $("regionList").querySelectorAll("[data-map-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.mapId;
        if (id === map.id) return;
        const target = MAPS[id];
        const exit = map.exits.find((e) => e.target === id);
        if (!exit) { showToast(`${target.name} 不相邻，需要先走到相邻地图`); return; }
        if (isForwardExit(exit) && !mapProgress().completed) {
          const progress = mapProgress();
          const rule = MAP_CLEAR_RULES[map.id];
          showToast(`尚未通关：普通怪 ${progress.kills}/${progress.need}，${rule.boss}${progress.bossDefeated ? "已击败" : "未击败"}`);
          return;
        }
        showToast(`${target.name} 在场景边缘的发光出口处，请走到出口触发切换`);
      });
    });
  }

  function renderNormalAttack() {
    const hero = activeHero();
    if (normalAttackSignature === hero.name) return;
    normalAttackSignature = hero.name;
    const resourceEffect = state.classId === "warrior" ? "命中额外获得 6 怒气。" : state.classId === "mage" ? "发射炎弹并消耗 8 法力。" : "命中获得 4 符力。";
    $("normalAttackBtn").innerHTML = `<span class="attack-key">J</span><strong>普攻</strong><small>100% 攻击</small><span class="skill-tooltip"><b>普通攻击</b><span>对当前锁定目标造成 100% 主属性伤害。${resourceEffect}</span><em>靠近目标后可连续使用</em></span>`;
  }

  function renderSkills() {
    const hero = activeHero();
    const signature = `${state.classId}:${state.player.cooldowns.map((cooldown) => Math.ceil(cooldown)).join(",")}`;
    if (skillSignature === signature) return;
    skillSignature = signature;
    $("skillBar").innerHTML = hero.skills.map((skill, index) => `<button class="skill-button" data-skill="${index}" aria-label="${skill.name}"><span class="skill-key">${index + 1}</span><strong>${skill.name}</strong><small>${skill.cost} ${hero.resourceName}</small><span class="skill-tooltip"><b>${skill.name} · ${skill.kind}</b><span>${skill.desc}</span><em>${skill.area ? `范围：以角色为中心 ${skill.areaLabel}` : `施法距离：${Math.round(skill.range / 30)} 格`} · 冷却 ${skill.cd} 秒</em></span>${state.player.cooldowns[index] > 0 ? `<span class="cooldown">${Math.ceil(state.player.cooldowns[index])}</span>` : ""}</button>`).join("");
    $("skillBar").querySelectorAll("button").forEach((button) => { button.disabled = state.player.cooldowns[Number(button.dataset.skill)] > 0; });
  }

  function renderEquipment() { const labels = { weapon: "武器", neck: "项链", boots: "靴子" }; $("equipmentGrid").innerHTML = Object.keys(labels).map((slot) => { const item = state.player.equipment[slot]; return `<button class="equipment-slot ${item ? "filled" : ""}" title="${item ? `${item.name}：${item.desc}` : `${labels[slot]}空位`}">${item ? `<span class="slot-glyph">${item.glyph}</span><span class="slot-name">${labels[slot]}</span>` : `<span class="slot-glyph">+</span><span class="slot-name">${labels[slot]}</span>`}</button>`; }).join(""); }
  function renderInventory() { const inventory = state.inventory || []; $("inventoryCount").textContent = `${inventory.length}/12`; $("inventoryGrid").innerHTML = Array.from({ length: 12 }, (_, index) => { const item = inventory[index]; return `<button class="inventory-slot ${item ? "" : "empty"}" data-item-index="${index}" title="${item ? `${item.name}：${item.desc}` : "空背包格"}">${item ? `<span class="quality-line" style="color:${item.color}"></span><span class="slot-glyph" style="color:${item.color}">${item.glyph}</span>${item.enhance ? `<span class="enhance">+${item.enhance}</span>` : ""}` : ""}</button>`; }).join(""); $("inventoryGrid").querySelectorAll("[data-item-index]").forEach((button) => { button.addEventListener("click", () => equipItem(inventory[Number(button.dataset.itemIndex)])); }); }
  function renderBoss() { const boss = state.entities.find((entity) => entity.boss); if (!boss) return; $("bossAlertText").textContent = boss.alive ? `${boss.name} · ${Math.ceil(boss.hp / boss.maxHp * 100)}% 生命 · 阶段 ${boss.phase}/${activeMap().boss.phases}` : `已击破 · ${Math.ceil(boss.respawn)} 秒后刷新`; }
  function renderAll() { if (!state) return; drawWorld(); renderMapHeader(); renderMapObjective(); renderRegion(); renderPlayer(); renderTarget(); renderNormalAttack(); renderSkills(); renderEquipment(); renderInventory(); renderLog(); renderBoss(); $("coords").textContent = `坐标 ${Math.round(state.player.x)}, ${Math.round(state.player.y)}`; }

  function persistGame() {
    if (!state) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ classId: state.classId, currentMapId: state.currentMapId, player: state.player, inventory: state.inventory || [], equipment: state.player.equipment, mapProgress: state.mapProgress }));
    return true;
  }

  function autoSaveProgress(mapName) {
    if (!persistGame()) return;
    log(`<b>${mapName}通关进度已自动保存</b>：刷新或任务中断后会从当前地图恢复。`, "loot");
    showToast(`${mapName}已通关并自动保存`);
  }

  function saveGame() { if (!persistGame()) return; showToast("进度已保存在本机浏览器"); log("进度已保存：下次打开可继续当前职业、装备与地图通关状态。", "loot"); }
  function loadGame() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !CLASSES[saved.classId]) return false;
      state = createState(saved.classId);
      Object.assign(state.player, saved.player);
      state.player.previewSkill = null;
      state.player.equipment = saved.equipment || saved.player.equipment || {};
      state.inventory = saved.inventory || [];
      state.mapProgress = saved.mapProgress || {};
      if (saved.quest && saved.currentMapId && !state.mapProgress[saved.currentMapId]) state.mapProgress[saved.currentMapId] = saved.quest;
      const startMap = saved.currentMapId && MAPS[saved.currentMapId] ? saved.currentMapId : "ash_outskirts";
      loadMap(startMap, state.player.x || 480, state.player.y || 780, true);
      $("classModal").classList.add("hidden");
      log("已恢复本机进度：服务器规则仍以当前版本为准。", "loot");
      return true;
    } catch { return false; }
  }
  function resetGame() { localStorage.removeItem(STORAGE_KEY); state = null; $("classModal").classList.remove("hidden"); showToast("请选择职业开始新的边境旅程"); }
  function setupClasses() { $("classOptions").innerHTML = Object.entries(CLASSES).map(([id, hero]) => `<button class="class-option" data-class="${id}" style="--class-color:${hero.color}"><span class="class-glyph">${hero.glyph}</span><span><h3>${hero.name}</h3><p>${hero.subtitle}</p><span class="class-stat">生命 ${hero.hp} · ${hero.resourceName} ${hero.resource}</span></span></button>`).join(""); $("classOptions").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => chooseClass(button.dataset.class))); }

  function setupInput() {
    window.addEventListener("keydown", (event) => { keys[event.key] = true; const key = event.key.toLowerCase(); if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault(); if (key === "j") normalAttack(); if (key === "f") collectDrops(); if (key === "q") usePotion(); if (key === "r") oneMoment(); if (key === "t") { const exit = primaryExit(); if (exit) tryTravel(exit); else showToast(mapProgress().completed ? "四张地图已全部通关" : objectiveView().text); } if (/^[1-4]$/.test(key)) castSkill(Number(key) - 1); }); window.addEventListener("keyup", (event) => { keys[event.key] = false; });
    canvas.addEventListener("pointerdown", (event) => { pointer.down = true; const point = canvasPoint(event); const target = state?.entities.find((entity) => entity.alive && distance(point, entity) < entity.radius + 22); if (target) selectTarget(target); else moveTarget = point; }); canvas.addEventListener("pointerup", () => { pointer.down = false; });
    canvas.addEventListener("pointermove", (event) => { if (!state) return; const point = canvasPoint(event); pointer.x = point.x; pointer.y = point.y; const hovered = state.entities.filter((entity) => entity.alive).sort((a, b) => Number(b.boss) - Number(a.boss)).find((entity) => distance(point, entity) < entity.radius + 18); state.hoveredEntityId = hovered?.id || null; });
    canvas.addEventListener("pointerleave", () => { if (state) state.hoveredEntityId = null; });
    $("skillBar").addEventListener("click", (event) => { const button = event.target.closest("[data-skill]"); if (button) castSkill(Number(button.dataset.skill)); });
    $("skillBar").addEventListener("pointerover", (event) => { const button = event.target.closest("[data-skill]"); if (button && state) state.player.previewSkill = Number(button.dataset.skill); });
    $("skillBar").addEventListener("pointerleave", () => { if (state) state.player.previewSkill = null; });
    $("normalAttackBtn").addEventListener("click", normalAttack); $("potionBtn").addEventListener("click", usePotion); $("saveBtn").addEventListener("click", saveGame); $("resetBtn").addEventListener("click", resetGame); $("inventoryHint").addEventListener("click", () => showToast("背包装备会影响战力，锁定只防误操作，不提供死亡保护")); document.querySelectorAll("[data-move]").forEach((button) => { button.addEventListener("pointerdown", () => { keys[{ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[button.dataset.move]] = true; }); button.addEventListener("pointerup", () => { keys[{ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[button.dataset.move]] = false; }); button.addEventListener("pointerleave", () => { keys[{ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[button.dataset.move]] = false; }); });
  }

  function usePotion() { if (!state || state.player.potion <= 0) { showToast("生命药水已用完"); return; } const maxHp = playerMaxHp(); if (state.player.hp >= maxHp) { showToast("生命值已满"); return; } state.player.potion -= 1; const restore = Math.round(maxHp * .32); state.player.hp = clamp(state.player.hp + restore, 0, maxHp); textAt(`+${restore}`, state.player.x, state.player.y - 32, "#78b6ec", 15); log(`使用生命药水，恢复 ${restore} 点生命。`); }

  function frame(timestamp) { const dt = Math.min((timestamp - lastTime) / 1000 || 0, .05); lastTime = timestamp; update(dt); requestAnimationFrame(frame); }
  if (new URLSearchParams(window.location.search).has("e2e")) {
    window.__ONEKNIFE_E2E__ = {
      snapshot: () => state ? JSON.parse(JSON.stringify({
        currentMapId: state.currentMapId,
        classId: state.classId,
        player: { x: state.player.x, y: state.player.y, hp: state.player.hp, resource: state.player.resource, poison: state.player.poison, level: state.player.level, potion: state.player.potion, targetId: state.player.targetId },
        entities: state.entities.map((entity) => ({ id: entity.id, x: entity.x, y: entity.y, hp: entity.hp, alive: entity.alive, boss: Boolean(entity.boss) })),
        progress: state.mapProgress,
        logs: state.logs.slice(-6).map((entry) => entry.message)
      })) : null
    };
  }
  setupClasses(); setupInput(); resizeCanvas(); window.addEventListener("resize", resizeCanvas); if (!loadGame()) { $("classModal").classList.remove("hidden"); } requestAnimationFrame(frame);
})();
