import type { ToolCall } from '@/lib/types';

export const TOOL_BADGE: Record<ToolCall['tool'], { label: string; className: string }> = {
  T1: { label: 'T1', className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  T2: { label: 'T2', className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  T3: { label: 'T3', className: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  T4: { label: 'T4', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  T5: { label: 'T5', className: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  T6: { label: 'T6', className: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30' },
};

/** 理由文本中的数字片段高亮（核对数字的视觉锚点） */
export function splitReasonNumbers(reason: string): { text: string; num?: string }[] {
  const parts: { text: string; num?: string }[] = [];
  let last = 0;
  const re = /\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reason))) {
    if (m.index > last) parts.push({ text: reason.slice(last, m.index) });
    parts.push({ text: m[0], num: m[0] });
    last = m.index + m[0].length;
  }
  if (last < reason.length) parts.push({ text: reason.slice(last) });
  return parts;
}
