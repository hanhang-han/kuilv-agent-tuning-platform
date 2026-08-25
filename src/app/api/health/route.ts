import { llmAvailable, getModelName } from '@/lib/llm/client';
import type { PlatformMode } from '@/lib/types';

export async function GET() {
  const mode: PlatformMode = {
    hasApiKey: llmAvailable(),
    mode: llmAvailable() ? 'live' : 'replay',
    model: getModelName(),
  };
  return Response.json(mode);
}
