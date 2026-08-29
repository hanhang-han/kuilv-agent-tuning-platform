/**
 * 种子数据生成脚本
 * 运行：npm run generate
 *
 * 产出 data/ 下的竞对 / 类目 / 类目知识 / 商品 / Prompt 版本。
 * 固定随机种子、可重复执行。
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  Category, Competitor, KnowledgeVersion, Product, ProductFactors, PromptVersion, T4Weights,
} from '../src/lib/types';

// ─── 可复现随机数 ────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260830);
const rand = (min: number, max: number) => min + rng() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─── 静态配置：6 竞对 × 10 城市 × 12 品类 ────────────────────────

const ALL_CITIES = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '西安', '南京', '重庆'];

const COMPETITORS: Competitor[] = [
  { id: 'comp-a', name: '竞对A·惠丰优选', coverageMode: 'sales', cities: ALL_CITIES, note: '数据完备：有 30 天销量数据，走策略一（T2 销量榜单）' },
  { id: 'comp-b', name: '竞对B·餐链直采', coverageMode: 'inventory', cities: ['北京', '上海', '广州', '成都', '杭州', '武汉', '西安', '南京'], note: '仅有库存快照，走策略二（T3 库存推算）' },
  { id: 'comp-c', name: '竞对C·食达汇', coverageMode: 'none', cities: ['上海', '广州', '深圳', '成都', '杭州', '武汉', '重庆'], note: '销量库存均无，走策略三（T4 多因子评分）' },
  { id: 'comp-d', name: '竞对D·鲜厨优选', coverageMode: 'sales', cities: ['北京', '上海', '深圳', '成都', '杭州', '武汉', '西安', '重庆'], note: '数据完备：有 30 天销量数据，走策略一（T2 销量榜单）' },
  { id: 'comp-e', name: '竞对E·粮农汇', coverageMode: 'inventory', cities: ['北京', '广州', '深圳', '成都', '西安', '南京', '重庆'], note: '仅有库存快照，走策略二（T3 库存推算）' },
  { id: 'comp-f', name: '竞对F·味达通', coverageMode: 'none', cities: ['上海', '广州', '杭州', '武汉', '南京', '重庆'], note: '销量库存均无，走策略三（T4 多因子评分）' },
];

const TOP_CATS = [
  { id: 'cat-bs', name: '半熟调理' },
  { id: 'cat-sx', name: '生鲜肉类' },
  { id: 'cat-sc', name: '蔬菜蛋品' },
  { id: 'cat-mm', name: '米面粮油' },
  { id: 'cat-tw', name: '调味酱料' },
  { id: 'cat-gf', name: '农副干货' },
  { id: 'cat-dp', name: '冻品水产' },
  { id: 'cat-js', name: '酒水饮料' },
  { id: 'cat-cy', name: '茶饮咖啡' },
  { id: 'cat-xl', name: '休闲零食' },
  { id: 'cat-hb', name: '烘焙原料' },
  { id: 'cat-bh', name: '日用百货' },
] as const;

const LEAF_DEFS: { id: string; name: string; parentId: string; cores: string[] }[] = [
  // 半熟调理
  { id: 'bs-yw', name: '腌制烤肉类', parentId: 'cat-bs', cores: ['腌制五花肉片', '奥尔良腌鸡腿', '黑椒腌制牛肉粒', '酱香腌制猪颈肉', '蜜汁叉烧肉', '孜然腌羊肉片', '蒜香腌制排骨', '藤椒腌鸡腿肉', '盐酥鸡腌块', '香辣腌制鸡翅', '沙姜腌鸡块', '咖喱腌制牛肉片'] },
  { id: 'bs-cc', name: '烧烤串类', parentId: 'cat-bs', cores: ['羔羊肉串', '牛肉串', '鸡脆骨串', '鱿鱼串', '掌中宝串', '烤面筋串', '五花肉串', '鸡心串', '板筋串', '鸡皮串', '烤肠串', '年糕串'] },
  { id: 'bs-wj', name: '火锅丸饺类', parentId: 'cat-bs', cores: ['撒尿牛丸', '鱼豆腐', '虾滑', '贡丸', '韭菜猪肉水饺', '香菜牛肉丸', '火锅年糕条', '包心鱼丸', '鱼皮饺', '墨鱼丸', '猪肉白菜水饺', '水晶虾饺'] },
  { id: 'bs-yc', name: '预制菜肴类', parentId: 'cat-bs', cores: ['梅菜扣肉', '酸菜鱼', '佛跳墙', '宫保鸡丁', '鱼香肉丝', '红烧狮子头', '台式卤肉', '辣子鸡', '水煮肉片', '回锅肉', '藤椒鱼片', '麻婆豆腐'] },
  // 生鲜肉类
  { id: 'sx-xr', name: '鲜分割肉类', parentId: 'cat-sx', cores: ['猪五花肉', '牛腩块', '羊后腿肉', '鸡胸肉', '猪里脊', '牛腱子', '鸡翅中', '精排骨段', '猪前腿肉', '牛上脑', '鸡琵琶腿', '羊排'] },
  { id: 'sx-lr', name: '冷冻肉类', parentId: 'cat-sx', cores: ['冷冻猪前腿肉', '冷冻牛腩', '冷冻羊肉卷', '冷冻鸡腿', '冷冻猪排骨', '冷冻牛肉块', '冷冻五花肉片', '冷冻鹅腿', '冷冻鸡全翅', '冷冻猪耳', '冷冻牛舌', '冷冻鸭腿'] },
  { id: 'sx-nz', name: '内脏副产品类', parentId: 'cat-sx', cores: ['猪肝', '牛百叶', '鸭肠', '猪肚', '鸭血', '牛筋', '鸡胗', '猪大肠', '猪心', '牛肚', '鸭胗', '鸡肠'] },
  // 蔬菜蛋品
  { id: 'sc-yc', name: '叶菜类', parentId: 'cat-sc', cores: ['大白菜', '娃娃菜', '上海青', '油麦菜', '生菜', '菠菜', '茼蒿', '空心菜', '韭菜', '西兰花', '菜心', '芥蓝'] },
  { id: 'sc-gj', name: '根茎类', parentId: 'cat-sc', cores: ['土豆', '洋葱', '大葱', '生姜', '大蒜', '白萝卜', '胡萝卜', '莲藕', '山药', '芋头', '莴笋', '竹笋'] },
  { id: 'sc-dan', name: '蛋类', parentId: 'cat-sc', cores: ['土鸡蛋', '洋鸡蛋', '鹌鹑蛋', '咸鸭蛋', '皮蛋', '卤蛋', '巴氏杀菌蛋液', '蛋白液', '蛋黄液', '清洁蛋'] },
  { id: 'sc-dz', name: '豆制品类', parentId: 'cat-sc', cores: ['北豆腐', '南豆腐', '内酯豆腐', '豆腐皮', '腐竹', '千张', '油豆腐', '冻豆腐', '鲜豆皮', '千叶豆腐', '素鸡', '豆腐泡'] },
  { id: 'sc-sj', name: '食用菌类', parentId: 'cat-sc', cores: ['香菇', '平菇', '金针菇', '杏鲍菇', '白玉菇', '茶树菇', '鲜木耳', '秀珍菇', '海鲜菇', '双孢菇', '鸡腿菇', '滑子菇'] },
  // 米面粮油
  { id: 'mm-dm', name: '大米类', parentId: 'cat-mm', cores: ['五常大米', '东北珍珠米', '长粒香米', '稻花香米', '糯米', '胚芽米', '碎米', '猫牙米', '泰国香米', '丝苗米', '汉江米', '富硒米'] },
  { id: 'mm-mf', name: '面粉类', parentId: 'cat-mm', cores: ['高筋面粉', '低筋面粉', '中筋面粉', '面包粉', '全麦面粉', '蛋糕粉', '饺子粉', '澄粉', '荞麦粉', '玉米粉', '糯米粉', '土豆淀粉'] },
  { id: 'mm-sy', name: '食用油类', parentId: 'cat-mm', cores: ['大豆油', '菜籽油', '花生油', '玉米油', '葵花籽油', '调和油', '稻米油', '芝麻香油', '橄榄油', '山茶油', '藤椒油', '辣椒油'] },
  { id: 'mm-zl', name: '杂粮类', parentId: 'cat-mm', cores: ['红豆', '绿豆', '小米', '燕麦米', '黑米', '薏仁米', '荞麦米', '糙米', '花腰豆', '鹰嘴豆', '高粱米', '大麦米'] },
  // 调味酱料
  { id: 'tw-jy', name: '酱油醋类', parentId: 'cat-tw', cores: ['生抽', '老抽', '草菇酱油', '陈醋', '米醋', '香醋', '白醋', '薄盐酱油', '红烧酱油', '蒸鱼豉油', '苹果醋', '甜醋'] },
  { id: 'tw-fh', name: '复合调味料类', parentId: 'cat-tw', cores: ['蚝油', '鸡精', '味极鲜', '沙茶酱', '烧烤酱', '蒜蓉酱', '藤椒酱', '照烧汁', '排骨酱', '海鲜酱', '叉烧酱', '黑椒酱'] },
  { id: 'tw-xx', name: '香辛料类', parentId: 'cat-tw', cores: ['花椒', '八角', '桂皮', '孜然粒', '白胡椒粉', '辣椒粉', '五香粉', '丁香', '香叶', '小茴香', '草果', '白芝麻'] },
  { id: 'tw-hd', name: '火锅底料类', parentId: 'cat-tw', cores: ['牛油麻辣底料', '清油底料', '番茄底料', '菌汤底料', '酸菜底料', '骨汤底料', '冬阴功底料', '鸳鸯锅底料', '藤椒底料', '咖喱底料', '海鲜锅底料', '潮汕牛肉锅底料'] },
  // 农副干货
  { id: 'gf-jg', name: '菌菇干货类', parentId: 'cat-gf', cores: ['干香菇', '黑木耳', '银耳', '黄花菜', '竹荪', '榛蘑', '茶树菇干', '猴头菇', '干虫草花', '姬松茸'] },
  { id: 'gf-fs', name: '粉丝粉条类', parentId: 'cat-gf', cores: ['红薯粉丝', '土豆粉条', '龙口粉丝', '桂林米粉', '河粉', '宽粉', '水晶粉', '红薯宽粉', '绿豆粉丝', '蕨根粉'] },
  { id: 'gf-hc', name: '海产干货类', parentId: 'cat-gf', cores: ['虾皮', '海带结', '紫菜', '干贝', '淡菜干', '虾米', '鱿鱼干', '海米', '裙带菜', '烤鱼片'] },
  // 冻品水产
  { id: 'dp-yl', name: '冷冻鱼类', parentId: 'cat-dp', cores: ['巴沙鱼片', '三文鱼段', '带鱼段', '秋刀鱼', '鲅鱼段', '鳕鱼块', '鲈鱼', '黄花鱼', '鲳鱼', '鲽鱼头', '金枪鱼段', '裸斑鱼'] },
  { id: 'dp-xl', name: '冷冻虾类', parentId: 'cat-dp', cores: ['南美白对虾', '阿根廷红虾', '虾仁', '基围虾', '龙虾尾', '皮皮虾肉', '黑虎虾', '磷虾', '北极甜虾', '冻熟虾仁', '斑节虾', '厄瓜多尔白虾'] },
  { id: 'dp-bl', name: '贝类', parentId: 'cat-dp', cores: ['蛏子肉', '花蛤肉', '扇贝柱', '贻贝肉', '生蚝肉', '蛤蜊肉', '鲍鱼', '北极贝', '章鱼段', '墨鱼仔', '海螺肉', '象拔蚌'] },
  // 酒水饮料
  { id: 'js-bj', name: '白酒类', parentId: 'cat-js', cores: ['酱香大曲酒', '浓香型白酒', '清香型白酒', '二锅头', '高粱酒', '米酒', '荞麦酒', '玉米白酒', '淡雅浓香酒', '小曲清香酒', '泸型原浆', '洞藏老酒'] },
  { id: 'js-pj', name: '啤酒类', parentId: 'cat-js', cores: ['精酿IPA', '全麦白啤', '原浆啤酒', '扎啤桶装', '黑啤', '果味啤酒', '无醇啤酒', '大罐黄啤', '皮尔森', '世涛啤酒', '荔枝小麦啤', '青柠啤酒'] },
  { id: 'js-yl', name: '饮料类', parentId: 'cat-js', cores: ['橙汁饮料', '酸梅汤', '柠檬茶', '豆奶', '椰子水', '气泡水', '电解质饮料', '冰红茶', '绿豆汤', '冬瓜茶', '玉米汁', '杨梅汁'] },
  { id: 'js-rp', name: '乳品类', parentId: 'cat-js', cores: ['纯牛奶', '酸奶', '淡奶油', '黄油', '奶粉', '炼乳', '奶酪碎', '调制乳', '早餐奶', '风味发酵乳', '稀奶油', '奶油奶酪'] },
  // 茶饮咖啡
  { id: 'cy-cm', name: '茶叶类', parentId: 'cat-cy', cores: ['茉莉花茶', '乌龙茶', '四季春茶', '锡兰红茶', '绿茶', '普洱熟茶', '大麦茶', '桂花乌龙', '茉莉绿茶', '三角红茶包', '青柑普洱', '冷泡茶包'] },
  { id: 'cy-kf', name: '咖啡类', parentId: 'cat-cy', cores: ['意式咖啡豆', '冷萃咖啡液', '速溶黑咖啡', '拿铁咖啡粉', '摩卡咖啡酱', '咖啡伴侣', '冻干咖啡粉', '单品咖啡豆', '挂耳咖啡', '咖啡浓缩液'] },
  { id: 'cy-jj', name: '糖浆小料类', parentId: 'cat-cy', cores: ['果糖糖浆', '蔗糖糖浆', '椰果', '珍珠波霸', '芋圆', '红豆罐头', '布丁粉', '寒天晶球', '西米', '蜜豆', '脆波波', '马蹄爆爆珠'] },
  // 休闲零食
  { id: 'xl-ph', name: '膨化食品类', parentId: 'cat-xl', cores: ['薯片', '虾条', '爆米花', '锅巴', '米饼', '玉米脆', '洋葱圈', '蛋卷', '炸薯条半成品', '小麻花', '猫耳朵', '沙琪玛'] },
  { id: 'xl-gd', name: '糕点类', parentId: 'cat-xl', cores: ['蛋糕胚', '麻薯', '桃酥', '老婆饼', '凤梨酥', '曲奇', '蛋黄酥', '绿豆糕', '蛋挞皮', '泡芙壳', '江米条', '枣泥糕'] },
  { id: 'xl-jg', name: '坚果炒货类', parentId: 'cat-xl', cores: ['瓜子', '花生米', '开心果', '巴旦木', '腰果', '榛子', '夏威夷果', '松子', '碧根果', '核桃仁', '混合坚果', '怪味豆'] },
  // 烘焙原料
  { id: 'hb-fz', name: '发酵类', parentId: 'cat-hb', cores: ['高活性干酵母', '泡打粉', '小苏打', '耐高糖酵母', '天然酵母种', '面包改良剂', '蛋糕乳化剂', '塔塔粉', '吉士粉', '酵母营养剂'] },
  { id: 'hb-xl', name: '馅料类', parentId: 'cat-hb', cores: ['豆沙馅', '莲蓉馅', '奶黄馅', '芋泥馅', '肉松馅', '五仁馅', '榴莲馅', '草莓果酱', '蓝莓果馅', '凤梨馅'] },
  { id: 'hb-qk', name: '巧克力装饰类', parentId: 'cat-hb', cores: ['黑巧克力币', '白巧克力币', '可可粉', '淋面酱', '耐烤巧克力豆', '巧克力笔', '彩色糖珠', '防潮糖粉', '翻糖膏', '椰蓉'] },
  // 日用百货
  { id: 'bh-cj', name: '餐具类', parentId: 'cat-bh', cores: ['一次性筷子', '降解餐盒', '塑料勺', '纸杯', '打包袋', '保鲜膜', '一次性手套', '吸管', '竹签', '透明餐盒', '铝箔餐盒', '纸碗'] },
  { id: 'bh-qj', name: '清洁用品类', parentId: 'cat-bh', cores: ['洗洁精', '84消毒液', '抹布', '钢丝球', '垃圾袋', '地拖', '洗手液', '除油剂', '百洁布', '油污净', '消毒湿巾', '厨房纸巾'] },
  { id: 'bh-yc', name: '一次性用品类', parentId: 'cat-bh', cores: ['一次性桌布', '一次性围裙', '锡纸', '保鲜袋', '餐巾纸', '湿巾', '台布', '隔油纸', '一次性帽子', '口罩', '鞋套', '硅油纸'] },
];

const CATEGORIES: Category[] = [
  ...TOP_CATS.map((t) => ({ id: t.id, name: t.name, path: t.name, parentId: 'root' })),
  ...LEAF_DEFS.map((l) => ({
    id: l.id, name: l.name, parentId: l.parentId,
    path: `${TOP_CATS.find((t) => t.id === l.parentId)!.name}/${l.name}`,
    ambiguityGroup: ['bs-yw', 'bs-cc', 'sx-xr', 'sx-lr'].includes(l.id) ? 'meat-boundary' : undefined,
  })),
];

/** 类目边界难点商品：标题关键词交叉（烤肉/烧烤/串/冷冻），需边界规则才能判对 */
const BOUNDARY_DEFS: { title: string; trueCategoryId: string; compId: string }[] = [
  { title: '【门店专供】秘制腌料腌制五花肉片500g 烧烤专用', trueCategoryId: 'bs-yw', compId: 'comp-a' },
  { title: '现穿羔羊肉串20串装 腌制入味✨', trueCategoryId: 'bs-cc', compId: 'comp-a' },
  { title: '烧烤用鲜羊肉块500g 未腌制现切', trueCategoryId: 'sx-xr', compId: 'comp-a' },
  { title: '碳烤牛肉串 生鲜现穿 整条装', trueCategoryId: 'bs-cc', compId: 'comp-a' },
  { title: '奥尔良腌鸡腿肉 烤肉店专用2.5kg', trueCategoryId: 'bs-yw', compId: 'comp-a' },
  { title: '穿签雪花牛肉串15签装', trueCategoryId: 'bs-cc', compId: 'comp-a' },
  { title: '鲜切黄牛肉片 火锅烧烤两用', trueCategoryId: 'sx-xr', compId: 'comp-a' },
  { title: '冷冻未腌制羊后腿肉块 整块5kg', trueCategoryId: 'sx-lr', compId: 'comp-a' },
  { title: '酱香腌制猪颈肉片400g 韩式烤肉', trueCategoryId: 'bs-yw', compId: 'comp-a' },
  { title: '农家土猪肉五花切块 现杀现发', trueCategoryId: 'sx-xr', compId: 'comp-a' },
  { title: '火锅用肥牛卷 冷冻原切3kg', trueCategoryId: 'sx-lr', compId: 'comp-a' },
  { title: '黑椒腌制牛肉粒 铁板烧用1kg', trueCategoryId: 'bs-yw', compId: 'comp-a' },
  { title: '【厂家直供】蒜香腌制鸡翅中 调味装2kg', trueCategoryId: 'bs-yw', compId: 'comp-b' },
  { title: '生穿鸡肉串 未腌制 大串20根', trueCategoryId: 'bs-cc', compId: 'comp-b' },
  { title: '内蒙古羔羊肉卷 涮肉用 未加工', trueCategoryId: 'sx-lr', compId: 'comp-b' },
  { title: '烧烤用精品牛五花切片 现切不腌制', trueCategoryId: 'sx-xr', compId: 'comp-b' },
  { title: '藤椒腌制鸡腿肉串 穿签即烤', trueCategoryId: 'bs-cc', compId: 'comp-b' },
  { title: '秘制孜然腌羊肉片 烤肉腌制专用', trueCategoryId: 'bs-yw', compId: 'comp-b' },
  { title: '鲜猪肋排段 烧烤斩块 未加工', trueCategoryId: 'sx-xr', compId: 'comp-b' },
  { title: '冷冻原切猪五花肉片 火锅食材', trueCategoryId: 'sx-lr', compId: 'comp-b' },
  { title: '和牛雪花牛肉粒 腌制调味装', trueCategoryId: 'bs-yw', compId: 'comp-b' },
  { title: '掌中宝穿串 生鲜现穿30串', trueCategoryId: 'bs-cc', compId: 'comp-b' },
  { title: '排酸牛后腿肉块 现切鲜冻两用', trueCategoryId: 'sx-lr', compId: 'comp-b' },
  { title: '腌制蜜汁叉烧肉 烤箱专用800g', trueCategoryId: 'bs-yw', compId: 'comp-b' },
  { title: '【爆款】香辣腌制鸡翅根 烤制预调', trueCategoryId: 'bs-yw', compId: 'comp-c' },
  { title: '无骨鸡爪穿串 泡椒风味', trueCategoryId: 'bs-cc', compId: 'comp-c' },
  { title: '原切未腌制牛舌片 烧肉店用', trueCategoryId: 'sx-xr', compId: 'comp-c' },
  { title: '冷冻带骨羊排 整扇未加工', trueCategoryId: 'sx-lr', compId: 'comp-c' },
  { title: '川香腌制麻辣牛肉片 烤串店专用', trueCategoryId: 'bs-yw', compId: 'comp-c' },
  { title: '竹签穿五花肉卷 生鲜未腌', trueCategoryId: 'bs-cc', compId: 'comp-c' },
  { title: '精品鲜羊肉片 手切涮肉', trueCategoryId: 'sx-xr', compId: 'comp-c' },
  { title: '冷冻腌制牛肉串 半成品穿串', trueCategoryId: 'bs-cc', compId: 'comp-c' },
  { title: '黑猪五花肉块 铁板烧用 鲜肉现切', trueCategoryId: 'sx-xr', compId: 'comp-c' },
  { title: '冷冻调理腌制猪排 炸物预腌', trueCategoryId: 'bs-yw', compId: 'comp-c' },
  { title: '孜然腌制羊肉粒 烧烤撒料版', trueCategoryId: 'bs-yw', compId: 'comp-c' },
  { title: '四季豆培根卷 穿串半成品', trueCategoryId: 'bs-cc', compId: 'comp-c' },
  { title: '叉烧味腌制梅花肉 蜜汁烤制装', trueCategoryId: 'bs-yw', compId: 'comp-d' },
  { title: '原切羊肉串 未腌生鲜 商用装', trueCategoryId: 'bs-cc', compId: 'comp-d' },
  { title: '烧烤用带皮五花肉块 鲜切', trueCategoryId: 'sx-xr', compId: 'comp-d' },
  { title: '肥牛卷 涮煮两用 冷冻整箱', trueCategoryId: 'sx-lr', compId: 'comp-d' },
  { title: '新奥尔良风味腌鸡翅 烤制半成品', trueCategoryId: 'bs-yw', compId: 'comp-d' },
  { title: '黑椒味腌制牛肉串 现穿即烤', trueCategoryId: 'bs-cc', compId: 'comp-d' },
  { title: '火锅用嫩羊肉片 机切未加工', trueCategoryId: 'sx-xr', compId: 'comp-d' },
  { title: '冷冻去骨羊腿肉 整块原切', trueCategoryId: 'sx-lr', compId: 'comp-d' },
  { title: '香辣腌小黄鱼 烤炉预调味', trueCategoryId: 'bs-yw', compId: 'comp-e' },
  { title: '穿签整条秋刀鱼 烧烤生鲜', trueCategoryId: 'bs-cc', compId: 'comp-e' },
  { title: '烧烤用牛板肉 鲜冻切块', trueCategoryId: 'sx-lr', compId: 'comp-e' },
  { title: '原切猪梅肉条 蜜汁腌制装', trueCategoryId: 'bs-yw', compId: 'comp-e' },
  { title: '生穿鱿鱼串 大串未腌制', trueCategoryId: 'bs-cc', compId: 'comp-e' },
  { title: '涮用肥羊卷 冷冻原切2.5kg', trueCategoryId: 'sx-lr', compId: 'comp-e' },
  { title: '藤椒腌鸡翅尖 烤串半成品', trueCategoryId: 'bs-yw', compId: 'comp-e' },
  { title: '锡纸烤用金针菇牛肉卷 穿串装', trueCategoryId: 'bs-cc', compId: 'comp-e' },
  { title: '腌制五香牛腩块 炖煮预调', trueCategoryId: 'bs-yw', compId: 'comp-f' },
  { title: '生穿鸡脆骨串 未腌制生鲜', trueCategoryId: 'bs-cc', compId: 'comp-f' },
  { title: '烧烤用鲜牛舌 原切未加工', trueCategoryId: 'sx-xr', compId: 'comp-f' },
  { title: '冷冻猪五花整条 未分割原切', trueCategoryId: 'sx-lr', compId: 'comp-f' },
  { title: '麻辣腌鸡腿排 烤制即食装', trueCategoryId: 'bs-yw', compId: 'comp-f' },
  { title: '穿串青椒牛肉卷 生鲜半成品', trueCategoryId: 'bs-cc', compId: 'comp-f' },
  { title: '手切鲜羊肉厚片 涮烤两用', trueCategoryId: 'sx-xr', compId: 'comp-f' },
  { title: '冷冻牛骨髓 整段未加工', trueCategoryId: 'sx-lr', compId: 'comp-f' },
];

