# Task 14: Per-Ghost REM Cycle Execution

**Milestone**: [M3 - Full REM Phase Wiring](../../milestones/milestone-3-full-rem-phase-wiring.md)
**Estimated Time**: 3-4 hours
**Dependencies**: T12, T13
**Status**: Not Started
**Design Reference**: [Ghost-Scoped REM Cycles](../../design/local.ghost-scoped-rem-cycles.md)

---

## Objective

Update the worker to run N+1 REM cycles per user collection: one for the user's own (non-ghost) memories and one per discovered ghost composite ID, using tag filters to scope each cycle to the correct memory subset.

---

## Context

Per the ghost-scoped design (Option A), a single worker handles all REM cycles for a collection sequentially. For user collections, the worker:

1. Discovers ghost composite IDs (T13)
2. Runs a REM cycle for user's own memories (no ghost tag filter)
3. Runs a REM cycle per ghost (filtered by `ghost_owner:*` tag)

This requires RemService.runCycle() to accept a `tagFilter` option (implemented in remember-core).

---

## Steps

### 1. Update worker.ts to detect user collections

Use `extractUserIdFromCollection()` from T13 to determine if the collection is a user collection.

### 2. Add ghost discovery to worker flow

For user collections, call `discoverGhostCompositeIds()` before running REM cycles.

### 3. Implement multi-cycle execution

```typescript
// For user collections:
const userId = extractUserIdFromCollection(collectionId);
if (userId) {
  const ghostIds = await discoverGhostCompositeIds(userId, logger);

  // Cycle 1: User's own memories (exclude ghost memories)
  // Need to determine how to filter OUT ghost memories for the user cycle
  await remService.runCycle(collectionId, { /* no ghost tag filter */ });

  // Cycles 2..N+1: Per-ghost memories
  for (const ghostCompositeId of ghostIds) {
    await remService.runCycle(collectionId, {
      tagFilter: [ghostCompositeId],
    });
  }
} else {
  // Non-user collection: single unfiltered cycle
  await remService.runCycle(collectionId);
}
```

### 4. Handle RemService instantiation per ghost

For ghost cycles that need mood/perception (T15), a new RemService instance may be needed per ghost with the correct ghostCompositeId. For now (before T15), all cycles can share the same RemService since mood deps aren't wired yet.

### 5. Update RemJobWorker integration

The current worker uses `RemJobWorker.execute(jobId, params)` which calls `remService.runCycle()` internally. We may need to either:
- Call `remService.runCycle()` directly with tag filters (bypassing RemJobWorker for ghost cycles)
- Or extend RemJobParams to include tagFilter and ghostCompositeId

Evaluate which approach is cleaner and implement.

### 6. Add logging for multi-cycle visibility

Log each cycle start/end with ghost composite ID or "user-own" label.

### 7. Write unit tests

Test cases:
- User collection with 2 ghosts → 3 cycles executed (1 user + 2 ghost)
- User collection with 0 ghosts → 1 cycle executed
- Non-user collection → 1 cycle executed
- Tag filter passed correctly for each ghost cycle

---

## Verification

- [ ] User collections trigger N+1 REM cycles
- [ ] Non-user collections trigger 1 REM cycle
- [ ] Each ghost cycle receives correct tagFilter
- [ ] Logging shows cycle-by-cycle progress
- [ ] Unit tests pass
- [ ] `npm run typecheck` passes

---

## Notes

- Option A (sequential within single worker) is used for initial implementation
- The user's own memory cycle may need a negative filter (exclude ghost memories) — TBD based on remember-core's tagFilter API
- Ghost cycles with small memory subsets will be fast
