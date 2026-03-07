# Task 15: Wire Mood/Perception Dependencies

**Milestone**: [M3 - Full REM Phase Wiring](../../milestones/milestone-3-full-rem-phase-wiring.md)
**Estimated Time**: 2-3 hours
**Dependencies**: T14
**Status**: Not Started
**Design Reference**: [Ghost-Scoped REM Cycles](../../design/local.ghost-scoped-rem-cycles.md)

---

## Objective

Wire MoodService and ghostCompositeId into RemService for each ghost REM cycle, enabling Phases 8 (mood update), 9 (mood narration), and 10 (perception update).

---

## Context

MoodService stores mood state at Firestore path `users/{userId}/{ghostCompositeId}/core`. Each ghost needs its own RemService instance (or reconfiguration) with the correct ghostCompositeId so mood/perception writes go to the right location.

The ghost composite ID IS the `ghost_owner:*` tag value:
- `ghost_owner:{ownerId}` — personal ghost
- `ghost_owner:space:{spaceId}` — space ghost
- `ghost_owner:group:{groupId}` — group ghost (future)

Mood state is assumed to always be backfilled.

---

## Steps

### 1. Import MoodService

```typescript
import { MoodService } from '@prmichaelsen/remember-core/services';
```

### 2. Create MoodService instance

MoodService has no constructor parameters — it uses Firestore helpers internally.

```typescript
const moodService = new MoodService();
```

### 3. Create per-ghost RemService instances

For each ghost cycle, create a RemService with the ghost's composite ID:

```typescript
for (const ghostCompositeId of ghostIds) {
  const ghostRemService = new RemService({
    ...sharedDeps,
    moodService,
    ghostCompositeId,
  });
  await ghostRemService.runCycle(collectionId, {
    tagFilter: [ghostCompositeId],
  });
}
```

### 4. Handle user's own memory cycle

The user's own memories don't have a ghost — skip moodService/ghostCompositeId for that cycle:

```typescript
const userRemService = new RemService({
  ...sharedDeps,
  // No moodService or ghostCompositeId — Phases 8-10 skipped
});
await userRemService.runCycle(collectionId);
```

### 5. Refactor shared deps extraction

Extract the common RemService deps into a `sharedDeps` object to avoid repetition across per-ghost instantiation.

### 6. Write unit tests

Test cases:
- Ghost cycle creates RemService with correct ghostCompositeId
- User cycle creates RemService without moodService
- MoodService.getOrInitialize called with correct userId + ghostCompositeId path
- Multiple ghosts get separate RemService instances

---

## Verification

- [ ] MoodService imported and instantiated
- [ ] Each ghost cycle gets RemService with correct ghostCompositeId
- [ ] User's own cycle skips mood deps
- [ ] Firestore mood path is correct: `users/{userId}/{ghostCompositeId}/core`
- [ ] Unit tests pass
- [ ] `npm run typecheck` passes

---

## Notes

- MoodService is stateless — one instance can be shared across ghost cycles
- ghostCompositeId must differ per ghost cycle — the RemService needs to be re-instantiated
- Consider caching/reusing RemService instances if performance is a concern (unlikely given sequential execution)
