/**
 * Validator（架构文档 §4）
 * ① 结构完整性 ② 类目枚举合法性 ③ 数值一致性（结构化字段 vs 工具返回）
 * 失败 → 带错误信息重试（上限，重试动作在 runner 编排）→ 仍失败 → 标记人工（E4）
 *
 * 注意边界：Validator 校验的是结构化输出的合规性；
 * 自由文本理由中的数值幻觉（E3）它管不住——这正是 v1.1 理由模板化的动机。
 */
import type { RecommendationItem } from '@/lib/types';
import { getStore } from '@/lib/storage';
import type { RunState } from './tools/registry';

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ValidationResult {
  passed: boolean;
  retries: number;
  checks: ValidationCheck[];
  /** 是否值得让 runner 触发 T5 重试（枚举/结构类失败） */
  retryable: boolean;
}

export function validateOutput(items: RecommendationItem[], state: RunState): ValidationResult {
  const leaves = getStore().categories.filter((c) => c.parentId === state.spec.parentId && c.id !== 'root');
  const leafIds = new Set(leaves.map((l) => l.id));

  const checks: ValidationCheck[] = [];

  // ① 结构完整性
  const structural = items.length > 0 && items.every((it) => it.productId && it.title && it.categoryId && it.reason);
  checks.push({
    name: 'JSON Schema 校验',
    passed: structural,
    detail: structural
      ? `通过（${items.length} 条推荐）`
      : items.length === 0 ? '输出为空：未生成任何推荐' : '存在缺失字段（productId/title/categoryId/reason）的条目',
  });

  // ② 类目枚举
  const invalid = items.filter((it) => !leafIds.has(it.categoryId) && it.categoryId !== 'PENDING');
  checks.push({
    name: '类目枚举校验',
    passed: invalid.length === 0,
    detail: invalid.length === 0
      ? '通过'
      : `存在枚举外类目：${invalid.map((it) => it.categoryId).slice(0, 3).join('、')}`,
  });

  // ③ 数值一致性（结构化字段必须与工具返回一致）
  const cands = state.strategy?.candidates ?? [];
  const mismatched = items.filter((it) => {
    const cand = cands.find((c) => c.productId === it.productId);
    if (!cand) return false; // 非策略工具返回的商品（模型自行纳入）由评审环节处理
    if (cand.metric !== undefined && it.metric !== undefined && cand.metric !== it.metric) return true;
    if (cand.score !== undefined && it.score !== undefined && Math.abs(cand.score - it.score) > 0.001) return true;
    return false;
  });
  checks.push({
    name: '数值一致性校验（结构化字段）',
    passed: mismatched.length === 0,
    detail: mismatched.length === 0 ? '通过' : `${mismatched.length} 条 metric/score 与工具返回不一致`,
  });

  const passed = checks.every((c) => c.passed);
  return {
    passed,
    retries: 0,
    checks,
    retryable: !structural || invalid.length > 0,
  };
}