// ─── 脏标题生成 ──────────────────────────────────────────────────

const PREFIXES = ['【门店专供】', '【厂家直供】', '【爆款】', '【特惠】', '【餐饮专供】', '【今日鲜达】', '【平台精选】'];
const MARKET_WORDS = ['精品', '正宗', '农家', '甄选', '金牌', '原切', '大厨推荐', '旺销', '直供'];
const EMOJIS = ['✨', '🔥', '🥩', '⚡', '👍', '🚀'];
const SUFFIXES = ['餐饮装', '商用装', '酒店专供', '大包装', '食堂装', '连锁专供'];
const SPECS = ['500g', '1kg', '2.5kg', '5kg', '10kg/箱', '20袋/箱', '25kg', '5斤装', '10kg/袋', '50枚/箱', '30份/组', '20kg/件'];

function dirtyTitle(core: string): string {
  let t = core;
  if (rng() < 0.35) t = pick(PREFIXES) + t;
  if (rng() < 0.4) t = pick(MARKET_WORDS) + t;
  if (rng() < 0.8) t += ' ' + pick(SPECS);
  if (rng() < 0.2) t += pick(EMOJIS);
  if (rng() < 0.2) t += ' ' + pick(SUFFIXES);
  return t;
}

// ─── 商品生成 ────────────────────────────────────────────────────

