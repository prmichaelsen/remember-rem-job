# Ghost-Scoped REM Cycles

**Concept**: Per-ghost REM cycle scoping within user collections, with Firestore-based ghost discovery and mood/perception state isolation
**Created**: 2026-03-07
**Status**: Design Specification

---

## Overview

User memory collections (`Memory_{userId}`) contain both the user's own memories and ghost memories from various ghost entities (personal ghosts, space ghosts, group ghosts). Each ghost's memories are tagged with a `ghost_owner:*` tag that serves as the ghost's composite ID.

REM currently processes entire collections without distinguishing between memory subsets. This design introduces ghost-aware scoping so that each ghost's memories receive their own REM cycle with the correct `ghostCompositeId`, enabling per-ghost mood drift, perception updates, and narration (Phases 8-10).

---

## Problem Statement

- **Mixed memory populations**: A single user collection may contain memories from 5+ different ghosts alongside the user's own memories. Processing them as one pool produces incorrect mood/perception state — mood drift from a space ghost's observations shouldn't bleed into a personal ghost's perception of the user.
- **ghostCompositeId is per-ghost**: `MoodService` and `PerceptionService` store state at `users/{userId}/{ghostCompositeId}/core`. Each ghost needs its own REM cycle to write to the correct Firestore path.
- **No current scoping mechanism**: RemService.runCycle() processes all memories in a collection without tag filtering.

---

## Solution

For each user collection, the worker:

1. **Discovers ghost composite IDs** from Firestore (mood state docs under `users/{userId}/`)
2. **Runs N+1 REM cycles** per collection:
   - 1 cycle for the user's own memories (no ghost tag filter, no ghostCompositeId)
   - N cycles for each discovered ghost (filtered by `ghost_owner:*` tag, with matching ghostCompositeId)
3. Each ghost REM cycle receives the correct `ghostCompositeId` so mood/perception writes go to the right Firestore path.

### Ghost Composite ID Patterns

| Ghost Type | Tag Format | ghostCompositeId | Firestore Path |
|---|---|---|---|
| Personal | `ghost_owner:{ownerId}` | `ghost_owner:{ownerId}` | `users/{userId}/ghost_owner:{ownerId}/core` |
| Space | `ghost_owner:space:{spaceId}` | `ghost_owner:space:{spaceId}` | `users/{userId}/ghost_owner:space:{spaceId}/core` |
| Group | `ghost_owner:group:{groupId}` | `ghost_owner:group:{groupId}` | `users/{userId}/ghost_owner:group:{groupId}/core` |

### Memory Ownership Rules

- **User collections** (`Memory_{userId}`): Contain user's own memories AND ghost memories from all ghost types
- **Space collections** (`Memory_{spaceId}`): Contain the space's own public memories only — no ghost memories
- **Group collections** (`Memory_{groupId}`): Contain the group's own memories only — no ghost memories

Ghost memories are always stored in the **conversing user's** collection, never in the ghost entity's own collection.

### Tag Scheme

Ghost memories carry these tags (set at creation time by the prompt injectors):

```
Personal ghost:  ['ghost_owner:{ownerId}', 'ghost_type:personal', 'ghost_user:{conversingUserId}']
Space ghost:     ['ghost_owner:space:{spaceId}', 'ghost_type:space', 'ghost_user:{conversingUserId}']
Group ghost:     ['ghost_owner:group:{groupId}', 'ghost_type:group', 'ghost_user:{conversingUserId}']
```

---

## Implementation

### Ghost Discovery (Firestore)

Ghost composite IDs are discovered by listing Firestore subcollections under `users/{userId}/` that match the `ghost_owner:*` pattern. Mood state is assumed to always exist (backfilled).

```typescript
async function discoverGhostCompositeIds(userId: string): Promise<string[]> {
  // List subcollections under users/{userId}/
  // Filter for names matching ghost_owner:*
  // Returns: ['ghost_owner:abc123', 'ghost_owner:space:my-space', ...]
}
```

### Per-Collection Worker Flow

```
Worker receives job: { collection_id: 'Memory_abc123' }

1. Extract userId from collection name (Memory_{userId} -> userId)
2. Discover ghost composite IDs from Firestore
3. Run REM cycle for user's own memories (no tag filter, no ghostCompositeId)
4. For each ghostCompositeId:
   a. Run REM cycle filtered to memories tagged with that ghostCompositeId
   b. Pass ghostCompositeId to RemService for mood/perception state
```

### RemService Changes (remember-core)

RemService.runCycle() needs to accept an optional tag filter to scope which memories are selected as candidates:

