# REM — Relationship Engine for Memories

**Concept**: Background cron job that automatically discovers and creates relationships between memories using embedding similarity and LLM validation
**Created**: 2026-03-02
**Status**: Design Specification

---

## Overview

REM (Relationship Engine for Memories) is a background process that runs hourly, round-robining through memory collections, discovering semantically related memories and grouping them into N-ary relationships. It emulates how human REM sleep consolidates memories — running quietly in the background, strengthening connections between related concepts.

Users rarely create relationships manually. REM fills this gap by automatically building a web of connections that makes memory collections more navigable and discoverable. A user who stores 50 poems will find them automatically grouped by theme; travel memories will link to each other by trip; recipes will cluster by cuisine.

---

## Problem Statement

- **Users don't create relationships**: The relationship feature exists in remember-core but sees near-zero manual usage. Without relationships, memories are isolated islands — searchable but not interconnected.
- **Discoverability gap**: Users can't say "find memories with the most relationships" or browse by connection because relationships are sparse.
- **Value locked in embeddings**: Every memory already has a vector embedding. The similarity information exists but isn't surfaced as explicit, named relationships.

---

## Solution

A GCP Cloud Scheduler cron job that runs every hour, processing one collection per invocation in round-robin order. For each collection, it:

1. **Selects candidate memories** (1/3 newest, 1/3 unprocessed, 1/3 random)
2. **Finds clusters** via Weaviate vector similarity (min threshold: 0.75)
3. **Deduplicates** against existing relationships (60% memory_ids overlap = merge)
4. **Validates and names** clusters using Haiku (reject weak clusters, generate `observation` text)
5. **Creates or updates** relationships with full CRUD (create, merge, split at 50-member cap)

```
Cloud Scheduler (hourly)
  → REM Service (GCP Cloud Run or similar)
    → Pick next collection (startAfter last_collection_id)
    → Select candidate memories (newest / unprocessed / random)
    → Weaviate findSimilar() per candidate (cosine ≥ 0.75)
    → Cluster formation (greedy agglomerative)
    → Dedup check against existing relationships (60% overlap → merge)
    → Haiku validation + observation generation
    → remember-core relationship CRUD (create / update / split)
    → Update rem_cursor in Firestore
```

**Alternatives considered:**
- **Cloudflare Workers Cron Trigger**: Rejected — 30-second CPU limit too restrictive for processing collections with hundreds of memories
- **Event-triggered (on memory create)**: Rejected — time-based approach emulates human REM sleep and avoids thundering herd on batch imports
- **Pure LLM analysis (Sonnet)**: Rejected — too expensive for hourly background cron; embeddings handle the heavy lifting for free
- **User-configurable rules/hints**: Rejected — adds complexity; REM should be fully autonomous

---

## Implementation

### Architecture

REM is a **remember-core responsibility**, not an agentbase responsibility. It lives in the remember ecosystem and operates on Weaviate collections via the existing `RelationshipService` and `MemoryService`.

```
┌──────────────────┐     ┌──────────────────────┐
│  GCP Cloud       │────▶│  REM Service          │
│  Scheduler       │     │  (Cloud Run / GCF)    │
│  (every hour)    │     │                       │
└──────────────────┘     │  1. Load rem_cursor   │
                         │  2. Pick collection   │
                         │  3. Select memories   │
                         │  4. Find clusters     │
                         │  5. Dedup + merge     │
                         │  6. Haiku validate    │
                         │  7. CRUD relationships│
                         │  8. Save rem_cursor   │
                         └──────┬───────┬────────┘
                                │       │
                    ┌───────────▼┐  ┌───▼──────────┐
                    │  Weaviate  │  │  Firestore   │
                    │  (memories,│  │  (rem_cursor, │
                    │  relations)│  │   collection  │
                    └────────────┘  │   registry)   │
                                    └───────────────┘
```

### Scope & Targeting

| Parameter | Value |
|-----------|-------|
| Collections processed | All — user, group, space |
| Processing order | Scan-based cursor (`startAfter` last processed collection ID) |
| Min collection size | 50 memories |
| Run interval | Every hour |
| Configurable | No (globally fixed) |
| Event-triggered | No (time-based only) |
| Enabled by default | Yes, for all collections |
| User opt-out | No |

### Memory Selection (per run)

Each run selects a subset of memories from the target collection, split into three thirds:

| Third | Selection Strategy | Purpose |
|-------|-------------------|---------|
| 1/3 newest | Sort by `created_at` desc, take top N | Build relationships for fresh memories quickly |
| 1/3 unprocessed | Filter by `created_at > rem_cursor`, take next N | Catch memories that haven't been analyzed yet |
| 1/3 random | Random sample of N | Rediscover old memories, find cross-temporal links |

REM can densify already-connected memories — it does not skip memories that already have relationships.

### Clustering Algorithm

