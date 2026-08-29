/**
 * 冒烟测试（无需 API Key）：验证 Agent 工具层的确定性链路
 * - T1 探测 / T2 销量榜单 / T3 库存推算 / T4 多因子评分
 * - T2 默认参数必须精确复现金标（数据完整性约束）
 * - 对话模式口径解析（resolveSpec 从模型参数落地）
 * 运行：npx tsx scripts/smoke-test.ts
 */
import { getStore } from '../src/lib/storage';
import { cellProducts, resolveSpec, type RunState } from '../src/lib/agent/tools/registry';
import { executeT1 } from '../src/lib/agent/tools/t1-coverage';
import { executeT2 } from '../src/lib/agent/tools/t2-sales';
import { executeT3 } from '../src/lib/agent/tools/t3-inventory';
import { executeT4 } from '../src/lib/agent/tools/t4-scoring';
import { t3Estimate } from '../src/lib/agent/tools/t3-inventory';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures += 1; console.error(`  ✗ ${label}`); }
}

async function main() {
  const store = getStore();

  console.log('\n[1] T1 数据覆盖探测');
  for (const comp of store.competitors) {
    const state: RunState = { spec: { competitorId: comp.id, city: comp.cities[0], parentId: 'cat-bs' }, promptVersion: store.getPrompt('pv-v1.1')! };
    const r = (await executeT1({}, state)) as { coverage: string; dataVolume: number };
    assert(r.coverage === comp.coverageMode, `${comp.name} → coverage=${r.coverage}（口径商品数 ${r.dataVolume}）`);
  }

  console.log('\n[2] T2 销量榜单 vs 金标（数据完整性）');
  const specA = { competitorId: 'comp-a', city: '北京', parentId: 'cat-bs' };
  const stateA: RunState = { spec: specA, promptVersion: store.getPrompt('pv-v1.1')! };
  const t2 = (await executeT2({}, stateA)) as { candidates: { productId: string }[] };
  const goldA = cellProducts(stateA).filter((p) => p.goldCities.includes(specA.city)).map((p) => p.id).sort();
  const t2Ids = t2.candidates.map((c) => c.productId).sort();
  assert(JSON.stringify(t2Ids) === JSON.stringify(goldA), `T2 默认参数输出 = 金标（${t2Ids.length} 个高销品完全一致）`);

  console.log('\n[3] T3 库存推算 / T4 多因子评分');
  const stateB: RunState = { spec: { competitorId: 'comp-b', city: '上海', parentId: 'cat-sx' }, promptVersion: store.getPrompt('pv-v1.1')! };
  const t3 = (await executeT3({}, stateB)) as { candidates: { productId: string; metric: number }[] };
  assert(t3.candidates.length >= 3, `竞对B（仅库存）T3 输出 ${t3.candidates.length} 个候选`);
  assert(t3.candidates.every((c) => c.metric > 0), 'T3 候选估算销量均 > 0');

  const stateC: RunState = { spec: { competitorId: 'comp-c', city: '成都', parentId: 'cat-tw' }, promptVersion: store.getPrompt('pv-v1.1')! };
  const t4 = (await executeT4({}, stateC)) as { candidates: { productId: string; score: number }[]; weights: { promo: number; onSale30: number; onSale180: number; channelTag: number } };
  assert(t4.candidates.length >= 3, `竞对C（均无）T4 输出 ${t4.candidates.length} 个候选`);
  assert(Math.abs(Object.values(t4.weights).reduce((s, x) => s + x, 0) - 1) < 0.001, 'T4 权重归一');

  const t3wrong = (await executeT3({}, stateA)) as { error?: string };
  assert(!!t3wrong.error, '对有销量竞对误调 T3 → 返回错误引导');

  console.log('\n[4] 对话模式口径解析（resolveSpec）');
  {
    const state: RunState = { spec: { competitorId: 'comp-a', city: '北京', parentId: 'cat-bs' }, promptVersion: store.getPrompt('pv-v1.1')! };
    const spec = resolveSpec({ city: '上海' }, state);
    assert(spec.city === '上海' && spec.competitorId === 'comp-a', '追问「那上海呢」→ 只替换城市，延续竞对');
    assert(state.spec.city === '上海', 'resolveSpec 落地更新 state.spec');
    const invalid = (() => { try { resolveSpec({ city: '兰州' }, state); return null; } catch (e) { return e as Error; } })();
    assert(!!invalid && invalid.message.includes('无效'), '非法城市 → 报错引导（模型可纠正）');
  }
  {
    const state: RunState = { spec: { competitorId: 'comp-a', city: '北京', parentId: 'cat-bs' }, promptVersion: store.getPrompt('pv-v1.1')!, lockedSpec: true };
    const spec = resolveSpec({ city: '上海' }, state);
    assert(spec.city === '北京', 'lockedSpec 模式忽略模型传参');
  }

  {
    const series = [300, 250, 200, 400, 350, 310, 500, 450, 420];
    assert(t3Estimate(series) === 900, `T3 差值算法：${t3Estimate(series)}（预期 900）`);
  }

  console.log(failures === 0 ? '\n✅ 冒烟测试全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
