// 《一刀999》静态配置：职业、怪物资料、掉落池与运行环境标记。
// 只包含数据与纯函数，不依赖游戏运行时状态。

export const STORAGE_KEY = "oneknife999-prototype-save-v4";
export const LEGACY_STORAGE_KEY = "oneknife999-prototype-save-v3";
export const LEGACY_STORAGE_KEY_V2 = "oneknife999-prototype-save-v2";
// 允许在无 DOM 环境（如 Node 单测、未来服务端共享）导入本模块
const hasWindow = typeof window !== "undefined";
const URL_FLAGS = new URLSearchParams(hasWindow ? window.location.search : "");
const LOCAL_TEST_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
export const TEST_MODE = hasWindow && LOCAL_TEST_HOSTS.has(window.location.hostname) && URL_FLAGS.has("e2e");
export const FAST_FORWARD = TEST_MODE && URL_FLAGS.has("fast");
// 0.6.0 P0 行为系统开关（仅测试用）：`?e2e=1&noabilities=1` 关闭全部怪物行为，
// 用于 A/B 对照量化「行为系统对难度的真实影响」。生产环境（非 e2e）恒为 false。
export const ABILITIES_ENABLED = !(TEST_MODE && URL_FLAGS.has("noabilities"));
// 0.7.3 细粒度消融：`noabilities` 是总闸，下面三个正交开关分别只关一类行为，
// 用来定位「第 30 关的死亡压力到底来自攻击形态、被动，还是亡语」。
// 语义约定：noabilities 全关；其余三个开关在总闸关闭时无意义（已随总闸一起失效）。
export const ATTACK_SHAPES_ENABLED = ABILITIES_ENABLED && !(TEST_MODE && URL_FLAGS.has("noabishapes"));
export const PASSIVES_ENABLED = ABILITIES_ENABLED && !(TEST_MODE && URL_FLAGS.has("noabipassives"));
export const DEATH_EFFECTS_ENABLED = ABILITIES_ENABLED && !(TEST_MODE && URL_FLAGS.has("noabideath"));

export const CLASSES = {
  warrior: {
    name: "战士",
    glyph: "刃",
    color: "#e7b36b",
    subtitle: "贴身爆发 · 追击 · 承伤",
    hp: 350,
    resource: 100,
    resourceName: "怒气",
    attack: 33,
    defense: 22,
    speed: 218,
    range: 70,
    cooldown: 0.62,
    skills: [
      {
        name: "破甲斩",
        cost: 10,
        cd: 3,
        damage: 1.45,
        range: 90,
        kind: "破甲",
        desc: "斩击锁定目标，造成 145% 攻击伤害，并使目标防御降低 15%，持续 4 秒。"
      },
      {
        name: "旋风扫",
        cost: 20,
        cd: 6,
        damage: 1.08,
        range: 125,
        kind: "范围",
        area: 125,
        areaLabel: "半径 4 格",
        desc: "以自身为中心横扫，最多命中 5 个敌人，每个目标承受 108% 攻击伤害。"
      },
      {
        name: "震地冲",
        cost: 25,
        cd: 12,
        damage: 1.25,
        range: 180,
        kind: "冲锋",
        desc: "向锁定目标突进最多 140 像素并击退，造成 125% 攻击伤害，突进瞬间获得 0.2 秒无敌。"
      },
      {
        name: "焚天斩",
        cost: 40,
        cd: 10,
        damage: 2.4,
        range: 105,
        kind: "爆发",
        desc: "对锁定目标施放重斩，造成 240% 攻击伤害；满破势时可被一刀时刻强化。"
      }
    ]
  },
  mage: {
    name: "法师",
    glyph: "焰",
    color: "#78b6ec",
    subtitle: "远程群攻 · 区域控制 · 清怪",
    hp: 235,
    resource: 240,
    resourceName: "法力",
    attack: 41,
    defense: 10,
    speed: 205,
    range: 220,
    cooldown: 0.86,
    skills: [
      {
        name: "雷矛术",
        cost: 14,
        cd: 2.5,
        damage: 1.65,
        range: 260,
        kind: "穿透",
        desc: "向锁定目标射出雷矛，沿直线穿透最多 3 个敌人，每个承受 165% 魔法伤害；可在 9 格内施放。"
      },
      {
        name: "焰痕地带",
        cost: 35,
        cd: 10,
        damage: 1.15,
        range: 180,
        kind: "范围",
        area: 180,
        areaLabel: "半径 6 格",
        desc: "以自身为中心铺开焰痕，范围内最多 5 个敌人承受 115% 魔法伤害。"
      },
      {
        name: "烈焰震环",
        cost: 25,
        cd: 12,
        damage: 1.2,
        range: 125,
        kind: "范围",
        area: 125,
        areaLabel: "半径 4 格",
        desc: "向周围爆开烈焰，造成 120% 魔法伤害并推开近身敌人。"
      },
      {
        name: "天火陨星",
        cost: 90,
        cd: 18,
        damage: 3.1,
        range: 300,
        kind: "爆发",
        desc: "召下天火锁定目标，造成 310% 魔法伤害；满破势时获得额外爆发。"
      }
    ]
  },
  taoist: {
    name: "道士",
    glyph: "符",
    color: "#a88ce3",
    subtitle: "持续输出 · 治疗 · 召唤",
    hp: 280,
    resource: 160,
    resourceName: "符力",
    attack: 30,
    defense: 16,
    speed: 210,
    range: 185,
    cooldown: 0.74,
    skills: [
      {
        name: "蚀骨咒",
        cost: 18,
        cd: 6,
        damage: 1.1,
        range: 205,
        kind: "削弱",
        desc: "对锁定目标施放蚀骨咒，造成 110% 道术伤害并积累一刀势能。"
      },
      {
        name: "召唤骨卫",
        cost: 35,
        cd: 20,
        damage: 0.8,
        range: 180,
        kind: "召唤",
        desc: "在身边召唤骨卫协同作战 12 秒：自动跟随、索敌，按你 40% 的普攻伤害出手。"
      },
      {
        name: "生息法阵",
        cost: 50,
        cd: 15,
        damage: 0,
        range: 120,
        kind: "治疗",
        area: 120,
        areaLabel: "半径 4 格",
        desc: "在脚下展开 4 秒生息法阵：站在阵中每秒回复 8% 最大生命，离开立即失效。"
      },
      {
        name: "镇魂符",
        cost: 10,
        cd: 2,
        damage: 1.55,
        range: 220,
        kind: "爆发",
        desc: "向锁定目标发射镇魂符，造成 155% 道术伤害；中毒目标更容易被终结。"
      }
    ]
  }
};

