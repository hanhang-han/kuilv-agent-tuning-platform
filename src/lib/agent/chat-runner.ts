/**
 * 对话式选品 Agent 运行时
 *
 * 多轮对话 ReAct：口径从自然语言解析（工具参数驱动，resolveSpec 落地）、
 * 口径不完整时模型先澄清、追问只替换变化项、流式输出（token + 工具事件）。
 */
import type OpenAI from 'openai';
import type { RecommendationItem, ToolCall } from '@/lib/types';
import { TOOL_LABELS } from '@/lib/types';
import { getStore } from '@/lib/storage';
import { chatCompletionStream } from '@/lib/llm/client';
import { buildTools, executeTool, fnNameToToolId, type RunState } from './tools/registry';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 该轮的推荐清单（回传给服务端做追问上下文） */
  output?: RecommendationItem[];
}

export type ChatEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; tool: string; name: string }
  | { type: 'tool_end'; step: ToolCall }
  | { type: 'run_complete'; output: RecommendationItem[] }
  | { type: 'done'; content: string }
  | { type: 'error'; message: string };

const CHAT_MODE_INSTRUCTION = `

## 对话模式说明
- 用户用自然语言提出选品需求，口径 = 竞对 × 城市 × 品类。竞对候选：comp-a 竞对A·惠丰优选（北京/上海/广州/成都）、comp-b 竞对B·餐链直采（北京/上海/成都）、comp-c 竞对C·食达汇（上海/广州/成都）；品类候选：cat-bs 半熟调理 / cat-sx 生鲜肉类 / cat-mm 米面粮油 / cat-tw 调味酱料 / cat-dp 冻品水产 / cat-js 酒水饮料 / cat-xl 休闲零食 / cat-bh 日用百货
- 口径信息不完整时（缺竞对/城市/品类任一项），先用一句话向用户确认，不要猜
- 用户追问时（如「那上海呢」「换成调味酱料」）：延续上文口径，只替换用户提到的变化项，直接重新执行，不需要重复确认
- 每次执行走完整流程：T1 探测 → 按覆盖选策略工具 → T5 对齐 → T6 理由
- 完成后用自然语言总结：推荐了几个商品、命中什么策略、关键数据（销量/评分）、给卖家的建议；每个商品一句话点评即可，不用罗列 JSON
- 被问「为什么推荐这个」等解释类问题时，基于已有工具返回数据回答；数据不够就再调工具`;

/** 从工具链结果组装推荐清单（数值全部来自工具，模型不碰数字） */
function assembleOutput(state: RunState): RecommendationItem[] {
  const store = getStore();
  const coverage = store.competitors.find((c) => c.id === state.spec.competitorId)?.coverageMode ?? 'none';
  const strategy = coverage === 'sales' ? 'S1-销量榜单' : coverage === 'inventory' ? 'S2-库存推算' : 'S3-多因子评分';
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

export async function runChatConversation(
  history: ChatHistoryMessage[],
  promptVersionId: string,
  onEvent: (e: ChatEvent) => void,
): Promise<{ content: string; output?: RecommendationItem[] }> {
  const store = getStore();
  const pv = store.getPrompt(promptVersionId);
  if (!pv) throw new Error(`Prompt 版本不存在: ${promptVersionId}`);

  const state: RunState = { spec: { competitorId: 'comp-a', city: '北京', parentId: 'cat-bs' }, promptVersion: pv };
  const tools = buildTools(pv);

  // 重建对话上下文：带推荐清单的轮次附加结构化数据，保证追问有据可答
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: pv.systemPrompt + CHAT_MODE_INSTRUCTION },
    ...history.map((m) => ({
      role: m.role,
      content: m.output?.length
        ? `${m.content}\n\n[本轮推荐清单数据]\n${JSON.stringify(m.output.map((o) => ({ 商品: o.title, 类目: o.categoryId, 策略: o.strategy, 销量: o.metric, 评分: o.score })))}`
        : m.content,
    })),
  ];

  let finalContent = '';
  let output: RecommendationItem[] | undefined;

  for (let turn = 0; turn < 8; turn++) {
    const result = await chatCompletionStream({
      messages,
      tools,
      onToken: (t) => onEvent({ type: 'token', text: t }),
    });

    if (result.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls as OpenAI.ChatCompletionMessageToolCall[],
      });
      for (const tc of result.toolCalls) {
        const toolId = fnNameToToolId(tc.function.name);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        if (!toolId) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: `未知工具：${tc.function.name}` }) });
          continue;
        }
        onEvent({ type: 'tool_start', tool: toolId, name: TOOL_LABELS[toolId] });
        const t0 = Date.now();
        let toolOutput: unknown;
        let status: ToolCall['status'] = 'ok';
        try {
          toolOutput = await executeTool(toolId, args, state);
        } catch (e) {
          toolOutput = { error: e instanceof Error ? e.message : String(e) };
          status = 'error';
        }
        const step: ToolCall = {
          step: turn * 10 + messages.length,
          tool: toolId,
          name: TOOL_LABELS[toolId],
          input: args,
          output: toolOutput,
          durationMs: Date.now() - t0,
          status,
        };
        onEvent({ type: 'tool_end', step });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolOutput) });
      }
      // 完整选品结果就绪 → 推送推荐清单（模型还会继续生成总结文本）
      if (!output && state.strategy && state.reasons && state.alignments) {
        output = assembleOutput(state);
        onEvent({ type: 'run_complete', output });
      }
      continue;
    }

    // 纯文本回复：澄清问题或最终总结
    finalContent = result.content;
    if (!output && state.strategy && state.reasons && state.alignments) {
      output = assembleOutput(state);
      onEvent({ type: 'run_complete', output });
    }
    break;
  }

  if (!finalContent) finalContent = '（本轮未生成文本回复）';

  onEvent({ type: 'done', content: finalContent });
  return { content: finalContent, output };
}
