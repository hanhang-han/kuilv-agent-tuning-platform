/**
 * T6 推荐理由生成（语义）
 * - template 模式（v1.1 起默认，ADR-6）：三段式模板 + 数字占位符填充，
 *   数字全部来自工具返回 → 数值幻觉从设计上被消灭
 * - free 模式（v0.9/baseline）：LLM 自由生成 → 可能出现 E3 理由幻觉（对照演示）
 */
import { chatCompletion } from '@/lib/llm/client';
import { getStore } from '@/lib/storage';
import type { RecommendationItem } from '@/lib/types';
import type { ReasonResult, RunState, StrategyCandidate } from './registry';

function templateReason(strategy: string, n: number | undefined, score: number | undefined): string {
  if (strategy === 'S1-销量榜单') {
    return `命中策略一（销量榜单）：类目内销量 top20% 高销品，近 30 天销量 ${n ?? '-'} 件。数据完备、置信度高，适合快驴卖家快速起量。`;
  }
  if (strategy === 'S2-库存推算') {
    return `命中策略二（库存推算）：近 30 天估算销量约 ${n ?? '-'} 件（保守下限）。无直接销量数据，建议小批量试销验证。`;
  }
  return `命中策略三（多因子评分）：综合评分 ${(score ?? 0).toFixed(2)} 分（促销/持续在售/长期在售/渠道标签加权）。数据稀缺口径的代理信号，建议谨慎评估后引入。`;
}

function keyNumbersFor(strategy: string, cand: StrategyCandidate | undefined): Record<string, number> {
  if (strategy === 'S1-销量榜单') return { '近30天销量(件)': cand?.metric ?? 0 };
  if (strategy === 'S2-库存推算') return { '近30天估算销量(件)': cand?.metric ?? 0 };
  return { '多因子评分': cand?.score ?? 0 };
}

function coverageStrategy(state: RunState): RecommendationItem['strategy'] {
  const mode = getStore().competitors.find((c) => c.id === state.spec.competitorId)?.coverageMode;
  return mode === 'sales' ? 'S1-销量榜单' : mode === 'inventory' ? 'S2-库存推算' : 'S3-多因子评分';
}

export async function executeT6(args: Record<string, unknown>, state: RunState): Promise<{ mode: string; reasons: ReasonResult[]; error?: string }> {
  const productIds = Array.isArray(args.productIds) ? (args.productIds as string[]) : [];
  if (productIds.length === 0) {
    return { mode: state.promptVersion.t6Mode, reasons: [], error: 'productIds 为空' };
  }
  const strategy = coverageStrategy(state);
  const cands = state.strategy?.candidates ?? [];
  const items = productIds
    .map((id) => {
      const cand = cands.find((c) => c.productId === id);
      const product = getStore().products.find((p) => p.id === id);
      return cand ?? (product ? { productId: id, title: product.title } : { productId: id, title: '' });
    })
    .filter((x) => x.title);

  if (state.promptVersion.t6Mode === 'template') {
    const reasons = items.map((cand) => {
      const reason = templateReason(strategy, cand.metric, cand.score);
      return { productId: cand.productId, reason, keyNumbers: keyNumbersFor(strategy, cand) };
    });
    state.reasons = reasons;
    return { mode: 'template', reasons };
  }

  // free 模式：LLM 自由生成（数值幻觉风险，E3 的来源）
  const system = '你是快驴选品推荐理由撰写助手。为每个商品生成推荐理由：说明命中策略、关键数据、对快驴卖家的价值点。';
  const user = `命中策略：${strategy}
商品与工具返回数据：
${items.map((c) => `- ${c.productId} ${c.title}${c.metric !== undefined ? `（近30天销量/估算：${c.metric} 件）` : ''}${c.score !== undefined ? `（多因子评分：${c.score}）` : ''}`).join('\n')}

严格输出 JSON 数组：[{"productId": "...", "reason": "推荐理由，一段话"}]`;

  let reasons: ReasonResult[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const cleaned = (msg.content ?? '').replace(/```json?/g, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        if (Array.isArray(parsed)) {
          reasons = parsed
            .filter((x): x is { productId: string; reason: string } => typeof x === 'object' && x !== null && typeof (x as any).productId === 'string')
            .map((x) => ({
              productId: x.productId,
              reason: String(x.reason ?? ''),
              keyNumbers: keyNumbersFor(strategy, items.find((i) => i.productId === x.productId)),
            }));
          if (reasons.length > 0) break;
        }
      } catch { /* retry */ }
    }
  }
  if (reasons.length === 0) {
    return { mode: 'free', reasons: [], error: '模型输出解析失败' };
  }
  state.reasons = reasons;
  return { mode: 'free', reasons };
}
