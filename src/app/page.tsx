'use client';

import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ERROR_META, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DashboardData {
  totals: { cases: number; reviewed: number; pending: number; liveCases: number };
  errorDist: Record<string, number>;
  weekly: { week: number; passRate: number | null; precision: number | null; recall: number | null; n: number }[];
  competitorSlice: { competitor: string; errorRate: number; caseCount: number; byType: Record<string, number> }[];
  latestRegression: { metrics: Record<string, number | undefined>; narrative?: string } | null;
  regressions: { id: string; promptLabel: string; metrics: Record<string, number | undefined>; mode: string; createdAt: string; narrative?: string }[];
}

const ERROR_COLORS: Record<string, string> = {
  E1: '#f59e0b', E2: '#f97316', E3: '#ef4444', E4: '#f43f5e', E5: '#eab308',
};

function BigCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(var(--foreground))',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        <div className="grid grid-cols-2 gap-3"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </div>
    );
  }

  const errorData = (Object.keys(ERROR_META) as (keyof typeof ERROR_META)[])
    .map((e) => ({ name: ERROR_META[e].label, key: e, count: data.errorDist[e] ?? 0 }));

  const trendData = data.weekly.map((w) => ({
    week: `W${w.week}`,
    通过率: w.passRate !== null ? +(w.passRate * 100).toFixed(1) : null,
    准确率: w.precision !== null ? +(w.precision * 100).toFixed(1) : null,
    召回率: w.recall !== null ? +(w.recall * 100).toFixed(1) : null,
  }));

  const compData = data.competitorSlice.map((c) => ({
    name: c.competitor.split('·')[1] ?? c.competitor,
    错误率: +(c.errorRate * 100).toFixed(1),
    E1: c.byType.E1, E2: c.byType.E2, E3: c.byType.E3, E4: c.byType.E4, E5: c.byType.E5,
  }));

  const m = data.latestRegression?.metrics;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">仪表盘</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Case 池 {data.totals.cases} 条（已评审 {data.totals.reviewed} / 待评审 {data.totals.pending} / live {data.totals.liveCases}）
          </p>
        </div>
        {data.regressions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.regressions.slice(0, 3).map((r) => (
              <Badge key={r.id} variant="outline" className="text-[11px]">
                {r.promptLabel}：通过率 {fmtPct(r.metrics.passRate)}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {m && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <BigCard label="最新回归通过率（v1.1）" value={fmtPct(m.passRate)} sub="500 条历史 case 回放比对" />
          <BigCard label="类目对齐准确率（深检）" value={fmtPct(m.alignmentAcc)} sub="首版 85% → 迭代 5 轮" />
          <BigCard label="理由数值一致率（深检）" value={fmtPct(m.reasonConsistency)} sub="理由模板化：幻觉率 11%→4%" />
          <BigCard label="策略三准召率" value={`${fmtPct(m.goldPrecision, 1)} / ${fmtPct(m.goldRecall, 1)}`} sub="vs 策略一金标（无数据口径）" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium">错误类型分布（快评口径，已评审 {data.totals.reviewed} 条）</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={errorData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} angle={-15} dy={8} height={50} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
              <Bar dataKey="count" name="case 数" radius={[4, 4, 0, 0]}>
                {errorData.map((d) => <Cell key={d.key} fill={ERROR_COLORS[d.key]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-muted-foreground">E1 类目错误是迭代主线；E3 占比低但伤害大，优先修——归因决定优先级</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium">8 周迭代趋势：通过率（快评）与策略三准召率（深检）</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} domain={[20, 100]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="通过率" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="准确率" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="召回率" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-muted-foreground">W1-3 v0.9 → W4-5 v1.0（工具描述重写）→ W6-8 v1.1（理由模板化）</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">按竞对切片：错误类型分布</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={compData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {(['E1', 'E2', 'E3', 'E4', 'E5'] as const).map((e) => (
              <Bar key={e} dataKey={e} stackId="a" name={ERROR_META[e].label} fill={ERROR_COLORS[e]} radius={e === 'E5' ? [4, 4, 0, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {data.competitorSlice.map((c) => (
            <span key={c.competitor} className={cn('rounded border border-border px-2 py-0.5')}>
              {c.competitor}：错误率 {fmtPct(c.errorRate)}（n={c.caseCount}）
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
