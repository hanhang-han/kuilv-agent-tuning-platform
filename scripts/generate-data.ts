/**
 * 种子数据生成脚本
 * 运行：npm run generate
 *
 * 产出 data/ 下全部种子文件，固定随机种子、可重复执行。
 * 数字体系（预置基准）：
 *   - case 池分布：通过 ~81%、E1 ~6%、E2 ~4%、E3 ~3%、E4 ~1%、E5 ~5%
 *   - 版本回归快照：v0.9 81% → v1.0 87% → v1.1 93%
 *   - 深检口径：类目对齐 85%→94%、理由一致 89%→96%、策略三准召 34%/62%→42%/70%
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentCase, AutoEval, Category, Competitor, ErrorType, KnowledgeVersion,
  Product, ProductFactors, PromptVersion, RecommendationItem, RegressionResult,
  ToolCall, T4Weights,
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
const rng = mulberry32(20260825);
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

// ─── 静态配置 ────────────────────────────────────────────────────

const CITIES = ['北京', '上海', '广州', '成都'];

const COMPETITORS: Competitor[] = [
  { id: 'comp-a', name: '竞对A·惠丰优选', coverageMode: 'sales', cities: ['北京', '上海', '广州', '成都'], note: '数据完备：有 30 天销量数据，走策略一（T2 销量榜单）' },
  { id: 'comp-b', name: '竞对B·餐链直采', coverageMode: 'inventory', cities: ['北京', '上海', '成都'], note: '仅有库存快照，走策略二（T3 库存推算）' },
  { id: 'comp-c', name: '竞对C·食达汇', coverageMode: 'none', cities: ['上海', '广州', '成都'], note: '销量库存均无，走策略三（T4 多因子评分）' },
];

interface CatDef { id: string; name: string; parentId: string }
const TOP_CATS: CatDef[] = [
  { id: 'cat-bs', name: '半熟调理', parentId: 'root' },
  { id: 'cat-sx', name: '生鲜肉类', parentId: 'root' },
  { id: 'cat-mm', name: '米面粮油', parentId: 'root' },
  { id: 'cat-tw', name: '调味酱料', parentId: 'root' },
  { id: 'cat-dp', name: '冻品水产', parentId: 'root' },
  { id: 'cat-js', name: '酒水饮料', parentId: 'root' },
  { id: 'cat-xl', name: '休闲零食', parentId: 'root' },
  { id: 'cat-bh', name: '日用百货', parentId: 'root' },
];

const LEAF_DEFS: { id: string; name: string; parentId: string; cores: string[] }[] = [
  { id: 'bs-yw', name: '腌制烤肉类', parentId: 'cat-bs', cores: ['腌制五花肉片', '奥尔良腌鸡腿', '黑椒腌制牛肉粒', '酱香腌制猪颈肉', '蜜汁叉烧肉', '孜然腌羊肉片', '蒜香腌制排骨', '藤椒腌鸡腿肉'] },
  { id: 'bs-cc', name: '烧烤串类', parentId: 'cat-bs', cores: ['羔羊肉串', '牛肉串', '鸡脆骨串', '鱿鱼串', '掌中宝串', '烤面筋串', '五花肉串', '鸡心串'] },
  { id: 'bs-wj', name: '火锅丸饺类', parentId: 'cat-bs', cores: ['撒尿牛丸', '鱼豆腐', '虾滑', '贡丸', '韭菜猪肉水饺', '香菜牛肉丸', '火锅年糕条', '包心鱼丸'] },
  { id: 'bs-yc', name: '预制菜肴类', parentId: 'cat-bs', cores: ['梅菜扣肉', '酸菜鱼', '佛跳墙', '宫保鸡丁', '鱼香肉丝', '红烧狮子头', '台式卤肉', '辣子鸡'] },
  { id: 'sx-xr', name: '鲜分割肉类', parentId: 'cat-sx', cores: ['猪五花肉', '牛腩块', '羊后腿肉', '鸡胸肉', '猪里脊', '牛腱子', '鸡翅中', '精排骨段'] },
  { id: 'sx-lr', name: '冷冻肉类', parentId: 'cat-sx', cores: ['冷冻猪前腿肉', '冷冻牛腩', '冷冻羊肉卷', '冷冻鸡腿', '冷冻猪排骨', '冷冻牛肉块', '冷冻五花肉片', '冷冻鹅腿'] },
  { id: 'sx-nz', name: '内脏副产品类', parentId: 'cat-sx', cores: ['猪肝', '牛百叶', '鸭肠', '猪肚', '鸭血', '牛筋', '鸡胗', '猪大肠'] },
  { id: 'mm-dm', name: '大米类', parentId: 'cat-mm', cores: ['五常大米', '东北珍珠米', '长粒香米', '稻花香米', '糯米', '胚芽米', '碎米', '猫牙米'] },
  { id: 'mm-mf', name: '面粉类', parentId: 'cat-mm', cores: ['高筋面粉', '低筋面粉', '中筋面粉', '面包粉', '全麦面粉', '蛋糕粉', '饺子粉', '澄粉'] },
  { id: 'mm-sy', name: '食用油类', parentId: 'cat-mm', cores: ['大豆油', '菜籽油', '花生油', '玉米油', '葵花籽油', '调和油', '稻米油', '芝麻香油'] },
  { id: 'mm-zl', name: '杂粮类', parentId: 'cat-mm', cores: ['红豆', '绿豆', '小米', '燕麦米', '黑米', '薏仁米', '荞麦米', '糙米'] },
  { id: 'tw-jy', name: '酱油醋类', parentId: 'cat-tw', cores: ['生抽', '老抽', '草菇酱油', '陈醋', '米醋', '香醋', '白醋', '薄盐酱油'] },
  { id: 'tw-fh', name: '复合调味料类', parentId: 'cat-tw', cores: ['蚝油', '鸡精', '味极鲜', '沙茶酱', '烧烤酱', '蒜蓉酱', '藤椒酱', '照烧汁'] },
  { id: 'tw-xx', name: '香辛料类', parentId: 'cat-tw', cores: ['花椒', '八角', '桂皮', '孜然粒', '白胡椒粉', '辣椒粉', '五香粉', '丁香'] },
  { id: 'tw-hd', name: '火锅底料类', parentId: 'cat-tw', cores: ['牛油麻辣底料', '清油底料', '番茄底料', '菌汤底料', '酸菜底料', '骨汤底料', '冬阴功底料', '鸳鸯锅底料'] },
  { id: 'dp-yl', name: '冷冻鱼类', parentId: 'cat-dp', cores: ['巴沙鱼片', '三文鱼段', '带鱼段', '秋刀鱼', '鲅鱼段', '鳕鱼块', '鲈鱼', '黄花鱼'] },
  { id: 'dp-xl', name: '冷冻虾类', parentId: 'cat-dp', cores: ['南美白对虾', '阿根廷红虾', '虾仁', '基围虾', '龙虾尾', '皮皮虾肉', '黑虎虾', '磷虾'] },
  { id: 'dp-bl', name: '贝类', parentId: 'cat-dp', cores: ['蛏子肉', '花蛤肉', '扇贝柱', '贻贝肉', '生蚝肉', '蛤蜊肉', '鲍鱼', '北极贝'] },
  { id: 'js-bj', name: '白酒类', parentId: 'cat-js', cores: ['酱香大曲酒', '浓香型白酒', '清香型白酒', '二锅头', '高粱酒', '米酒', '荞麦酒', '玉米白酒'] },
  { id: 'js-pj', name: '啤酒类', parentId: 'cat-js', cores: ['精酿IPA', '全麦白啤', '原浆啤酒', '扎啤桶装', '黑啤', '果味啤酒', '无醇啤酒', '大罐黄啤'] },
  { id: 'js-yl', name: '饮料类', parentId: 'cat-js', cores: ['橙汁饮料', '酸梅汤', '柠檬茶', '豆奶', '椰子水', '气泡水', '电解质饮料', '冰红茶'] },
  { id: 'js-rp', name: '乳品类', parentId: 'cat-js', cores: ['纯牛奶', '酸奶', '淡奶油', '黄油', '奶粉', '炼乳', '奶酪碎', '调制乳'] },
  { id: 'xl-ph', name: '膨化食品类', parentId: 'cat-xl', cores: ['薯片', '虾条', '爆米花', '锅巴', '米饼', '玉米脆', '洋葱圈', '蛋卷'] },
  { id: 'xl-gd', name: '糕点类', parentId: 'cat-xl', cores: ['蛋糕胚', '麻薯', '桃酥', '老婆饼', '凤梨酥', '曲奇', '蛋黄酥', '绿豆糕'] },
  { id: 'xl-jg', name: '坚果炒货类', parentId: 'cat-xl', cores: ['瓜子', '花生米', '开心果', '巴旦木', '腰果', '榛子', '夏威夷果', '松子'] },
  { id: 'bh-cj', name: '餐具类', parentId: 'cat-bh', cores: ['一次性筷子', '降解餐盒', '塑料勺', '纸杯', '打包袋', '保鲜膜', '一次性手套', '吸管'] },
  { id: 'bh-qj', name: '清洁用品类', parentId: 'cat-bh', cores: ['洗洁精', '84消毒液', '抹布', '钢丝球', '垃圾袋', '地拖', '洗手液', '除油剂'] },
  { id: 'bh-yc', name: '一次性用品类', parentId: 'cat-bh', cores: ['一次性桌布', '一次性围裙', '锡纸', '保鲜袋', '餐巾纸', '湿巾', '台布', '隔油纸'] },
];

const CATEGORIES: Category[] = [
  ...TOP_CATS.map((t) => ({ id: t.id, name: t.name, path: t.name, parentId: 'root' })),
  ...LEAF_DEFS.map((l) => ({
    id: l.id, name: l.name, parentId: l.parentId,
    path: `${TOP_CATS.find((t) => t.id === l.parentId)!.name}/${l.name}`,
    ambiguityGroup: ['bs-yw', 'bs-cc', 'sx-xr', 'sx-lr'].includes(l.id) ? 'meat-boundary' : undefined,
  })),
];

/** 类目边界难点商品（E1 素材）：标题关键词交叉，需边界规则才能判对 */
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
];

