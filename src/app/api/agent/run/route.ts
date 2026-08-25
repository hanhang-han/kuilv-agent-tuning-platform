/**
 * POST /api/agent/run —— 单口径运行（真跑）
 * SSE 流式推送：{type:'step', step} 每个工具调用 → {type:'done', case} 完整 case
 * 无 API Key 时自动降级回放模式：取最匹配的 seed case，按步回放其决策链路
 */
import { llmAvailable } from '@/lib/llm/client';
import { getStore } from '@/lib/storage';
import { runAgent } from '@/lib/agent/runner';
import type { AgentCase, CaseSpec } from '@/lib/types';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findReplayCase(spec: CaseSpec): AgentCase | undefined {
  const cases = getStore().listCases().filter((c) => c.source === 'seed');
  return (
    cases.find((c) => c.spec.competitorId === spec.competitorId && c.spec.city === spec.city && c.spec.parentId === spec.parentId) ??
    cases.find((c) => c.spec.competitorId === spec.competitorId && c.spec.parentId === spec.parentId) ??
    cases.find((c) => c.spec.competitorId === spec.competitorId)
  );
}

export async function POST(req: Request) {
  let body: { competitorId?: string; city?: string; parentId?: string; promptVersionId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  const { competitorId, city, parentId } = body;
  if (!competitorId || !city || !parentId) {
    return Response.json({ error: '缺少口径参数（competitorId/city/parentId）' }, { status: 400 });
  }
  const spec: CaseSpec = { competitorId, city, parentId };
  const promptVersionId = body.promptVersionId || 'pv-baseline';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        if (!llmAvailable()) {
          const replay = findReplayCase(spec);
          if (!replay) {
            send({ type: 'error', message: '回放模式未找到匹配的 seed case' });
          } else {
            send({ type: 'mode', mode: 'replay', caseId: replay.id, note: '未配置 DeepSeek API Key，按回放模式演示' });
            for (const step of replay.chain) {
              await sleep(450);
              send({ type: 'step', step });
            }
            await sleep(300);
            send({ type: 'done', case: replay, replayed: true });
          }
        } else {
          send({ type: 'mode', mode: 'live', promptVersionId });
          const agentCase = await runAgent(spec, promptVersionId, {
            onStep: (step) => send({ type: 'step', step }),
          });
          send({ type: 'done', case: agentCase });
        }
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
