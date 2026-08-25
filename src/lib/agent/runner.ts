/**
 * Agent 运行时（架构文档 §3 Type A 口径选品 / §5 编排层）
 *
 * ReAct 循环：Reason → Act（调工具）→ Observe → 循环，直到模型给出最终回答
 * 护栏（ADR/§5.3）：步数上限 8；temperature=0；数值全部来自工具（组装输出不含模型生成数值）
 *
 * 关键设计：最终输出由工具链结果组装（T5 类目 + T6 理由 + 策略工具数据），
 * 模型的价值在编排决策——调哪些工具、传什么参数、选哪些商品进推荐清单。
 * 模型的错误决策（传错参数/漏选金标品/选入低销量品）会真实反映为 E2/E5。
 */
import type OpenAI from 'openai';
import type { AgentCase, CaseSpec, RecommendationItem, ToolCall } from '@/lib/types';
import { TOOL_LABELS } from '@/lib/types';
import { getStore } from '@/lib/storage';
import { chatCompletion } from '@/lib/llm/client';
import { buildTools, executeTool, fnNameToToolId, type RunState } from './tools/registry';
import { executeT5 } from './tools/t5-align';
import { validateOutput } from './validator';
import { autoEvaluate } from '@/lib/eval/auto-eval';

export interface RunOptions {
  onStep?: (step: ToolCall) => void;
  /** 回归测试跑批时不入评审池 */
  saveCase?: boolean;
}

const OUTPUT_FORMAT_INSTRUCTION = `

输出说明：完成工具调用后，直接给出一段简短的文字总结（推荐了几个商品、命中什么策略）。
最终推荐清单以 T6 工具返回的完整结果为准，不需要你重新罗列 JSON。`;

function safeParse(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

function strategyFor(coverage: string): RecommendationItem['strategy'] {
  return coverage === 'sales' ? 'S1-销量榜单' : coverage === 'inventory' ? 'S2-库存推算' : 'S3-多因子评分';
}

/** 从工具链结果组装输出（ADR-1：数值来自工具，模型不碰数字） */
export function assembleOutput(state: RunState): RecommendationItem[] {
  const store = getStore();
  const coverage = store.competitors.find((c) => c.id === state.spec.competitorId)?.coverageMode ?? 'none';
  const strategy = strategyFor(coverage);
  return (state.reasons ?? []).map((r) => {
    const alignment = state.alignments?.find((a) => a.productId === r.productId);
    const cand = state.strategy?.candidates.find((c) => c.productId === r.productId);
    const product = store.products.find((p) => p.id === r.productId);
    return {
      productId: r.productId,
      title: product?.title ?? cand?.title ?? '',
      categoryId: alignment?.categoryId ?? 'UNKNOWN',
      strategy: cand ? strategy : 'none',
      metric: cand?.metric,
      score: cand?.score,
      reason: r.reason,
      keyNumbers: r.keyNumbers,
    };
  });
}

export async function runAgent(spec: CaseSpec, promptVersionId: string, opts: RunOptions = {}): Promise<AgentCase> {
  const store = getStore();
  const pv = store.getPrompt(promptVersionId);
  if (!pv) throw new Error(`Prompt 版本不存在: ${promptVersionId}`);
  const comp = store.competitors.find((c) => c.id === spec.competitorId);
  const topCat = store.categories.find((c) => c.id === spec.parentId && c.parentId === 'root');
  if (!comp || !topCat || !comp.cities.includes(spec.city)) {
    throw new Error('口径参数无效（竞对/城市/品类不匹配）');
  }

  const state: RunState = { spec, promptVersion: pv };
  const chain: ToolCall[] = [];
  const saveStep = (call: ToolCall) => { chain.push(call); opts.onStep?.(call); };

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: pv.systemPrompt + OUTPUT_FORMAT_INSTRUCTION },
    {
      role: 'user',
      content: `口径：竞对「${comp.name}」（${spec.competitorId}）× 城市「${spec.city}」× 品类「${topCat.name}」（${spec.parentId}）。请识别该口径下竞对平台的高销品，产出选品推荐清单。`,
    },
  ];
  const tools = buildTools(pv);

  let step = 0;
  for (let turn = 0; turn < 8; turn++) {
    const msg = await chatCompletion({ messages, tools });
    if (msg.tool_calls?.length) {
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue;
        const toolId = fnNameToToolId(tc.function.name);
        const args = safeParse(tc.function.arguments);
        const t0 = Date.now();
        let output: unknown;
        let status: ToolCall['status'] = 'ok';
        if (!toolId) {
          output = { error: `未知工具：${tc.function.name}` };
          status = 'error';
        } else {
          try {
            output = await executeTool(toolId, args, state);
          } catch (e) {
            output = { error: e instanceof Error ? e.message : String(e) };
            status = 'error';
          }
        }
        step += 1;
        saveStep({
          step, tool: toolId ?? 'T1', name: toolId ? TOOL_LABELS[toolId] : tc.function.name,
          input: args, output, durationMs: Date.now() - t0, status,
        });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(output) });
      }
    } else {
      if (msg.content) messages.push({ role: 'assistant', content: msg.content });
      break;
    }
  }

  // 组装输出 + Validator（含一次 T5 纠错重试，ADR-7）
  let output = assembleOutput(state);
  let validation = validateOutput(output, state);
  let retries = 0;
  if (!validation.passed && validation.retryable && state.alignments?.length) {
    const feedback = '注意：上次输出包含非法类目 ID 或结构缺失，请严格从枚举中选择，不确定时输出 PENDING。';
    const t0 = Date.now();
    const t5Result = await executeT5(
      { productIds: state.alignments.map((a) => a.productId) }, state, feedback,
    );
    step += 1;
    saveStep({
      step, tool: 'T5', name: TOOL_LABELS.T5,
      input: { productIds: state.alignments.map((a) => a.productId), retry: true },
      output: t5Result, durationMs: Date.now() - t0, status: t5Result.error ? 'error' : 'retry',
      note: 'Validator 失败后的纠错重试',
    });
    output = assembleOutput(state);
    validation = validateOutput(output, state);
    retries = 1;
  }

  const validatorCall: ToolCall = {
    step: step + 1, tool: 'validator', name: 'Validator 校验',
    input: { itemCount: output.length },
    output: { passed: validation.passed, retries, checks: validation.checks },
    durationMs: 0,
    status: validation.passed ? 'ok' : 'error',
    note: validation.passed ? undefined : `重试 ${retries} 次后仍失败，标记人工处理`,
  };
  chain.push(validatorCall);
  opts.onStep?.(validatorCall);

  const autoEval = autoEvaluate(spec, output, validation.passed);
  const confidences = state.alignments?.map((a) => a.confidence) ?? [];
  const confidence = confidences.length
    ? Math.round((confidences.reduce((s, x) => s + x, 0) / confidences.length) * 100) / 100
    : 0.9;

  const agentCase: AgentCase = {
    id: `case-live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    source: 'live',
    spec,
    promptVersionId,
    chain,
    output,
    validatorPassed: validation.passed,
    autoEval,
    confidence,
  };

  if (opts.saveCase !== false) store.addCase(agentCase);
  return agentCase;
}
