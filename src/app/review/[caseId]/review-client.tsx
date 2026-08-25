'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DecisionTimeline } from '@/components/case/decision-timeline';
import type { AgentCase, ErrorType, RecommendationItem } from '@/lib/types';
import { ERROR_META, caseStatus, fmtDateTime, fmtPct, splitReasonNumbers } from '@/lib/format';
import { cn } from '@/lib/utils';

interface EnrichedItem extends RecommendationItem {
  categoryName: string;
  trueCategoryName?: string;
  isBoundaryCase: boolean;
}

interface CaseDetail extends AgentCase {
  meta: { specLabel: string; promptLabel: string; changeNote?: string };
  output: EnrichedItem[];
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold tabular-nums', warn ? 'text-red-400' : 'text-foreground')}>{value}</div>
    </div>
  );
}

function OutputCard({ item, deepMode }: { item: EnrichedItem; deepMode: boolean }) {
  const misaligned = deepMode && item.trueCategoryName && item.categoryName !== item.trueCategoryName;
  return (
    <div className={cn('rounded-lg border bg-card p-3', misaligned ? 'border-red-500/40' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{item.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="outline" className={misaligned ? 'border-red-500/40 text-red-400' : ''}>{item.categoryName}</Badge>
            {item.isBoundaryCase && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">边界商品</Badge>}
            <span className="text-muted-foreground">{item.strategy}</span>
            {item.metric !== undefined && <span className="font-mono text-muted-foreground">{item.metric} 件</span>}
            {item.score !== undefined && <span className="font-mono text-muted-foreground">评分 {item.score}</span>}
          </div>
        </div>
      </div>
      {misaligned && (
        <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-400">
          深检：真值类目为「{item.trueCategoryName}」——映射错误（E1）
        </div>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {splitReasonNumbers(item.reason).map((p, i) =>
          p.num ? (
            <mark key={i} className="rounded bg-sky-500/20 px-0.5 font-mono text-sky-300">{p.text}</mark>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
      {deepMode && item.keyNumbers && Object.keys(item.keyNumbers).length > 0 && (
        <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          工具返回数据：{Object.entries(item.keyNumbers).map(([k, v]) => `${k}=${v}`).join('，')}
        </div>
      )}
    </div>
  );
}

export function ReviewClient({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [verdict, setVerdict] = useState<'pass' | 'reject' | null>(null);
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [note, setNote] = useState('');
  const [deepMode, setDeepMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDetail(null); setVerdict(null); setErrorType(null); setNote(''); setNotFound(false);
    fetch(`/api/cases/${caseId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then(setDetail)
      .catch(() => setNotFound(true));
  }, [caseId]);

  const submit = useCallback(async () => {
    if (!verdict) { toast.error('请先选择「通过」或「打回」'); return; }
    if (verdict === 'reject' && !errorType) { toast.error('打回必须选择错误类型（E1-E5）'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, errorType: verdict === 'reject' ? errorType : undefined, note }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '提交失败');
      toast.success(verdict === 'pass' ? '已通过' : `已打回（${errorType}）`);
      const next = await fetch('/api/cases?status=pending&pageSize=1').then((r) => r.json());
      const nextId = next.items?.[0]?.id;
      if (nextId && nextId !== caseId) router.push(`/review/${nextId}`);
      else router.push('/review');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }, [verdict, errorType, note, caseId, router]);

  if (notFound) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">case 不存在</p>
          <Button variant="outline" className="mt-3" render={<Link href="/cases" />}>返回 Case 池</Button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-96" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const st = caseStatus(detail);
  const detected = detail.autoEval?.detectedErrors ?? [];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="font-mono text-sm">{detail.id}</span>
        <span className="text-sm font-medium">{detail.meta.specLabel}</span>
        <Badge variant="outline">{detail.meta.promptLabel}</Badge>
        <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[11px]', st.className)}>{st.label}</span>
        <span className="text-xs text-muted-foreground">{fmtDateTime(detail.createdAt)}</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="size-3.5" />
          <span>深检模式（显示真值比对）</span>
          <Switch checked={deepMode} onCheckedChange={setDeepMode} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-4 p-4">
        <div className="col-span-3 space-y-3 overflow-y-auto">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">自动评测（judge 初筛）</div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Validator" value={detail.validatorPassed ? '通过' : '失败'} warn={!detail.validatorPassed} />
            <Metric label="类目对齐" value={fmtPct(detail.autoEval?.alignmentAccuracy)} warn={(detail.autoEval?.alignmentAccuracy ?? 1) < 1} />
            <Metric label="理由数值一致" value={fmtPct(detail.autoEval?.reasonConsistency)} warn={(detail.autoEval?.reasonConsistency ?? 1) < 1} />
            <Metric label="置信度" value={detail.confidence?.toFixed(2) ?? '-'} />
            {detail.autoEval?.goldPrecision !== undefined && (
              <Metric label="金标准确率" value={fmtPct(detail.autoEval.goldPrecision)} warn={detail.autoEval.goldPrecision < 1} />
            )}
            {detail.autoEval?.goldRecall !== undefined && (
              <Metric label="金标召回率" value={fmtPct(detail.autoEval.goldRecall)} warn={detail.autoEval.goldRecall < 1} />
            )}
          </div>
          {detected.length > 0 ? (
            <div className="rounded-md border border-border bg-card p-2.5">
              <div className="text-[11px] text-muted-foreground">自动检出（供快评参考）</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {detected.map((e) => (
                  <span key={e} className={cn('rounded border px-1.5 py-0.5 text-[11px]', ERROR_META[e].className)}>{ERROR_META[e].label}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-card p-2.5 text-[11px] text-muted-foreground">自动评测未检出明显错误</div>
          )}
          <div className="rounded-md border border-border bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">Prompt 版本</div>
            {detail.meta.changeNote ?? detail.promptVersionId}
          </div>
        </div>

        <div className="col-span-5 min-w-0 overflow-y-auto">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">决策链路（{detail.chain.length} 步）</div>
          <DecisionTimeline steps={detail.chain} />
        </div>

        <div className="col-span-4 min-w-0 overflow-y-auto">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">输出清单（{detail.output.length} 条推荐）</div>
          <div className="space-y-2.5">
            {detail.output.map((item) => (
              <OutputCard key={item.productId} item={item} deepMode={deepMode} />
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-border bg-card/60 px-5 py-3">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex gap-2">
            <Button
              variant={verdict === 'pass' ? 'default' : 'outline'}
              onClick={() => setVerdict('pass')}
            >
              <CheckCircle2 className="size-4" />通过
            </Button>
            <Button
              variant={verdict === 'reject' ? 'destructive' : 'outline'}
              onClick={() => setVerdict('reject')}
            >
              <XCircle className="size-4" />打回
            </Button>
          </div>
          {verdict === 'reject' && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ERROR_META) as ErrorType[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  title={ERROR_META[e].desc}
                  onClick={() => setErrorType(e)}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                    errorType === e ? ERROR_META[e].className : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {ERROR_META[e].label}
                </button>
              ))}
            </div>
          )}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="评审备注（可选）：错误细节、归因线索…"
            className="h-9 min-h-9 flex-1 resize-none py-2 text-xs"
            rows={1}
          />
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            提交评审{verdict === 'reject' ? '（打回）' : '并进入下一条'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
