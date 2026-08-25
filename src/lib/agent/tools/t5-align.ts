/**
 * T5 商品语义对齐（语义，全架构唯一 LLM 语义入口）
 * 竞对商品标题（脏数据）→ 快驴标准类目（封闭枚举）
 * 知识注入：该品类叶子类目枚举 + 类目知识数据集（边界规则 + few-shot，按版本注入）
 *
 * 核心机制：基线版本（含糊描述 + kv-v0 无规则无样例）在边界商品上会真实出错；
 * 改进 T5 工具描述或类目知识 → 回归测试可见类目对齐准确率提升。
 */
import { chatCompletion } from '@/lib/llm/client';
import { getStore } from '@/lib/storage';
import { cellProducts, type AlignmentResult, type RunState } from './registry';

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json?/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fallthrough */ }
  }
  return null;
}

export async function executeT5(
  args: Record<string, unknown>,
  state: RunState,
  retryFeedback?: string,
): Promise<{ alignments: AlignmentResult[]; pendingReview: string[]; knowledgeVersion: string; error?: string }> {
  const productIds = Array.isArray(args.productIds) ? (args.productIds as string[]) : [];
  if (productIds.length === 0) {
    return { alignments: [], pendingReview: [], knowledgeVersion: state.promptVersion.knowledgeVersionId, error: 'productIds 为空' };
  }
  const store = getStore();
  const products = cellProducts(state).filter((p) => productIds.includes(p.id));
  if (products.length === 0) {
    return { alignments: [], pendingReview: [], knowledgeVersion: state.promptVersion.knowledgeVersionId, error: '未找到对应商品，请确认 productIds 来自策略工具返回' };
  }

  // 封闭枚举：该品类下的叶子类目
  const leaves = store.categories.filter((c) => c.parentId === state.spec.parentId && c.id !== 'root');
  // 类目知识：边界规则 + few-shot（按 prompt 版本关联的知识版本注入）
  const knowledge = store.getKnowledge(state.promptVersion.knowledgeVersionId);
  const rulesLines: string[] = [];
  const shotLines: string[] = [];
  for (const leaf of leaves) {
    const entry = knowledge?.entries.find((e) => e.categoryId === leaf.id);
    if (entry?.boundaryRules) rulesLines.push(`- ${leaf.name}（${leaf.id}）：${entry.boundaryRules}`);
    for (const shot of entry?.fewShots ?? []) {
      shotLines.push(`- 标题「${shot.title}」→ ${shot.categoryId}`);
    }
  }

  const system = `你是商品类目对齐引擎，任务是把竞对商品标题映射到快驴标准类目。${retryFeedback ?? ''}`;
  const user = `## 可选类目（封闭枚举，只能从中选择）
${leaves.map((l) => `- ${l.id} ${l.name}（${l.path}）`).join('\n')}

${rulesLines.length ? `## 类目边界规则\n${rulesLines.join('\n')}\n` : ''}${shotLines.length ? `## 参照样例\n${shotLines.join('\n')}\n` : ''}
## 待对齐商品
${products.map((p) => `- ${p.id} ${p.title}`).join('\n')}

## 输出要求
严格输出 JSON 数组，每个元素：{"productId": "...", "categoryId": "类目ID", "confidence": 0到1的数字}
归属不确定时 categoryId 输出 "PENDING"（待人工复核），不要猜测。`;

  let alignments: AlignmentResult[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const parsed = extractJson(msg.content ?? '');
    if (Array.isArray(parsed)) {
      alignments = parsed
        .filter((x): x is { productId: string; categoryId: string; confidence?: number } =>
          typeof x === 'object' && x !== null && typeof (x as any).productId === 'string')
        .map((x) => ({
          productId: x.productId,
          categoryId: x.categoryId,
          confidence: typeof x.confidence === 'number' ? Math.round(Math.min(1, Math.max(0, x.confidence)) * 100) / 100 : 0.8,
        }));
      if (alignments.length > 0) break;
    }
  }
  if (alignments.length === 0) {
    return { alignments: [], pendingReview: [], knowledgeVersion: state.promptVersion.knowledgeVersionId, error: '模型输出解析失败' };
  }

  state.alignments = alignments;
  return {
    alignments,
    pendingReview: alignments.filter((a) => a.confidence < 0.6 || a.categoryId === 'PENDING').map((a) => a.productId),
    knowledgeVersion: state.promptVersion.knowledgeVersionId,
  };
}
