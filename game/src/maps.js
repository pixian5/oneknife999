import { MONSTER_FLAVOR, MONSTER_BEHAVIORS } from "./config.js";
import { seededRandom, distanceToPath, pathLength, pointOnPath, routePoint } from "./geometry.js";

// 《一刀999》地图数据：4 张手工地图 + 96 张确定性生成地图，
// 以及关卡顺序、通关规则、剧情节点与战术节点契约。

export const MAPS = {
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

export const CHAPTERS = [
  { name: "灰烬边境", short: "边境", danger: "normal", dangerLabel: "边境荒野", ground: "#21362a", special: "#324b3c", accent: "#c28b57", monsters: ["腐烬战奴", "赤牙猎兽", "残甲尸兵", "荒道斥候"], boss: "灰烬霸主" },
  { name: "苍月群岛", short: "苍月", danger: "normal", dangerLabel: "海岛争夺", ground: "#17313a", special: "#244d59", accent: "#6fa8b6", monsters: ["潮骨水鬼", "蓝鳞海妖", "礁甲兽", "逐浪刀客"], boss: "沧海妖皇" },
  { name: "龙脉地宫", short: "龙脉", danger: "danger", dangerLabel: "地宫险域", ground: "#29261f", special: "#4b3f2a", accent: "#c6a15b", monsters: ["石俑卫", "龙脉毒虫", "铜甲尸", "寻宝恶徒"], boss: "地宫龙君" },
  { name: "冰封北境", short: "冰封", danger: "danger", dangerLabel: "极寒禁区", ground: "#23333a", special: "#36525d", accent: "#91bdc9", monsters: ["霜牙狼", "冻尸兵", "冰壳魔", "雪原猎手"], boss: "玄冰魔王" },
  { name: "烬火魔域", short: "烬火", danger: "desolate", dangerLabel: "魔域爆装", ground: "#35201c", special: "#5b2d22", accent: "#d56d45", monsters: ["熔岩奴", "火翼魔", "焦骨卫", "炼狱行刑者"], boss: "焚天魔尊" },
  { name: "幽冥鬼蜮", short: "幽冥", danger: "desolate", dangerLabel: "幽冥死地", ground: "#252033", special: "#40305a", accent: "#9b76c4", monsters: ["摄魂鬼", "冥甲尸", "渡魂妖", "黄泉守卫"], boss: "幽冥鬼帝" },
  { name: "天穹遗迹", short: "天穹", danger: "desolate", dangerLabel: "遗迹禁区", ground: "#202d35", special: "#334d5a", accent: "#69aabd", monsters: ["遗迹傀儡", "雷羽妖", "巡天卫", "断界法师"], boss: "天穹圣主" },
  { name: "星陨禁区", short: "星陨", danger: "desolate", dangerLabel: "星陨绝地", ground: "#262536", special: "#433f62", accent: "#8f88d1", monsters: ["陨晶兽", "虚空影", "星骸兵", "禁区猎杀者"], boss: "星陨邪神" },
  { name: "神魔战场", short: "神魔", danger: "desolate", dangerLabel: "神魔战场", ground: "#312522", special: "#594037", accent: "#ce8a64", monsters: ["堕神卫", "魔血骑", "战场怨魂", "破军修罗"], boss: "神魔战皇" },
  { name: "帝陵终境", short: "帝陵", danger: "desolate", dangerLabel: "终境皇陵", ground: "#29241c", special: "#4c412c", accent: "#d1aa55", monsters: ["帝陵禁卫", "金甲尸王", "镇国妖师", "不灭战魂"], boss: "玄烬帝尊" }
];
export const STAGE_SITES = ["前哨", "荒径", "古寨", "深谷", "祭坛", "迷宫", "王庭", "禁门", "圣台", "终殿"];
export const FIXED_MAP_IDS = ["ash_outskirts", "pine_forest", "black_rock_mine", "red_sand_desert"];
export const SITE_LAYOUTS = [
  { arena: "outpost", road: "direct", landmarks: ["watchtower", "barricade", "lantern", "cart"], detail: "警戒塔、拒马与补给车组成边境防线" },
  { arena: "trail", road: "fork", landmarks: ["signpost", "tree", "rock", "lantern"], detail: "岔路、路标与散落营火标记追踪路线" },
  { arena: "stockade", road: "direct", landmarks: ["palisade", "watchtower", "cart", "lantern"], detail: "寨墙、角楼和辎重围出可辨识的古寨轮廓" },
  { arena: "ravine", road: "zigzag", landmarks: ["cliff", "rock", "bridgepost", "ruin"], detail: "崖柱与桥桩把道路压缩成峡谷通道" },
  { arena: "altar", road: "radial", landmarks: ["shrine", "obelisk", "lantern", "rune"], detail: "同心祭环、方尖碑与符文围绕仪式中心" },
  { arena: "maze", road: "fork", landmarks: ["mazewall", "ruin", "obelisk", "lantern"], detail: "断墙和错位路口形成残缺迷宫" },
  { arena: "court", road: "direct", landmarks: ["courtpost", "banner", "lantern", "statue"], detail: "对称柱阵、战旗与石像构成王庭轴线" },
  { arena: "gate", road: "zigzag", landmarks: ["gatepost", "barricade", "obelisk", "beam"], detail: "巨型门柱、封锁线与引火梁强调破门目标" },
  { arena: "sanctum", road: "radial", landmarks: ["rune", "shrine", "lantern", "beam"], detail: "浮光符文与圣火灯环绕高台" },
  { arena: "throne", road: "direct", landmarks: ["throne", "courtpost", "banner", "obelisk"], detail: "王座、环柱与章主徽记构成终殿决战场" }
];
// 每种场所母题都有一个一次性场景节点。节点不改变通关条件，但让玩家
// 在安全路线、补给路线和首领路线之间做出有即时收益的选择。
export const SITE_NODE_EFFECTS = [
  { effect: "rally", name: "点燃警戒塔", detail: "按 F 点燃警戒塔，立即充满破势槽，准备下一轮爆发。" },
  { effect: "scout", name: "标记追迹路标", detail: "按 F 标记追迹路标，恢复 25% 职业资源并锁定最近敌人。" },
  { effect: "fortify", name: "加固拒马", detail: "按 F 加固拒马，恢复 35% 最大生命并获得 4 秒免伤。" },
  { effect: "bridge", name: "稳固桥桩", detail: "按 F 稳固桥桩，清除场上危险区与毒层，并获得 3 秒免伤。" },
  { effect: "resonance", name: "启动共鸣祭坛", detail: "按 F 启动祭坛，恢复 50% 职业资源并增加 30 点破势。" },
  { effect: "compass", name: "启动迷宫罗盘", detail: "按 F 启动罗盘，优先锁定当前区域首领或最近敌人。" },
  { effect: "banner", name: "夺下战旗", detail: "按 F 夺下战旗，恢复 20% 最大生命并增加 50 点破势。" },
  { effect: "breach", name: "燃烧破门火油", detail: "按 F 点燃火油，增加 75 点破势并恢复 20% 职业资源。" },
  { effect: "purify", name: "圣台净光", detail: "按 F 接受圣台净光，清除毒层并补满职业资源。" },
  { effect: "decree", name: "宣告王座遗诏", detail: "按 F 宣告遗诏，生命、职业资源与破势槽全部补满。" }
];

export function siteNodeDefinition(stageNumber, shortName = "场景") {
  const definition = SITE_NODE_EFFECTS[(Math.max(1, stageNumber) - 1) % SITE_NODE_EFFECTS.length];
  return { ...definition, id: `site-${stageNumber}`, kind: "site", name: `${shortName}${definition.name}` };
}
export const STORY_BEATS = [
  { title: "异兆", action: "调查异象", text: "疆域信标忽然熄灭，地底传来与玄烬心脏同频的震动。" },
  { title: "遗痕", action: "追踪残留", text: "敌人留下被刻意抹去的军印，线索指向更深处的旧王朝密道。" },
  { title: "盟约", action: "接应盟友", text: "一名掌握禁忌史的幸存者提出合作，却隐瞒了自己与首领的关系。" },
  { title: "代价", action: "夺回补给", text: "前路被封，救援百姓与追击魂火车队只能在同一场战斗中完成。" },
  { title: "夺印", action: "破坏仪式", text: "首领正以生灵记忆铸造玄烬之印，失败者会被从所有人的记忆中抹去。" },
  { title: "潜城", action: "潜入核心", text: "密道通向一座仍在运转的古代城机，真正的战争并非始于今日。" },
  { title: "裂盟", action: "识破背叛", text: "同行者交出半枚钥印，承认此前的引路也在替幕后者筛选合格容器。" },
  { title: "破门", action: "开启禁门", text: "门后封存着上一代守烬人的证词：玄烬既是灾祸，也是大陆火种。" },
  { title: "真相", action: "守住证据", text: "敌军试图销毁真相，玩家必须决定公开代价，还是独自背负秘密。" },
  { title: "章决", action: "击败章主", text: "章主以自身为祭开启下一重疆域，遗言将此前敌我关系彻底改写。" }
];
export const CHAPTER_STORIES = [
  { premise: "灰烬矿脉复燃，失踪多年的守碑军开始袭击故乡。", ally: "巡碑少女阿禾", foe: "边军统领赫连烬", relic: "裂碑钥印", truth: "守碑军并未叛变，他们在阻止矿脉吞噬村民记忆。", climax: "赫连烬自愿成为灰烬霸主，只为封住第一道烬门。" },
  { premise: "苍月潮汐倒流，沉船载着百年前未送达的求援信归来。", ally: "潮语者洛汐", foe: "沧海妖皇", relic: "月潮罗盘", truth: "群岛海妖曾是护送火种的水军，诅咒来自王朝灭口。", climax: "妖皇交出航路，要求玩家替被抹去的水军向大陆作证。" },
  { premise: "龙脉地宫重新计数活人，石俑把玩家称为失踪的第九位皇嗣。", ally: "盗陵医师顾七", foe: "地宫龙君", relic: "龙骨玉册", truth: "皇嗣并非血脉，而是能够承受玄烬的九个容器编号。", climax: "龙君确认玩家是最后仍保有人性的容器，并开启北境逃生门。" },
  { premise: "北境长夜冻结时间，失踪者仍在冰层中重复战争最后一天。", ally: "雪哨长宁霜", foe: "玄冰魔王", relic: "停时冰镜", truth: "宁霜早在百年前战死，如今只是冰镜为完成军令保存的记忆。", climax: "玩家击碎冰镜让亡军解脱，也释放了被时间囚禁的烬火。" },
  { premise: "烬火魔域吞噬北境，魔族却宣称自己才是玄烬最初的看守者。", ally: "魔匠赤鸢", foe: "焚天魔尊", relic: "初火炉心", truth: "人族王朝曾夺走初火并篡改史书，魔域战争是一场千年追索。", climax: "魔尊败后拒绝复仇，将炉心托付玩家检验其是否仍会选择人族。" },
  { premise: "幽冥河出现无名亡魂，他们没有死因，只留下被删去的人生。", ally: "摆渡人无咎", foe: "幽冥鬼帝", relic: "万名生死簿", truth: "玄烬每次稳定都要消耗一座城的记忆，鬼帝一直保存被献祭者姓名。", climax: "玩家夺回生死簿，第一次听见玄烬内部无数人的求救。" },
  { premise: "天穹遗迹从云层坠落，古代机关宣告大陆将在三十日后重置。", ally: "机关师弥星", foe: "天穹圣主", relic: "重置星盘", truth: "重置会毁灭文明却保住大陆躯壳，是历代守烬人留下的保险。", climax: "圣主要求玩家选择执行重置，或承担寻找第三条道路的责任。" },
  { premise: "星陨禁区记录所有失败未来，每块陨晶都映出玩家不同的死亡。", ally: "未来残影九歌", foe: "星陨邪神", relic: "逆命星核", truth: "九歌是未来玩家主动切下的人性，用来阻止自己成为新帝尊。", climax: "玩家收回九歌，获得改写一次结局的力量，也继承成为暴君的可能。" },
  { premise: "神魔战场重新开战，双方都持有证明对方先背叛的真实史书。", ally: "停战使苏烈", foe: "神魔战皇", relic: "双史战旗", truth: "两部史书都是真的：玄烬让两个时间分支重叠，以战争持续供能。", climax: "玩家斩断战旗合并时间线，百万战魂终于看到同一个黎明。" },
  { premise: "帝陵终境开启，玄烬帝尊以玩家的面容等待最后一位容器归位。", ally: "历代同伴的记忆回声", foe: "玄烬帝尊", relic: "完整玄烬之心", truth: "帝尊是每次轮回选择独自承担一切的玩家，世界已重复九百九十九次。", climax: "第千次轮回中，玩家让大陆共同记住代价并分担火种，终止独自封印。" }
];

export function storyForStage(stageNumber) {
  const chapterIndex = Math.floor((stageNumber - 1) / 10);
  const slot = (stageNumber - 1) % 10;
  const chapter = CHAPTERS[chapterIndex];
  const arc = CHAPTER_STORIES[chapterIndex];
  const beat = STORY_BEATS[slot];
  return {
    chapterTitle: `第${chapterIndex + 1}章 · ${chapter.name}`,
    beatTitle: `${String(stageNumber).padStart(3, "0")} · ${beat.title}`,
    premise: arc.premise,
    objective: `${beat.action}，夺回${arc.relic}`,
    summary: beat.text,
    speaker: slot < 7 ? arc.ally : slot === 9 ? arc.foe : "守烬回声",
    dialogue: slot === 9 ? `「打败我，然后带着${arc.relic}去见下一段真相。」` : slot === 7 ? `「${arc.truth}」` : `「${beat.text}」`,
    reveal: slot === 9 ? arc.climax : slot >= 7 ? arc.truth : `线索继续指向${arc.foe}`
  };
}

export function mapsPerLevel(stageNumber) {
  if (stageNumber <= 10) return 1;
  if (stageNumber <= 30) return 2;
  if (stageNumber <= 60) return 3;
  return 4;
}

export function campaignGrowth(clearedMaps) {
  const cleared = Math.max(0, Math.min(100, Math.floor(Number(clearedMaps) || 0)));
  if (cleared <= 10) return { level: 1 + cleared, exp: 0, nextExp: 100, mapsPerLevel: 1 };
  if (cleared <= 30) return { level: 11 + Math.floor((cleared - 10) / 2), exp: ((cleared - 10) % 2) * 50, nextExp: 100, mapsPerLevel: 2 };
  if (cleared <= 60) return { level: 21 + Math.floor((cleared - 30) / 3), exp: Math.floor(((cleared - 30) % 3) * 100 / 3), nextExp: 100, mapsPerLevel: 3 };
  return { level: 31 + Math.floor((cleared - 60) / 4), exp: ((cleared - 60) % 4) * 25, nextExp: 100, mapsPerLevel: 4 };
}

export function generatedLayout(stageNumber, chapter) {
  const random = seededRandom(stageNumber * 982451653 + 104729);
  const site = SITE_LAYOUTS[(stageNumber - 1) % 10];
  const townY = [180, 565, 950][stageNumber % 3];
  const townRect = { x: 80, y: townY, w: 280, h: 280 };
  const boss = { x: Math.round(1810 + random() * 380), y: Math.round(260 + random() * 840) };
  const start = { x: townRect.x + townRect.w / 2, y: townRect.y + townRect.h / 2 };
  const path = [start.x, start.y];
  for (let point = 1; point <= 5; point += 1) {
    const ratio = point / 6;
    let x = start.x + (boss.x - start.x) * ratio + (random() - .5) * 230;
    let y = start.y + (boss.y - start.y) * ratio + (random() - .5) * 270;
    if (site.road === "zigzag") {
      // 折返道路必须在控制点上产生实际回摆，而不是只换一个标签。
      const fold = 320 + (stageNumber % 3) * 20;
      x += point % 2 ? fold : -fold;
      y += point % 2 ? 210 : -210;
    }
    path.push(Math.round(Math.max(120, Math.min(2240, x))));
    path.push(Math.round(Math.max(100, Math.min(1400, y))));
  }
  path.push(boss.x, boss.y);
  const landmarks = Array.from({ length: 10 }, (_, index) => ({
    type: site.landmarks[(index + stageNumber) % site.landmarks.length],
    x: Math.round(420 + random() * 1740),
    y: Math.round(150 + random() * 1180),
    r: Math.round(14 + random() * 16),
    color: index % 2 ? chapter.special : chapter.accent
  }));
  const chapterEnd = stageNumber % 10 === 0;
  const specialRect = {
    x: Math.max(1380, Math.min(1780, boss.x - 260)),
    y: Math.max(90, Math.min(930, boss.y - 220)),
    w: chapterEnd ? 620 : 520,
    h: chapterEnd ? 520 : 440,
    tier: chapterEnd ? "chapter" : "standard",
    label: chapterEnd ? "章末决战战区" : "区域首领战区"
  };
  const outsideBossZone = (point, padding = 34) => point.x < specialRect.x - padding || point.x > specialRect.x + specialRect.w + padding || point.y < specialRect.y - padding || point.y > specialRect.y + specialRect.h + padding;
  const paths = [path];
  let branchPath = null;
  if (site.road === "fork" || site.road === "radial") {
    const forkX = path[6];
    const forkY = path[7];
    const edgeY = Math.max(140, Math.min(1360, forkY + (stageNumber % 2 ? 390 : -390)));
    branchPath = [forkX, forkY, forkX + 160, forkY, forkX + 260, edgeY, forkX + 430, edgeY, forkX + 560, edgeY, boss.x - 180, boss.y, boss.x, boss.y];
    paths.push(branchPath);
  }
  // 战斗营位贴着路线生成：玩家沿路清怪时会自然经历前段警戒、中段压迫和首领前集结，
  // 分支图则把四只守卫放进支路中段，给“绕路换补给”一个真实战斗代价。
  const mainProgresses = branchPath ? [.12, .22, .33, .45, .58, .7, .79, .86] : [.1, .17, .24, .32, .4, .48, .56, .64, .71, .77, .83, .88];
  const branchProgresses = [.38, .5, .62, .74];
  const monsterRoutes = branchPath
    ? mainProgresses.map((progress, index) => ({ route: "main", progress, lateral: (index % 2 ? 1 : -1) * (28 + (stageNumber + index) % 3 * 16) })).concat(branchProgresses.map((progress, index) => ({ route: "branch", progress, lateral: (index % 2 ? -1 : 1) * (30 + (stageNumber + index) % 2 * 18) })))
    : mainProgresses.map((progress, index) => ({ route: "main", progress, lateral: (index % 2 ? 1 : -1) * (28 + (stageNumber + index) % 3 * 16) }));
  const monsterSpawns = monsterRoutes.map(({ route, progress, lateral }, index) => {
    const routePath = route === "branch" ? branchPath : path;
    let adjustedProgress = progress;
    let point = routePoint(routePath, adjustedProgress, lateral);
    // 首领前集结必须停在战区外，给 Boss 留出完整的阶段走位和撤离空间。
    while (!outsideBossZone(point, 70) && adjustedProgress > .18) {
      adjustedProgress = Math.max(.12, adjustedProgress - .045);
      point = routePoint(routePath, adjustedProgress, lateral);
    }
    if (!outsideBossZone(point, 34)) {
      const lateralCandidates = [lateral + 110, lateral - 110, lateral + 180, lateral - 180, lateral + 250, lateral - 250];
      const alternate = lateralCandidates.map((offset) => routePoint(routePath, adjustedProgress, offset)).find((candidate) => outsideBossZone(candidate, 70));
      if (alternate) point = alternate;
    }
    const jittered = { x: point.x + (random() - .5) * 24, y: point.y + (random() - .5) * 24 };
    if (!outsideBossZone(jittered, 58)) {
      jittered.x = point.x;
      jittered.y = point.y;
    }
    return [Math.round(Math.max(430, Math.min(2100, jittered.x))), Math.round(Math.max(130, Math.min(1370, jittered.y))), (index + stageNumber) % 4, route, adjustedProgress];
  });
  const bossEntry = { x: path[10], y: path[11] };
  const routePlan = {
    type: site.road,
    summary: site.road === "fork" ? "主路 + 支路秘藏" : site.road === "radial" ? "环线分流 · 支路补给" : site.road === "zigzag" ? "折返峡道 · 逐段清场" : "主路直进 · 首领入口",
    mainLength: pathLength(path),
    branchLength: branchPath ? pathLength(branchPath) : 0,
    branchEntry: branchPath ? { x: branchPath[0], y: branchPath[1] } : null,
    bossEntry,
    bossEntryBuffer: Math.round(Math.hypot(boss.x - bossEntry.x, boss.y - bossEntry.y)),
    encounterBands: branchPath
      ? [
          { id: "approach", route: "main", label: "前段警戒带", from: .08, to: .33, count: 3 },
          { id: "pressure", route: "main", label: "中段压迫带", from: .34, to: .7, count: 3 },
          { id: "branch_guard", route: "branch", label: "支路守卫带", from: .18, to: .66, count: 4 },
          { id: "rally", route: "main", label: "首领前集结", from: .71, to: .88, count: 2 }
        ]
      : [
          { id: "approach", route: "main", label: "前段警戒带", from: .08, to: .32, count: 3 },
          { id: "pressure", route: "main", label: "中段压迫带", from: .33, to: .68, count: 4 },
          { id: "rally", route: "main", label: "首领前集结", from: .69, to: .9, count: 5 }
        ]
  };
  const occupied = [start, boss, ...monsterSpawns.map(([x, y]) => ({ x, y }))];
  const pointOutsideRect = (point, rect, padding = 0) => point.x < rect.x - padding || point.x > rect.x + rect.w + padding || point.y < rect.y - padding || point.y > rect.y + rect.h + padding;
  const freePoint = (base, minDistance = 120, routePath = null, maxRouteDistance = 132) => {
    const offsets = [
      [0, 0], [120, -86], [-140, 92], [166, 118], [-176, -104],
      [250, 0], [-250, 0], [0, 230], [0, -230], [300, 170], [-300, 170], [300, -170], [-300, -170],
      [420, 0], [-420, 0], [0, 360], [0, -360], [520, 0], [-520, 0], [0, 480], [0, -480]
    ];
    const candidates = offsets.map(([dx, dy]) => ({ x: base.x + dx, y: base.y + dy }));
    const normalized = candidates.map((point) => ({ x: Math.round(Math.max(410, Math.min(2160, point.x))), y: Math.round(Math.max(120, Math.min(1380, point.y))) }));
    const valid = normalized.filter((point, index, all) => all.findIndex((other) => other.x === point.x && other.y === point.y) === index)
      .filter((point) => pointOutsideRect(point, specialRect, 78))
      .filter((point) => occupied.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= minDistance))
      .filter((point) => !routePath || distanceToPath(point, routePath) <= maxRouteDistance);
    if (valid.length) return valid[0];
    // Fallback must preserve hard map-safety and route constraints. It only
    // changes candidate priority, never permits a node to enter a Boss zone.
    const constrained = normalized.filter((point, index, all) => all.findIndex((other) => other.x === point.x && other.y === point.y) === index)
      .filter((point) => pointOutsideRect(point, specialRect, 78))
      .filter((point) => !routePath || distanceToPath(point, routePath) <= maxRouteDistance);
    const expanded = [];
    for (let x = 430; x <= 2100; x += 85) {
      for (let y = 130; y <= 1370; y += 85) {
        const point = { x, y };
        if (pointOutsideRect(point, specialRect, 78) && (!routePath || distanceToPath(point, routePath) <= maxRouteDistance) && occupied.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= minDistance)) expanded.push(point);
      }
    }
    if (expanded.length) return expanded[0];
    const fallback = constrained
      .sort((a, b) => {
        const score = (point) => Math.min(...occupied.map((other) => Math.hypot(point.x - other.x, point.y - other.y)));
        return score(b) - score(a);
      })[0];
    const safeFallback = constrained.find((point) => occupied.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= minDistance));
    if (safeFallback) return safeFallback;
    if (fallback) return fallback;
    throw new Error(`地图节点没有安全候选：${stageNumber}/${routePath ? "branch" : "main"}`);
  };
  const restPoint = freePoint({ x: path[4], y: path[5] }, 144);
  occupied.push(restPoint);
  // 支路线上的秘藏锚在分支中段，而不是靠近汇入首领区的末端；资源节点
  // 还须为 Boss 半径、交互半径和额外战斗缓冲预留完整安全距离。
  const branchCachePoint = branchPath ? (() => {
    const progresses = [.06, .1, .14, .18, .22, .26, .3];
    const laterals = [-120, -90, 90, 120];
    for (const progress of progresses) {
      for (const lateral of laterals) {
        const point = routePoint(branchPath, progress, lateral);
        if (pointOutsideRect(point, specialRect, 78) && distanceToPath(point, branchPath) <= 132 && occupied.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= 158)) return point;
      }
    }
    return null;
  })() : null;
  const cachePoint = branchCachePoint || (branchPath
    ? freePoint(routePoint(branchPath, .22), 208, branchPath)
    : freePoint({ x: path[8], y: path[9] }, 208));
  occupied.push(cachePoint);
  const sitePoint = freePoint({ x: path[6], y: path[7] }, 154);
  occupied.push(sitePoint);
  const siteNode = siteNodeDefinition(stageNumber, chapter.short);
  const tacticalPoints = [
    { id: `rest-${stageNumber}`, kind: "rest", route: "main", x: restPoint.x, y: restPoint.y, radius: 62, name: `${chapter.short}前线篝火`, detail: "靠近篝火可恢复生命、资源并净化毒层" },
    { id: `cache-${stageNumber}`, kind: "resource", route: branchPath ? "branch" : "main", x: cachePoint.x, y: cachePoint.y, radius: 70, name: `${chapter.short}${branchPath ? "支路秘藏补给箱" : "秘藏补给箱"}`, detail: branchPath ? "沿支路探索后按 F 搜索一次，获得药水、金币与首领印记" : "靠近后按 F 搜索一次，获得药水、金币与首领印记" },
    { ...siteNode, route: "main", x: sitePoint.x, y: sitePoint.y, radius: 66 }
  ];
  return { townRect, boss, monsterSpawns, paths, branchPath, landmarks, specialRect, tacticalPoints, siteStyle: site, routePlan, layoutId: `layout-${stageNumber}-${townY}-${boss.x}-${boss.y}-${site.arena}` };
}

