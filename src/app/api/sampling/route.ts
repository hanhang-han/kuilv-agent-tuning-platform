/**
 * POST /api/sampling —— 生成分层抽样评审任务
 * GET /api/sampling —— 当前队列
 *
 * 分层逻辑（设计考量：简单随机会被头部类目淹没，分层保证长尾可见）：
 * - 按 竞对 × 品类 分层，层间轮转抽取
 * - 层内优先级：低置信度（<0.75）> 自动评测检出错误 > 普通
 */
import { getStore } from '@/lib/storage';
import type { AgentCase, SamplingTask } from '@/lib/types';

export const dynamic = 'force-dynamic';

const priority = (c: AgentCase): number => {
  if ((c.confidence ?? 1) < 0.75) return 0;
  if ((c.autoEval?.detectedErrors.length ?? 0) > 0) return 1;
  return 2;
};

const reasonLabel = (c: AgentCase): string => {
  if ((c.confidence ?? 1) < 0.75) return '低置信度（T5 对齐不确定，深检优先）';
  if ((c.autoEval?.detectedErrors.length ?? 0) > 0) return `自动评测检出 ${c.autoEval!.detectedErrors.join('、')}`;
  return '常规抽样';
};

export async function GET() {
  const store = getStore();
  const queue = store.getQueue();
  if (!queue) return Response.json({ queue: null });
  const cases = queue.tasks
    .map((t) => ({ task: t, c: store.getCase(t.caseId) }))
    .filter((x) => x.c);
  return Response.json({
    queue: { ...queue, tasks: queue.tasks },
    items: cases.map(({ task, c }) => ({
      caseId: c!.id,
      createdAt: c!.createdAt,
      specLabel: task.stratum,
      reason: task.reason,
      confidence: c!.confidence,
      detectedErrors: c!.autoEval?.detectedErrors ?? [],
      reviewed: !!c!.review,
    })),
  });
}

export async function POST(req: Request) {
  let body: { taskCount?: number };
  try { body = await req.json(); } catch { body = {}; }
  const taskCount = Math.min(50, Math.max(5, body.taskCount ?? 20));

  const store = getStore();
  const pending = store.listCases().filter((c) => !c.review);
  if (pending.length === 0) {
    return Response.json({ error: '当前没有待评审 case——去运行台跑新口径，或等待下一批' }, { status: 400 });
  }

  // 分层：竞对 × 品类
  const strata = new Map<string, AgentCase[]>();
  for (const c of pending) {
    const comp = store.competitors.find((x) => x.id === c.spec.competitorId);
    const top = store.categories.find((x) => x.id === c.spec.parentId);
    const key = `${comp?.name ?? ''} × ${top?.name ?? ''}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key)!.push(c);
  }
  for (const list of strata.values()) {
    list.sort((a, b) => priority(a) - priority(b) || b.createdAt.localeCompare(a.createdAt));
  }

  // 层间轮转填充
  const tasks: SamplingTask[] = [];
  const keys = [...strata.keys()];
  const cursor = new Map(keys.map((k) => [k, 0]));
  while (tasks.length < taskCount) {
    let picked = false;
    for (const k of keys) {
      const list = strata.get(k)!;
      const i = cursor.get(k)!;
      if (i < list.length) {
        const c = list[i];
        tasks.push({ caseId: c.id, stratum: k, reason: reasonLabel(c) });
        cursor.set(k, i + 1);
        picked = true;
        if (tasks.length >= taskCount) break;
      }
    }
    if (!picked) break;
  }

  const queue = {
    id: `queue-${Date.now()}`,
    createdAt: new Date().toISOString(),
    totalCases: tasks.length,
    tasks,
  };
  store.setQueue(queue);
  return Response.json({ ok: true, queue });
}