```
for each candidate_memory in selected_memories:
    similar = weaviate.findSimilar(candidate_memory.id, min_similarity=0.75, limit=20)

    if len(similar) < 2:
        continue  # Need at least 2 similar memories to form a cluster

    cluster = [candidate_memory] + similar

    # Check for existing relationship overlap
    existing = find_overlapping_relationships(cluster.memory_ids, threshold=0.60)

    if existing:
        merge_into_existing(existing, cluster.new_memory_ids)
    else:
        # Validate with Haiku before creating
        validation = haiku.validate_and_name(cluster)
        if validation.is_valid:
            create_relationship(
                memory_ids=cluster.memory_ids,
                observation=validation.observation,
                relationship_type=validation.type,
                source='rem',
                strength=validation.strength,
                confidence=validation.confidence,
                tags=validation.tags
            )
```

### Relationship CRUD

REM performs full CRUD on relationships:

| Operation | When |
|-----------|------|
| **Create** | New cluster found with no overlapping existing relationship |
| **Update (merge)** | New memories fit an existing relationship (>60% overlap); add new `memory_ids`, refresh `observation` via Haiku |
| **Update (split)** | Relationship exceeds 50 members; Haiku identifies sub-clusters, original is updated to keep one sub-cluster, new relationships created for others |
| **Delete** | A split operation produces an empty or single-member remainder (edge case) |

### Deduplication

Before creating a new relationship, REM checks for overlap:

1. Fetch all relationships in the collection that share any `memory_ids` with the candidate cluster
2. For each, compute overlap ratio: `|intersection(existing.memory_ids, candidate.memory_ids)| / |candidate.memory_ids|`
3. If overlap > 60%: merge new memories into existing relationship
4. If overlap ≤ 60%: create new relationship

### Haiku Validation & Naming

Each candidate cluster is sent to Haiku for validation and naming before creation:

```
Prompt to Haiku:
  "Given these memory summaries, determine if they form a meaningful group.
   If yes: provide a relationship_type, observation (descriptive title),
   strength (0-1), confidence (0-1), and tags.
   If no: respond with { valid: false, reason: '...' }"

Input: [memory.content summaries, truncated to ~200 chars each]
Output: { valid, relationship_type, observation, strength, confidence, tags }
```

Haiku serves two purposes:
- **Gate**: Reject clusters that are superficially similar but not meaningfully related
- **Name**: Generate a descriptive `observation` that serves as a human-readable title

### Similarity Thresholds

| Cosine Similarity | Example | REM Action |
|-------------------|---------|------------|
| 0.95+ | Near-duplicate content | Cluster (high confidence) |
| 0.82-0.94 | Strong thematic connection | Cluster (medium-high confidence) |
| 0.75-0.81 | Contextually related | Cluster if Haiku validates |
| < 0.75 | Weak or no connection | Skip |

Minimum threshold: **0.75**. This is slightly aggressive, but Haiku validation acts as a second gate to reject false positives.

### Relationship Themes

REM looks for these connection types (not exhaustive — Haiku may identify others):

- **Topical**: Same subject matter (poems about nature, recipes for bread)
- **Temporal**: Same time period (memories from a trip, a week, a season)
- **Locational**: Same place (memories from Tokyo, from home)
- **Author/Source**: Same creator or origin
- **Genre**: Same format or style (all poems, all journal entries)
- **Event**: Related to the same event or experience

### Source Field (Schema Change)

Requires a new `source` field on the Relationship type in remember-core:

```typescript
interface Relationship {
  // ... existing fields ...
  source: 'user' | 'rem' | 'rule'  // NEW
}
```

- `'user'`: Manually created by a user (default for existing relationships)
- `'rem'`: Created by REM background process
- `'rule'`: Created by an automoderation rule

This is a **Weaviate schema migration** in remember-core. Existing relationships default to `source: 'user'`.

### Processing Tracking

REM state is stored in Firestore under the `remember` Firebase project:

```typescript
// Firestore: rem_state/cursor
interface RemCursorState {
  last_collection_id: string  // startAfter cursor for next collection scan
  last_run_at: string         // ISO timestamp of last run
}

// Firestore: rem_state/collections/{collection_id}
interface RemCollectionState {
  collection_id: string       // e.g., "Memory_users_abc123"
  last_processed_at: string   // ISO timestamp of last run on this collection
  memory_cursor: string       // Offset for "unprocessed" third within this collection
}
```

### User Control & Visibility

| Aspect | Decision |
|--------|----------|
| Enabled by default | Yes |
| User can disable | No |
| Notifications on create | No |
| Visual distinction in UI | No |
| Users can edit/delete REM relationships | No |
| Re-weighting memories | No (weight is user-set) |

---

## Benefits

- **Zero-effort relationship building**: Users get a connected memory graph without doing anything
- **Cheap**: Embeddings are free (already in Weaviate), Haiku is pennies per cluster
- **Conservative**: 0.75 threshold + Haiku validation = low false-positive rate
- **Scalable**: Cursor-based scan + hourly cadence means even thousands of collections get processed without overload
- **Emulates human cognition**: Time-based background processing mirrors how the brain consolidates memories during sleep

---

## Trade-offs

