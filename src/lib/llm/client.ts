/**
 * DeepSeek LLM 客户端（OpenAI 兼容协议）
 * temperature=0：跑批可复现，回归测试前提（ADR-5）
 * 无 API Key 时平台降级为回放模式（health 接口探测）
 */
import OpenAI from 'openai';

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

let cached: OpenAI | null = null;

export function llmAvailable(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

export function getModelName(): string {
  return MODEL;
}

function getClient(): OpenAI {
  if (!cached) {
    cached = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: BASE_URL,
    });
  }
  return cached;
}

/** 带重试的 chat 调用（function calling 网络抖动兜底） */
export async function chatCompletion(params: {
  messages: OpenAI.ChatCompletionMessageParam[];
  tools?: OpenAI.ChatCompletionTool[];
}): Promise<OpenAI.ChatCompletionMessage> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await getClient().chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages: params.messages,
        ...(params.tools?.length ? { tools: params.tools, tool_choice: 'auto' as const } : {}),
      });
      return res.choices[0].message;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface StreamResult {
  content: string;
  toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
}

/** 流式 chat（对话模式：token 逐段回调，工具调用增量组装） */
export async function chatCompletionStream(params: {
  messages: OpenAI.ChatCompletionMessageParam[];
  tools?: OpenAI.ChatCompletionTool[];
  onToken?: (text: string) => void;
}): Promise<StreamResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const stream = await getClient().chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages: params.messages,
        ...(params.tools?.length ? { tools: params.tools, tool_choice: 'auto' as const } : {}),
        stream: true,
      });
      let content = '';
      const toolMap = new Map<number, { id: string; name: string; args: string }>();
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          content += delta.content;
          params.onToken?.(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const existing = toolMap.get(tc.index ?? 0) ?? { id: '', name: '', args: '' };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          toolMap.set(tc.index ?? 0, existing);
        }
      }
      return {
        content,
        toolCalls: [...toolMap.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, v]) => ({ id: v.id, type: 'function' as const, function: { name: v.name, arguments: v.args } })),
      };
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