const products: Product[] = [];
let pid = 0;
const addProduct = (p: Omit<Product, 'id'>) => {
  pid += 1;
  products.push({ ...p, id: `p-${String(pid).padStart(5, '0')}` });
};

function genTrueSales(): number {
  const r = rng();
  if (r < 0.35) return Math.round(rand(15, 90));      // 长尾
  if (r < 0.65) return Math.round(rand(90, 220));     // 中部
  return Math.round(rand(250, 2600));                 // 高销（金标候选）
}

function genInventorySeries(sales30: number): number[] {
  const daily = Math.max(1, sales30 / 30);
  let stock = Math.round(daily * rand(2.5, 4));
  const series: number[] = [stock];
  for (let day = 1; day < 9; day++) {
    let sold = daily * rand(0.5, 1.3);
    if (rng() < 0.12) sold = 0;
    stock = Math.max(0, stock - sold);
    if (rng() < 0.15) stock += daily * rand(2, 3);
    series.push(Math.round(stock));
  }
  return series;
}

function genFactors(level: number): ProductFactors {
  return {
    promo7d: rng() < 0.2 + 0.5 * level,
    onSale30d: Math.round(clamp(level * 30 * rand(0.75, 1.15), 3, 30)),
    onSale180d: Math.round(clamp(level * 6 * rand(0.7, 1.2), 1, 6)),
    channelTags: level > 0.55 ? (rng() < 0.5 ? ['热销'] : ['热销', '爆款']) : rng() < 0.3 ? ['新品尝鲜'] : [],
  };
}

