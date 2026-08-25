// ─── 领域类型定义 ───────────────────────────────────────────────
// 与《选品Agent架构文档-评审版.md》对应的类型层。
// 模块对照：竞对/类目/商品(L1 数据层)、ToolCall/AgentCase(决策链路)、
// PromptVersion(三类可优化资产,架构文档 §9)、RegressionResult(统一回归)。

export type ToolId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
export type ErrorType = 'E1' | 'E2' | 'E3' | 'E4' | 'E5';
export type CoverageMode = 'sales' | 'inventory' | 'none';
export type StrategyId = 'S1-销量榜单' | 'S2-库存推算' | 'S3-多因子评分';

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  E1: '类目映射错误',
  E2: '误判高销',
  E3: '理由幻觉',
  E4: '格式违规',
  E5: '漏检',
};

export const TOOL_LABELS: Record<ToolId, string> = {
  T1: '数据覆盖探测',
  T2: '销量榜单查询',
  T3: '库存推算',
  T4: '多因子评分',
  T5: '商品语义对齐',
  T6: '推荐理由生成',
};

// ─── L1 数据层 ──────────────────────────────────────────────────

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

/** 类目知识数据集条目（T5 唯一知识来源，可版本化资产） */
export interface KnowledgeEntry {
  categoryId: string;
  /** 自然语言边界判定规则（v1.0 资产） */
  boundaryRules?: string;
  /** 对比样例库（v1.1 资产） */
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

// ─── 口径与决策链路 ─────────────────────────────────────────────

export interface CaseSpec {
  competitorId: string;
  city: string;
  parentId: string;
}

export interface ToolCall {
  step: number;
  tool: ToolId | 'validator';
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
  /** T6 模板模式的数据来源（数值一致性校验与 E3 检测依据） */
  keyNumbers?: Record<string, number>;
}

export interface AutoEval {
  formatPass: boolean;
  /** 类目对齐正确率（vs 真值，0-1） */
  alignmentAccuracy: number;
  /** 理由数值一致率（0-1，不一致即 E3 幻觉） */
  reasonConsistency: number;
  /** 选品准确率（vs 金标，仅竞对A 口径） */
  goldPrecision?: number;
  /** 选品召回率（vs 金标，仅竞对A 口径） */
  goldRecall?: number;
  /** 自动检测到的错误类型 */
  detectedErrors: ErrorType[];
}

export interface CaseReview {
  verdict: 'pass' | 'reject';
  errorType?: ErrorType;
  reviewer: string;
  note?: string;
  reviewedAt: string;
}

export interface AgentCase {
  id: string;
  createdAt: string;
  source: 'seed' | 'live';
  spec: CaseSpec;
  promptVersionId: string;
  chain: ToolCall[];
  output: RecommendationItem[];
  validatorPassed: boolean;
  autoEval?: AutoEval;
  review?: CaseReview;
  /** seed 数据周序（1-8，趋势图用） */
  week?: number;
  /** 分层抽样用置信度 */
  confidence?: number;
}

// ─── 可优化资产（架构文档 §9：prompt / 类目数据集 / 策略参数） ──

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
  /** 调优起点：所有人从 baseline fork 开始 */
  isBaseline?: boolean;
  builtin?: boolean;
}

// ─── 回归测试 ───────────────────────────────────────────────────

export interface RegressionMetrics {
  passRate: number;
  formatRate: number;
  alignmentAcc: number;
  reasonConsistency: number;
  goldPrecision?: number;
  goldRecall?: number;
}

export interface RegressionResult {
  id: string;
  promptVersionId: string;
  baselineVersionId?: string;
  caseCount: number;
  mode: 'seed' | 'live';
  createdAt: string;
  metrics: RegressionMetrics;
  byErrorType: Record<ErrorType, number>;
  deltaVsBaseline?: Partial<RegressionMetrics>;
  durationMs: number;
  /** 预置基准数字（seed 模式直接展示） */
  narrative?: string;
}

// ─── 抽样队列 ───────────────────────────────────────────────────

export interface SamplingTask {
  caseId: string;
  stratum: string;
  reason: string;
}

export interface SamplingQueue {
  id: string;
  createdAt: string;
  totalCases: number;
  tasks: SamplingTask[];
}

// ─── 运行配置 ───────────────────────────────────────────────────

export interface PlatformMode {
  hasApiKey: boolean;
  mode: 'live' | 'replay';
  model: string;
}
