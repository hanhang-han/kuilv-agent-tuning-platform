'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ClipboardCheck, Database, FlaskConical, LayoutDashboard, Layers, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: '仪表盘', icon: LayoutDashboard },
  { href: '/cases', label: 'Case 池', icon: Database },
  { href: '/review', label: '评审工作台', icon: ClipboardCheck },
  { href: '/prompts', label: 'Prompt 实验室', icon: FlaskConical },
  { href: '/sampling', label: '抽样队列', icon: Layers },
  { href: '/run', label: '运行台', icon: Play },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [mode, setMode] = useState<{ mode: string; model: string } | null>(null);

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(setMode).catch(() => {});
  }, []);

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card/50 md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="size-4" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">选品 Agent 调优平台</div>
          <div className="text-[11px] text-muted-foreground">评估 · 评审 · 回归</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-3">
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('inline-block size-2 rounded-full', mode?.mode === 'live' ? 'bg-emerald-500' : 'bg-amber-500')} />
          {mode ? (
            <span className="text-muted-foreground">
              {mode.mode === 'live' ? `真跑模式 · ${mode.model}` : '回放模式（未配置 API Key）'}
            </span>
          ) : (
            <span className="text-muted-foreground">检测运行模式…</span>
          )}
        </div>
      </div>
    </aside>
  );
}
