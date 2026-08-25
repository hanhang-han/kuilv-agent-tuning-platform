/**
 * 冒烟测试（无需 API Key）：验证 Agent 运行时的确定性链路
 * - T1 探测 / T2 销量榜单 / T3 库存推算 / T4 多因子评分
 * - T2 默认参数必须精确复现金标（数据完整性约束）
 * - assembleOutput + Validator + autoEvaluate 端到端（T5/T6 用桩数据模拟）
 * 运行：npx tsx scripts/smoke-test.ts
 */
import { getStore } from '../src/lib/storage';
import { cellProducts, type RunState } from '../src/lib/agent/tools/registry';
import { executeT1 } from '../src/lib/agent/tools/t1-coverage';
import { executeT2 } from '../src/lib/agent/tools/t2-sales';
import { executeT3 } from '../src/lib/agent/tools/t3-inventory';
import { executeT4 } from '../src/lib/agent/tools/t4-scoring';
import { t3Estimate } from '../src/lib/agent/tools/t3-inventory';
import { assembleOutput } from '../src/lib/agent/runner';
import { validateOutput } from '../src/lib/agent/validator';
import { autoEvaluate } from '../src/lib/eval/auto-eval';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures += 1; console.error(`  ✗ ${label}`); }
}

async function main() {
const store = getStore();

// ── T1：三竞对覆盖探测 ──
console.log('\n[1] T1 数据覆盖探测');
for (const comp of store.competitors) {
  const state: RunState = { spec: { competitorId: comp.id, city: comp.cities[0], parentId: 'cat-bs' }, promptVersion: store.getPrompt('pv-v1.1')! };
  const r = (await executeT1({}, state)) as { coverage: string; dataVolume: number };
  assert(r.coverage === comp.coverageMode, `${comp.name} → coverage=${r.coverage}（口径商品数 ${r.dataVolume}）`);
}

// ── T2：默认参数必须精确复现金标 ──
console.log('\n[2] T2 销量榜单 vs 金标（数据完整性）');
const specA = { competitorId: 'comp-a', city: '北京', parentId: 'cat-bs' };
const stateA: RunState = { spec: specA, promptVersion: store.getPrompt('pv-v1.1')! };
const t2 = (await executeT2({}, stateA)) as { candidates: { productId: string }[] };
const goldA = cellProducts(stateA).filter((p) => p.goldCities.includes(specA.city)).map((p) => p.id).sort();
const t2Ids = t2.candidates.map((c) => c.productId).sort();
assert(JSON.stringify(t2Ids) === JSON.stringify(goldA), `T2 默认参数输出 = 金标（${t2Ids.length} 个高销品完全一致）`);

// ── T3/T4：代理策略输出 ──
console.log('\n[3] T3 库存推算 / T4 多因子评分');
const stateB: RunState = { spec: { competitorId: 'comp-b', city: '上海', parentId: 'cat-sx' }, promptVersion: store.getPrompt('pv-v1.1')! };
const t3 = (await executeT3({}, stateB)) as { candidates: { productId: string; metric: number }[] };
assert(t3.candidates.length >= 3, `竞对B（仅库存）T3 输出 ${t3.candidates.length} 个候选（估算销量口径）`);
assert(t3.candidates.every((c) => c.metric > 0), 'T3 候选估算销量均 > 0');

const stateC: RunState = { spec: { competitorId: 'comp-c', city: '成都', parentId: 'cat-tw' }, promptVersion: store.getPrompt('pv-v1.1')! };
const t4 = (await executeT4({}, stateC)) as { candidates: { productId: string; score: number }[]; weights: { promo: number; onSale30: number; onSale180: number; channelTag: number } };
assert(t4.candidates.length >= 3, `竞对C（均无）T4 输出 ${t4.candidates.length} 个候选`);
assert(Math.abs(Object.values(t4.weights).reduce((s, x) => s + x, 0) - 1) < 0.001, 'T4 权重归一（v1.1 校准版）');

// 错误策略调用兜底：对 A 调 T3 应返回 error 提示
const t3wrong = (await executeT3({}, stateA)) as { error?: string };
assert(!!t3wrong.error, '对有销量竞对误调 T3 → 返回错误引导（模型可据此纠正路由）');

// ── 组装 + Validator + autoEval 端到端（桩注入 T5/T6 结果） ──
console.log('\n[4] 组装输出 → Validator → 自动评测（含错误注入验证）');
const products = cellProducts(stateA);
const goldProduct = products.find((p) => p.goldCities.includes(specA.city))!;
const goldProduct2 = products.filter((p) => p.goldCities.includes(specA.city))[1] ?? goldProduct;
const lowProduct = products.filter((p) => !p.goldCities.includes(specA.city) && (p.sales30d ?? 0) < 120)[0] ?? products[0];

// 正常 case：T5 全对齐、T6 模板理由（输出全部候选 = 全部金标）
{
  const state: RunState = { spec: specA, promptVersion: store.getPrompt('pv-v1.1')! };
  await executeT2({}, state);
  const sel = state.strategy!.candidates;
  state.alignments = sel.map((c) => ({ productId: c.productId, categoryId: products.find((p) => p.id === c.productId)!.trueCategoryId, confidence: 0.9 }));
  state.reasons = sel.map((c) => ({
    productId: c.productId,
    reason: `命中策略一（销量榜单）：类目内销量 top20% 高销品，近 30 天销量 ${c.metric} 件。数据完备、置信度高，适合快驴卖家快速起量。`,
    keyNumbers: { '近30天销量(件)': c.metric ?? 0 },
  }));
  const output = assembleOutput(state);
  const validation = validateOutput(output, state);
  const evalRes = autoEvaluate(specA, output, validation.passed);
  assert(validation.passed, '正常 case：Validator 通过');
  assert(evalRes.alignmentAccuracy === 1 && evalRes.detectedErrors.length === 0, '正常 case：对齐 100%，无错误检出');
  assert(evalRes.goldPrecision === 1, '正常 case：A 口径金标准确率 100%');
}

// E1 注入：T5 把边界商品对齐到错误类目
{
  const state: RunState = { spec: specA, promptVersion: store.getPrompt('pv-v1.1')! };
  await executeT2({}, state);
  const sel = state.strategy!.candidates.slice(0, 3);
  state.alignments = sel.map((c, i) => ({
    productId: c.productId,
    categoryId: i === 0 ? 'bs-cc' : products.find((p) => p.id === c.productId)!.trueCategoryId,
    confidence: i === 0 ? 0.72 : 0.9,
  }));
  state.reasons = sel.map((c) => ({ productId: c.productId, reason: `模板理由，销量 ${c.metric} 件`, keyNumbers: { '近30天销量(件)': c.metric ?? 0 } }));
  const output = assembleOutput(state);
  const evalRes = autoEvaluate(specA, output, true);
  assert(evalRes.alignmentAccuracy < 1 && evalRes.detectedErrors.includes('E1'), 'E1 注入：自动评测检出类目映射错误');
}

// E3 注入：free 模式理由数字幻觉
{
  const state: RunState = { spec: specA, promptVersion: store.getPrompt('pv-v0.9')! };
  await executeT2({}, state);
  const sel = state.strategy!.candidates.slice(0, 3);
  state.alignments = sel.map((c) => ({ productId: c.productId, categoryId: products.find((p) => p.id === c.productId)!.trueCategoryId, confidence: 0.9 }));
  const realN = sel[0].metric ?? 0;
  state.reasons = sel.map((c, i) => ({
    productId: c.productId,
    reason: i === 0 ? `该商品表现强劲，近 30 天销量约 ${Math.round(realN * 3.3)} 件，位居类目前列。` : `销量 ${c.metric} 件，稳健动销。`,
    keyNumbers: { '近30天销量(件)': c.metric ?? 0 },
  }));
  const output = assembleOutput(state);
  const evalRes = autoEvaluate(specA, output, true);
  assert(evalRes.reasonConsistency < 1 && evalRes.detectedErrors.includes('E3'), `E3 注入：理由幻觉被检出（真实 ${realN} 件 vs 虚构 ${Math.round(realN * 3.3)} 件）`);
}

// E2 注入：非金标低销量品进入清单
{
  const state: RunState = { spec: specA, promptVersion: store.getPrompt('pv-v1.1')! };
  await executeT2({}, state);
  const sel = [goldProduct, goldProduct2];
  state.strategy!.candidates.push({ productId: lowProduct.id, title: lowProduct.title, metric: lowProduct.sales30d });
  state.alignments = [...sel, lowProduct].map((p) => ({ productId: p.id, categoryId: p.trueCategoryId, confidence: 0.85 }));
  state.reasons = [...sel, lowProduct].map((p) => ({ productId: p.id, reason: `销量 ${p.sales30d} 件`, keyNumbers: { '近30天销量(件)': p.sales30d ?? 0 } }));
  const output = assembleOutput(state);
  const evalRes = autoEvaluate(specA, output, true);
  assert(evalRes.goldPrecision !== undefined && evalRes.goldPrecision < 1 && evalRes.detectedErrors.includes('E2'), `E2 注入：非金标品（销量 ${lowProduct.sales30d} 件）被检出误判高销`);
}

// E4 注入：枚举外类目 → Validator 拦截
{
  const state: RunState = { spec: specA, promptVersion: store.getPrompt('pv-v1.1')! };
  await executeT2({}, state);
  const sel = state.strategy!.candidates.slice(0, 2);
  state.alignments = sel.map((c, i) => ({ productId: c.productId, categoryId: i === 0 ? 'CAT-INVALID' : products.find((p) => p.id === c.productId)!.trueCategoryId, confidence: 0.8 }));
  state.reasons = sel.map((c) => ({ productId: c.productId, reason: `销量 ${c.metric} 件`, keyNumbers: { '近30天销量(件)': c.metric ?? 0 } }));
  const output = assembleOutput(state);
  const validation = validateOutput(output, state);
  const evalRes = autoEvaluate(specA, output, validation.passed);
  assert(!validation.passed && validation.retryable, 'E4 注入：Validator 拦截枚举外类目（可触发 T5 纠错重试）');
  assert(evalRes.detectedErrors.includes('E4'), 'E4 注入：自动评测检出格式违规');
}

// T3 算法一致性：与生成器同算法
{
  const series = [300, 250, 200, 400, 350, 310, 500, 450, 420];
  // 周期1: 差值 50,50,100 → max 100；周期2: 50,40,90 → 90；周期3: 50,30,80 → 80；合计 270 × 10/3 = 900
  assert(t3Estimate(series) === 900, `T3 差值算法：${t3Estimate(series)}（预期 900）`);
}

console.log(failures === 0 ? '\n✅ 冒烟测试全部通过' : `\n❌ ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