/** 每竞对×叶子类目的基础商品数与城市覆盖幅度（决定口径密度） */
const COMP_SCALE: Record<string, { perLeaf: number; cityMin: number; cityMax: number }> = {
  'comp-a': { perLeaf: 20, cityMin: 3, cityMax: 6 },
  'comp-b': { perLeaf: 16, cityMin: 2, cityMax: 5 },
  'comp-c': { perLeaf: 13, cityMin: 2, cityMax: 4 },
  'comp-d': { perLeaf: 18, cityMin: 2, cityMax: 5 },
  'comp-e': { perLeaf: 14, cityMin: 2, cityMax: 4 },
  'comp-f': { perLeaf: 11, cityMin: 2, cityMax: 3 },
};

for (const leaf of LEAF_DEFS) {
  for (const comp of COMPETITORS) {
    const scale = COMP_SCALE[comp.id];
    for (let i = 0; i < scale.perLeaf; i++) {
      const core = leaf.cores[(i + Math.floor(rng() * leaf.cores.length)) % leaf.cores.length];
      const trueSales = genTrueSales();
      const cityCount = randInt(scale.cityMin, Math.min(scale.cityMax, comp.cities.length));
      addProduct({
        competitorId: comp.id,
        title: dirtyTitle(core),
        trueCategoryId: leaf.id,
        parentId: leaf.parentId,
        cities: shuffle(comp.cities).slice(0, cityCount),
        price: Math.round(rand(8, 420) * 10) / 10,
        trueSales30d: trueSales,
        sales30d: comp.coverageMode === 'sales' ? trueSales : undefined,
        inventorySeries: comp.coverageMode === 'inventory' ? genInventorySeries(trueSales) : undefined,
        factors: comp.coverageMode === 'none' ? genFactors(rng()) : undefined,
        goldCities: [],
      });
    }
  }
}