/** 边界类目混淆映射（E1 注入用：真值 → 易错目标） */
const CONFUSION: Record<string, string> = {
  'bs-yw': 'bs-cc', 'bs-cc': 'bs-yw', 'sx-xr': 'bs-yw', 'sx-lr': 'sx-xr',
};
/** 同父类近邻（快评易漏检的 subtle 错位） */
const SIBLING: Record<string, string> = {};
for (const leaf of LEAF_DEFS) {
  const sameParent = LEAF_DEFS.filter((l) => l.parentId === leaf.parentId && l.id !== leaf.id);
  SIBLING[leaf.id] = sameParent.length ? sameParent[0].id : leaf.id;
}

// ─── 脏标题生成 ──────────────────────────────────────────────────

const PREFIXES = ['【门店专供】', '【厂家直供】', '【爆款】', '【特惠】', '【餐饮专供】'];
const MARKET_WORDS = ['精品', '正宗', '农家', '甄选', '金牌', '原切', '大厨推荐'];
const EMOJIS = ['✨', '🔥', '🥩', '⚡', '👍'];
const SUFFIXES = ['餐饮装', '商用装', '酒店专供', '大包装'];
const SPECS = ['500g', '1kg', '2.5kg', '500g×20', '10kg/箱', '20袋/箱', '25kg', '5斤装'];

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
  products.push({ ...p, id: `p-${String(pid).padStart(4, '0')}` });
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

