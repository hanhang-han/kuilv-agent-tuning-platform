import { getStore } from '@/lib/storage';
import type { ErrorType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/dashboard —— 仪表盘聚合统计（seed 口径为主，预置指标的实时版） */
export async function GET() {
  const store = getStore();
  const cases = store.listCases();
  const reviewed = cases.filter((c) => c.review);

  // 错误类型分布（快评口径：review 标注）
  const errorDist: Record<string, number> = { pass: 0, E1: 0, E2: 0, E3: 0, E4: 0, E5: 0 };
  for (const c of reviewed) {
    if (c.review!.verdict === 'pass') errorDist.pass += 1;
    else errorDist[c.review!.errorType ?? 'E1'] += 1;
  }

  // 8 周趋势：通过率（快评）+ 策略三准召率（C 口径 autoEval，深检）
  const weekly: { week: number; passRate: number | null; precision: number | null; recall: number | null; n: number }[] = [];
  for (let w = 1; w <= 8; w++) {
    const wc = cases.filter((c) => c.week === w);
    const wcReviewed = wc.filter((c) => c.review);
    const wcC = wc.filter((c) => c.spec.competitorId === 'comp-c' && c.autoEval?.goldPrecision !== undefined);
    weekly.push({
      week: w,
      passRate: wcReviewed.length ? wcReviewed.filter((c) => c.review!.verdict === 'pass').length / wcReviewed.length : null,
      precision: wcC.length ? wcC.reduce((s, c) => s + (c.autoEval!.goldPrecision ?? 0), 0) / wcC.length : null,
      recall: wcC.length ? wcC.reduce((s, c) => s + (c.autoEval!.goldRecall ?? 0), 0) / wcC.length : null,
      n: wc.length,
    });
  }

  // 按竞对切片：错误率（打回 case / 已评审 case）
  const competitorSlice = store.competitors.map((comp) => {
    const cc = reviewed.filter((c) => c.spec.competitorId === comp.id);
    const rejected = cc.filter((c) => c.review!.verdict === 'reject').length;
    const byType: Record<string, number> = {};
    for (const t of ['E1', 'E2', 'E3', 'E4', 'E5'] as ErrorType[]) {
      byType[t] = cc.filter((c) => c.review?.errorType === t).length;
    }
    return {
      competitor: comp.name,
      errorRate: cc.length ? rejected / cc.length : 0,
      caseCount: cc.length,
      byType,
    };
  });

  const regressions = store.listRegressions();
  const latest = regressions
    .filter((r) => r.mode === 'seed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return Response.json({
    totals: {
      cases: cases.length,
      reviewed: reviewed.length,
      pending: cases.length - reviewed.length,
      liveCases: cases.filter((c) => c.source === 'live').length,
    },
    errorDist,
    weekly,
    competitorSlice,
    latestRegression: latest ?? null,
    regressions: regressions.map((r) => ({ ...r, promptLabel: store.getPrompt(r.promptVersionId)?.label ?? r.promptVersionId })),
  });
}
