'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DecisionTimeline } from '@/components/case/decision-timeline';
import type { AgentCase, Competitor, ToolCall } from '@/lib/types';
import { ERROR_META, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Meta {
  competitors: Competitor[];
  categories: { id: string; name: string }[];
  prompts: { id: string; label: string; isBaseline?: boolean; changeNote?: string }[];
  mode: { mode: string; model: string };
}

interface DoneCase extends AgentCase {
  meta?: { specLabel: string; promptLabel: string };
}

export default function RunPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [competitorId, setCompetitorId] = useState<string>('');
  const [city, setCity] = useState('');
  const [parentId, setParentId] = useState('');
  const [promptVersionId, setPromptVersionId] = useState('pv-baseline');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<ToolCall[]>([]);
  const [modeNote, setModeNote] = useState<string>('');
  const [result, setResult] = useState<DoneCase | null>(null);
  const [error, setError] = useState<string>('');
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/meta').then((r) => r.json()).then((m: Meta) => {
      setMeta(m);
      setCompetitorId(m.competitors[0]?.id ?? '');
      setCity(m.competitors[0]?.cities[0] ?? '');
      setParentId(m.categories[0]?.id ?? '');
    }).catch(() => {});
  }, []);

  const cities = meta?.competitors.find((c) => c.id === competitorId)?.cities ?? [];

  const start = async () => {
    setRunning(true); setSteps([]); setResult(null); setError(''); setModeNote('');
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId, city, parentId, promptVersionId }),
      });
      if (!res.ok || !res.body) throw new Error(`请求失败（${res.status}）`);
      const reader = res.body.getReader();
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
          if (data.type === 'mode') {
            setModeNote(data.mode === 'live' ? `真跑模式 · 版本 ${data.promptVersionId}` : '回放模式（未配置 API Key，按历史 case 演示）');
          } else if (data.type === 'step') {
            setSteps((s) => [...s, data.step]);
            timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight });
          } else if (data.type === 'done') {
            setResult(data.case);
          } else if (data.type === 'error') {
            setError(data.message);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '运行失败');
    } finally {
      setRunning(false);
    }
  };

  const detected = result?.autoEval?.detectedErrors ?? [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">运行台</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        选择口径实时运行选品 Agent，观察 ReAct 决策链路：T1 探测 → 策略路由 → T5 对齐 → T6 理由 → Validator
      </p>

      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Select
            value={competitorId}
            onValueChange={(v) => { const id = v ?? ''; setCompetitorId(id); setCity(meta?.competitors.find((c) => c.id === id)?.cities[0] ?? ''); }}
            items={meta?.competitors.map((c) => ({ value: c.id, label: c.name }))}
          >
            <SelectTrigger className="w-44"><SelectValue placeholder="竞对" /></SelectTrigger>
            <SelectContent>
              {meta?.competitors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={city} onValueChange={(v) => setCity(v ?? '')} items={cities.map((c) => ({ value: c, label: c }))}>
            <SelectTrigger className="w-28"><SelectValue placeholder="城市" /></SelectTrigger>
            <SelectContent>
              {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={parentId} onValueChange={(v) => setParentId(v ?? '')} items={meta?.categories.map((c) => ({ value: c.id, label: c.name }))}>
            <SelectTrigger className="w-32"><SelectValue placeholder="品类" /></SelectTrigger>
            <SelectContent>
              {meta?.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={promptVersionId} onValueChange={(v) => setPromptVersionId(v ?? 'pv-baseline')} items={meta?.prompts.map((p) => ({ value: p.id, label: p.label }))}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Prompt 版本" /></SelectTrigger>
            <SelectContent>
              {meta?.prompts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={start} disabled={running || !competitorId || !city || !parentId}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? '运行中…' : '开始运行'}
          </Button>
        </div>
        {promptVersionId && meta?.prompts.find((p) => p.id === promptVersionId)?.changeNote && (
          <p className="mt-2 text-xs text-muted-foreground">
            版本说明：{meta.prompts.find((p) => p.id === promptVersionId)!.changeNote}
          </p>
        )}
      </div>

      {(modeNote || error) && (
        <div className="mt-4">
          {modeNote && <Badge variant="outline" className={cn(modeNote.includes('回放') ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400')}>{modeNote}</Badge>}
          {error && <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
        </div>
      )}

      {steps.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">实时决策链路</div>
          <div ref={timelineRef} className="max-h-[420px] overflow-y-auto pr-1">
            <DecisionTimeline steps={steps} />
          </div>
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">运行完成</span>
            <Badge variant="outline">输出 {result.output.length} 条推荐</Badge>
            <Badge variant="outline" className={result.validatorPassed ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'}>
              Validator {result.validatorPassed ? '通过' : '失败'}
            </Badge>
            {result.autoEval && (
              <>
                <Badge variant="outline">对齐 {fmtPct(result.autoEval.alignmentAccuracy)}</Badge>
                <Badge variant="outline">理由一致 {fmtPct(result.autoEval.reasonConsistency)}</Badge>
              </>
            )}
            {!('replayed' in result) && result.source === 'live' && <span className="text-xs text-muted-foreground">已入 Case 池</span>}
          </div>
          {detected.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">自动评测检出：</span>
              {detected.map((e) => (
                <span key={e} className={cn('rounded border px-1.5 py-0.5 text-[11px]', ERROR_META[e].className)}>{ERROR_META[e].label}</span>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" render={<Link href={`/review/${result.id}`} />}>去评审这条 case</Button>
            <Button size="sm" variant="outline" render={<Link href="/cases" />}>返回 Case 池</Button>
          </div>
        </div>
      )}
    </div>
  );
}