for (const leaf of LEAF_DEFS) {
  for (const comp of COMPETITORS) {
    // 每竞对×叶子类目的基础商品数：A 多、B 中、C 少但保证口径密度
    const n = comp.id === 'comp-a' ? 5 : comp.id === 'comp-b' ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const core = leaf.cores[(i + Math.floor(rng() * leaf.cores.length)) % leaf.cores.length];
      const trueSales = genTrueSales();
      const cityCount = comp.id === 'comp-a' ? randInt(2, 4) : comp.id === 'comp-c' ? randInt(2, 3) : randInt(1, 3);
      const cities = shuffle(comp.cities).slice(0, cityCount);
      addProduct({
        competitorId: comp.id,
        title: dirtyTitle(core),
        trueCategoryId: leaf.id,
        parentId: leaf.parentId,
        cities,
        price: Math.round(rand(8, 420) * 10) / 10,
        trueSales30d: trueSales,
        sales30d: comp.id === 'comp-a' ? trueSales : undefined,
        inventorySeries: comp.id === 'comp-b' ? genInventorySeries(trueSales) : undefined,
        factors: comp.id === 'comp-c' ? genFactors(rng()) : undefined,
        goldCities: [],
      });
    }
  }
}

// 边界难点商品
for (const b of BOUNDARY_DEFS) {
  const comp = COMPETITORS.find((c) => c.id === b.compId)!;
  const trueSales = rng() < 0.6 ? Math.round(rand(260, 2200)) : Math.round(rand(60, 200));
  const cityCount = comp.id === 'comp-a' ? randInt(2, 3) : randInt(1, 2);
  addProduct({
    competitorId: comp.id,
    title: b.title,
    trueCategoryId: b.trueCategoryId,
    parentId: CATEGORIES.find((c) => c.id === b.trueCategoryId)!.parentId,
    cities: shuffle(comp.cities).slice(0, cityCount),
    price: Math.round(rand(15, 260) * 10) / 10,
    trueSales30d: trueSales,
    sales30d: comp.id === 'comp-a' ? trueSales : undefined,
    inventorySeries: comp.id === 'comp-b' ? genInventorySeries(trueSales) : undefined,
    factors: comp.id === 'comp-c' ? genFactors(clamp(trueSales / 2000, 0.1, 0.95)) : undefined,
    goldCities: [],
    isBoundaryCase: true,
  });
}

// ─── 金标计算（策略一：真值销量 top20% 且 ≥200，最少 2 个） ─────

interface Cell { compId: string; city: string; parentId: string }
const cells: Cell[] = [];
for (const comp of COMPETITORS) for (const city of comp.cities) for (const top of TOP_CATS) {
  cells.push({ compId: comp.id, city, parentId: top.id });
}

const cellProducts = (c: Cell) => products.filter((p) => p.competitorId === c.compId && p.parentId === c.parentId && p.cities.includes(c.city));
const cellGold = (c: Cell) => cellProducts(c).filter((p) => p.goldCities.includes(c.city));

for (const cell of cells) {
  const list = cellProducts(cell).sort((a, b) => b.trueSales30d - a.trueSales30d);
  const eligible = list.filter((p) => p.trueSales30d >= 200);
  const K = Math.max(3, Math.ceil(list.length * 0.2));
  for (const p of eligible.slice(0, K)) p.goldCities.push(cell.city);
}

// ─── 策略算法（与运行时工具一致） ────────────────────────────────

function t3Estimate(series: number[]): number {
  let total = 0;
  for (let cyc = 0; cyc < 3; cyc++) {
    const [a, b, d] = [series[cyc * 3], series[cyc * 3 + 1], series[cyc * 3 + 2]];
    const diffs = [a - b, b - d, a - d].filter((x) => x > 0);
    if (diffs.length) total += Math.max(...diffs);
  }
  return Math.round(total * (10 / 3));
}

function t4Score(f: ProductFactors, w: T4Weights): number {
  return Math.round((w.promo * (f.promo7d ? 1 : 0) + w.onSale30 * (f.onSale30d / 30) + w.onSale180 * (f.onSale180d / 6) + w.channelTag * (Math.min(f.channelTags.length, 2) / 2)) * 1000) / 1000;
}

// ─── Prompt 版本与类目知识（三类可优化资产） ─────────────────────

const W_UNCAL: T4Weights = { promo: 0.4, onSale30: 0.2, onSale180: 0.2, channelTag: 0.2 };
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

const SYSTEM_PROMPT_BASE = `你是快驴选品分析师，对给定的口径（竞对 × 城市 × 品类）识别竞对平台的高销品，产出选品推荐清单。先探测数据覆盖情况，再获取候选商品，做类目对齐，生成推荐理由。`;

const T5_DESC_VAGUE = '将竞对商品标题映射到快驴标准类目，输出对应类目 ID。';
const T5_DESC_GOOD = `将竞对商品标题映射到快驴标准类目。关键边界规则：腌制/调味/酱制处理过的肉制品（未穿串）归「腌制烤肉类」；穿串/穿签预处理（无论是否腌制）归「烧烤串类」；仅含烹饪建议词（如"烧烤用""火锅用"）的未加工鲜肉归「鲜分割肉类」；冷冻的未加工肉归「冷冻肉类」。归属不确定时输出「待人工复核」，禁止猜测。`;

