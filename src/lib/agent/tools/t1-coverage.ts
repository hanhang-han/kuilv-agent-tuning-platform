/**
 * T1 数据覆盖探测（数值，确定性）
 * 查询口径数据质量 → 返回覆盖状态，模型据此做策略路由（三策略瀑布的 agent 化）
 */
import { getStore } from '@/lib/storage';
import type { RunState } from './registry';

export async function executeT1(_args: Record<string, unknown>, state: RunState) {
  const store = getStore();
  const comp = store.competitors.find((c) => c.id === state.spec.competitorId)!;
  const { city, parentId } = state.spec;
  const volume = store.products.filter(
    (p) => p.competitorId === state.spec.competitorId && p.parentId === parentId && p.cities.includes(city),
  ).length;
  return {
    coverage: comp.coverageMode,
    dataVolume: volume,
    lastUpdate: new Date().toISOString().slice(0, 10),
    note: comp.note,
  };
}
