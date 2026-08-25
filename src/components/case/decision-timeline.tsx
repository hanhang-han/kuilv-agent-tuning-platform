'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ToolCall } from '@/lib/types';
import { TOOL_BADGE } from '@/lib/format';
import { cn } from '@/lib/utils';

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function DecisionTimeline({ steps }: { steps: ToolCall[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-2">
      {steps.map((step) => {
        const badge = TOOL_BADGE[step.tool];
        const isOpen = !!open[step.step];
        return (
          <div key={step.step} className="rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [step.step]: !o[step.step] }))}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/40"
            >
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{String(step.step).padStart(2, '0')}</span>
              <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[11px]', badge.className)}>{badge.label}</span>
              <span className="text-sm font-medium">{step.name}</span>
              {step.status !== 'ok' && (
                <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-400">
                  {step.status === 'retry' ? '重试' : '异常'}
                </span>
              )}
              {step.note && <span className="hidden truncate text-xs text-muted-foreground lg:inline">{step.note}</span>}
              <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                {step.durationMs}ms
                {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </span>
            </button>
            {isOpen && (
              <div className="grid gap-3 border-t border-border px-3 py-3 md:grid-cols-2">
                <JsonBlock label="输入" data={step.input} />
                <JsonBlock label="输出" data={step.output} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