const baseToolDescs = {
  T1: '探测指定口径（竞对×城市×品类）的数据覆盖质量。返回：sales（有销量数据）/ inventory（仅有库存数据）/ none（均无）。用于决定策略路由。',
  T2: '查询类目内销量榜单。输出类目内销量 top20% 且 ≥200 件的高销品（30 天窗口）。适用于有销量数据的竞对。',
  T3: '库存推算销量。基于 3 天窗口差值算法：周期内两两做差、剔除负差值（补货）、取最大正差值，各周期累加。适用于仅有库存数据的竞对。',
  T4: '多因子评分。四因子加权：近 7 天促销 / 近 30 天持续在售 / 近 180 天长期有效在售 / 渠道标签。适用于无销量无库存数据的竞对。',
} as const;

const T6_DESC_FREE = '为每个推荐品生成推荐理由，说明命中策略、关键数据和适合快驴卖家的价值点。';
const T6_DESC_TEMPLATE = '按三段式模板生成推荐理由：命中策略 + 关键数据 + 卖家价值点。所有数字必须从工具返回值通过占位符填充，禁止模型自行生成数字。';

const KNOWLEDGE_VERSIONS: KnowledgeVersion[] = [
  {
    id: 'kv-v0', label: 'kv-v0（首版）', note: 'v0.9 时代：仅类目枚举，无边界定义、无样例',
    entries: [],
  },
  {
    id: 'kv-v1', label: 'kv-v1（边界完备化）', note: 'R2 迭代：补全易混淆类目组的自然语言边界规则',
    entries: [
      { categoryId: 'bs-yw', boundaryRules: '腌制、调味、酱制处理过的肉制品（未穿串）归本类。注意：即使标题含「烤肉」「烧烤」字样，只要经过腌制且未穿串，仍归本类。' },
      { categoryId: 'bs-cc', boundaryRules: '穿串、穿签预处理的商品归本类，无论是否腌制（穿串优先于腌制判断）。' },
      { categoryId: 'sx-xr', boundaryRules: '未加工的鲜肉归本类。注意：标题仅含烹饪建议词（烧烤用、火锅用、铁板烧用）不代表经过加工。' },
      { categoryId: 'sx-lr', boundaryRules: '冷冻的未加工肉归本类。冷冻羊肉卷、肥牛卷等虽为涮肉用途，仍属冷冻肉类。' },
    ],
  },
  {
    id: 'kv-v2', label: 'kv-v2（样例扩充）', note: 'R5 迭代：评审 case 回流，few-shot 对比样例库扩充',
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
    id: 'pv-baseline', label: 'baseline（调优起点）', createdAt: '2026-06-25T09:00:00+08:00',
    systemPrompt: SYSTEM_PROMPT_BASE,
    toolDescriptions: {
      T1: baseToolDescs.T1, T2: baseToolDescs.T2, T3: baseToolDescs.T3, T4: baseToolDescs.T4,
      T5: T5_DESC_VAGUE, T6: T6_DESC_FREE,
    },
    knowledgeVersionId: 'kv-v0', t6Mode: 'free', t4Weights: W_UNCAL,
    changeNote: '可调优基线：T5 描述含糊、T6 自由生成、因子权重未校准——已知存在明显优化空间，从这里 fork 开始调优实践',
    isBaseline: true, builtin: true,
  },
  {
    id: 'pv-v0.9', label: 'v0.9（首版）', createdAt: '2026-06-29T09:00:00+08:00',
    systemPrompt: SYSTEM_PROMPT_V1,
    toolDescriptions: {
      T1: baseToolDescs.T1, T2: baseToolDescs.T2, T3: baseToolDescs.T3, T4: baseToolDescs.T4,
      T5: T5_DESC_VAGUE, T6: T6_DESC_FREE,
    },
    knowledgeVersionId: 'kv-v0', t6Mode: 'free', t4Weights: W_UNCAL,
    changeNote: '首版上线：六工具 + Validator（无重试）。已知问题：类目对齐 85%、格式合规 92%',
    builtin: true,
  },
  {
    id: 'pv-v1.0', label: 'v1.0（工具描述重写）', createdAt: '2026-07-20T09:00:00+08:00',
    systemPrompt: SYSTEM_PROMPT_V1,
    toolDescriptions: {
      T1: baseToolDescs.T1, T2: baseToolDescs.T2, T3: baseToolDescs.T3, T4: baseToolDescs.T4,
      T5: T5_DESC_GOOD, T6: T6_DESC_FREE,
    },
    knowledgeVersionId: 'kv-v1', t6Mode: 'free', t4Weights: W_CAL,
    parentVersionId: 'pv-v0.9',
    changeNote: 'R2 迭代：重写 T5 工具描述（类目边界说明）；Validator 增加失败重试；四因子权重按策略一金标回测校准',
    builtin: true,
  },
  {
    id: 'pv-v1.1', label: 'v1.1（理由模板化）', createdAt: '2026-08-03T09:00:00+08:00',
    systemPrompt: SYSTEM_PROMPT_V1,
    toolDescriptions: {
      T1: baseToolDescs.T1, T2: baseToolDescs.T2, T3: baseToolDescs.T3, T4: baseToolDescs.T4,
      T5: T5_DESC_GOOD, T6: T6_DESC_TEMPLATE,
    },
    knowledgeVersionId: 'kv-v2', t6Mode: 'template', t4Weights: W_CAL,
    parentVersionId: 'pv-v1.0',
    changeNote: 'R5 迭代：T6 理由模板化（数字占位符填充，消灭数值幻觉来源）；类目知识 few-shot 样例扩充',
    builtin: true,
  },
];