export const MONSTER_FLAVOR = {
  腐烬矿工: "被矿尘侵蚀的旧矿工，会挥动沉重矿镐追击闯入者。",
  赤牙猎犬: "速度很快的矿道猎犬，防御较低但近身攻击频繁。",
  裂脊尸卫: "披着残破甲片的守卫，生命与防御高于同区怪物。",
  灰烬侦察者: "在矿道外围巡游的斥候，攻击较高且体型灵活。",
  灰鬃狼: "雾松林中的群猎者，擅长快速贴近落单目标。",
  林皮蛛: "伏在林地阴影中的毒蛛，攻击高而护甲薄弱。",
  松鸦盗: "占据商路的盗匪，攻防均衡并会持续追击。",
  枯木菇人: "由腐木孢子聚成的怪物，生命与护甲较高。",
  黑岩矿工: "被深井怨气驱使的矿工，使用重型工具近身攻击。",
  落石魔: "岩层凝成的厚重魔物，移动迟缓但极难击穿。",
  矿脉蝙蝠: "盘旋在矿脉上方的袭击者，生命低但攻击凶狠。",
  腐毒僵尸: "尸皇气息催生的腐尸，靠近后持续制造压力。",
  赤砂蝎: "赤砂中潜伏的甲蝎，拥有较高防御与稳定伤害。",
  沙虫: "从沙层下钻出的巨虫，生命高且会紧贴目标。",
  沙盗斥候: "危险商道上的精锐斥候，攻击力远高于普通怪物。",
  枯骨游魂: "不受风沙阻挡的游魂，护甲较低但伤害不容忽视。",
  裂碑领主: "盘踞腐烬矿道的石碑守卫，低血量时会制造地裂危险区。",
  森林巨猿: "统治雾松林的巨兽，阶段二会在玩家附近召下落木。",
  坑道尸皇: "深井棺室的统治者，会召唤腐工，并在后续阶段制造地裂与吞噬区。",
  沙蝎王: "赤砂大漠的高危首领，尾刺会锁定玩家，并可叠加毒层。",
  // 十章主 Boss：此前没有档案文本，终局首领反而只有兜底文案。
  灰烬霸主: "赫连烬自愿化身的守门者，以自身封住了第一道烬门。",
  沧海妖皇: "替王朝护送火种的水军统帅，被灭口百年后化作妖皇。",
  地宫龙君: "龙脉的计数者，只认可仍保有人性的容器编号。",
  玄冰魔王: "停时冰镜核心的意志，永远重复执行百年前的撤退军令。",
  焚天魔尊: "初火最初的看守者，宣称魔域才保存着玄烬的正史。",
  幽冥鬼帝: "万名生死簿的保管者，记得每一个被献祭者的真名。",
  天穹圣主: "重置协议的执行者，相信毁灭文明是最小损失方案。",
  星陨邪神: "所有失败未来的集合体，由玩家切下的人性守护而成。",
  神魔战皇: "双史战争的具现，两条时间线都相信对方先背叛。",
  玄烬帝尊: "第千次轮回的终点，以玩家的面容等待最后一位容器归位。"
};