for (const b of BOUNDARY_DEFS) {
  const comp = COMPETITORS.find((c) => c.id === b.compId)!;
  const trueSales = rng() < 0.6 ? Math.round(rand(260, 2200)) : Math.round(rand(60, 200));
  const cityCount = randInt(2, Math.min(4, comp.cities.length));
  addProduct({
    competitorId: comp.id,
    title: b.title,
    trueCategoryId: b.trueCategoryId,
    parentId: CATEGORIES.find((c) => c.id === b.trueCategoryId)!.parentId,
    cities: shuffle(comp.cities).slice(0, cityCount),
    price: Math.round(rand(15, 260) * 10) / 10,
    trueSales30d: trueSales,
    sales30d: comp.coverageMode === 'sales' ? trueSales : undefined,
    inventorySeries: comp.coverageMode === 'inventory' ? genInventorySeries(trueSales) : undefined,
    factors: comp.coverageMode === 'none' ? genFactors(clamp(trueSales / 2000, 0.1, 0.95)) : undefined,
    goldCities: [],
    isBoundaryCase: true,
  });
}

// 金标（策略一）：口径内真值销量 top20% 且 ≥200 件，最少 3 个
const cellStats: { size: number; gold: number }[] = [];
for (const comp of COMPETITORS) {
  for (const city of comp.cities) {
    for (const top of TOP_CATS) {
      const list = products
        .filter((p) => p.competitorId === comp.id && p.parentId === top.id && p.cities.includes(city))
        .sort((a, b) => b.trueSales30d - a.trueSales30d);
      const eligible = list.filter((p) => p.trueSales30d >= 200);
      const K = Math.max(3, Math.ceil(list.length * 0.2));
      for (const p of eligible.slice(0, K)) p.goldCities.push(city);
      cellStats.push({ size: list.length, gold: Math.min(eligible.length, K) });
    }
  }
}