// ─── Era 配置（错误分布按预设口径精确控制） ─────────────────────

interface EraConfig {
  versionId: string;
  weeks: number[];
  counts: Record<'pass' | ErrorType, number>;
  subtleAlign: number;  // 通过 case 中单项被 subtle 错位概率（快评漏检、深检可见）
  subtleE3: number;     // 通过 case 中单项理由数字轻微失真概率
  goldBC: Record<'comp-b' | 'comp-c', { p: number; r: number }>;
}

const ERAS: EraConfig[] = [
  {
    versionId: 'pv-v0.9', weeks: [1, 2, 3],
    counts: { pass: 202, E1: 24, E2: 9, E3: 14, E4: 5, E5: 16 },
    subtleAlign: 0.19, subtleE3: 0.13,
    goldBC: { 'comp-b': { p: 0.5, r: 0.7 }, 'comp-c': { p: 0.34, r: 0.62 } },
  },
  {
    versionId: 'pv-v1.0', weeks: [4, 5],
    counts: { pass: 91, E1: 5, E2: 4, E3: 2, E4: 1, E5: 5 },
    subtleAlign: 0.1, subtleE3: 0.08,
    goldBC: { 'comp-b': { p: 0.53, r: 0.72 }, 'comp-c': { p: 0.38, r: 0.66 } },
  },
  {
    versionId: 'pv-v1.1', weeks: [6, 7, 8],
    counts: { pass: 201, E1: 4, E2: 10, E3: 2, E4: 0, E5: 5 },
    subtleAlign: 0.065, subtleE3: 0.04,
    goldBC: { 'comp-b': { p: 0.55, r: 0.74 }, 'comp-c': { p: 0.42, r: 0.7 } },
  },
];

// ─── Case 合成 ───────────────────────────────────────────────────

const WEEK1_START = Date.UTC(2026, 5, 29); // 2026-06-29，第 8 周止于 2026-08-23
const weekStart = (w: number) => new Date(WEEK1_START + (w - 1) * 7 * 86400000);
const randTimeInWeek = (w: number) => {
  const t = WEEK1_START + (w - 1) * 7 * 86400000 + rand(0, 6.5) * 86400000;
  return new Date(t).toISOString();
};

const productById = new Map(products.map((p) => [p.id, p]));

interface ItemDraft {
  item: RecommendationItem;
  reasonConsistent: boolean;
  alignedCorrect: boolean;
}

function buildReason(item: RecommendationItem, mode: 'template' | 'free', fudge: 'none' | 'subtle' | 'obvious'): string {
  const n = item.metric ?? Math.round((item.score ?? 0.5) * 1000);
  const display = fudge === 'obvious' ? Math.round(n * rand(2.5, 4)) : fudge === 'subtle' ? Math.round(n * rand(1.2, 1.5)) : n;
  if (item.strategy === 'S1-销量榜单') {
    return mode === 'template'
      ? `命中策略一（销量榜单）：类目内销量 top20% 高销品，近 30 天销量 ${display} 件。数据完备、置信度高，适合快驴卖家快速起量。`
      : `该商品在竞对平台表现强劲，近 30 天销量约 ${display} 件，位居类目前列，适合快驴卖家快速起量。`;
  }
  if (item.strategy === 'S2-库存推算') {
    return mode === 'template'
      ? `命中策略二（库存推算）：近 30 天估算销量约 ${display} 件（保守下限）。无直接销量数据，建议小批量试销验证。`
      : `根据库存变化推算，该商品近 30 天销量约 ${display} 件，属于稳健动销品，建议引入试销。`;
  }
  const s = item.score ?? 0;
  const scoreDisp = fudge === 'obvious' ? (s * rand(1.5, 2)).toFixed(2) : fudge === 'subtle' ? (s * rand(1.15, 1.3)).toFixed(2) : s.toFixed(2);
  const salesClaim = fudge !== 'none' ? `近 30 天销量约 ${Math.round(rand(800, 3000))} 件，` : '';
  return mode === 'template'
    ? `命中策略三（多因子评分）：综合评分 ${scoreDisp} 分（促销/持续在售/长期在售/渠道标签加权）。数据稀缺口径的代理信号，建议谨慎评估后引入。`
    : `${salesClaim}该商品在无销量数据口径下综合评分 ${scoreDisp}，多维信号良好，值得关注引入。`;
}

function keyNumbersFor(item: RecommendationItem): Record<string, number> {
  if (item.strategy === 'S1-销量榜单') return { '近30天销量(件)': item.metric ?? 0 };
  if (item.strategy === 'S2-库存推算') return { '近30天估算销量(件)': item.metric ?? 0 };
  return { '多因子评分': item.score ?? 0 };
}