export const MONSTER_BEHAVIORS = {
  腐烬矿工: { skills: ["矿镐重击：近身造成高额物理伤害", "矿尘护体：短暂提高防御"] },
  赤牙猎犬: { skills: ["撕咬：连续两次快速攻击", "嗜血追踪：玩家低血时移速提高"] },
  裂脊尸卫: { skills: ["残甲冲撞：命中后短暂减速", "尸甲：受到的首次伤害降低"] },
  灰烬侦察者: { skills: ["投掷火石：远距离小范围伤害", "警戒号角：附近怪物短暂加攻"] },
  灰鬃狼: { skills: ["群猎撕咬：附近同类越多伤害越高", "跃袭：快速贴近目标"] },
  林皮蛛: { skills: ["毒牙：叠加一层中毒", "蛛网：降低玩家移动速度"] },
  松鸦盗: { skills: ["背刺：从侧后方攻击时增伤", "掷刃：中距离投掷飞刀"] },
  枯木菇人: { skills: ["孢子爆裂：死亡时留下短暂毒区", "木甲：防御较高"] },
  黑岩矿工: { skills: ["重锤：蓄力后造成震退", "落石警告：召唤小范围落石"] },
  落石魔: { skills: ["岩拳：高伤害近战攻击", "碎岩皮肤：受到暴击伤害降低"] },
  矿脉蝙蝠: { skills: ["俯冲：从空中快速突袭", "尖啸：短暂打断玩家动作"] },
  腐毒僵尸: { skills: ["腐毒抓：叠加持续伤害", "尸气：靠近时降低治疗效果"] },
  赤砂蝎: { skills: ["尾针：叠加毒层", "钻沙：短暂脱离锁定"] },
  沙虫: { skills: ["地底突袭：从玩家脚下出现", "沙甲：正面减伤"] },
  沙盗斥候: { skills: ["连射：连续发射三枚弩箭", "撤步：受伤后向后位移"] },
  枯骨游魂: { skills: ["魂火：远程追踪弹", "无形：短暂降低受到的物理伤害"] },
  腐烬战奴: {
    intro: "被守碑军遗留烬纹控制的战俑，仍重复执行百年前的封锁命令。",
    skills: ["烬纹重击：命中后留下灼热印记", "守碑姿态：低血时提高防御"]
  },
  赤牙猎兽: {
    intro: "边境驯兽场逃出的猎兽，嗅到玄烬气息后会追击携印者。",
    skills: ["撕裂突进：快速扑向目标", "血腥嗅觉：玩家低血时伤害提高"]
  },
  残甲尸兵: {
    intro: "穿着断裂军甲的守碑尸兵，胸甲上还刻着未完成的撤退令。",
    skills: ["断甲劈砍：造成高额近战伤害", "残军意志：首次受到致命伤害时保留少量生命"]
  },
  荒道斥候: {
    intro: "沿魂火车队巡逻的边境斥候，熟悉所有补给营的暗号。",
    skills: ["火石投掷：远程制造小范围灼烧", "警戒哨音：短暂强化附近敌人"]
  },
  潮骨水鬼: {
    intro: "被倒流潮水送回陆地的旧水军，骨甲里仍藏着未送达的军函。",
    skills: ["潮刃：近战附带缓速", "回潮：受伤后向水域方向退回"]
  },
  蓝鳞海妖: {
    intro: "替王朝守住海底档案的蓝鳞妖族，歌声会扰乱入侵者记忆。",
    skills: ["潮歌：降低玩家资源回复", "鳞光：短暂反射部分远程伤害"]
  },
  礁甲兽: { intro: "盘踞沉船航道的礁石巨兽，外壳记录着被抹掉的海战日期。", skills: ["礁壳冲撞：命中后击退", "潮甲：背部受到的伤害降低"] },
  逐浪刀客: { intro: "追随洛汐寻找水军姓名的亡命刀客，出手节奏随潮汐变化。", skills: ["逐浪三斩：连续三段攻击", "踏潮：短暂提高移动速度"] },
  石俑卫: { intro: "龙脉地宫的计数守卫，只对烬纹容器和盗取玉册者拔刀。", skills: ["石戟横扫：扇形近战伤害", "俑身固守：短暂免疫击退"] },
  龙脉毒虫: { intro: "吸食龙脉渗液的地宫毒虫，会把失败容器的编号刻进毒刺。", skills: ["龙毒：叠加持续伤害", "钻脉：短暂遁入地下"] },
  铜甲尸: {
    intro: "被司烬院封存在铜棺中的失败容器，听见玩家脚步便重新醒来。",
    skills: ["铜棺砸击：高额近战伤害", "铜甲反震：近战命中者受到反伤"]
  },
  寻宝恶徒: {
    intro: "追踪龙骨玉册的盗陵者，愿意用同伴的生命换取一块结晶。",
    skills: ["夺宝飞刃：中距离投掷", "贪婪护符：拾取附近能量后提高攻击"]
  },
  霜牙狼: { intro: "冰镜边缘的群猎狼，脚印会在同一分钟内反复出现。", skills: ["霜牙撕咬：命中后降低移速", "雪线围猎：同伴越多伤害越高"] },
  冻尸兵: { intro: "停时冰镜保存的亡军，胸前军令永远停在撤退前一刻。", skills: ["冻刃：附带寒冷减速", "冰躯：低血时受到伤害降低"] },
  冰壳魔: { intro: "以冻结记忆为食的冰壳魔物，会把活人的体温当作火种。", skills: ["冰壳震荡：范围伤害并减速", "寒甲：周期获得护盾"] },
  雪原猎手: { intro: "守护雪哨最后军令的猎手，拒绝让任何活人再被冰镜保存。", skills: ["冰弩：远程追踪攻击", "雪隐：短暂降低被命中概率"] },
  熔岩奴: {
    intro: "烬火炉心外环的熔岩奴，曾是被人族夺走初火的第一批守炉者。",
    skills: ["熔岩拳：命中后留下灼烧", "炉渣护体：受到伤害时反弹火星"]
  },
  火翼魔: { intro: "替赤鸢巡查魔域上空的火翼族，记得每一座被篡改的炉门。", skills: ["火翼俯冲：快速突袭", "焰羽：向周围散射火羽"] },
  焦骨卫: { intro: "在夺火战争中被烧焦的守卫，仍把入侵者误认作王朝军。", skills: ["焦骨劈：高额近战伤害", "余烬复燃：低血时恢复少量生命"] },
  炼狱行刑者: { intro: "魔域旧刑场的执行者，专门惩罚试图独占初火的容器。", skills: ["锁链拖拽：将目标拉近", "刑火印：目标越孤立伤害越高"] },
  摄魂鬼: {
    intro: "幽冥河边收集无名记忆的鬼影，每一张脸都来自被献祭的城民。",
    skills: ["摄魂：降低玩家最大资源", "无名雾：短暂隐藏自身轮廓"]
  },
  冥甲尸: {
    intro: "穿戴亡者姓名铸成的冥甲尸，拒绝让生死簿上的名字消失。",
    skills: ["冥甲重击：命中后造成持续伤害", "死者护佑：附近亡魂越多防御越高"]
  },
  渡魂妖: { intro: "替无咎摆渡亡魂的渡魂妖，迷失后会把活人也当成乘客。", skills: ["引魂灯：召来追踪鬼火", "摆渡步：短暂闪到玩家侧面"] },
  黄泉守卫: { intro: "看守万名生死簿的黄泉守卫，只允许记住真名的人通过。", skills: ["黄泉戟：扇形攻击", "名册封锁：短暂禁止药水回复"] },
  遗迹傀儡: { intro: "天穹遗迹坠落后仍在执行重置协议的古代傀儡。", skills: ["机关拳：命中后短暂眩晕", "协议护盾：周期生成正面护盾"] },
  雷羽妖: { intro: "盘旋在坠落遗迹上空的雷羽妖，负责监视重置星盘的读数。", skills: ["雷羽：远程落雷", "风暴翼：短暂提高移速并免疫减速"] },
  巡天卫: {
    intro: "维护双史天空航道的巡天卫，把所有接近星盘者登记为异常。",
    skills: ["天矛：直线穿透攻击", "巡天标记：提高后续受到的伤害"]
  },
  断界法师: { intro: "掌握重置边界的古代法师，认为毁灭文明是最小损失方案。", skills: ["断界弹：追踪魔法弹", "裂隙：在脚下生成延迟爆发区"] },
  陨晶兽: { intro: "吞食失败未来结晶的陨兽，体内映出玩家尚未经历的死亡。", skills: ["晶角冲锋：直线冲撞", "陨晶甲：受到技能伤害降低"] },
  虚空影: { intro: "从被删去的未来投下的影子，会模仿玩家最近一次攻击。", skills: ["影袭：复制基础攻击", "虚空步：短暂无敌并位移"] },
  星骸兵: { intro: "由失败轮回遗骸拼成的星骸兵，胸甲上刻着不同版本的终局。", skills: ["星骸斩：多段近战", "残星复起：死亡后短暂复原"] },
  禁区猎杀者: { intro: "专门清除未来证人的猎杀者，优先追击携带逆命星核者。", skills: ["猎杀箭：远程追踪", "处决：玩家低血时造成额外伤害"] },
  堕神卫: { intro: "两条时间线重叠后失去神名的堕神卫，仍守着不存在的神殿。", skills: ["神陨锤：范围震击", "堕神甲：周期降低受到的伤害"] },
  魔血骑: {
    intro: "以魔血维持停战誓约的骑士，误把双方的真实史书都当成敌书。",
    skills: ["魔血冲锋：冲向目标并击退", "血誓：低血时提高攻击"]
  },
  战场怨魂: { intro: "神魔战场的未名怨魂，记得两条历史中互相矛盾的死亡。", skills: ["怨火：追踪玩家位置", "战忆：附近同类死亡时提高伤害"] },
  破军修罗: {
    intro: "拒绝停战的破军修罗，相信只有继续战争才能证明自己的历史。",
    skills: ["破军连斩：连续近战攻击", "修罗怒：攻击命中后叠加攻速"]
  },
  帝陵禁卫: { intro: "玄烬帝陵最后的禁卫，把第千次轮回的容器视为归位者。", skills: ["帝陵戟：高额扇形伤害", "禁卫阵：附近同伴获得减伤"] },
  金甲尸王: {
    intro: "以历代容器金甲拼成的尸王，身体里保存着九百九十九段失败记忆。",
    skills: ["金甲重踏：范围震退", "尸王再起：低血时召回一名禁卫"]
  },
  镇国妖师: {
    intro: "替旧王朝维持双史封锁的妖师，知道帝尊真正的第一张脸。",
    skills: ["镇国符：封锁玩家技能冷却", "妖火阵：以目标为中心生成火圈"]
  },
  不灭战魂: {
    intro: "帝陵终殿永不熄灭的战魂，拒绝承认第千次轮回可以选择不同答案。",
    skills: ["不灭斩：生命越低伤害越高", "战魂回响：复制最近一次危险技能"]
  }
};

