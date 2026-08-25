/**
 * T3 库存推算（数值，确定性）—— 策略二
 * 3 天窗口差值算法：周期内两两做差 → 剔除负差值（补货）→ 取最大正差值 → 各周期累加
 * 与种子数据生成器的算法保持一致（9 天快照 → 推算 30 天）
 */
import { cellProducts, type RunState } from './registry';

export function t3Estimate(series: number[]): number {
  let total = 0;
  for (let cyc = 0; cyc < 3; cyc++) {
    const [a, b, d] = [series[cyc * 3], series[cyc * 3 + 1], series[cyc * 3 + 2]];
    const diffs = [a - b, b - d, a - d].filter((x) => x > 0);
    if (diffs.length) total += Math.max(...diffs);
  }
  return Math.round(total * (10 / 3));
}

export async function executeT3(args: Record<string, unknown>, state: RunState) {
  const products = cellProducts(state).filter((p) => p.inventorySeries);
  if (products.length === 0) {
    return { error: '该竞对无库存快照数据（coverage != inventory），请按 T1 探测结果选择策略工具' };
  }
  const topPct = typeof args.topPct === 'number' && args.topPct > 0 && args.topPct <= 1 ? args.topPct : 0.2;

  const ranked = [...products].sort((a, b) => t3Estimate(b.inventorySeries!) - t3Estimate(a.inventorySeries!));
  const K = Math.max(3, Math.ceil(ranked.length * topPct));
  const candidates = ranked.slice(0, K).filter((p) => t3Estimate(p.inventorySeries!) > 0);

  state.strategy = {
    tool: 'T3',
    candidates: candidates.map((p) => ({ productId: p.id, title: p.title, metric: t3Estimate(p.inventorySeries!) })),
  };
  return {
    strategy: 'S2-库存推算',
    algorithm: '3 天窗口差值：剔除补货（负差值），取周期内最大正差值，各周期累加（保守下限）',
    topPct, candidateCount: candidates.length,
    candidates: state.strategy.candidates,
  };
}
