import { llmAvailable, getModelName } from '@/lib/llm/client';

export async function GET() {
  return Response.json({
    hasApiKey: llmAvailable(),
    mode: llmAvailable() ? 'live' : 'replay',
    model: getModelName(),
  });
}
