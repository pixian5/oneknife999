// 资产解析层（0.8.5）：把「地图数据名 → 实际素材文件名」收敛到一处。
//
// 0.6.0 的动作帧接入直接拼 `monster-full-${entity.name}-${action}.png`，但生成图
// 会给怪物名加章节前缀（如「边境荒原战狼」），素材库却是无前缀的
// `monster-full-荒原战狼-idle.png`，导致 5–100 关全部 404 并回退几何图形。
// 本模块负责：
// 1. 剥离章节前缀；
// 2. 把 40 个旧生成怪别名到 50 个有动作帧的物种；
// 3. 处理 4 个素材库中不存在的命名；
// 4. Boss 立绘 / 情报头像 / 每图底图的回退链。
//
// 纯数据 + 纯函数，不依赖 DOM，可被 Node 单测直接引用。

export const CHAPTER_SHORTS = ["边境", "苍月", "龙脉", "冰封", "烬火", "幽冥", "天穹", "星陨", "神魔", "帝陵"];

// 50 个带 idle/walk/attack/hit 四帧的物种（0.5.1 素材库）。
export const ACTION_MONSTERS = new Set([
  "冥河巨鳄",
  "冰川巨兽",
  "冰鳞鱼人",
  "噬魂将军",
  "地宫炎蝠",
  "寒霜狼卫",
  "幽冥骑士",
  "断刃老兵",
  "暴雪鹰王",
  "极地魔狼",
  "林间鬼鸮",
  "残破巨像",
  "沉渊海灵",
  "沙丘巨蟒",
  "沙魂亡灵",
  "深岩蠕兽",
  "深海巨章",
  "火焰战狼",
  "火狱邪龙",
  "灰烬影狼",
  "灰烬魔影",
  "灼心魔蝠",
  "烬焰巫侍",
  "烬甲巨虫",
  "热浪妖",
  "焦土鸦王",
  "焦焰飞龙",
  "熔岩蚁后",
  "熔核巨人",
  "玉髓守卫",
  "白骨射手",
  "石甲巨像",
  "矿毒邪蛛",
  "矿道巨虫",
  "礁岩魔龟",
  "祭坛邪灵",
  "苍月鲨卫",
  "苔冠树精",
  "荒原战狼",
  "荒漠毒蝎",
  "藤蔓缚妖",
  "赤甲巨蜥",
  "迷雾妖鸟",
  "金纹毒蟒",
  "铁屑蜥蜴",
  "铁锈傀儡",
  "雾隐蛟",
  "霜苔毒蛙",
  "鬼火妖灵",
  "黑曜石灵"
]);

// 40 个旧「章节前缀」生成怪 → 已有动作帧的物种。
// 键为剥离章节前缀后的基础名（与 monster-abilities.js 的 suffix 匹配一致）。
export const MONSTER_ALIASES = {
  腐烬战奴: "断刃老兵",
  赤牙猎兽: "灰烬影狼",
  残甲尸兵: "矿道巨虫",
  荒道斥候: "焦土鸦王",
  潮骨水鬼: "沉渊海灵",
  蓝鳞海妖: "深海巨章",
  礁甲兽: "礁岩魔龟",
  逐浪刀客: "苍月鲨卫",
  石俑卫: "石甲巨像",
  毒虫: "矿毒邪蛛",
  铜甲尸: "玉髓守卫",
  寻宝恶徒: "白骨射手",
  霜牙狼: "极地魔狼",
  冻尸兵: "冰川巨兽",
  冰壳魔: "冰鳞鱼人",
  雪原猎手: "暴雪鹰王",
  熔岩奴: "热浪妖",
  火翼魔: "火狱邪龙",
  焦骨卫: "熔核巨人",
  炼狱行刑者: "烬甲巨虫",
  摄魂鬼: "鬼火妖灵",
  冥甲尸: "幽冥骑士",
  渡魂妖: "噬魂将军",
  黄泉守卫: "冥河巨鳄",
  遗迹傀儡: "铁锈傀儡",
  雷羽妖: "迷雾妖鸟",
  巡天卫: "残破巨像",
  断界法师: "祭坛邪灵",
  陨晶兽: "深岩蠕兽",
  虚空影: "雾隐蛟",
  星骸兵: "灼心魔蝠",
  禁区猎杀者: "焦焰飞龙",
  堕神卫: "荒原战狼",
  魔血骑: "赤甲巨蜥",
  战场怨魂: "烬焰巫侍",
  破军修罗: "金纹毒蟒",
  禁卫: "黑曜石灵",
  金甲尸王: "沙魂亡灵",
  镇国妖师: "藤蔓缚妖",
  不灭战魂: "苔冠树精",
  // 4 个 0.6.0 新增命名在素材库里没有同名文件，显式映射到最接近的动作帧物种。
  鬼鸮: "林间鬼鸮",
  熔岩蛇王: "金纹毒蟒",
  虚影刺客: "灰烬魔影",
  灰烬魔像: "石甲巨像"
};