```typescript
interface RunCycleOptions {
  tagFilter?: string[];  // Only process memories containing ALL of these tags
}

// Usage:
await remService.runCycle('Memory_abc123', { tagFilter: ['ghost_owner:space:my-space'] });
```

This filter applies to the candidate selection phase (Phase 1) — all three selection strategies (newest, unprocessed, random) are scoped to memories matching the tag filter.

### RemService Constructor Per-Ghost

Each ghost REM cycle requires a RemService instance (or reconfiguration) with the correct `ghostCompositeId`:

```typescript
// User's own memories — no ghostCompositeId
const userRemService = new RemService({
  ...sharedDeps,
  // moodService and ghostCompositeId omitted — mood phases skipped for user's own memories
});

// Per-ghost — with ghostCompositeId
const ghostRemService = new RemService({
  ...sharedDeps,
  moodService,
  ghostCompositeId: 'ghost_owner:abc123',
});
```

### Job Granularity Options

**Option A: One job per collection, multiple REM cycles within**
- Scheduler creates 1 job per collection
- Worker discovers ghosts and runs N+1 cycles sequentially
- Simpler job tracking, but longer per-worker execution time

**Option B: One job per collection-ghost pair**
- Scheduler discovers ghosts and creates separate jobs for each (collection, ghostCompositeId) pair
- Maximum parallelism
- Requires scheduler to have Firestore access for ghost discovery

**Recommendation**: Option A for initial implementation. Ghost discovery and multi-cycle execution within a single worker keeps the scheduler simple. Option B can be a future optimization if per-worker execution time becomes a concern.

---

## Benefits

- **Correct mood/perception isolation**: Each ghost's emotional state evolves independently based on its own memory interactions
- **Extensible**: Adding `ghost_owner:group:{groupId}` requires no architectural changes — just a new tag pattern
- **Backward compatible**: Collections without ghost memories run a single unfiltered REM cycle, same as today
- **Firestore as source of truth**: Ghost composite ID discovery uses Firestore (backfilled mood state), avoiding Weaviate aggregation costs

---

## Trade-offs

- **Multiplied REM cycles**: A user with 5 ghosts gets 6 REM cycles per collection (1 user + 5 ghost). Mitigation: ghost memory subsets are typically small (tens of memories, not hundreds), so individual cycles are fast
- **Sequential within worker**: Option A runs ghost cycles sequentially. Mitigation: each ghost cycle processes a small subset; total time is bounded. Can upgrade to Option B later
- **RemService tag filtering**: Requires a remember-core change to support tag-scoped candidate selection. Mitigation: the filter is a simple Weaviate `where` clause addition
- **Firestore subcollection listing**: Listing subcollections requires Firestore Admin SDK. Mitigation: already available in the Cloud Run environment

---

## Dependencies

- **remember-core**: Tag filter support in RemService.runCycle() (new feature)
- **remember-core**: Published version with EmotionalScoringService, ScoringContextService, ClassificationService, createAnthropicSubLlm exports
- **Firestore**: Backfilled mood state docs for all ghost composite IDs
- **Weaviate**: Tag-based filtering in memory queries (already supported)

---

## Testing Strategy

- **Unit tests**: Ghost composite ID discovery from Firestore mock
- **Unit tests**: Tag filter scoping in candidate selection
- **Integration tests**: Multi-ghost collection with 3 ghost types, verify separate mood state per ghost
- **Edge cases**: Collection with no ghost memories (single cycle), collection with only ghost memories (no user cycle needed?), ghost with zero memories after filtering

---

## Migration Path

1. **Backfill mood state**: Ensure all ghost composite IDs have initialized mood docs in Firestore
2. **remember-core**: Add tag filter support to RemService.runCycle()
3. **remember-core**: Publish new version with all Phase 0-10 service exports
4. **remember-rem**: Wire new deps (subLlm, emotionalScoringService, scoringContextService, classificationService)
5. **remember-rem**: Implement ghost discovery + multi-cycle worker logic
6. **remember-rem**: Wire moodService + ghostCompositeId per ghost cycle
7. **Deploy and monitor**: Verify correct mood state isolation across ghosts

---

## Future Considerations

- **Option B fan-out**: Per-ghost job creation in scheduler for maximum parallelism
- **Ghost memory lifecycle**: What happens to ghost memories when a ghost is disabled/deleted?
- **Cross-ghost relationships**: Should REM ever discover relationships between a user's own memories and a ghost's memories?
- **Group ghost support**: `ghost_owner:group:{groupId}` pattern ready but untested until group ghosts ship

---

**Status**: Design Specification
**Recommendation**: Implement after remember-core publishes new service exports. Start with Option A (multi-cycle within single worker).
**Related Documents**: [local.rem-background-relationships.md](local.rem-background-relationships.md), REM Cycle Handoff Report