export function generatedMap(stageNumber) {
  const chapterIndex = Math.floor((stageNumber - 1) / 10);
  const chapter = CHAPTERS[chapterIndex];
  const slot = (stageNumber - 1) % 10;
  const expectedLevel = campaignGrowth(stageNumber - 1).level;
  const scale = 1 + stageNumber * 0.085;
  const id = `stage_${String(stageNumber).padStart(3, "0")}`;
  const layout = generatedLayout(stageNumber, chapter);
  const monsterTypes = chapter.monsters.map((name, typeIndex) => ({
    name: `${chapter.short}${name}`,
    color: [chapter.accent, "#89999c", "#7b6a58", "#9a6b72"][typeIndex],
    hp: Math.round((72 + typeIndex * 18) * scale),
    attack: Math.round(11 + stageNumber * 1.05 + typeIndex * 2),
    defense: Math.round(3 + stageNumber * 0.42 + typeIndex * 2),
    exp: 0,
    gold: Math.round(8 + stageNumber * 1.4 + typeIndex * 2),
    radius: 16 + typeIndex,
    intro: `${chapter.name}中负责巡逻的${name}，会根据玩家距离选择攻击方式。`,
    skills: [`${name}攻击：基础伤害 ${Math.round(11 + stageNumber * 1.05 + typeIndex * 2)}`, `${name}本能：受到伤害后继续追击`]
  }));
  const bossName = slot === 9 ? chapter.boss : `${chapter.short}${STAGE_SITES[slot]}领主`;
  return {
    id,
    stageNumber,
    chapter: chapterIndex + 1,
    chapterName: chapter.name,
    story: storyForStage(stageNumber),
    name: `${chapter.short}${STAGE_SITES[slot]}`,
    subtitle: `${chapter.name} · 第 ${slot + 1} 战区`,
    levelMin: expectedLevel,
    levelMax: expectedLevel + 1,
    danger: chapter.danger,
    dangerLabel: chapter.dangerLabel,
    layoutId: layout.layoutId,
    width: 2400,
    height: 1500,
    palette: { ground: chapter.ground, road: "rgba(210, 184, 125, .12)", roadHi: "rgba(235, 210, 150, .16)", grid: "rgba(220, 230, 220, .035)", town: "rgba(98, 213, 198, .08)", townBorder: "rgba(98, 213, 198, .22)", special: chapter.special, specialBorder: `${chapter.accent}66`, water: "rgba(100, 150, 170, .14)" },
    townRect: layout.townRect,
    specialRect: layout.specialRect,
    paths: layout.paths,
    branchPath: layout.branchPath,
    landmarks: layout.landmarks,
    tacticalPoints: layout.tacticalPoints,
    siteStyle: layout.siteStyle,
    routePlan: layout.routePlan,
    encounterBands: layout.routePlan.encounterBands,
    landmarkLabels: [{ text: `${chapter.short}补给营`, x: layout.townRect.x + 70, y: layout.townRect.y + layout.townRect.h + 25 }, { text: `${bossName}领域`, x: layout.boss.x - 80, y: layout.boss.y + 95 }],
    monsterTypes,
    monsterSpawns: layout.monsterSpawns,
    boss: {
      id: `boss-${id}`,
      name: bossName,
      color: chapter.accent,
      hp: Math.round(760 + stageNumber * 88),
      attack: Math.round(24 + stageNumber * 1.28),
      defense: Math.round(10 + stageNumber * 0.55),
      exp: 0,
      gold: Math.round(120 + stageNumber * 16),
      radius: 34 + Math.min(6, Math.floor(stageNumber / 20)),
      x: layout.boss.x,
      y: layout.boss.y,
      phases: stageNumber % 10 === 0 ? 3 : 2,
      phase1Trigger: stageNumber % 10 === 0 ? 0.68 : 0.5,
      phase2Trigger: stageNumber % 10 === 0 ? 0.34 : undefined,
      specialInterval: Math.max(3.2, 6.5 - stageNumber * 0.025),
      specialKind: ["crack", "logs", "devour", "sting"][stageNumber % 4],
      poisonStacks: stageNumber % 4 === 3
    },
    drops: [
      { name: `${chapter.short}战刃·${stageNumber}`, slot: "weapon", quality: stageNumber > 70 ? "orange" : "purple", glyph: "刃", power: 10 + stageNumber * 2, value: 30 + stageNumber * 8, color: stageNumber > 70 ? "#e7b36b" : "#a88ce3", desc: `第 ${stageNumber} 关武器 · 攻击 ${10 + stageNumber * 2}` },
      { name: `${chapter.short}魂链·${stageNumber}`, slot: "neck", quality: "purple", glyph: "玉", power: 8 + stageNumber, value: 25 + stageNumber * 6, color: "#a88ce3", desc: `第 ${stageNumber} 关护符 · 生命与战力成长` },
      { name: `${chapter.short}行靴·${stageNumber}`, slot: "boots", quality: "blue", glyph: "靴", power: 6 + stageNumber, value: 20 + stageNumber * 5, color: "#78b6ec", desc: `第 ${stageNumber} 关战靴 · 防御与移速成长` },
      { name: `${chapter.short}首领魂核·${stageNumber}`, slot: "material", quality: "orange", glyph: "核", power: 0, value: 80 + stageNumber * 12, color: "#e7b36b", desc: `第 ${stageNumber} 关首领铸魂材料` }
    ],
    exits: []
  };
}