function buildCase(idx: number, cell: Cell, errorType: 'pass' | ErrorType, era: EraConfig, week: number): AgentCase {
  const comp = COMPETITORS.find((c) => c.id === cell.compId)!;
  const promptVersion = PROMPT_VERSIONS.find((p) => p.id === era.versionId)!;
  const cellList = cellProducts(cell);
  const gold = cellGold(cell);
  const goldIds = new Set(gold.map((p) => p.id));
  const nonGold = cellList.filter((p) => !goldIds.has(p.id));

  // 排序候选（工具返回顺序）
  const ranked = [...cellList].sort((a, b) => {
    if (comp.coverageMode === 'sales') return (b.sales30d ?? 0) - (a.sales30d ?? 0);
    if (comp.coverageMode === 'inventory') return t3Estimate(b.inventorySeries!) - t3Estimate(a.inventorySeries!);
    return t4Score(b.factors!, promptVersion.t4Weights) - t4Score(a.factors!, promptVersion.t4Weights);
  });
  const metricOf = (p: Product): { metric?: number; score?: number } =>
    comp.coverageMode === 'sales' ? { metric: p.sales30d }
      : comp.coverageMode === 'inventory' ? { metric: t3Estimate(p.inventorySeries!) }
        : { score: t4Score(p.factors!, promptVersion.t4Weights) };

  const strategy = comp.coverageMode === 'sales' ? 'S1-销量榜单' : comp.coverageMode === 'inventory' ? 'S2-库存推算' : 'S3-多因子评分';
  const t = promptVersion.t6Mode;

  // 选取输出商品
  let selected: Product[];
  if (comp.id === 'comp-a') {
    selected = gold.slice(0, 8);
    if (errorType === 'E5') selected = selected.slice(0, Math.max(1, Math.floor(selected.length / 2)));
    if (errorType === 'E2') {
      const lows = nonGold.filter((p) => (p.sales30d ?? 0) < 120).slice(0, 2);
      selected = [...selected, ...lows].slice(0, 8);
    }
  } else {
    const target = era.goldBC[comp.id as 'comp-b' | 'comp-c'];
    const r = errorType === 'E5' ? target.r * 0.55 : target.r;
    const p = errorType === 'E2' ? target.p * 0.6 : target.p;
    let selCount = Math.max(1, Math.round(gold.length * r));
    let nonCount = Math.min(Math.round(selCount * (1 - p) / p), 8 - selCount);
    if (errorType === 'E2') nonCount = Math.min(nonCount + 2, 8 - selCount);
    const selGold = ranked.filter((x) => goldIds.has(x.id)).slice(0, selCount);
    let selNon = ranked.filter((x) => !goldIds.has(x.id)).slice(0, Math.max(0, nonCount));
    if (errorType === 'E2') {
      const bottom = ranked.filter((x) => !goldIds.has(x.id)).slice(-2);
      selNon = [...new Map([...selNon, ...bottom].map((x) => [x.id, x])).values()].slice(0, 8 - selGold.length);
    }
    selected = [...selGold, ...selNon];
  }
  selected = selected.slice(0, 8);

  // 构造输出条目（含错误注入）
  const drafts: ItemDraft[] = selected.map((p) => {
    const { metric, score } = metricOf(p);
    return {
      item: {
        productId: p.id, title: p.title, categoryId: p.trueCategoryId, strategy,
        metric, score, reason: '', keyNumbers: {},
      },
      reasonConsistent: true, alignedCorrect: true,
    };
  });

  let validatorPassed = true;
  const e1Target = drafts.find((d) => productById.get(d.item.productId)?.isBoundaryCase) ?? drafts[0];

  if (errorType === 'E1' && e1Target) {
    e1Target.item.categoryId = CONFUSION[e1Target.item.categoryId] ?? SIBLING[e1Target.item.categoryId];
    e1Target.alignedCorrect = false;
  }
  if (errorType === 'E4' && drafts[0]) {
    drafts[0].item.categoryId = 'CAT-INVALID';
    drafts[0].item.reason = '';
    drafts[0].alignedCorrect = false;
    validatorPassed = false;
  }
  // subtle 错误（通过 case 也可能携带，快评漏检、深检可见）
  for (const d of drafts) {
    if (errorType !== 'pass' || d.item.categoryId === 'CAT-INVALID') continue;
    if (!d.alignedCorrect) continue;
    if (rng() < era.subtleAlign) { d.item.categoryId = SIBLING[d.item.categoryId]; d.alignedCorrect = false; }
  }

  // 理由生成（E3 注入 / subtle 失真）
  for (const d of drafts) {
    if (d.item.categoryId === 'CAT-INVALID') continue;
    let fudge: 'none' | 'subtle' | 'obvious' = 'none';
    if (errorType === 'E3' && d === drafts.find((x) => x.item.productId === drafts[0].item.productId)) fudge = 'obvious';
    else if (errorType === 'pass' && rng() < era.subtleE3) fudge = 'subtle';
    d.item.reason = buildReason(d.item, t, fudge);
    d.item.keyNumbers = keyNumbersFor(d.item);
    d.reasonConsistent = fudge === 'none';
  }
  if (errorType === 'E3') {
    const d0 = drafts[0];
    d0.reasonConsistent = false;
  }

  // 决策链路
  const createdAt = randTimeInWeek(week);
  const chain: ToolCall[] = [];
  chain.push({
    step: 1, tool: 'T1', name: '数据覆盖探测',
    input: { competitorId: cell.compId, city: cell.city, parentId: cell.parentId },
    output: { coverage: comp.coverageMode, dataVolume: cellList.length, lastUpdate: createdAt.slice(0, 10) },
    durationMs: randInt(180, 480), status: 'ok',
  });
  const strategyTool = comp.coverageMode === 'sales' ? 'T2' : comp.coverageMode === 'inventory' ? 'T3' : 'T4';
  chain.push({
    step: 2, tool: strategyTool,
    name: { T2: '销量榜单查询', T3: '库存推算', T4: '多因子评分' }[strategyTool],
    input: { competitorId: cell.compId, city: cell.city, parentId: cell.parentId, topPct: 0.2, minSales: 200 },
    output: {
      strategy,
      candidateCount: Math.min(ranked.length, 10),
      candidates: ranked.slice(0, 10).map((p) => {
        const { metric, score } = metricOf(p);
        return { productId: p.id, title: p.title, ...(metric !== undefined ? { sales30d: metric } : { score }) };
      }),
    },
    durationMs: randInt(300, 950), status: 'ok',
  });
  const alignments = drafts.map((d) => {
    const correct = d.item.categoryId === productById.get(d.item.productId)?.trueCategoryId;
    return {
      productId: d.item.productId, title: d.item.title, categoryId: d.item.categoryId,
      confidence: Math.round((correct ? rand(0.82, 0.97) : rand(0.5, 0.8)) * 100) / 100,
    };
  });
  chain.push({
    step: 3, tool: 'T5', name: '商品语义对齐',
    input: { productIds: drafts.map((d) => d.item.productId), knowledgeVersion: promptVersion.knowledgeVersionId },
    output: {
      alignments,
      pendingReview: alignments.filter((a) => a.confidence < 0.6).map((a) => a.productId),
    },
    durationMs: randInt(800, 2100), status: 'ok',
    note: `类目知识注入：${promptVersion.knowledgeVersionId}`,
  });
  chain.push({
    step: 4, tool: 'T6', name: '推荐理由生成',
    input: { items: drafts.map((d) => ({ productId: d.item.productId, categoryId: d.item.categoryId })), mode: t },
    output: { reasons: drafts.map((d) => ({ productId: d.item.productId, reason: d.item.reason })) },
    durationMs: randInt(600, 1900), status: 'ok',
    note: t === 'template' ? '模板化生成（数字占位符填充）' : '自由生成',
  });
  chain.push({
    step: 5, tool: 'validator', name: 'Validator 校验',
    input: { itemCount: drafts.length },
    output: {
      passed: validatorPassed,
      retries: validatorPassed ? 0 : 3,
      checks: [
        { name: 'JSON Schema 校验', passed: validatorPassed, detail: validatorPassed ? '通过' : 'categoryId "CAT-INVALID" 不在类目枚举内' },
        { name: '数值一致性校验（结构化字段）', passed: true, detail: '通过' },
        { name: '类目枚举校验', passed: validatorPassed, detail: validatorPassed ? '通过' : '存在枚举外类目' },
      ],
    },
    durationMs: randInt(40, 160),
    status: validatorPassed ? 'ok' : 'error',
    note: validatorPassed ? undefined : '重试 3 次仍失败，标记人工处理',
  });

  // 自动评测
  const total = drafts.length || 1;
  const alignedCount = drafts.filter((d) => d.alignedCorrect).length;
  const consistentCount = drafts.filter((d) => d.reasonConsistent).length;
  const outGoldCount = drafts.filter((d) => goldIds.has(d.item.productId)).length;
  const goldPrecision = drafts.length ? outGoldCount / drafts.length : undefined;
  const goldRecall = gold.length ? outGoldCount / gold.length : undefined;
  const detected: ErrorType[] = [];
  if (!validatorPassed) detected.push('E4');
  else {
    if (alignedCount < drafts.length) detected.push('E1');
    if (consistentCount < drafts.length) detected.push('E3');
    if (comp.id === 'comp-a') {
      if (goldPrecision !== undefined && goldPrecision < 1) detected.push('E2');
      if (goldRecall !== undefined && goldRecall < 1) detected.push('E5');
    } else if (goldRecall !== undefined && goldRecall < 0.5) {
      detected.push('E5');
    }
  }
  const autoEval: AutoEval = {
    formatPass: validatorPassed,
    alignmentAccuracy: alignedCount / total,
    reasonConsistency: consistentCount / total,
    goldPrecision, goldRecall,
    detectedErrors: detected,
  };

  // 评审标注
  const unreviewedRate = week === 8 ? 0.4 : week >= 6 ? 0.15 : 0.03;
  let review: AgentCase['review'];
  if (rng() > unreviewedRate) {
    const reviewedAt = new Date(new Date(createdAt).getTime() + rand(0.2, 2.5) * 86400000).toISOString();
    review = errorType === 'pass'
      ? { verdict: 'pass', reviewer: '产品PM', reviewedAt, note: '' }
      : { verdict: 'reject', errorType: errorType as ErrorType, reviewer: '产品PM', reviewedAt, note: '' };
  }

  const confidences = alignments.map((a) => a.confidence);
  const confidence = confidences.length ? confidences.reduce((s, x) => s + x, 0) / confidences.length : 0.9;

  return {
    id: `case-seed-${String(idx).padStart(4, '0')}`,
    createdAt, source: 'seed',
    spec: { competitorId: cell.compId, city: cell.city, parentId: cell.parentId },
    promptVersionId: era.versionId,
    chain, output: drafts.map((d) => d.item),
    validatorPassed, autoEval, review, week, confidence: Math.round(confidence * 100) / 100,
  };
}

