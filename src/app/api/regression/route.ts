/**
 * POST /api/regression —— 发起回归测试（SSE 进度）
 * GET /api/regression —— 全部回归结果列表
 */
import { getStore } from '@/lib/storage';
import { runRegression } from '@/lib/eval/regression';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ results: getStore().listRegressions() });
}

export async function POST(req: Request) {
  let body: { promptVersionId?: string; caseCount?: number; baselineVersionId?: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  const promptVersionId = body.promptVersionId;
  if (!promptVersionId) return Response.json({ error: '缺少 promptVersionId' }, { status: 400 });
  const caseCount = Math.min(80, Math.max(10, body.caseCount ?? 30));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        send({ type: 'start', total: caseCount });
        const result = await runRegression({
          promptVersionId,
          caseCount,
          baselineVersionId: body.baselineVersionId,
          onProgress: (p) => send({ type: 'progress', done: p.done, total: p.total, current: p.current }),
        });
        send({ type: 'done', result });
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