export const COMMON_DROPS = [
  {
    name: "生命药水",
    kind: "health_potion",
    slot: "consumable",
    quality: "blue",
    glyph: "药",
    color: "#f16d66",
    desc: "拾取后增加 1 瓶生命药水",
    weight: 36
  },
  {
    name: "回元露",
    kind: "resource_potion",
    slot: "consumable",
    quality: "blue",
    glyph: "露",
    color: "#78b6ec",
    desc: "拾取后恢复 35% 职业资源",
    weight: 24
  },
  {
    name: "散落金币袋",
    kind: "gold",
    slot: "currency",
    quality: "white",
    glyph: "金",
    color: "#e7b36b",
    desc: "拾取后获得一小袋金币",
    weight: 20
  }
];

export function monsterProfile(entity, map) {
  if (!entity.boss) {
    const behavior = MONSTER_BEHAVIORS[entity.name];
    return {
      intro: entity.intro || behavior?.intro || MONSTER_FLAVOR[entity.name] || "游荡在当前区域的敌对生物。",
      // 0.6.0 统一 schema：MONSTER_BEHAVIORS 全部为 { intro, skills } 对象（此前数组/对象混用）。
      skills: entity.skills || behavior?.skills || [`近身攻击：基础伤害 ${entity.attack}`, `护甲：防御 ${entity.defense}`]
    };
  }
  const kind = map.boss.specialKind;
  const special =
    kind === "logs"
      ? "落木狂暴：在玩家附近生成落木圈"
      : kind === "devour"
        ? "地裂吞噬：制造延迟爆发危险区"
        : kind === "sting"
          ? "锁定尾刺：瞄准玩家位置并叠加毒层"
          : "碑裂震击：低血量后制造地裂圈";
  const summon = map.boss.summonMob !== undefined ? "召唤腐工：周期召来普通怪物" : `阶段转换：共 ${map.boss.phases} 个阶段`;
  return { intro: MONSTER_FLAVOR[entity.name] || "当前区域的首领。", skills: [special, summon] };
}