// ─── 类目知识与 Prompt 版本 ──────────────────────────────────────

const W_CAL: T4Weights = { promo: 0.35, onSale30: 0.25, onSale180: 0.25, channelTag: 0.15 };

const SYSTEM_PROMPT_V1 = `你是快驴选品分析师，任务是对给定口径（竞对 × 城市 × 品类）识别竞对平台的高销品，产出结构化选品推荐清单。

执行流程：
1. 先调用 T1 探测该口径的数据覆盖情况
2. 按覆盖结果选择策略工具：有销量数据 → T2；仅有库存 → T3；均无 → T4
3. 对候选商品调用 T5 做类目语义对齐；归属不确定时输出「待人工复核」标记，禁止猜测
4. 调用 T6 为每个入选品生成推荐理由，理由中的数字必须来自工具返回值
5. 严格按 JSON Schema 输出

工具使用规则：
- 所有数值结论必须来自工具返回，禁止自行推算或编造数值
- 选品清单是人工审核环节的输入，宁缺毋滥`;

const T5_DESC_GOOD = `将竞对商品标题映射到快驴标准类目。关键边界规则：腌制/调味/酱制处理过的肉制品（未穿串）归「腌制烤肉类」；穿串/穿签预处理（无论是否腌制）归「烧烤串类」；仅含烹饪建议词（如"烧烤用""火锅用"）的未加工鲜肉归「鲜分割肉类」；冷冻的未加工肉归「冷冻肉类」。归属不确定时输出「待人工复核」，禁止猜测。`;