// 场所母题 → 精英怪立绘（通用「XX领主」复用，避免 89 个 Boss 全部回退几何圆）。
export const ARENA_ELITE_PORTRAITS = {
  outpost: "边境铁骑",
  trail: "雾林巨狼",
  stockade: "烬火屠夫",
  ravine: "黑岩魔像",
  altar: "烈焰魔君",
  maze: "苍月海王",
  court: "地宫龙卫",
  gate: "幽冥鬼将",
  sanctum: "冰霜巨人",
  throne: "沙暴巨蝎"
};

export const HANDCRAFTED_ARENA = {
  ash_outskirts: "outpost",
  pine_forest: "trail",
  black_rock_mine: "ravine",
  red_sand_desert: "throne"
};

// 有专属战场立绘的 11 个 Boss。
export const BOSS_PORTRAITS = new Set([
  "裂碑领主",
  "沧海妖皇",
  "地宫龙君",
  "玄冰魔王",
  "焚天魔尊",
  "幽冥鬼帝",
  "天穹圣主",
  "星陨邪神",
  "神魔战皇",
  "玄烬帝尊",
  "灰烬霸主"
]);

// 章节末 Boss 的 UI 头像：通用领主按章节回退，避免全部显示裂碑领主。
export const CHAPTER_BOSS_PORTRAITS = [
  "灰烬霸主",
  "沧海妖皇",
  "地宫龙君",
  "玄冰魔王",
  "焚天魔尊",
  "幽冥鬼帝",
  "天穹圣主",
  "星陨邪神",
  "神魔战皇",
  "玄烬帝尊"
];

// 通用 Boss 的章节色调（source-atop 叠色，渲染层统一 0.22 透明度）。
export const CHAPTER_TINTS = ["#b06a3a", "#3a7ab0", "#7a6a3a", "#6aa0c0", "#c04a2a", "#6a4a8a", "#b09040", "#4a4a7a", "#a03a3a", "#c0a040"];

const MONSTER_ACTIONS = new Set(["idle", "walk", "attack", "hit"]);

export function stripChapterPrefix(name, chapter = 1) {
  if (!name) return "";
  const short = CHAPTER_SHORTS[(Math.max(1, chapter || 1) - 1) % CHAPTER_SHORTS.length];
  return name.startsWith(short) && name.length > short.length ? name.slice(short.length) : name;
}

// 普通怪贴图：优先动作帧，其次静态单帧。所有返回值都对应 assets/ 下真实文件。
export function resolveMonsterSpriteName(name, action = "idle", map) {
  if (!name) return null;
  // 先看完整名是否本身就是动作帧物种 / 别名键（如「苍月鲨卫」「幽冥骑士」本身就以章节短名开头，
  // 不能无条件剥前缀）；再尝试剥离章节前缀。
  const exact = MONSTER_ALIASES[name] || (ACTION_MONSTERS.has(name) ? name : null);
  const base = stripChapterPrefix(name, map?.chapter || 1);
  const target = exact || MONSTER_ALIASES[base] || (ACTION_MONSTERS.has(base) ? base : null);
  if (!target) return `monster-full-${base}.png`;
  const safeAction = MONSTER_ACTIONS.has(action) ? action : "idle";
  return `monster-full-${target}-${safeAction}.png`;
}

export function resolveEliteSpriteName(map) {
  const arena = map?.siteStyle?.arena || HANDCRAFTED_ARENA[map?.id] || "outpost";
  const name = ARENA_ELITE_PORTRAITS[arena] || ARENA_ELITE_PORTRAITS.outpost;
  return `monster-full-精英-${name}.png`;
}

// Boss 战场贴图：有专属立绘直接用；通用领主用精英图 + 章节色调。
export function resolveBossSprite(map) {
  const name = map?.boss?.name;
  if (!name) return null;
  if (BOSS_PORTRAITS.has(name)) return { name, path: `boss-full-${name}.png`, tint: null };
  const arena = map?.siteStyle?.arena || HANDCRAFTED_ARENA[map?.id] || "outpost";
  const elite = ARENA_ELITE_PORTRAITS[arena] || ARENA_ELITE_PORTRAITS.outpost;
  return {
    name: `精英-${elite}`,
    path: `monster-full-精英-${elite}.png`,
    tint: CHAPTER_TINTS[(Math.max(1, map?.chapter || 1) - 1) % CHAPTER_TINTS.length]
  };
}

// 右侧首领情报条头像：有专属 jpg 用专属，否则回退本章章末 Boss。
export function resolveBossUiPortrait(map) {
  const name = map?.boss?.name;
  if (!name) return "boss-liebei.jpg";
  if (BOSS_PORTRAITS.has(name)) return `boss-${name}.jpg`;
  const chapter = Math.max(1, Math.min(10, map?.chapter || 1));
  return `boss-${CHAPTER_BOSS_PORTRAITS[chapter - 1]}.jpg`;
}

// 每图底图：50 张 map-cXX-YY（每章 5 张，按关卡序号循环）。
export function resolveMapBackgroundName(map) {
  const chapter = Math.max(1, Math.min(10, map?.chapter || 1));
  const stage = Math.max(1, map?.stageNumber || 1);
  return `map-c${String(chapter).padStart(2, "0")}-${String(((stage - 1) % 5) + 1).padStart(2, "0")}.jpg`;
}
