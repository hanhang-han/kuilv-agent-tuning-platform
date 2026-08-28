/**
 * POST /api/chat —— 对话式选品 Agent（SSE 流式）
 * 事件流：token（逐段文本）→ tool_start/tool_end（工具调用）→ run_complete（推荐清单入池）→ done
 * 对话模式必须真实调用 LLM：未配置 API Key 时返回 error 事件（无回放降级）
 */
import { llmAvailable } from '@/lib/llm/client';
import { runChatConversation, type ChatHistoryMessage } from '@/lib/agent/chat-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { messages?: ChatHistoryMessage[]; promptVersionId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  const messages = (body.messages ?? []).filter((m) => m && typeof m.content === 'string' && m.content.trim());
  if (messages.length === 0) {
    return Response.json({ error: 'messages 为空' }, { status: 400 });
  }
  const promptVersionId = body.promptVersionId || 'pv-baseline';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      if (!llmAvailable()) {
        send({
          type: 'error',
          message: '对话模式需要真实调用 LLM：请在 .env.local（本地）或 Vercel 环境变量配置 DEEPSEEK_API_KEY。配置前的演示请用「运行台」的回放模式。',
        });
        controller.close();
        return;
      }
      try {
        await runChatConversation(messages, promptVersionId, send);
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
