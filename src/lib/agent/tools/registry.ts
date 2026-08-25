/**
 * 工具注册表（架构文档 §4 工具层）
 * - 工具描述从 PromptVersion 注入：改描述 → 影响 agent 调用质量（核心调优杠杆）
 * - T1-T4 确定性计算，T5/T6 内部 LLM 子调用
 * - RunState 累积各工具结果，runner 据此组装最终输出（ADR-1：数值全部来自工具）
 */
import type OpenAI from 'openai';
import type { CaseSpec, Product, PromptVersion, ToolId } from '@/lib/types';
import { getStore } from '@/lib/storage';
import { executeT1 } from './t1-coverage';
import { executeT2 } from './t2-sales';
import { executeT3 } from './t3-inventory';
import { executeT4 } from './t4-scoring';
import { executeT5 } from './t5-align';
import { executeT6 } from './t6-reason';

export const TOOL_FN_NAMES: Record<ToolId, string> = {
  T1: 't1_data_coverage',
  T2: 't2_sales_ranking',
  T3: 't3_inventory_estimate',
  T4: 't4_multifactor_score',
  T5: 't5_category_align',
  T6: 't6_reason_generate',
};

export function fnNameToToolId(fn: string): ToolId | undefined {
  return (Object.keys(TOOL_FN_NAMES) as ToolId[]).find((k) => TOOL_FN_NAMES[k] === fn);
}

export interface StrategyCandidate {
  productId: string;
  title: string;
  metric?: number;
  score?: number;
}

export interface AlignmentResult {
  productId: string;
  categoryId: string;
  confidence: number;
}

export interface ReasonResult {
  productId: string;
  reason: string;
  keyNumbers: Record<string, number>;
}

/** 运行期累积状态 */
export interface RunState {
  spec: CaseSpec;
  promptVersion: PromptVersion;
  strategy?: { tool: 'T2' | 'T3' | 'T4'; candidates: StrategyCandidate[] };
  alignments?: AlignmentResult[];
  reasons?: ReasonResult[];
}

export function cellProducts(state: RunState): Product[] {
  const { competitorId, city, parentId } = state.spec;
  return getStore().products.filter(
    (p) => p.competitorId === competitorId && p.parentId === parentId && p.cities.includes(city),
  );
}

function paramSchema(props: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', properties: props, required };
}

const SPEC_ARGS = {
  competitorId: { type: 'string', description: '竞对 ID，如 comp-a' },
  city: { type: 'string', description: '城市' },
  parentId: { type: 'string', description: '品类 ID（顶层类目），如 cat-bs' },
};

export function buildTools(pv: PromptVersion): OpenAI.ChatCompletionTool[] {
  const d = pv.toolDescriptions;
  return [
    {
      type: 'function',
      function: {
        name: TOOL_FN_NAMES.T1, description: d.T1,
        parameters: paramSchema({ ...SPEC_ARGS }),
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_FN_NAMES.T2, description: d.T2,
        parameters: paramSchema({
          ...SPEC_ARGS,
          topPct: { type: 'number', description: '类目内排名截取比例，默认 0.2（top20%）' },
          minSales: { type: 'number', description: '销量门槛（件/30天），默认 200' },
        }),
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_FN_NAMES.T3, description: d.T3,
        parameters: paramSchema({ ...SPEC_ARGS, topPct: { type: 'number', description: '截取比例，默认 0.2' } }),
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_FN_NAMES.T4, description: d.T4,
        parameters: paramSchema({ ...SPEC_ARGS, topPct: { type: 'number', description: '截取比例，默认 0.2' } }),
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_FN_NAMES.T5, description: d.T5,
        parameters: paramSchema(
          { productIds: { type: 'array', items: { type: 'string' }, description: '待对齐的商品 ID 列表' } },
          ['productIds'],
        ),
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_FN_NAMES.T6, description: d.T6,
        parameters: paramSchema(
          { productIds: { type: 'array', items: { type: 'string' }, description: '最终入选推荐清单的商品 ID 列表' } },
          ['productIds'],
        ),
      },
    },
  ];
}

export async function executeTool(id: ToolId, args: Record<string, unknown>, state: RunState): Promise<unknown> {
  switch (id) {
    case 'T1': return executeT1(args, state);
    case 'T2': return executeT2(args, state);
    case 'T3': return executeT3(args, state);
    case 'T4': return executeT4(args, state);
    case 'T5': return executeT5(args, state);
    case 'T6': return executeT6(args, state);
  }
}
