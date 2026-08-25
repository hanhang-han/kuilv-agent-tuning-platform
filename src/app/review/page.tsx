import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getStore } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default function ReviewIndexPage() {
  const pending = getStore()
    .listCases()
    .filter((c) => !c.review)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (pending) redirect(`/review/${pending.id}`);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">当前没有待评审的 case</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        抽样队列可以生成新的评审任务；也可以去运行台跑一个新口径，或到 Case 池翻查历史 case 做深检。
      </p>
      <div className="flex gap-2">
        <Button variant="outline" render={<Link href="/sampling" />}>去抽样队列</Button>
        <Button render={<Link href="/run" />}>去运行台</Button>
      </div>
    </div>
  );
}