for (let stageNumber = 5; stageNumber <= 100; stageNumber += 1) {
  const map = generatedMap(stageNumber);
  MAPS[map.id] = map;
}

export const MAP_ORDER = [...FIXED_MAP_IDS, ...Array.from({ length: 96 }, (_, index) => `stage_${String(index + 5).padStart(3, "0")}`)];

export function mapLayoutSignature(map) {
  return JSON.stringify({
    town: map.townRect,
    boss: [map.boss.x, map.boss.y],
    spawns: map.monsterSpawns,
    paths: map.paths,
    landmarks: map.landmarks.map(({ type, x, y }) => [type, x, y]),
    tacticalPoints: (map.tacticalPoints || []).map(({ kind, route, x, y, radius }) => [kind, route, x, y, radius]),
    site: map.siteStyle?.arena || "handcrafted"
  });
}
export function pathTurnCount(path) {
  const xPoints = Array.from({ length: path.length / 2 }, (_, index) => path[index * 2]);
  let previousDirection = 0;
  let turns = 0;
  for (let index = 1; index < xPoints.length; index += 1) {
    const delta = xPoints[index] - xPoints[index - 1];
    if (Math.abs(delta) < 20) continue;
    const direction = Math.sign(delta);
    if (previousDirection && direction !== previousDirection) turns += 1;
    previousDirection = direction;
  }
  return turns;
}

