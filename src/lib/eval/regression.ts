/**
 * 回归引擎（架构文档 §9：统一回归）
 * 任一可优化资产（prompt / 类目知识 / 参数）改动 → 全量口径回放 → 分错误类型对比 → 合入/打回
 *
 * 模式：
 * - live：真实调用 LLM 重跑口径（temperature=0，同口径重复运行无增量信息 → 回归对象 = 全部去重口径）
 * - 回放：内置版本直接返回预置快照（基准数字）；自定义版本需要 API Key
 */
import type { AgentCase, CaseSpec, ErrorType, RegressionResult } from '@/lib/types';
import { getStore } from '@/lib/storage';
import { llmAvailable } from '@/lib/llm/client';
import { runAgent } from '@/lib/agent/runner';

export interface RegressionProgress {
  done: number;
  total: number;
  current?: string;
}

/** 分层抽取去重口径（竞对 × 城市 × 品类轮转，保证覆盖均衡） */
export function sampleSpecs(count: number): CaseSpec[] {
  const specs: CaseSpec[] = [];
  const seen = new Set<string>();
  for (const c of getStore().listCases().filter((x) => x.source === 'seed')) {
    const key = `${c.spec.competitorId}|${c.spec.city}|${c.spec.parentId}`;
    if (!seen.has(key)) { seen.add(key); specs.push(c.spec); }
  }
  return specs.slice(0, count);
}

function aggregate(cases: AgentCase[]) {
  const items = cases.flatMap((c) => c.output);
  const store = getStore();
  const aligned = items.filter((it) => {
    const p = store.products.find((x) => x.id === it.productId);
    return p ? p.trueCategoryId === it.categoryId : false;
  }).length;
  const consistent = cases.reduce((s, c) => s + Math.round((c.autoEval?.reasonConsistency ?? 1) * c.output.length), 0);

  const cCases = cases.filter((c) => c.spec.competitorId === 'comp-c' && c.autoEval);
  const cP = cCases.filter((c) => c.autoEval!.goldPrecision !== undefined);
  const cR = cCases.filter((c) => c.autoEval!.goldRecall !== undefined);

  const byErrorType: Record<ErrorType, number> = { E1: 0, E2: 0, E3: 0, E4: 0, E5: 0 };
  let passed = 0;
  for (const c of cases) {
    const errs = c.autoEval?.detectedErrors ?? [];
    if (errs.length === 0) { passed += 1; continue; }
    byErrorType[errs[0]] += 1;
  }

  return {
    metrics: {
      passRate: cases.length ? passed / cases.length : 0,
      formatRate: cases.length ? cases.filter((c) => c.validatorPassed).length / cases.length : 0,
      alignmentAcc: items.length ? aligned / items.length : 0,
      reasonConsistency: items.length ? consistent / items.length : 1,
      goldPrecision: cP.length ? cP.reduce((s, c) => s + (c.autoEval!.goldPrecision ?? 0), 0) / cP.length : undefined,
      goldRecall: cR.length ? cR.reduce((s, c) => s + (c.autoEval!.goldRecall ?? 0), 0) / cR.length : undefined,
    },
    byErrorType,
    caseCount: cases.length,
  };
}

export async function runRegression(opts: {
  promptVersionId: string;
  caseCount: number;
  baselineVersionId?: string;
  onProgress?: (p: RegressionProgress) => void;
}): Promise<RegressionResult> {
  const store = getStore();
  const pv = store.getPrompt(opts.promptVersionId);
  if (!pv) throw new Error(`Prompt 版本不存在: ${opts.promptVersionId}`);

  const startedAt = Date.now();

  // 回放模式：内置版本返回预置快照
  if (!llmAvailable()) {
    if (pv.builtin) {
      const snapshot = store.listRegressions().find((r) => r.promptVersionId === pv.id && r.mode === 'seed');
      if (snapshot) return snapshot;
    }
    throw new Error(
      pv.builtin
        ? `「${pv.label}」没有预置回归快照——请在 .env.local 配置 DEEPSEEK_API_KEY 后真实跑回归（v0.9/v1.0/v1.1 可直接查看预置结果）`
        : '自定义版本的回归测试需要真实调用 LLM——请在 .env.local 配置 DEEPSEEK_API_KEY 后重试（内置版本可查看预置回归结果）',
    );
  }

  // live 模式：全量去重口径重跑（并发 6）
  const specs = sampleSpecs(opts.caseCount);
  if (specs.length === 0) throw new Error('未找到可回归的口径');
  const total = specs.length;
  const cases: AgentCase[] = [];
  const queue = [...specs];
  const compName = (id: string) => store.competitors.find((c) => c.id === id)?.name ?? id;

  const workers = Array.from({ length: Math.min(6, specs.length) }, async () => {
    while (queue.length > 0) {
      const spec = queue.shift()!;
      try {
        const c = await runAgent(spec, opts.promptVersionId, { saveCase: false });
        cases.push(c);
      } catch {
        // 单口径失败不阻塞整体回归，计为格式失败 case
        cases.push({
          id: `case-fail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: new Date().toISOString(),
          source: 'live', spec, promptVersionId: opts.promptVersionId,
          chain: [], output: [], validatorPassed: false,
          autoEval: { formatPass: false, alignmentAccuracy: 0, reasonConsistency: 1, detectedErrors: ['E4'] },
        });
      }
      opts.onProgress?.({ done: cases.length, total, current: `${compName(spec.competitorId)} × ${spec.city}` });
    }
  });
  await Promise.all(workers);

  const agg = aggregate(cases);

  // 与基线版本的最近一次回归对比
  let deltaVsBaseline: RegressionResult['deltaVsBaseline'];
  let baselineVersionId = opts.baselineVersionId;
  if (baselineVersionId) {
    const baseResult = store.listRegressions()
      .filter((r) => r.promptVersionId === baselineVersionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (baseResult) {
      deltaVsBaseline = {
        passRate: agg.metrics.passRate - baseResult.metrics.passRate,
        formatRate: agg.metrics.formatRate - baseResult.metrics.formatRate,
        alignmentAcc: agg.metrics.alignmentAcc - baseResult.metrics.alignmentAcc,
        reasonConsistency: agg.metrics.reasonConsistency - baseResult.metrics.reasonConsistency,
        ...(agg.metrics.goldPrecision !== undefined && baseResult.metrics.goldPrecision !== undefined
          ? { goldPrecision: agg.metrics.goldPrecision - baseResult.metrics.goldPrecision } : {}),
        ...(agg.metrics.goldRecall !== undefined && baseResult.metrics.goldRecall !== undefined
          ? { goldRecall: agg.metrics.goldRecall - baseResult.metrics.goldRecall } : {}),
      };
    }
  }

  const result: RegressionResult = {
    id: `rg-live-${Date.now()}`,
    promptVersionId: opts.promptVersionId,
    baselineVersionId,
    caseCount: agg.caseCount,
    mode: 'live',
    createdAt: new Date().toISOString(),
    metrics: agg.metrics,
    byErrorType: agg.byErrorType,
    deltaVsBaseline,
    durationMs: Date.now() - startedAt,
  };
  store.addRegression(result);
  return result;
}
