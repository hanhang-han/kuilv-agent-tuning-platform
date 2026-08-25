'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, FlaskConical, GitBranch, Loader2, Play, Save, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import type { PromptVersion, RegressionResult, ToolId } from '@/lib/types';
import { ERROR_META, fmtDateTime, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PromptListItem {
  id: string; label: string; isBaseline?: boolean; builtin?: boolean;
  t6Mode: string; knowledgeVersionId: string; t4Weights: PromptVersion['t4Weights'];
  changeNote: string; parentVersionId?: string; createdAt: string;
}

interface Meta {
  prompts: PromptListItem[];
  knowledgeVersions: { id: string; label: string; note: string }[];
}

interface Detail extends PromptVersion {
  knowledge: { id: string; label: string; note: string; entries: unknown[] } | null;
  regressions: RegressionResult[];
}

const TOOL_IDS: ToolId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const TOOL_NAMES: Record<ToolId, string> = {
  T1: 'T1 数据覆盖探测', T2: 'T2 销量榜单', T3: 'T3 库存推算',
  T4: 'T4 多因子评分', T5: 'T5 商品语义对齐', T6: 'T6 推荐理由生成',
};

function Delta({ v }: { v: number | undefined }) {
  if (v === undefined) return <span className="text-muted-foreground">-</span>;
  const pct = (v * 100).toFixed(1);
  return v >= 0
    ? <span className="inline-flex items-center gap-0.5 text-emerald-400"><TrendingUp className="size-3" />+{pct}pp</span>
    : <span className="inline-flex items-center gap-0.5 text-red-400"><TrendingDown className="size-3" />{pct}pp</span>;
}

function RegressionReport({ result }: { result: RegressionResult }) {
  const m = result.metrics;
  const d = result.deltaVsBaseline;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[
          { label: '回归通过率', value: fmtPct(m.passRate), delta: d?.passRate },
          { label: '格式合规率', value: fmtPct(m.formatRate), delta: d?.formatRate },
          { label: '类目对齐准确率', value: fmtPct(m.alignmentAcc), delta: d?.alignmentAcc },
          { label: '理由数值一致率', value: fmtPct(m.reasonConsistency), delta: d?.reasonConsistency },
          { label: '策略三准确率', value: fmtPct(m.goldPrecision, 1), delta: d?.goldPrecision },
          { label: '策略三召回率', value: fmtPct(m.goldRecall, 1), delta: d?.goldRecall },
        ].map((x) => (
          <div key={x.label} className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{x.label}</div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums">{x.value}</span>
              {d ? <Delta v={x.delta} /> : null}
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">分错误类型（{result.caseCount} 个口径 · {Math.round(result.durationMs / 1000)}s）</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ERROR_META) as (keyof typeof ERROR_META)[]).map((e) => (
            <span key={e} className={cn('rounded border px-2 py-1 text-[11px]', ERROR_META[e].className)}>
              {ERROR_META[e].label}：{result.byErrorType[e] ?? 0}
            </span>
          ))}
        </div>
      </div>
      {result.narrative && <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{result.narrative}</p>}
    </div>
  );
}

