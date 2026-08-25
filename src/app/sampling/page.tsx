'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ERROR_META, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface QueueItem {
  caseId: string;
  createdAt: string;
  specLabel: string;
  reason: string;
  confidence?: number;
  detectedErrors: string[];
  reviewed: boolean;
}

export default function SamplingPage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [queueAt, setQueueAt] = useState<string>('');
  const [taskCount, setTaskCount] = useState('20');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/sampling');
    const data = await res.json();
    setItems(data.items ?? []);
    setQueueAt(data.queue?.createdAt ?? '');
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true); setError('');
    try {
      const res = await fetch('/api/sampling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskCount: parseInt(taskCount, 10) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '生成失败'); return; }
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const pendingCount = items?.filter((i) => !i.reviewed).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Layers className="size-5" />抽样队列</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            分层抽样生成当日评审任务：按竞对 × 品类分层、层内低置信度优先——简单随机会被头部类目淹没
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={taskCount} onValueChange={(v) => setTaskCount(v ?? '20')} items={[{ value: '10', label: '10 条' }, { value: '20', label: '20 条' }, { value: '40', label: '40 条' }]}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 条</SelectItem>
              <SelectItem value="20">20 条</SelectItem>
              <SelectItem value="40">40 条</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            生成评审任务
          </Button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">{error}</div>}

      {items === null ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">还没有抽样任务</p>
          <p className="mt-1 text-xs text-muted-foreground">点击「生成评审任务」，按分层策略从待评审 case 中抽取</p>
        </div>
      ) : (
        <>
          {queueAt && (
            <p className="mb-3 text-xs text-muted-foreground">
              队列生成于 {fmtDateTime(queueAt)} · 剩余待评审 {pendingCount} 条
            </p>
          )}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.caseId} className={cn('flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3', item.reviewed && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{item.caseId}</span>
                    <span className="text-sm">{item.specLabel}</span>
                    {item.reviewed ? (
                      <Badge variant="outline">已评审</Badge>
                    ) : (
                      <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-400">待评审</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{item.reason}</span>
                    {item.confidence !== undefined && <span>· 置信度 {item.confidence.toFixed(2)}</span>}
                    {item.detectedErrors.map((e) => (
                      <span key={e} className={cn('rounded border px-1 py-0.5', ERROR_META[e as keyof typeof ERROR_META]?.className)}>{e}</span>
                    ))}
                  </div>
                </div>
                {!item.reviewed && (
                  <Button size="sm" variant="outline" render={<Link href={`/review/${item.caseId}`} />}>
                    评审
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