export function placeTacticalPoints(map, stageNumber, chapterShort) {
  const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const start = { x: map.townRect.x + map.townRect.w / 2, y: map.townRect.y + map.townRect.h / 2 };
  const boss = { x: map.boss.x, y: map.boss.y };
  const occupied = [start, boss, ...map.monsterSpawns.map(([x, y]) => ({ x, y }))];
  const pointOutsideRect = (point, rect, padding = 0) => !rect || point.x < rect.x - padding || point.x > rect.x + rect.w + padding || point.y < rect.y - padding || point.y > rect.y + rect.h + padding;
  const pick = (base, minDistance) => {
    const offsets = [[0, 0], [170, 0], [-170, 0], [0, 170], [0, -170], [280, 120], [-280, 120], [280, -120], [-280, -120], [420, 0], [-420, 0], [0, 330], [0, -330], [520, 180], [-520, 180], [520, -180], [-520, -180]];
    const candidates = offsets.map(([dx, dy]) => ({ x: Math.round(Math.max(410, Math.min(2160, base.x + dx))), y: Math.round(Math.max(120, Math.min(1380, base.y + dy))) }));
    const unique = candidates.filter((point, index, all) => all.findIndex((other) => other.x === point.x && other.y === point.y) === index);
    const valid = unique.filter((point) => pointOutsideRect(point, map.specialRect, 78) && occupied.every((other) => pointDistance(point, other) >= minDistance));
    const chosen = valid[0] || unique.sort((a, b) => Math.min(...occupied.map((other) => pointDistance(b, other))) - Math.min(...occupied.map((other) => pointDistance(a, other))))[0];
    occupied.push(chosen);
    return chosen;
  };
  const rest = pick({ x: map.townRect.x + map.townRect.w + 250, y: map.townRect.y + map.townRect.h / 2 }, 144);
  const resource = pick({ x: map.boss.x - 410, y: map.boss.y + 300 }, 152);
  const site = pick({ x: map.boss.x - 650, y: map.boss.y - 120 }, 148);
  const siteNode = siteNodeDefinition(stageNumber, chapterShort);
  return [
    { id: `rest-${map.id}`, kind: "rest", x: rest.x, y: rest.y, radius: 62, name: `${chapterShort}前线篝火`, detail: "靠近篝火可恢复生命、资源并净化毒层" },
    { id: `cache-${map.id}`, kind: "resource", x: resource.x, y: resource.y, radius: 70, name: `${chapterShort}秘藏补给箱`, detail: "靠近后按 F 搜索一次，获得药水、金币与首领印记" },
    { ...siteNode, x: site.x, y: site.y, radius: 66 }
  ];
}