export default function PromptsPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Detail | null>(null);
  const [dirty, setDirty] = useState(false);

  const [regCount, setRegCount] = useState('30');
  const [regBaseline, setRegBaseline] = useState('');
  const [regRunning, setRegRunning] = useState(false);
  const [regProgress, setRegProgress] = useState<{ done: number; total: number; current?: string } | null>(null);
  const [regResult, setRegResult] = useState<RegressionResult | null>(null);
  const [regError, setRegError] = useState('');

  const loadMeta = useCallback(async () => {
    const m = await fetch('/api/prompts').then((r) => r.json());
    setMeta(m);
    if (!selectedId && m.prompts.length) setSelectedId(m.prompts[0].id);
  }, [selectedId]);

  useEffect(() => { loadMeta(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) return;
    setDetail(null); setDraft(null); setDirty(false); setRegResult(null); setRegError('');
    fetch(`/api/prompts/${selectedId}`).then((r) => r.json()).then((d: Detail) => {
      setDetail(d);
      setDraft(structuredClone(d));
    });
  }, [selectedId]);

  const save = async () => {
    if (!draft) return;
    const res = await fetch('/api/prompts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: draft.id, label: draft.label, systemPrompt: draft.systemPrompt,
        toolDescriptions: draft.toolDescriptions, knowledgeVersionId: draft.knowledgeVersionId,
        t6Mode: draft.t6Mode, t4Weights: draft.t4Weights, changeNote: draft.changeNote,
      }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? '保存失败'); return; }
    toast.success('已保存——去「回归测试」验证改动效果');
    setDirty(false);
    const d = await fetch(`/api/prompts/${draft.id}`).then((r) => r.json());
    setDetail(d); setDraft(structuredClone(d));
    loadMeta();
  };

  const fork = async () => {
    const base = detail;
    if (!base) return;
    const label = prompt('新版本名称（如：v2.0-我的调优版）');
    if (!label) return;
    const res = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseVersionId: base.id, label, changeNote: `从 ${base.label} fork 开始调优` }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? 'fork 失败'); return; }
    toast.success(`已创建 ${label}`);
    await loadMeta();
    setSelectedId(data.id);
  };

  const remove = async (id: string) => {
    if (!confirm('确认删除该自定义版本？')) return;
    const res = await fetch(`/api/prompts?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? '删除失败'); return; }
    toast.success('已删除');
    await loadMeta();
    if (selectedId === id) setSelectedId('pv-baseline');
  };

  const startRegression = async () => {
    if (!draft) return;
    setRegRunning(true); setRegProgress(null); setRegResult(null); setRegError('');
    try {
      const res = await fetch('/api/regression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptVersionId: draft.id,
          caseCount: parseInt(regCount, 10),
          baselineVersionId: regBaseline || undefined,
        }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const evt of events) {
          if (!evt.startsWith('data: ')) continue;
          const data = JSON.parse(evt.slice(6));
          if (data.type === 'progress') setRegProgress({ done: data.done, total: data.total, current: data.current });
          else if (data.type === 'done') { setRegResult(data.result); await loadMeta(); }
          else if (data.type === 'error') setRegError(data.message);
        }
      }
    } catch (e) {
      setRegError(e instanceof Error ? e.message : '回归失败');
    } finally {
      setRegRunning(false);
    }
  };

  const readOnly = !!draft?.builtin;

  return (
    <div className="flex min-h-screen">
      <div className="w-64 shrink-0 border-r border-border p-4">
        <h1 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FlaskConical className="size-4" />Prompt 实验室</h1>
        <div className="space-y-1">
          {meta?.prompts.map((p) => (
            <div key={p.id} className={cn('group flex items-center rounded-md border px-2.5 py-2', selectedId === p.id ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:bg-accent')}>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(p.id)}>
                <div className="truncate text-sm">{p.label}</div>
                <div className="truncate text-[11px] text-muted-foreground">{p.builtin ? '内置' : '自定义'} · {p.t6Mode === 'template' ? '模板' : '自由'}理由</div>
              </button>
              {!p.builtin && (
                <button type="button" onClick={() => remove(p.id)} className="ml-1 opacity-0 transition-opacity group-hover:opacity-100" title="删除">
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-red-400" />
                </button>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={fork} disabled={!detail}>
          <GitBranch className="size-3.5" />从当前版本 fork
        </Button>
      </div>

      <div className="min-w-0 flex-1 p-5">
        {!draft ? (
          <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>
        ) : (
          <Tabs defaultValue="editor">
            <div className="mb-4 flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="editor">编辑器</TabsTrigger>
                <TabsTrigger value="regression">回归测试</TabsTrigger>
                <TabsTrigger value="history">回归历史</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                {readOnly && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">内置版本只读</Badge>}
                {dirty && <span className="text-xs text-muted-foreground">有未保存修改</span>}
                <Button size="sm" onClick={save} disabled={readOnly || !dirty}>
                  <Save className="size-3.5" />保存
                </Button>
              </div>
            </div>

            <TabsContent value="editor" className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm">
                  版本名称
                  <Input value={draft.label} disabled={readOnly} onChange={(e) => { setDraft({ ...draft, label: e.target.value }); setDirty(true); }} className="h-8 w-48" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  类目知识
                  <Select value={draft.knowledgeVersionId} disabled={readOnly}
                    onValueChange={(v) => { setDraft({ ...draft, knowledgeVersionId: v ?? draft.knowledgeVersionId }); setDirty(true); }}
                    items={meta?.knowledgeVersions.map((k) => ({ value: k.id, label: k.label }))}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {meta?.knowledgeVersions.map((k) => <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  T6 理由模式
                  <Switch checked={draft.t6Mode === 'template'} disabled={readOnly}
                    onCheckedChange={(v) => { setDraft({ ...draft, t6Mode: v ? 'template' : 'free' }); setDirty(true); }} />
                  <span className="text-xs text-muted-foreground">{draft.t6Mode === 'template' ? '模板化（占位符）' : '自由生成'}</span>
                </label>
              </div>
              {draft.knowledge && (
                <p className="text-xs text-muted-foreground">类目知识说明：{draft.knowledge.note}</p>
              )}

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">System Prompt</div>
                <Textarea value={draft.systemPrompt} disabled={readOnly} rows={10}
                  onChange={(e) => { setDraft({ ...draft, systemPrompt: e.target.value }); setDirty(true); }}
                  className="font-mono text-xs leading-relaxed" />
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">工具描述（agent 时代的「产品文案」，T5 描述质量直接决定类目对齐）</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {TOOL_IDS.map((t) => (
                    <div key={t}>
                      <div className="mb-1 text-[11px] text-muted-foreground">{TOOL_NAMES[t]}</div>
                      <Textarea value={draft.toolDescriptions[t]} disabled={readOnly} rows={t === 'T5' ? 5 : 2}
                        onChange={(e) => { setDraft({ ...draft, toolDescriptions: { ...draft.toolDescriptions, [t]: e.target.value } }); setDirty(true); }}
                        className="text-xs leading-relaxed" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">T4 四因子权重（策略三，和必须为 1）</div>
                <div className="flex flex-wrap gap-3">
                  {(['promo', 'onSale30', 'onSale180', 'channelTag'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1.5 text-xs">
                      {{ promo: '促销', onSale30: '持续在售', onSale180: '长期在售', channelTag: '渠道标签' }[k]}
                      <Input type="number" step="0.05" min="0" max="1" disabled={readOnly} value={draft.t4Weights[k]}
                        onChange={(e) => { setDraft({ ...draft, t4Weights: { ...draft.t4Weights, [k]: parseFloat(e.target.value) || 0 } }); setDirty(true); }}
                        className="h-8 w-20" />
                    </label>
                  ))}
                  <span className={cn('self-center text-xs', Math.abs(draft.t4Weights.promo + draft.t4Weights.onSale30 + draft.t4Weights.onSale180 + draft.t4Weights.channelTag - 1) > 0.01 ? 'text-red-400' : 'text-muted-foreground')}>
                    合计 {(draft.t4Weights.promo + draft.t4Weights.onSale30 + draft.t4Weights.onSale180 + draft.t4Weights.channelTag).toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">改动说明</div>
                <Input value={draft.changeNote} disabled={readOnly} onChange={(e) => { setDraft({ ...draft, changeNote: e.target.value }); setDirty(true); }} className="h-8" />
              </div>
            </TabsContent>

            <TabsContent value="regression" className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm">对「{draft.label}」发起回归测试</span>
                  <Select value={regCount} onValueChange={(v) => setRegCount(v ?? '30')} items={[{ value: '30', label: '30 个口径（快速）' }, { value: '80', label: '80 个口径（全量）' }]}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 个口径（快速）</SelectItem>
                      <SelectItem value="80">80 个口径（全量）</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={regBaseline} onValueChange={(v) => setRegBaseline(v ?? '')} items={[{ value: '', label: '不对比' }, ...meta?.prompts.map((p) => ({ value: p.id, label: p.label })) ?? []]}>
                    <SelectTrigger className="w-52"><SelectValue placeholder="对比基线版本" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">不对比</SelectItem>
                      {meta?.prompts.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={startRegression} disabled={regRunning}>
                    {regRunning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {regRunning ? '回归中…' : '发起回归'}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  live 模式真实重跑全部去重口径（并发 6，temperature=0）；回放模式下内置版本直接展示预置快照。改完 prompt 先保存再回归。
                </p>
              </div>

              {regProgress && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>回归进度 {regProgress.current ? `· 正在跑 ${regProgress.current}` : ''}</span>
                    <span className="tabular-nums text-muted-foreground">{regProgress.done}/{regProgress.total}</span>
                  </div>
                  <Progress value={(regProgress.done / regProgress.total) * 100} />
                </div>
              )}

              {regError && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{regError}</div>}

              {regResult && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3 text-sm font-semibold">
                    回归报告 · {regResult.caseCount} 口径 · {fmtDateTime(regResult.createdAt)}
                    <Badge variant="outline" className="ml-2">{regResult.mode === 'live' ? '真跑' : '预置快照'}</Badge>
                  </div>
                  <RegressionReport result={regResult} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-3">
              {draft.regressions.length === 0 && (
                <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">该版本暂无回归记录</div>
              )}
              {draft.regressions
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((r) => (
                  <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm">
                      <span className="font-medium">{fmtDateTime(r.createdAt)}</span>
                      <Badge variant="outline">{r.mode === 'live' ? '真跑' : '预置快照'}</Badge>
                      <span className="text-xs text-muted-foreground">{r.caseCount} 口径</span>
                      <ChevronRight className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">通过率 {fmtPct(r.metrics.passRate)}</span>
                    </div>
                    <RegressionReport result={r} />
                  </div>
                ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
