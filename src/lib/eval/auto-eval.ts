/**
 * 自动评测（架构文档 §8 评估层 / LLM-as-judge + 深检口径）
 *
 * 平台掌握真值（商品真值类目、真值销量金标），因此可全自动计算四项深检指标：
 * - 类目对齐准确率（vs 真值类目）——E1 检测
 * - 理由数值一致率（理由中数字 vs 工具返回）——E3 检测（judge 启发式，存在少量误判，
 *   与人工抽检校准的 judge 工作方式一致）
 * - 选品准召率（vs 金标：真值销量 top20% 且 ≥200）
 * - 格式合规率（Validator）
 *
 * E2/E5 的自动检测在数据完备竞对（A）上可靠；代理策略口径（B/C）下
 * 非金标品混入属策略固有模糊，靠人工评审归类。
 */
import type { AgentCase, AutoEval, CaseSpec, ErrorType, RecommendationItem } from '@/lib/types';
import { getStore } from '@/lib/storage';

/** 策略话术中的固定数字（top20%、30天、180天等），不视为数据主张 */
const VOCAB_NUMBERS = new Set([3, 7, 15, 20, 30, 60, 180]);

function reasonConsistent(reason: string, allowed: number[]): boolean {
  const nums = (reason.match(/\d+(?:\.\d+)?/g) ?? [])
    .map(Number)
    .filter((n) => n >= 10 && !VOCAB_NUMBERS.has(n));
  return nums.every((n) =>
    allowed.some((a) => a >= 10 && Math.abs(n - a) <= Math.max(1, a * 0.02)),
  );
}

export function autoEvaluate(spec: CaseSpec, items: RecommendationItem[], formatPass: boolean): AutoEval {
  const store = getStore();
  const products = store.products.filter((p) => p.competitorId === spec.competitorId && p.parentId === spec.parentId && p.cities.includes(spec.city));
  const gold = products.filter((p) => p.goldCities.includes(spec.city));
  const goldIds = new Set(gold.map((p) => p.id));

  const total = items.length;
  const alignedCount = items.filter((it) => {
    const p = store.products.find((x) => x.id === it.productId);
    return p ? p.trueCategoryId === it.categoryId : false;
  }).length;
  const consistentCount = items.filter((it) => {
    const allowed = [
      ...(it.metric !== undefined ? [it.metric] : []),
      ...(it.score !== undefined ? [it.score] : []),
      ...Object.values(it.keyNumbers ?? {}),
    ];
    return reasonConsistent(it.reason, allowed);
  }).length;

  const outGoldCount = items.filter((it) => goldIds.has(it.productId)).length;
  const goldPrecision = total ? outGoldCount / total : undefined;
  const goldRecall = gold.length ? outGoldCount / gold.length : undefined;

  const detected: ErrorType[] = [];
  if (!formatPass) {
    detected.push('E4');
  } else {
    if (total > 0 && alignedCount < total) detected.push('E1');
    if (total > 0 && consistentCount < total) detected.push('E3');
    if (spec.competitorId === 'comp-a') {
      if (goldPrecision !== undefined && goldPrecision < 1) detected.push('E2');
      if (goldRecall !== undefined && goldRecall < 1) detected.push('E5');
    } else if (goldRecall !== undefined && goldRecall < 0.5) {
      detected.push('E5');
    }
  }

  return {
    formatPass,
    alignmentAccuracy: total ? alignedCount / total : 0,
    reasonConsistency: total ? consistentCount / total : 1,
    goldPrecision,
    goldRecall,
    detectedErrors: detected,
  };
}

/** 汇总一批 case 的深检指标（回归引擎用） */
export function aggregateMetrics(cases: AgentCase[]) {
  const withEval = cases.filter((c) => c.autoEval);
  const items = withEval.flatMap((c) => c.output);
  const aligned = items.filter((it) => {
    const p = getStore().products.find((x) => x.id === it.productId);
    return p ? p.trueCategoryId === it.categoryId : false;
  }).length;
  const consistent = withEval.reduce((s, c) => s + Math.round((c.autoEval?.reasonConsistency ?? 1) * c.output.length), 0);
  const cCases = withEval.filter((c) => c.spec.competitorId === 'comp-c');
  const cP = cCases.filter((c) => c.autoEval?.goldPrecision !== undefined).reduce((s, c) => s + (c.autoEval!.goldPrecision ?? 0), 0) / (cCases.filter((c) => c.autoEval?.goldPrecision !== undefined).length || 1);
  const cR = cCases.filter((c) => c.autoEval?.goldRecall !== undefined).reduce((s, c) => s + (c.autoEval!.goldRecall ?? 0), 0) / (cCases.filter((c) => c.autoEval?.goldRecall !== undefined).length || 1);
  const reviewed = withEval.filter((c) => c.review);
  const passRate = reviewed.filter((c) => c.review!.verdict === 'pass').length / (reviewed.length || 1);
  return {
    passRate, formatRate: withEval.filter((c) => c.validatorPassed).length / (withEval.length || 1),
    alignmentAcc: aligned / (items.length || 1),
    reasonConsistency: consistent / (items.length || 1),
    goldPrecision: cP, goldRecall: cR,
  };
}
