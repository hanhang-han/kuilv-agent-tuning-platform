import type { ErrorType, ToolCall } from '@/lib/types';

export const ERROR_META: Record<ErrorType, { label: string; desc: string; className: string }> = {
  E1: { label: 'E1 类目映射错误', desc: '竞对商品映射到错误类目（T5 语义问题）', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  E2: { label: 'E2 误判高销', desc: '非高销品进入推荐清单（策略/数据问题）', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  E3: { label: 'E3 理由幻觉', desc: '推荐理由中的数据与工具返回不符（T6 生成问题）', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  E4: { label: 'E4 格式违规', desc: '输出不符合 Schema（工程问题）', className: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  E5: { label: 'E5 漏检', desc: '金标高销品未进入清单（召回问题）', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
};

export const TOOL_BADGE: Record<ToolCall['tool'], { label: string; className: string }> = {
  T1: { label: 'T1', className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  T2: { label: 'T2', className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  T3: { label: 'T3', className: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  T4: { label: 'T4', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  T5: { label: 'T5', className: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  T6: { label: 'T6', className: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30' },
  validator: { label: 'VD', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtPct(v: number | undefined, digits = 0): string {
  if (v === undefined) return '-';
  return `${(v * 100).toFixed(digits)}%`;
}

export function caseStatus(c: { review?: { verdict: 'pass' | 'reject'; errorType?: ErrorType } }): { key: 'pending' | 'pass' | 'reject'; label: string; className: string } {
  if (!c.review) return { key: 'pending', label: '待评审', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' };
  if (c.review.verdict === 'pass') return { key: 'pass', label: '已通过', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  return { key: 'reject', label: `打回·${c.review.errorType ?? ''}`, className: 'bg-red-500/15 text-red-400 border-red-500/30' };
}

/** 理由文本中的数字片段高亮（评审时核对数字的视觉锚点） */
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
