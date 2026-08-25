import { getStore } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** GET /api/prompts/[id] —— 版本全文（编辑器数据源） */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = getStore();
  const pv = store.getPrompt(id);
  if (!pv) return Response.json({ error: '版本不存在' }, { status: 404 });
  const knowledge = store.getKnowledge(pv.knowledgeVersionId);
  return Response.json({
    ...pv,
    knowledge: knowledge
      ? { id: knowledge.id, label: knowledge.label, note: knowledge.note, entries: knowledge.entries }
      : null,
    regressions: store.listRegressions().filter((r) => r.promptVersionId === id),
  });
}