// ============ 0.2.5 装备 / 强化 / 词缀 / 技能升级 / PK 配置（对齐 docs/02、03、05、11） ============

// 12 装备部位（docs/03）：键名即存档与 equipment 对象的字段；hp 为该部位提供的固定生命加成。
export const EQUIPMENT_SLOTS = {
  weapon: { label: "武器", glyph: "刃", hp: 0 },
  helmet: { label: "头盔", glyph: "盔", hp: 40 },
  neck: { label: "项链", glyph: "玉", hp: 45 },
  armor: { label: "衣服", glyph: "甲", hp: 60 },
  braceletL: { label: "左手镯", glyph: "镯", hp: 20 },
  braceletR: { label: "右手镯", glyph: "镯", hp: 20 },
  ringL: { label: "左戒指", glyph: "戒", hp: 15 },
  ringR: { label: "右戒指", glyph: "戒", hp: 15 },
  belt: { label: "腰带", glyph: "带", hp: 30 },
  boots: { label: "靴子", glyph: "靴", hp: 0 },
  medal: { label: "勋章", glyph: "勋", hp: 35 },
  talisman: { label: "玉佩", glyph: "佩", hp: 35 }
};
export const EQUIPMENT_SLOT_KEYS = Object.keys(EQUIPMENT_SLOTS);