- **No user control**: Users can't disable REM or delete its relationships. If REM creates noisy relationships, users are stuck with them. Mitigation: conservative thresholds + Haiku gating should keep quality high. The `source: 'rem'` field enables future filtering.
- **LLM cost**: Haiku calls add cost (~$0.005-0.02 per cluster). With hourly runs and ~3-5 clusters per run, that's ~$1-3/month. Mitigation: bounded by Anthropic API key spending limit.
- **Stale clusters**: REM doesn't revisit old relationships to check if they still make sense after memories are deleted. Mitigation: remember-core already cleans up orphaned relationship references on memory delete.
- **Scan-order fairness**: Active collections with many new memories get the same processing frequency as dormant ones. Mitigation: the "newest" third naturally prioritizes fresh content when the collection's turn comes.

---

## Dependencies

- **remember-core**: Existing `RelationshipService` and `MemoryService` for CRUD and similarity search
- **Weaviate**: Vector similarity via `findSimilar()`, relationship storage
- **Firestore (remember project)**: `rem_cursor` state tracking, collection registry
- **Anthropic API (Haiku)**: Cluster validation and observation generation
- **GCP Cloud Scheduler**: Hourly cron trigger
- **Schema migration**: New `source` field on Relationship type in Weaviate

---

## Testing Strategy

- **Unit tests**: Clustering algorithm, deduplication logic, merge/split decisions
- **Integration tests**: End-to-end run on a test collection with known similar memories, verify correct relationships created
- **Dedup tests**: Ensure repeated runs don't create duplicate relationships
- **Split tests**: Verify relationships over 50 members are correctly split
- **Haiku mock tests**: Test with mock Haiku responses to verify gating works (rejects weak clusters)
- **Cursor tests**: Verify startAfter cursor persists and resumes correctly across runs

---

## Migration Path

1. **Schema migration**: Add `source` field to Relationship type in remember-core (default `'user'` for existing)
2. **REM service**: Implement as new module in remember-core or standalone Cloud Run service
3. **Firestore setup**: Create `rem_state` collection in remember Firebase project
4. **Deploy**: Deploy REM service to GCP
5. **Cloud Scheduler**: Configure hourly trigger
6. **Monitor**: Watch relationship creation rate, Haiku costs, cluster quality for first week

---

## Future Considerations

- **User opt-out**: If REM proves noisy, add per-collection disable toggle
- **UI filtering**: Filter relationships by `source` to show only manual or only REM-created
- **Re-weighting based on relationship density**: Not modifying `weight` directly, but could expose a derived "connectedness score"
- **Event-triggered mode**: Optional burst processing when large batches of memories are imported
- **Relationship decay**: Periodically re-evaluate old relationships and remove ones that no longer hold (e.g., if most member memories were deleted)
- **Cross-collection relationships**: Link memories across user/group boundaries (would require ACL considerations)

---

**Status**: Design Specification
**Recommendation**: Implement as a new milestone in remember-core. Prerequisites: source field schema migration.

---

## Appendix: Design Decisions

Key decisions resolved during clarification (clarification-6, clarification-7):

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Collection scope | All (user, group, space) | REM should benefit all collection types equally |
| Processing order | Cursor-based scan (`startAfter`) | Simpler than maintaining ordered list for 1000+ collections |
| Min collection size | 50 memories | Small collections produce unreliable similarity; 10 is too few, items likely disparate |
| Memory selection | 1/3 newest, 1/3 unprocessed, 1/3 random | Balances fresh content, completeness, and rediscovery |
| Re-weighting | No | Weight is a user-set property; REM should not modify it silently |
| Source field | Schema migration (`'user' \| 'rem' \| 'rule'`) | Enables filtering; `rule` supports future automoderation |
| Naming | Haiku generates `observation` text | No title field exists; observation serves as de-facto title |
| Deduplication | 60% memory_ids overlap = merge | Avoids near-duplicates while allowing growth |
| Max per relationship | 50 memories, split beyond | Bidirectional update cost grows linearly; 50 keeps updates fast |
| Intelligence | Embeddings + Haiku (Option B) | Embeddings are free, Haiku adds naming/validation for pennies |
| Similarity threshold | 0.75 | Slightly aggressive but Haiku acts as second gate for false positives |
| Relationship themes | Topical, temporal, locational, author, genre, event | Emulates human associative memory (temporal + spatial links included) |
| User hints/rules | No | Fully autonomous; no user configuration |
| CRUD scope | Full (create, update/merge, split, delete) | Splitting requires modifying existing relationships |
| User opt-out | No | On by default, not disableable |
| Notifications | No | Silent background process |
| UI distinction | No | REM relationships appear same as manual ones |
| Tracking | Collection-level cursor in Firestore (remember project) | `startAfter` for collection scan, per-collection memory cursor |
| Execution env | GCP (Cloud Scheduler + Cloud Run) | remember-core responsibility, not Cloudflare Workers |
| Interval | Hourly, globally fixed, time-based only | Emulates human REM sleep; no event triggers |
| Cost budget | Bounded by Anthropic API key spending limit | No separate budget; Haiku is cheap enough |
