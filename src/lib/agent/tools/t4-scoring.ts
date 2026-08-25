/**
 * T4 多因子评分（数值，确定性）—— 策略三
 * 四因子加权：近7天促销 / 近30天持续在售 / 近180天长期有效在售 / 渠道标签
 * 权重来自 PromptVersion（可优化资产之一：策略一金标回测校准，v0.9 → v1.0 的迭代点）
 */
import type { ProductFactors, T4Weights } from '@/lib/types';
import { cellProducts, type RunState } from './registry';

export function t4Score(f: ProductFactors, w: T4Weights): number {
  return Math.round(
    (w.promo * (f.promo7d ? 1 : 0) +
      w.onSale30 * (f.onSale30d / 30) +
      w.onSale180 * (f.onSale180d / 6) +
      w.channelTag * (Math.min(f.channelTags.length, 2) / 2)) * 1000,
  ) / 1000;
}

export async function executeT4(args: Record<string, unknown>, state: RunState) {
  const products = cellProducts(state).filter((p) => p.factors);
  if (products.length === 0) {
    return { error: '该竞对有销量或库存数据，请优先使用 T2 / T3（按 T1 探测结果）' };
  }
  const topPct = typeof args.topPct === 'number' && args.topPct > 0 && args.topPct <= 1 ? args.topPct : 0.2;
  const weights = state.promptVersion.t4Weights;

  const ranked = [...products].sort((a, b) => t4Score(b.factors!, weights) - t4Score(a.factors!, weights));
  const K = Math.max(3, Math.ceil(ranked.length * topPct));
  const candidates = ranked.slice(0, K);

  state.strategy = {
    tool: 'T4',
    candidates: candidates.map((p) => ({
      productId: p.id, title: p.title,
      score: t4Score(p.factors!, weights),
      factors: p.factors,
    })),
  };
  return {
    strategy: 'S3-多因子评分',
    weights, topPct, candidateCount: candidates.length,
    note: '因子均为代理信号（非充分条件），准召率为三策略中最低——宁可漏检不误推',
    candidates: state.strategy.candidates,
  };
}