// 生成全部 case
const cases: AgentCase[] = [];
{
  let idx = 0;
  for (const era of ERAS) {
    const cellOrder = shuffle(cells);
    let ci = 0;
    const tasks: ('pass' | ErrorType)[] = [
      ...Array(era.counts.pass).fill('pass'),
      ...(['E1', 'E2', 'E3', 'E4', 'E5'] as ErrorType[]).flatMap((e) => Array(era.counts[e]).fill(e)),
    ];
    for (const task of shuffle(tasks)) {
      idx += 1;
      const cell = cellOrder[ci % cellOrder.length];
      ci += 1;
      const week = era.weeks[(idx + Math.floor(rng() * era.weeks.length)) % era.weeks.length];
      cases.push(buildCase(idx, cell, task, era, week));
    }
  }
  cases.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  cases.forEach((c, i) => { c.id = `case-seed-${String(i + 1).padStart(4, '0')}`; });
}

// ─── 预置回归结果（基准快照） ───────────────────────────────────

const REGRESSIONS: RegressionResult[] = [
  {
    id: 'rg-v0.9', promptVersionId: 'pv-v0.9', caseCount: 500, mode: 'seed', createdAt: '2026-07-06T10:30:00+08:00',
    metrics: { passRate: 0.81, formatRate: 0.92, alignmentAcc: 0.85, reasonConsistency: 0.89, goldPrecision: 0.34, goldRecall: 0.62 },
    byErrorType: { E1: 30, E2: 5, E3: 12, E4: 40, E5: 8 },
    durationMs: 14 * 60 * 1000,
    narrative: '首版回归：格式违规 8% 是最大问题（Validator 尚无重试机制）；类目对齐 85%，边界类目错位集中',
  },
  {
    id: 'rg-v1.0', promptVersionId: 'pv-v1.0', baselineVersionId: 'pv-v0.9', caseCount: 500, mode: 'seed', createdAt: '2026-07-20T10:30:00+08:00',
    metrics: { passRate: 0.87, formatRate: 0.96, alignmentAcc: 0.91, reasonConsistency: 0.93, goldPrecision: 0.38, goldRecall: 0.66 },
    byErrorType: { E1: 17, E2: 8, E3: 10, E4: 20, E5: 10 },
    deltaVsBaseline: { passRate: 0.06, formatRate: 0.04, alignmentAcc: 0.06, reasonConsistency: 0.04, goldPrecision: 0.04, goldRecall: 0.04 },
    durationMs: 12 * 60 * 1000,
    narrative: 'R2 迭代验证：工具描述重写（类目边界说明）+ Validator 重试机制；确认未引入新错误类型',
  },
  {
    id: 'rg-v1.1', promptVersionId: 'pv-v1.1', baselineVersionId: 'pv-v1.0', caseCount: 500, mode: 'seed', createdAt: '2026-08-03T10:30:00+08:00',
    metrics: { passRate: 0.93, formatRate: 0.99, alignmentAcc: 0.94, reasonConsistency: 0.96, goldPrecision: 0.42, goldRecall: 0.7 },
    byErrorType: { E1: 12, E2: 8, E3: 6, E4: 5, E5: 4 },
    deltaVsBaseline: { passRate: 0.06, formatRate: 0.03, alignmentAcc: 0.03, reasonConsistency: 0.03, goldPrecision: 0.04, goldRecall: 0.04 },
    durationMs: 11 * 60 * 1000,
    narrative: 'R5 迭代验证：理由模板化（数字占位符）后理由幻觉基本消除；few-shot 扩充补齐长尾类目',
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
write('cases-seed.json', cases);
write('regressions-seed.json', REGRESSIONS);

// ── 校验统计 ──
console.log('\n══════════ 校验统计 ══════════');
console.log(`商品总数: ${products.length}（边界难点商品 ${products.filter((p) => p.isBoundaryCase).length}）`);
const reviewed = cases.filter((c) => c.review);
const dist = { pass: 0, E1: 0, E2: 0, E3: 0, E4: 0, E5: 0 };
for (const c of reviewed) {
  if (c.review!.verdict === 'pass') dist.pass += 1; else dist[c.review!.errorType!] += 1;
}
const totalReviewed = reviewed.length;
console.log(`\ncase 总数: ${cases.length}（已评审 ${totalReviewed}，待评审 ${cases.length - totalReviewed}）`);
console.log('评审分布（对照目标：pass ~81% / E1 6% / E2 4% / E3 3% / E4 1% / E5 5%）:');
for (const [k, v] of Object.entries(dist)) {
  console.log(`  ${k}: ${v} (${((v / totalReviewed) * 100).toFixed(1)}%)`);
}
for (const era of ERAS) {
  const eraCases = cases.filter((c) => c.promptVersionId === era.versionId);
  const passRate = eraCases.filter((c) => c.review?.verdict === 'pass').length / eraCases.filter((c) => c.review).length;
  const items = eraCases.flatMap((c) => c.output);
  const align = items.filter((it) => it.categoryId === productById.get(it.productId)?.trueCategoryId).length / items.length;
  const totalItems = items.length || 1;
  const consistentItems = eraCases.reduce((s, c) => s + Math.round((c.autoEval?.reasonConsistency ?? 1) * c.output.length), 0);
  const consistency = consistentItems / totalItems;
  const cCases = eraCases.filter((c) => c.spec.competitorId === 'comp-c' && c.autoEval?.goldPrecision !== undefined);
  const cP = cCases.reduce((s, c) => s + (c.autoEval!.goldPrecision ?? 0), 0) / (cCases.length || 1);
  const cR = cCases.reduce((s, c) => s + (c.autoEval!.goldRecall ?? 0), 0) / (cCases.length || 1);
  console.log(`${era.versionId}: 通过率 ${(passRate * 100).toFixed(0)}% | 对齐 ${((align) * 100).toFixed(0)}% | 理由一致 ${(consistency * 100).toFixed(0)}% | 策略三准召 ${(cP * 100).toFixed(0)}%/${(cR * 100).toFixed(0)}% (n=${cCases.length})`);
}
console.log('\n周通过率趋势:');
for (let w = 1; w <= 8; w++) {
  const wc = cases.filter((c) => c.week === w && c.review);
  const p = wc.filter((c) => c.review!.verdict === 'pass').length / (wc.length || 1);
  console.log(`  W${w}: ${(p * 100).toFixed(0)}% (n=${wc.length})`);
}
const e3sample = cases.find((c) => c.review?.errorType === 'E3');
if (e3sample) {
  console.log(`\nE3 样例（${e3sample.id}）理由数字 vs 工具返回:`);
  console.log(`  理由: ${e3sample.output[0]?.reason.slice(0, 80)}...`);
  console.log(`  keyNumbers: ${JSON.stringify(e3sample.output[0]?.keyNumbers)}`);
}
console.log('\n✅ 种子数据生成完成');
