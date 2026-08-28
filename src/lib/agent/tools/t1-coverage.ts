/**
 * T1 数据覆盖探测（数值，确定性）
 * 查询口径数据质量 → 返回覆盖状态，模型据此做策略路由（三策略瀑布的 agent 化）
 */
import { getStore } from '@/lib/storage';
import { resolveSpec, type RunState } from './registry';

export async function executeT1(args: Record<string, unknown>, state: RunState) {
  const spec = resolveSpec(args, state);
  const store = getStore();
  const comp = store.competitors.find((c) => c.id === spec.competitorId)!;
  const volume = store.products.filter(
    (p) => p.competitorId === spec.competitorId && p.parentId === spec.parentId && p.cities.includes(spec.city),
  ).length;
  return {
    coverage: comp.coverageMode,
    dataVolume: volume,
    lastUpdate: new Date().toISOString().slice(0, 10),
    note: comp.note,
    spec: { competitorId: spec.competitorId, competitorName: comp.name, city: spec.city, parentId: spec.parentId },
  };
}