// 强化 +1~+15（docs/03）：失败不降级、不销毁；+10 起失败积累祝福值，满 100 下一次必成。
// 金币消耗 = ENHANCE_BASE_COST × 1.5^(目标等级)；+8 起额外消耗 1 件材料类物品。
export const ENHANCE_RULES = {
  max: 15,
  baseCost: 70,
  costGrowth: 1.5,
  materialFromLevel: 8,
  rates: [
    { from: 1, to: 5, rate: 1.0, blessingOnFail: 0 },
    { from: 6, to: 8, rate: 0.7, blessingOnFail: 15 },
    { from: 9, to: 12, rate: 0.4, blessingOnFail: 12 },
    { from: 13, to: 15, rate: 0.2, blessingOnFail: 10 }
  ],
  powerStep: 0.08 // 每级强化按基础 power 的 8% 提升有效战力
};

// 关卡通关奖励（docs/03 确定性目标：首领印记与基础材料）。
// checkMapCompletion 发放，任务链任务卡同步展示，避免奖励文案与发放漂移。
export const QUEST_REWARD = { gold: 60, marks: 8 };

// 拆解返还的基础强化材料模板（docs/03：拆解返还 50% 基础强化材料）。
// 与生成地图的「黑铁矿石」同名同品质，掉落与拆解共用堆叠。
export const BASIC_MATERIAL = {
  name: "黑铁矿石",
  slot: "material",
  quality: "blue",
  glyph: "矿",
  power: 0,
  value: 30,
  color: "#78b6ec",
  desc: "基础强化材料，+8 起强化消耗 1 件；可堆叠"
};

