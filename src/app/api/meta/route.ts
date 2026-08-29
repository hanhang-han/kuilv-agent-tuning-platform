import { getStore } from '@/lib/storage';
import { llmAvailable, getModelName } from '@/lib/llm/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = getStore();
  return Response.json({
    categoryMap: Object.fromEntries(store.categories.map((c) => [c.id, c.name])),
    mode: { hasApiKey: llmAvailable(), mode: llmAvailable() ? 'live' : 'replay', model: getModelName() },
  });
}