const baseToolDescs = {
  T1: '探测指定口径（竞对×城市×品类）的数据覆盖质量。返回：sales（有销量数据）/ inventory（仅有库存数据）/ none（均无）。用于决定策略路由。',
  T2: '查询类目内销量榜单。输出类目内销量 top20% 且 ≥200 件的高销品（30 天窗口）。适用于有销量数据的竞对。',
  T3: '库存推算销量。基于 3 天窗口差值算法：周期内两两做差、剔除负差值（补货）、取最大正差值，各周期累加。适用于仅有库存数据的竞对。',
  T4: '多因子评分。四因子加权：近 7 天促销 / 近 30 天持续在售 / 近 180 天长期有效在售 / 渠道标签。适用于无销量无库存数据的竞对。',
} as const;

const T6_DESC_TEMPLATE = '按三段式模板生成推荐理由：命中策略 + 关键数据 + 卖家价值点。所有数字必须从工具返回值通过占位符填充，禁止模型自行生成数字。';

const KNOWLEDGE_VERSIONS: KnowledgeVersion[] = [
  { id: 'kv-v0', label: 'kv-v0', note: '仅类目枚举，无边界定义、无样例', entries: [] },
  {
    id: 'kv-v1', label: 'kv-v1', note: '含易混淆类目边界规则',
    entries: [
      { categoryId: 'bs-yw', boundaryRules: '腌制、调味、酱制处理过的肉制品（未穿串）归本类。注意：即使标题含「烤肉」「烧烤」字样，只要经过腌制且未穿串，仍归本类。' },
      { categoryId: 'bs-cc', boundaryRules: '穿串、穿签预处理的商品归本类，无论是否腌制（穿串优先于腌制判断）。' },
      { categoryId: 'sx-xr', boundaryRules: '未加工的鲜肉归本类。注意：标题仅含烹饪建议词（烧烤用、火锅用、铁板烧用）不代表经过加工。' },
      { categoryId: 'sx-lr', boundaryRules: '冷冻的未加工肉归本类。冷冻羊肉卷、肥牛卷等虽为涮肉用途，仍属冷冻肉类。' },
    ],
  },
  {
    id: 'kv-v2', label: 'kv-v2', note: '边界规则 + few-shot 样例',
    entries: [
      {
        categoryId: 'bs-yw', boundaryRules: '腌制、调味、酱制处理过的肉制品（未穿串）归本类。注意：即使标题含「烤肉」「烧烤」字样，只要经过腌制且未穿串，仍归本类。',
        fewShots: [
          { title: '秘制腌料腌制五花肉片 烧烤专用', categoryId: 'bs-yw' },
          { title: '黑椒腌制牛肉粒 铁板烧用', categoryId: 'bs-yw' },
        ],
      },
      {
        categoryId: 'bs-cc', boundaryRules: '穿串、穿签预处理的商品归本类，无论是否腌制（穿串优先于腌制判断）。',
        fewShots: [
          { title: '现穿羔羊肉串 腌制入味', categoryId: 'bs-cc' },
          { title: '生穿鸡肉串 未腌制', categoryId: 'bs-cc' },
        ],
      },
      {
        categoryId: 'sx-xr', boundaryRules: '未加工的鲜肉归本类。注意：标题仅含烹饪建议词（烧烤用、火锅用、铁板烧用）不代表经过加工。',
        fewShots: [
          { title: '烧烤用鲜羊肉块 未腌制现切', categoryId: 'sx-xr' },
          { title: '鲜切黄牛肉片 火锅烧烤两用', categoryId: 'sx-xr' },
        ],
      },
      {
        categoryId: 'sx-lr', boundaryRules: '冷冻的未加工肉归本类。冷冻羊肉卷、肥牛卷等虽为涮肉用途，仍属冷冻肉类。',
        fewShots: [
          { title: '冷冻未腌制羊后腿肉块', categoryId: 'sx-lr' },
          { title: '火锅用肥牛卷 冷冻原切', categoryId: 'sx-lr' },
        ],
      },
    ],
  },
];