// 强化结算纯函数：返回 { canEnhance, reason, cost, materialNeeded, rate }。
export function enhanceQuote(item, playerGold, inventory) {
  const level = item?.enhance || 0;
  if (!item || item.slot === "material" || item.slot === "consumable" || item.slot === "currency")
    return { canEnhance: false, reason: "该物品不能强化", cost: 0, materialNeeded: 0, rate: 0 };
  if (level >= ENHANCE_RULES.max) return { canEnhance: false, reason: "已达强化上限 +15", cost: 0, materialNeeded: 0, rate: 0 };
  const target = level + 1;
  const tier = ENHANCE_RULES.rates.find((rule) => target >= rule.from && target <= rule.to) || ENHANCE_RULES.rates.at(-1);
  const cost = Math.round(ENHANCE_RULES.baseCost * Math.pow(ENHANCE_RULES.costGrowth, target));
  const materialNeeded = target >= ENHANCE_RULES.materialFromLevel ? 1 : 0;
  const hasMaterial = !materialNeeded || (inventory || []).some((entry) => entry.slot === "material");
  const rate = item.blessing >= 100 ? 1 : tier.rate;
  if (playerGold < cost) return { canEnhance: false, reason: `金币不足（需要 ${cost}）`, cost, materialNeeded, rate };
  if (!hasMaterial) return { canEnhance: false, reason: "+8 起需要 1 件材料类物品", cost, materialNeeded, rate };
  return { canEnhance: true, reason: "", cost, materialNeeded, rate };
}

// 词缀池（docs/03 七组的原型子集：主属性 / 生存 / 资源）。
// value 为随关号缩放的区间；随机数由调用方注入，保证可单测。
export const AFFIX_POOL = [
  { group: "主属性", key: "attack", label: "攻击", base: 4, perStage: 0.35 },
  { group: "生存", key: "hp", label: "生命", base: 14, perStage: 1.1 },
  { group: "生存", key: "defense", label: "防御", base: 1, perStage: 0.16 },
  { group: "资源", key: "regen", label: "恢复", base: 1, perStage: 0.06, percent: true }
];

// 技能升级（docs/02「每级提高倍率」的原型简化：每级 +6% 技能倍率，上限 10 级）。
export const SKILL_UPGRADE = { maxLevel: 10, multiplierPerLevel: 0.06, pointsPerLevel: 1 };

// PK 单机演示（docs/05）：主动击杀白名武者 +100 罪恶值；≥300 红名；红名死亡掉落 1 件穿戴装备；
// 20 级前不能主动攻击玩家；罪恶值只在危险区击杀普通怪时下降（每只 -2），安全区挂机不下降。
export const PK_RULES = {
  minLevelToAttack: 20,
  sinPerKill: 100,
  redNameThreshold: 300,
  sinDecayPerDangerKill: 2,
  dropOnRedDeath: 1
};

// 装备有效战力：基础 power + 强化加成 + 攻击词缀。
export function effectiveItemPower(item) {
  if (!item) return 0;
  const enhance = item.enhance || 0;
  const affixAttack = (item.affixes || []).filter((affix) => affix.key === "attack").reduce((sum, affix) => sum + affix.value, 0);
  return Math.round((item.power || 0) * (1 + ENHANCE_RULES.powerStep * enhance) + affixAttack);
}

// 装备提供的生命加成：部位固定值 + 生命词缀（强化不放大生命）。
export function equipmentHpBonus(item, slotKey) {
  if (!item) return 0;
  const slotBase = EQUIPMENT_SLOTS[slotKey]?.hp || 0;
  const affixHp = (item.affixes || []).filter((affix) => affix.key === "hp").reduce((sum, affix) => sum + affix.value, 0);
  return slotBase + affixHp;
}

// 装备提供的防御加成：防御词缀之和（原型不做部位基础防御）。
export function equipmentDefenseBonus(item) {
  if (!item) return 0;
  return (item.affixes || []).filter((affix) => affix.key === "defense").reduce((sum, affix) => sum + affix.value, 0);
}

// 装备三围汇总（0.4.0）：一次算全「有效战力 / 生命加成 / 防御加成」。
// 面板、装备预览、重铸对比共用同一个入口，避免出现「预览值」和「穿上后的面板值」两套算法。
export function equipmentTotals(equipment = {}) {
  const totals = { power: 0, hp: 0, defense: 0 };
  for (const slotKey of EQUIPMENT_SLOT_KEYS) {
    const item = equipment?.[slotKey];
    if (!item) continue;
    totals.power += effectiveItemPower(item);
    totals.hp += equipmentHpBonus(item, slotKey);
    totals.defense += equipmentDefenseBonus(item);
  }
  return totals;
}
