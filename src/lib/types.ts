// ─── 领域类型 ───────────────────────────────────────────────────
// 对话式选品 Agent 的类型层：工具（T1-T6）、商品/类目/竞对（数据层）、
// 推荐清单（输出）、PromptVersion（agent 的人设与工具描述）。

export type ToolId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
export type CoverageMode = 'sales' | 'inventory' | 'none';
export type StrategyId = 'S1-销量榜单' | 'S2-库存推算' | 'S3-多因子评分';

export const TOOL_LABELS: Record<ToolId, string> = {
  T1: '数据覆盖探测',
  T2: '销量榜单查询',
  T3: '库存推算',
  T4: '多因子评分',
  T5: '商品语义对齐',
  T6: '推荐理由生成',
};

// ─── 口径 ───────────────────────────────────────────────────────

/** 选品口径：竞对 × 城市 × 品类 */
export interface CaseSpec {
  competitorId: string;
  city: string;
  parentId: string;
}

// ─── 数据层 ──────────────────────────────────────────────────────

export interface Competitor {
  id: string;
  name: string;
  coverageMode: CoverageMode;
  cities: string[];
  note: string;
}

export interface Category {
  id: string;
  name: string;
  path: string;
  parentId: string;
  /** 易混淆组标记（如 meat-boundary），类目边界难点 */
  ambiguityGroup?: string;
}

export interface FewShot {
  title: string;
  categoryId: string;
}

/** 类目知识数据集条目（T5 唯一知识来源） */
export interface KnowledgeEntry {
  categoryId: string;
  /** 自然语言边界判定规则 */
  boundaryRules?: string;
  /** 对比样例库 */
  fewShots?: FewShot[];
}

export interface KnowledgeVersion {
  id: string;
  label: string;
  note: string;
  entries: KnowledgeEntry[];
}

export interface ProductFactors {
  promo7d: boolean;
  onSale30d: number;
  onSale180d: number;
  channelTags: string[];
}

export interface Product {
  id: string;
  competitorId: string;
  title: string;
  trueCategoryId: string;
  parentId: string;
  cities: string[];
  price: number;
  /** 隐藏真值：底层真实 30 天销量（金标 = 按真值算的策略一结果） */
  trueSales30d: number;
  /** 竞对A：观测到的 30 天销量（= 真值，数据完备） */
  sales30d?: number;
  /** 竞对B：9 天库存快照（T3 差值算法输入） */
  inventorySeries?: number[];
  /** 竞对C：四因子（T4 输入） */
  factors?: ProductFactors;
  /** 金标城市：该商品在此城市的口径内属于策略一金标（top20% 或 ≥200 件） */
  goldCities: string[];
  /** 类目边界难点商品（标题关键词交叉，需边界规则才能判对） */
  isBoundaryCase?: boolean;
}

// ─── 输出 ───────────────────────────────────────────────────────

export interface ToolCall {
  step: number;
  tool: ToolId;
  name: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  status: 'ok' | 'error' | 'retry';
  note?: string;
}

export interface RecommendationItem {
  productId: string;
  title: string;
  categoryId: string;
  strategy: StrategyId | 'none';
  score?: number;
  metric?: number;
  reason: string;
  /** T6 模板模式的数据来源（理由数字来自工具返回） */
  keyNumbers?: Record<string, number>;
}

// ─── Agent 配置 ──────────────────────────────────────────────────

export type T6Mode = 'template' | 'free';

export interface T4Weights {
  promo: number;
  onSale30: number;
  onSale180: number;
  channelTag: number;
}

export interface PromptVersion {
  id: string;
  label: string;
  createdAt: string;
  systemPrompt: string;
  toolDescriptions: Record<ToolId, string>;
  knowledgeVersionId: string;
  t6Mode: T6Mode;
  t4Weights: T4Weights;
  parentVersionId?: string;
  changeNote: string;
  isBaseline?: boolean;
  builtin?: boolean;
}
