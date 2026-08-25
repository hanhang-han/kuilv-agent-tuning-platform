/**
 * T2 销量榜单查询（数值，确定性）—— 策略一
 * 类目内销量 top20% 且 ≥200 件（默认参数与金标口径一致）
 * topPct / minSales 由模型传入：参数选择本身是 agent 的决策点（误传低门槛 → E2 风险）
 */
import { cellProducts, type RunState } from './registry';

export async function executeT2(args: Record<string, unknown>, state: RunState) {
  const products = cellProducts(state);
  const withSales = products.filter((p) => p.sales30d !== undefined);
  if (withSales.length === 0) {
    return { error: '该竞对无销量数据（coverage != sales），请按 T1 探测结果选择策略工具（T3 库存推算 / T4 多因子评分）' };
  }
  const topPct = typeof args.topPct === 'number' && args.topPct > 0 && args.topPct <= 1 ? args.topPct : 0.2;
  const minSales = typeof args.minSales === 'number' && args.minSales >= 0 ? args.minSales : 200;

  const ranked = [...withSales].sort((a, b) => (b.sales30d ?? 0) - (a.sales30d ?? 0));
  const K = Math.max(3, Math.ceil(ranked.length * topPct));
  const candidates = ranked.filter((p) => (p.sales30d ?? 0) >= minSales).slice(0, K);

  state.strategy = {
    tool: 'T2',
    candidates: candidates.map((p) => ({ productId: p.id, title: p.title, metric: p.sales30d })),
  };
  return {
    strategy: 'S1-销量榜单',
    topPct, minSales, candidateCount: candidates.length,
    candidates: state.strategy.candidates,
  };
}
