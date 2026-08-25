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
