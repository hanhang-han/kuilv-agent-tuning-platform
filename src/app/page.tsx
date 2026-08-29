'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { RecommendationItem, ToolCall } from '@/lib/types';
import { TOOL_BADGE, splitReasonNumbers } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolSteps?: (ToolCall & { pending?: boolean })[];
  output?: RecommendationItem[];
  error?: boolean;
}

interface Meta {
  categoryMap: Record<string, string>;
  mode: { hasApiKey: boolean; mode: string; model: string };
}

const EXAMPLES = [
  '看看竞对A在北京的半熟调理类目有什么高销品',
  '竞对B上海的生鲜肉类有什么值得引入的？',
  '帮我分析竞对C成都的调味酱料选品机会',
  '火锅季快到了，竞对A广州的冻品水产有什么趋势商品？',
];

function ToolStep({ step }: { step: ToolCall & { pending?: boolean } }) {
  const [open, setOpen] = useState(false);
  const badge = TOOL_BADGE[step.tool];
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 text-xs">
      <button type="button" className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left" onClick={() => setOpen(!open)}>
        <span className={cn('rounded border px-1 py-0.5 font-mono text-[10px]', badge.className)}>{badge.label}</span>
        <span className="text-muted-foreground">{step.name}</span>
        {step.pending ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : (
          <>
            <span className="text-[10px] text-muted-foreground">{step.durationMs}ms</span>
            {step.status !== 'ok' && <span className="rounded border border-red-500/30 bg-red-500/10 px-1 text-[10px] text-red-400">{step.status === 'retry' ? '重试' : '异常'}</span>}
          </>
        )}
        <span className="ml-auto text-muted-foreground">{open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}</span>
      </button>
      {open && !step.pending && (
        <div className="grid gap-2 border-t border-border/60 px-2.5 py-2 md:grid-cols-2">
          <div>
            <div className="mb-0.5 text-[10px] text-muted-foreground">输入</div>
            <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-1.5 font-mono text-[10px] text-muted-foreground">{JSON.stringify(step.input, null, 2)}</pre>
          </div>
          <div>
            <div className="mb-0.5 text-[10px] text-muted-foreground">输出</div>
            <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-1.5 font-mono text-[10px] text-muted-foreground">{JSON.stringify(step.output, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function OutputCard({ item, categoryName }: { item: RecommendationItem; categoryName: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="truncate text-sm font-medium">{item.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge variant="outline">{categoryName}</Badge>
        <span className="text-muted-foreground">{item.strategy}</span>
        {item.metric !== undefined && <span className="font-mono text-muted-foreground">{item.metric} 件/30天</span>}
        {item.score !== undefined && <span className="font-mono text-muted-foreground">评分 {item.score}</span>}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {splitReasonNumbers(item.reason).map((p, i) =>
          p.num ? <mark key={i} className="rounded bg-sky-500/20 px-0.5 font-mono text-sky-300">{p.text}</mark> : <span key={i}>{p.text}</span>,
        )}
      </p>
    </div>
  );
}

export default function ChatPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/meta').then((r) => r.json()).then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;
    setInput('');
    setStreaming(true);

    const history = messages
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content, output: m.output }));
    setMessages([...messages, { role: 'user', content }, { role: 'assistant', content: '', toolSteps: [] }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...history, { role: 'user', content }] }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const update = (fn: (m: ChatMessage) => ChatMessage) => {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = fn(copy[copy.length - 1]);
          return copy;
        });
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';
        for (const evt of events) {
          if (!evt.startsWith('data: ')) continue;
          const data = JSON.parse(evt.slice(6));
          if (data.type === 'token') {
            update((m) => ({ ...m, content: m.content + data.text }));
          } else if (data.type === 'tool_start') {
            update((m) => ({ ...m, toolSteps: [...(m.toolSteps ?? []), { step: (m.toolSteps?.length ?? 0) + 1, tool: data.tool, name: data.name, input: {}, output: {}, durationMs: 0, status: 'ok', pending: true }] }));
          } else if (data.type === 'tool_end') {
            update((m) => {
              const steps = [...(m.toolSteps ?? [])];
              steps[steps.length - 1] = data.step;
              return { ...m, toolSteps: steps };
            });
          } else if (data.type === 'run_complete') {
            update((m) => ({ ...m, output: data.output }));
          } else if (data.type === 'error') {
            update((m) => ({ ...m, content: m.content || data.message, error: true }));
          }
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: `连接中断：${e instanceof Error ? e.message : String(e)}`, error: true };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

  const noKey = meta && !meta.mode.hasApiKey;
  const catName = (id: string) => meta?.categoryMap?.[id] ?? id;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <h1 className="text-sm font-semibold">选品 Agent</h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">竞对高销品识别 · 六工具 ReAct · 推荐理由可追溯</span>
        {meta && (
          <Badge variant="outline" className={cn('ml-auto', noKey ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400')}>
            {noKey ? '未配置 Key' : `真跑 · ${meta.mode.model}`}
          </Badge>
        )}
      </header>

      {noKey && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-xs text-amber-400">
          对话需要真实调用 LLM：本地在项目目录创建 .env.local 写入 DEEPSEEK_API_KEY=sk-xxx（线上在 Vercel 环境变量配置后 Redeploy）。
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-5 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-semibold">选</div>
              <div>
                <h2 className="text-lg font-semibold">你好，我是选品 Agent</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  给我一个口径（竞对 × 城市 × 品类），我会探测数据覆盖、路由识别策略、对齐类目、生成推荐理由。
                </p>
              </div>
              <div className="grid w-full max-w-xl gap-2">
                {EXAMPLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded-lg border border-border bg-card px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    onClick={() => send(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m, i) => (
                <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] space-y-2', m.role === 'user' && 'rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground')}>
                    {m.role === 'user' ? (
                      m.content
                    ) : (
                      <>
                        {m.toolSteps && m.toolSteps.length > 0 && (
                          <div className="space-y-1.5">
                            {m.toolSteps.map((s, j) => <ToolStep key={j} step={s} />)}
                          </div>
                        )}
                        {m.content && (
                          <p className={cn('whitespace-pre-wrap text-sm leading-relaxed', m.error ? 'text-red-400' : 'text-foreground')}>
                            {m.content}
                          </p>
                        )}
                        {m.output && m.output.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-[11px] text-muted-foreground">推荐清单（{m.output.length} 条）</div>
                            {m.output.map((item) => (
                              <OutputCard key={item.productId} item={item} categoryName={catName(item.categoryId)} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {streaming && messages[messages.length - 1]?.content === '' && (messages[messages.length - 1]?.toolSteps?.length ?? 0) === 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />思考中…</div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="border-t border-border px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            rows={1}
            disabled={streaming}
            placeholder={noKey ? '配置 DeepSeek API Key 后即可对话…' : '输入选品需求，如「看看竞对A北京半熟调理的高销品」（Enter 发送，Shift+Enter 换行）'}
            className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50"
          />
          <Button size="icon" onClick={() => send(input)} disabled={streaming || !input.trim()}>
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </footer>
    </div>
  );
}