const PROMPT_VERSIONS: PromptVersion[] = [
  {
    id: 'pv-v1.1', label: 'v1.1', createdAt: '2026-08-03T09:00:00+08:00',
    systemPrompt: SYSTEM_PROMPT_V1,
    toolDescriptions: {
      T1: baseToolDescs.T1, T2: baseToolDescs.T2, T3: baseToolDescs.T3, T4: baseToolDescs.T4,
      T5: T5_DESC_GOOD, T6: T6_DESC_TEMPLATE,
    },
    knowledgeVersionId: 'kv-v2', t6Mode: 'template', t4Weights: W_CAL,
    changeNote: '理由模板化（数字占位符填充）+ 类目知识含边界规则与 few-shot 样例',
    builtin: true,
  },
];

// ─── 写文件 + 校验统计 ───────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const write = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✓ ${name} (${(fs.statSync(path.join(DATA_DIR, name)).size / 1024).toFixed(1)} KB)`);
};

write('competitors.json', COMPETITORS);
write('categories.json', CATEGORIES);
write('category-knowledge.json', KNOWLEDGE_VERSIONS);
write('products.json', products);
write('prompts.json', PROMPT_VERSIONS);

console.log('\n══════════ 校验统计 ══════════');
console.log(`竞对 ${COMPETITORS.length} 个 × 品类 ${TOP_CATS.length} 个（${LEAF_DEFS.length} 个叶子类目）`);
console.log(`商品总数: ${products.length}（边界难点商品 ${products.filter((p) => p.isBoundaryCase).length}）`);
const totalCells = cellStats.length;
const avgSize = Math.round(cellStats.reduce((s, c) => s + c.size, 0) / totalCells);
const avgGold = Math.round(cellStats.reduce((s, c) => s + c.gold, 0) / totalCells);
const emptyCells = cellStats.filter((c) => c.size === 0).length;
console.log(`口径: ${totalCells} 个（平均商品数 ${avgSize}，平均金标 ${avgGold}，空口径 ${emptyCells}）`);
console.log(`标题去重率: ${(new Set(products.map((p) => p.title)).size / products.length * 100).toFixed(1)}%`);
console.log('\n✅ 种子数据生成完成');
