/**
 * 只读数据层：竞对 / 类目 / 类目知识 / 商品 / Prompt 版本
 * 种子数据静态 import（打进 bundle，本地与 Vercel 行为一致），无运行时状态。
 */
import type { Category, Competitor, KnowledgeVersion, Product, PromptVersion } from '@/lib/types';

import competitorsJson from '../../../data/competitors.json';
import categoriesJson from '../../../data/categories.json';
import knowledgeJson from '../../../data/category-knowledge.json';
import productsJson from '../../../data/products.json';
import promptsJson from '../../../data/prompts.json';

const g = globalThis as unknown as { __klvData?: Store };

export class Store {
  readonly competitors = competitorsJson as unknown as Competitor[];
  readonly categories = categoriesJson as unknown as Category[];
  readonly knowledgeVersions = knowledgeJson as unknown as KnowledgeVersion[];
  readonly products = productsJson as unknown as Product[];
  private readonly prompts = promptsJson as unknown as PromptVersion[];

  getKnowledge(id: string): KnowledgeVersion | undefined {
    return this.knowledgeVersions.find((k) => k.id === id);
  }

  getPrompt(id: string): PromptVersion | undefined {
    return this.prompts.find((p) => p.id === id);
  }
}

export function getStore(): Store {
  if (!g.__klvData) g.__klvData = new Store();
  return g.__klvData;
}
