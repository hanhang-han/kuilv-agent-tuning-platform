/**
 * 存储模块（架构文档 §6 数据资产设计）
 *
 * 双后端策略：
 * - 种子数据：静态 import（打进 bundle，本地与 Vercel 都可用）
 * - 运行时状态（live case、评审覆盖、自定义 prompt、live 回归、抽样队列）：
 *   本地 → data/runtime/state.json 持久化；Vercel → 仅内存（重启丢失，demo 可接受）
 *
 * 评审覆盖不改动种子文件本身：seed case 的评审结果存在 reviewOverrides，
 * 读取时合并——保证种子数据可重跑、可 git 管理。
 */
import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentCase, CaseReview, Category, Competitor, KnowledgeVersion, Product,
  PromptVersion, RegressionResult, SamplingQueue,
} from '@/lib/types';

import competitorsJson from '../../../data/competitors.json';
import categoriesJson from '../../../data/categories.json';
import knowledgeJson from '../../../data/category-knowledge.json';
import productsJson from '../../../data/products.json';
import promptsJson from '../../../data/prompts.json';
import casesSeedJson from '../../../data/cases-seed.json';
import regressionsSeedJson from '../../../data/regressions-seed.json';

const SEED = {
  competitors: competitorsJson as unknown as Competitor[],
  categories: categoriesJson as unknown as Category[],
  knowledge: knowledgeJson as unknown as KnowledgeVersion[],
  products: productsJson as unknown as Product[],
  prompts: promptsJson as unknown as PromptVersion[],
  cases: casesSeedJson as unknown as AgentCase[],
  regressions: regressionsSeedJson as unknown as RegressionResult[],
};

interface RuntimeState {
  liveCases: AgentCase[];
  reviewOverrides: Record<string, CaseReview>;
  customPrompts: PromptVersion[];
  liveRegressions: RegressionResult[];
  queue?: SamplingQueue;
}

const EMPTY_STATE: RuntimeState = {
  liveCases: [], reviewOverrides: {}, customPrompts: [], liveRegressions: [],
};

const RUNTIME_DIR = path.join(process.cwd(), 'data', 'runtime');
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'state.json');
const IS_VERCEL = !!process.env.VERCEL;

class Store {
  private state: RuntimeState;

  constructor() {
    this.state = this.load();
  }

  private load(): RuntimeState {
    if (IS_VERCEL) return { ...EMPTY_STATE };
    try {
      if (fs.existsSync(RUNTIME_FILE)) {
        return { ...EMPTY_STATE, ...JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf-8')) };
      }
    } catch (e) {
      console.error('[storage] 运行时状态加载失败，使用空状态', e);
    }
    return { ...EMPTY_STATE };
  }

  private persist() {
    if (IS_VERCEL) return;
    try {
      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
      fs.writeFileSync(RUNTIME_FILE, JSON.stringify(this.state), 'utf-8');
    } catch (e) {
      console.error('[storage] 运行时状态写入失败', e);
    }
  }

  reset() {
    this.state = { ...EMPTY_STATE };
    this.persist();
  }

  // ── 参考数据（只读） ──
  get competitors() { return SEED.competitors; }
  get categories() { return SEED.categories; }
  get products() { return SEED.products; }
  get knowledgeVersions() { return SEED.knowledge; }

  getKnowledge(id: string): KnowledgeVersion | undefined {
    return SEED.knowledge.find((k) => k.id === id);
  }

  // ── Case 池（seed + live，评审覆盖合并） ──
  listCases(): AgentCase[] {
    const mergeReview = (c: AgentCase): AgentCase => {
      const override = this.state.reviewOverrides[c.id];
      return override ? { ...c, review: override } : c;
    };
    return [...SEED.cases.map(mergeReview), ...this.state.liveCases.map(mergeReview)];
  }

  getCase(id: string): AgentCase | undefined {
    return this.listCases().find((c) => c.id === id);
  }

  addCase(c: AgentCase) {
    this.state.liveCases.push(c);
    this.persist();
  }

  setReview(caseId: string, review: CaseReview): AgentCase | undefined {
    this.state.reviewOverrides[caseId] = review;
    this.persist();
    return this.getCase(caseId);
  }

  // ── Prompt 版本（seed 只读 + 自定义可增删） ──
  listPrompts(): PromptVersion[] {
    return [...SEED.prompts, ...this.state.customPrompts];
  }

  getPrompt(id: string): PromptVersion | undefined {
    return this.listPrompts().find((p) => p.id === id);
  }

  savePrompt(p: PromptVersion) {
    const i = this.state.customPrompts.findIndex((x) => x.id === p.id);
    if (i >= 0) this.state.customPrompts[i] = p;
    else this.state.customPrompts.push(p);
    this.persist();
  }

  deletePrompt(id: string): boolean {
    const before = this.state.customPrompts.length;
    this.state.customPrompts = this.state.customPrompts.filter((p) => p.id !== id);
    const changed = before !== this.state.customPrompts.length;
    if (changed) this.persist();
    return changed;
  }

  // ── 回归结果（seed 快照 + live 结果） ──
  listRegressions(): RegressionResult[] {
    return [...SEED.regressions, ...this.state.liveRegressions];
  }

  addRegression(r: RegressionResult) {
    this.state.liveRegressions.push(r);
    this.persist();
  }

  // ── 抽样队列（当日任务） ──
  getQueue(): SamplingQueue | undefined {
    return this.state.queue;
  }

  setQueue(q: SamplingQueue) {
    this.state.queue = q;
    this.persist();
  }
}

const g = globalThis as unknown as { __klvStore?: Store };

export function getStore(): Store {
  if (!g.__klvStore) g.__klvStore = new Store();
  return g.__klvStore;
}
