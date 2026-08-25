import { getStore } from '@/lib/storage';
import type { AgentCase } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface CaseSummary {
  id: string;
  createdAt: string;
  source: 'seed' | 'live';
  specLabel: string;
  competitorName: string;
  city: string;
  parentName: string;
  promptVersionId: string;
  promptLabel: string;
  status: 'pending' | 'pass' | 'reject';
  errorType?: string;
  outputCount: number;
  week?: number;
  confidence?: number;
  detectedErrors: string[];
}

function toSummary(c: AgentCase): CaseSummary {
  const store = getStore();
  const comp = store.competitors.find((x) => x.id === c.spec.competitorId);
  const top = store.categories.find((x) => x.id === c.spec.parentId);
  const pv = store.getPrompt(c.promptVersionId);
  return {
    id: c.id,
    createdAt: c.createdAt,
    source: c.source,
    specLabel: `${comp?.name ?? c.spec.competitorId} × ${c.spec.city} × ${top?.name ?? c.spec.parentId}`,
    competitorName: comp?.name ?? '',
    city: c.spec.city,
    parentName: top?.name ?? '',
    promptVersionId: c.promptVersionId,
    promptLabel: pv?.label ?? c.promptVersionId,
    status: !c.review ? 'pending' : c.review.verdict,
    errorType: c.review?.errorType,
    outputCount: c.output.length,
    week: c.week,
    confidence: c.confidence,
    detectedErrors: c.autoEval?.detectedErrors ?? [],
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (k: string) => url.searchParams.get(k) || undefined;
  const competitorId = q('competitorId');
  const city = q('city');
  const parentId = q('parentId');
  const status = q('status');
  const errorType = q('errorType');
  const source = q('source');
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(10, parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20));

  let cases = getStore().listCases();
  if (competitorId) cases = cases.filter((c) => c.spec.competitorId === competitorId);
  if (city) cases = cases.filter((c) => c.spec.city === city);
  if (parentId) cases = cases.filter((c) => c.spec.parentId === parentId);
  if (source) cases = cases.filter((c) => c.source === source);
  if (errorType) cases = cases.filter((c) => c.review?.errorType === errorType);
  if (status) {
    cases = cases.filter((c) =>
      status === 'pending' ? !c.review : c.review?.verdict === status,
    );
  }
  cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = cases.length;
  const items = cases.slice((page - 1) * pageSize, page * pageSize).map(toSummary);
  return Response.json({ total, page, pageSize, items });
}
