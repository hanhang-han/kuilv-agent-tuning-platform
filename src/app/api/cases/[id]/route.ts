import { getStore } from '@/lib/storage';
import type { CaseReview, ErrorType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ERROR_TYPES: ErrorType[] = ['E1', 'E2', 'E3', 'E4', 'E5'];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = getStore().getCase(id);
  if (!c) return Response.json({ error: 'case 不存在' }, { status: 404 });
  const store = getStore();
  const comp = store.competitors.find((x) => x.id === c.spec.competitorId);
  const top = store.categories.find((x) => x.id === c.spec.parentId);
  const pv = store.getPrompt(c.promptVersionId);
  const catName = (cid: string) => store.categories.find((x) => x.id === cid)?.name ?? cid;
  const product = (pid: string) => store.products.find((x) => x.id === pid);
  return Response.json({
    ...c,
    meta: {
      specLabel: `${comp?.name} × ${c.spec.city} × ${top?.name}`,
      promptLabel: pv?.label ?? c.promptVersionId,
      changeNote: pv?.changeNote,
    },
    output: c.output.map((it) => ({
      ...it,
      trueCategoryName: product(it.productId) ? catName(product(it.productId)!.trueCategoryId) : undefined,
      categoryName: catName(it.categoryId),
      isBoundaryCase: product(it.productId)?.isBoundaryCase ?? false,
    })),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { verdict?: string; errorType?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '请求体必须是 JSON' }, { status: 400 });
  }
  if (body.verdict !== 'pass' && body.verdict !== 'reject') {
    return Response.json({ error: 'verdict 必须是 pass 或 reject' }, { status: 400 });
  }
  if (body.verdict === 'reject' && !ERROR_TYPES.includes(body.errorType as ErrorType)) {
    return Response.json({ error: '打回必须选择错误类型（E1-E5）' }, { status: 400 });
  }
  const review: CaseReview = {
    verdict: body.verdict,
    errorType: body.verdict === 'reject' ? (body.errorType as ErrorType) : undefined,
    reviewer: '产品PM',
    note: body.note || '',
    reviewedAt: new Date().toISOString(),
  };
  const updated = getStore().setReview(id, review);
  if (!updated) return Response.json({ error: 'case 不存在' }, { status: 404 });
  return Response.json({ ok: true, review });
}
