'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Competitor } from '@/lib/types';
import type { CaseSummary } from '@/app/api/cases/route';
import { ERROR_META, caseStatus, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Meta {
  competitors: Competitor[];
  categories: { id: string; name: string }[];
}

const ALL = '__all__';

export default function CasesPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [items, setItems] = useState<CaseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ competitorId: ALL, city: ALL, parentId: ALL, status: ALL, errorType: ALL, source: ALL });

  useEffect(() => {
    fetch('/api/meta').then((r) => r.json()).then(setMeta).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (filters.competitorId !== ALL) params.set('competitorId', filters.competitorId);
    if (filters.city !== ALL) params.set('city', filters.city);
    if (filters.parentId !== ALL) params.set('parentId', filters.parentId);
    if (filters.status !== ALL) params.set('status', filters.status);
    if (filters.errorType !== ALL) params.set('errorType', filters.errorType);
    if (filters.source !== ALL) params.set('source', filters.source);
    const res = await fetch(`/api/cases?${params}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const cities = useMemo(() => {
    const comp = meta?.competitors.find((c) => c.id === filters.competitorId);
    return comp ? comp.cities : [...new Set((meta?.competitors ?? []).flatMap((c) => c.cities))];
  }, [meta, filters.competitorId]);

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Case 池</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Agent 运行记录全量（{total} 条）· 本页待评审 {pendingCount} 条</p>
        </div>
        <Button render={<Link href="/run" />}><Plus className="size-4" />新建口径运行</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={filters.competitorId} onValueChange={(v) => { setFilters((f) => ({ ...f, competitorId: v ?? ALL, city: ALL })); setPage(1); }}
          items={[{ value: ALL, label: '全部竞对' }, ...meta?.competitors.map((c) => ({ value: c.id, label: c.name })) ?? []]}>
          <SelectTrigger className="w-44"><SelectValue placeholder="竞对" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部竞对</SelectItem>
            {meta?.competitors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.city} onValueChange={(v) => { setFilters((f) => ({ ...f, city: v ?? ALL })); setPage(1); }}
          items={[{ value: ALL, label: '全部城市' }, ...cities.map((c) => ({ value: c, label: c }))]}>
          <SelectTrigger className="w-28"><SelectValue placeholder="城市" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部城市</SelectItem>
            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.parentId} onValueChange={(v) => { setFilters((f) => ({ ...f, parentId: v ?? ALL })); setPage(1); }}
          items={[{ value: ALL, label: '全部品类' }, ...meta?.categories.map((c) => ({ value: c.id, label: c.name })) ?? []]}>
          <SelectTrigger className="w-32"><SelectValue placeholder="品类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部品类</SelectItem>
            {meta?.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => { setFilters((f) => ({ ...f, status: v ?? ALL })); setPage(1); }}
          items={[{ value: ALL, label: '全部状态' }, { value: 'pending', label: '待评审' }, { value: 'pass', label: '已通过' }, { value: 'reject', label: '已打回' }]}>
          <SelectTrigger className="w-32"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value="pending">待评审</SelectItem>
            <SelectItem value="pass">已通过</SelectItem>
            <SelectItem value="reject">已打回</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.errorType} onValueChange={(v) => { setFilters((f) => ({ ...f, errorType: v ?? ALL })); setPage(1); }}
          items={[{ value: ALL, label: '全部错误类型' }, ...(Object.keys(ERROR_META) as (keyof typeof ERROR_META)[]).map((e) => ({ value: e, label: ERROR_META[e].label }))]}>
          <SelectTrigger className="w-40"><SelectValue placeholder="错误类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部错误类型</SelectItem>
            {(Object.keys(ERROR_META) as (keyof typeof ERROR_META)[]).map((e) => (
              <SelectItem key={e} value={e}>{ERROR_META[e].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.source} onValueChange={(v) => { setFilters((f) => ({ ...f, source: v ?? ALL })); setPage(1); }}
          items={[{ value: ALL, label: '全部来源' }, { value: 'seed', label: '历史 seed' }, { value: 'live', label: 'live 运行' }]}>
          <SelectTrigger className="w-32"><SelectValue placeholder="来源" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部来源</SelectItem>
            <SelectItem value="seed">历史 seed</SelectItem>
            <SelectItem value="live">live 运行</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Case</TableHead>
              <TableHead>口径</TableHead>
              <TableHead className="w-36">Prompt 版本</TableHead>
              <TableHead className="w-16 text-right">输出</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-16">置信度</TableHead>
              <TableHead className="w-36">时间</TableHead>
              <TableHead className="w-20 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : items.map((c) => {
                  const st = caseStatus({
                    review: c.status === 'pass'
                      ? { verdict: 'pass' as const }
                      : c.status === 'reject'
                        ? { verdict: 'reject' as const, errorType: c.errorType as never }
                        : undefined,
                  });
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-mono text-xs">{c.id}</div>
                        {c.source === 'live' && <Badge variant="outline" className="mt-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-400">live</Badge>}
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-sm">{c.specLabel}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.promptLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.outputCount}</TableCell>
                      <TableCell>
                        <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[11px]', st.className)}>{st.label}</span>
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-muted-foreground">{c.confidence !== undefined ? c.confidence.toFixed(2) : '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDateTime(c.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" render={<Link href={`/review/${c.id}`} />}>
                          评审
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">没有符合条件的 case</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {total} 条 · 第 {page}/{totalPages} 页</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  );
}