MAP_ORDER.forEach((id, index) => {
  const map = MAPS[id];
  map.stageNumber = index + 1;
  map.chapter = Math.floor(index / 10) + 1;
  map.chapterName ||= CHAPTERS[map.chapter - 1].name;
  map.story ||= storyForStage(index + 1);
  map.levelMin = campaignGrowth(index).level;
  map.levelMax = map.levelMin + 1;
  if (!map.tacticalPoints) {
    map.tacticalPoints = placeTacticalPoints(map, index + 1, map.name);
  }
  if (!map.routePlan) {
    const mainPath = map.paths?.[0] || [];
    const bossEntry = mainPath.length >= 12
      ? { x: mainPath[10], y: mainPath[11] }
      : { x: map.boss.x - 120, y: map.boss.y };
    map.routePlan = {
      type: map.paths?.length > 1 ? "fork" : "direct",
      summary: map.paths?.length > 1 ? "主路 + 支路秘藏" : "主路直进 · 首领入口",
      mainLength: pathLength(mainPath),
      branchLength: map.paths?.[1] ? pathLength(map.paths[1]) : 0,
      branchEntry: map.paths?.[1] ? { x: map.paths[1][0], y: map.paths[1][1] } : null,
      bossEntry,
      bossEntryBuffer: Math.round(Math.hypot(map.boss.x - bossEntry.x, map.boss.y - bossEntry.y))
    };
  }
  if (!map.routePlan.encounterBands) {
    const third = Math.ceil(map.monsterSpawns.length / 3);
    map.routePlan.encounterBands = [
      { id: "approach", route: "main", label: "前段警戒带", from: .08, to: .34, count: Math.max(2, third) },
      { id: "pressure", route: "main", label: "中段压迫带", from: .35, to: .68, count: Math.max(2, third) },
      { id: "rally", route: "main", label: "首领前集结", from: .69, to: .9, count: Math.max(2, map.monsterSpawns.length - third * 2) }
    ];
  }
  map.encounterBands = map.routePlan.encounterBands;
  const exits = [];
  if (index > 0) {
    const previous = MAPS[MAP_ORDER[index - 1]];
    exits.push({ x: 20, y: 540, w: 50, h: 360, target: previous.id, spawn: { x: 2280, y: 760 }, label: previous.name, sub: `推荐 Lv.${previous.levelMin}` });
  }
  if (index < MAP_ORDER.length - 1) {
    const next = MAPS[MAP_ORDER[index + 1]];
    exits.push({ x: 2330, y: 540, w: 60, h: 360, target: next.id, spawn: { x: 90, y: 760 }, label: next.name, sub: `推荐 Lv.${next.levelMin}` });
  }
  map.exits = exits;
});

export const MAP_CLEAR_RULES = Object.fromEntries(MAP_ORDER.map((id, index) => {
  const map = MAPS[id];
  const kills = index === 0 ? 8 : index < 4 ? 10 : index < 10 ? 5 : index < 40 ? 6 : index < 70 ? 7 : 8;
  return [id, { kills, boss: map.boss.name, next: MAP_ORDER[index + 1] || null, exit: "东侧出口", stageNumber: index + 1, mapsPerLevel: mapsPerLevel(index + 1) }];
}));

Object.values(MAPS).forEach((map) => {
  map.monsterTypes.forEach((type) => {
    const base = Object.keys(MONSTER_BEHAVIORS).find((name) => type.name.endsWith(name));
    if (!base) return;
    const behavior = MONSTER_BEHAVIORS[base];
    type.intro = behavior.intro || MONSTER_FLAVOR[base] || type.intro;
    type.skills = behavior.skills || behavior;
  });
});
