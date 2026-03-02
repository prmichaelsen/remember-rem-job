/**
 * Stubs for @prmichaelsen/remember-core/rem exports.
 *
 * remember-core 0.17.0+ will export these from './rem' subpath.
 * Once published, replace this import with:
 *   import { RemService, RemStateStore, createHaikuClient, ... } from '@prmichaelsen/remember-core/rem';
 *
 * These stubs match the remember-core rem/ API exactly so the entry point
 * won't need changes when switching to the real package.
 */

import type { WeaviateClient } from 'weaviate-client';

// ─── Logger (matches remember-core Logger interface) ─────────────────────

interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ─── RelationshipService stub type ───────────────────────────────────────
// Uses any to avoid type conflicts with real RelationshipService from remember-core

// ─── Haiku Client ────────────────────────────────────────────────────────

export interface HaikuValidationInput {
  memories: Array<{
    id: string;
    content_summary: string;
    tags: string[];
    content_type?: string;
  }>;
}

export interface HaikuValidationResult {
  valid: boolean;
  relationship_type?: string;
  observation?: string;
  strength?: number;
  confidence?: number;
  tags?: string[];
  reason?: string;
}

export interface HaikuClient {
  validateCluster(input: HaikuValidationInput): Promise<HaikuValidationResult>;
}

export function createHaikuClient(options: {
  apiKey: string;
  model?: string;
}): HaikuClient {
  const model = options.model ?? 'claude-haiku-4-5-20251001';

  return {
    async validateCluster(input: HaikuValidationInput): Promise<HaikuValidationResult> {
      try {
        const truncated: HaikuValidationInput = {
          memories: input.memories.map((m) => ({
            ...m,
            content_summary: m.content_summary.slice(0, 200),
          })),
        };

        const memorySummaries = truncated.memories
          .map((m) => `- [${m.id}] ${m.content_summary} (tags: ${m.tags.join(', ') || 'none'})`)
          .join('\n');

        const prompt = `Given these memory summaries from a single collection, determine if they form a meaningful group that should be linked as a relationship.

Memories:
${memorySummaries}

If these memories form a coherent group, respond with ONLY valid JSON:
{"valid":true,"relationship_type":"<type>","observation":"<descriptive title for this group>","strength":<0-1>,"confidence":<0-1>,"tags":["<relevant tags>"]}

If they do NOT form a meaningful group, respond with ONLY valid JSON:
{"valid":false,"reason":"<why not>"}

Relationship types: topical, temporal, locational, author, genre, event, or other descriptive type.
Respond with ONLY the JSON object, no other text.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!response.ok) {
          return { valid: false, reason: `api_error: ${response.status}` };
        }

        const data = (await response.json()) as any;
        const text = data.content?.[0]?.text ?? '';
        return JSON.parse(text) as HaikuValidationResult;
      } catch {
        return { valid: false, reason: 'api_error' };
      }
    },
  };
}

// ─── RemStateStore ───────────────────────────────────────────────────────

interface RemCursorState {
  last_collection_id: string;
  last_run_at: string;
}

interface RemCollectionState {
  collection_id: string;
  last_processed_at: string;
  memory_cursor: string;
}

export class RemStateStore {
  private getDocument: any;
  private setDocument: any;
  private basePath: string;

  constructor() {
    // Lazy-load firestore functions (must be initialized before use)
    this.basePath = 'remember_data.rem_state';
  }

  private async ensureFirestore() {
    if (!this.getDocument) {
      const mod = await import('@prmichaelsen/remember-core/database/firestore');
      this.getDocument = mod.getDocument;
      this.setDocument = mod.setDocument;
    }
  }

  async getCursor(): Promise<RemCursorState | null> {
    await this.ensureFirestore();
    const doc = await this.getDocument(this.basePath, 'cursor');
    if (!doc) return null;
    return doc as unknown as RemCursorState;
  }

  async saveCursor(state: RemCursorState): Promise<void> {
    await this.ensureFirestore();
    await this.setDocument(this.basePath, 'cursor', state as any);
  }

  async getCollectionState(collectionId: string): Promise<RemCollectionState | null> {
    await this.ensureFirestore();
    const doc = await this.getDocument(`${this.basePath}/collections`, collectionId);
    if (!doc) return null;
    return doc as unknown as RemCollectionState;
  }

  async saveCollectionState(state: RemCollectionState): Promise<void> {
    await this.ensureFirestore();
    await this.setDocument(`${this.basePath}/collections`, state.collection_id, state as any);
  }
}

// ─── RemService ──────────────────────────────────────────────────────────

export interface RemServiceDeps {
  weaviateClient: WeaviateClient;
  relationshipServiceFactory: (collection: any, userId: string) => any;
  stateStore: RemStateStore;
  haikuClient: HaikuClient;
  config?: Partial<RemConfig>;
  logger?: Logger;
}

export interface RunCycleResult {
  collection_id: string | null;
  memories_scanned: number;
  clusters_found: number;
  relationships_created: number;
  relationships_merged: number;
  relationships_split: number;
  skipped_by_haiku: number;
  duration_ms: number;
}

interface RemConfig {
  max_candidates_per_run: number;
  min_collection_size: number;
  similarity_threshold: number;
  min_cluster_size: number;
  max_cluster_size: number;
}

const DEFAULT_REM_CONFIG: RemConfig = {
  max_candidates_per_run: 50,
  min_collection_size: 5,
  similarity_threshold: 0.75,
  min_cluster_size: 2,
  max_cluster_size: 10,
};

/**
 * Stub RemService — delegates to remember-core's clustering and relationship logic.
 *
 * This is a simplified stub that runs one cycle:
 * 1. Lists memory collections
 * 2. Picks next collection via cursor
 * 3. Selects candidate memories
 * 4. Forms clusters via embedding similarity
 * 5. Validates via Haiku
 * 6. Creates/merges relationships
 *
 * Will be replaced by real import from @prmichaelsen/remember-core/rem once published.
 */
export class RemService {
  private config: RemConfig;
  private logger: Logger;

  constructor(private deps: RemServiceDeps) {
    this.config = { ...DEFAULT_REM_CONFIG, ...deps.config };
    this.logger = deps.logger ?? ({ info() {}, warn() {}, error() {}, debug() {} } as any);
  }

  async runCycle(): Promise<RunCycleResult> {
    // Stub: returns empty result until remember-core publishes RemService
    this.logger.info?.('RemService.runCycle() — stub implementation');
    this.logger.warn?.(
      'Using stub RemService. Upgrade @prmichaelsen/remember-core to 0.17.0+ for real implementation.',
    );

    return {
      collection_id: null,
      memories_scanned: 0,
      clusters_found: 0,
      relationships_created: 0,
      relationships_merged: 0,
      relationships_split: 0,
      skipped_by_haiku: 0,
      duration_ms: 0,
    };
  }
}
