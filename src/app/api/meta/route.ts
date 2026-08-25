import { getStore } from '@/lib/storage';
import { llmAvailable, getModelName } from '@/lib/llm/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = getStore();
  return Response.json({
    competitors: store.competitors,
    categories: store.categories.filter((c) => c.parentId === 'root'),
    prompts: store.listPrompts().map((p) => ({
      id: p.id, label: p.label, isBaseline: !!p.isBaseline, builtin: !!p.builtin,
      t6Mode: p.t6Mode, knowledgeVersionId: p.knowledgeVersionId, changeNote: p.changeNote,
    })),
    mode: { hasApiKey: llmAvailable(), mode: llmAvailable() ? 'live' : 'replay', model: getModelName() },
  });
}
