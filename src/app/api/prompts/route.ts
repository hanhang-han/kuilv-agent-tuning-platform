import { getStore } from '@/lib/storage';
import type { PromptVersion, ToolId } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/prompts —— 版本列表 */
export async function GET() {
  const store = getStore();
  return Response.json({
    prompts: store.listPrompts().map((p) => ({
      id: p.id, label: p.label, isBaseline: !!p.isBaseline, builtin: !!p.builtin,
      t6Mode: p.t6Mode, knowledgeVersionId: p.knowledgeVersionId,
      t4Weights: p.t4Weights, changeNote: p.changeNote, parentVersionId: p.parentVersionId,
      createdAt: p.createdAt,
    })),
    knowledgeVersions: store.knowledgeVersions.map((k) => ({ id: k.id, label: k.label, note: k.note })),
  });
}

/** POST /api/prompts —— 从某版本 fork 新的自定义版本 */
export async function POST(req: Request) {
  let body: { baseVersionId?: string; label?: string; changeNote?: string };
  try { body = await req.json(); } catch {
    return Response.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  const store = getStore();
  const base = store.getPrompt(body.baseVersionId || 'pv-baseline');
  if (!base) return Response.json({ error: '基线版本不存在' }, { status: 400 });
  const label = (body.label || '').trim();
  if (!label) return Response.json({ error: '请填写版本名称' }, { status: 400 });

  const id = `pv-custom-${Date.now()}`;
  const version: PromptVersion = {
    ...base,
    id,
    label,
    createdAt: new Date().toISOString(),
    parentVersionId: base.id,
    changeNote: body.changeNote || `从 ${base.label} fork`,
    isBaseline: false,
    builtin: false,
  };
  store.savePrompt(version);
  return Response.json({ ok: true, id });
}

/** PUT /api/prompts —— 更新自定义版本（内置版本只读，保证基准数据不被改动） */
export async function PUT(req: Request) {
  let body: {
    id?: string; label?: string; systemPrompt?: string;
    toolDescriptions?: Partial<Record<ToolId, string>>;
    knowledgeVersionId?: string; t6Mode?: 'template' | 'free';
    t4Weights?: PromptVersion['t4Weights']; changeNote?: string;
  };
  try { body = await req.json(); } catch {
    return Response.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: '缺少版本 id' }, { status: 400 });
  const store = getStore();
  const existing = store.getPrompt(body.id);
  if (!existing) return Response.json({ error: '版本不存在' }, { status: 404 });
  if (existing.builtin) return Response.json({ error: '内置版本只读（基准数据）——请 fork 后编辑' }, { status: 403 });

  const weights = body.t4Weights ?? existing.t4Weights;
  const weightSum = weights.promo + weights.onSale30 + weights.onSale180 + weights.channelTag;
  if (Math.abs(weightSum - 1) > 0.01) {
    return Response.json({ error: `四因子权重之和必须为 1（当前 ${weightSum.toFixed(2)}）` }, { status: 400 });
  }
  if (body.knowledgeVersionId && !store.getKnowledge(body.knowledgeVersionId)) {
    return Response.json({ error: '类目知识版本不存在' }, { status: 400 });
  }

  const updated: PromptVersion = {
    ...existing,
    label: (body.label || existing.label).trim() || existing.label,
    systemPrompt: body.systemPrompt ?? existing.systemPrompt,
    toolDescriptions: { ...existing.toolDescriptions, ...(body.toolDescriptions ?? {}) },
    knowledgeVersionId: body.knowledgeVersionId ?? existing.knowledgeVersionId,
    t6Mode: body.t6Mode ?? existing.t6Mode,
    t4Weights: weights,
    changeNote: body.changeNote ?? existing.changeNote,
  };
  store.savePrompt(updated);
  return Response.json({ ok: true });
}

/** DELETE /api/prompts?id= —— 删除自定义版本 */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: '缺少版本 id' }, { status: 400 });
  const store = getStore();
  const existing = store.getPrompt(id);
  if (!existing) return Response.json({ error: '版本不存在' }, { status: 404 });
  if (existing.builtin) return Response.json({ error: '内置版本不可删除' }, { status: 403 });
  const ok = store.deletePrompt(id);
  return Response.json({ ok });
}
