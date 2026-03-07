# Task 13: Ghost Composite ID Discovery

**Milestone**: [M3 - Full REM Phase Wiring](../../milestones/milestone-3-full-rem-phase-wiring.md)
**Estimated Time**: 2-3 hours
**Dependencies**: T12
**Status**: Not Started
**Design Reference**: [Ghost-Scoped REM Cycles](../../design/local.ghost-scoped-rem-cycles.md)

---

## Objective

Implement Firestore-based discovery of ghost composite IDs for a given user collection. Given a collection name like `Memory_{userId}`, discover which `ghost_owner:*` composite IDs have mood state in Firestore, returning the list of ghost composite IDs that need separate REM cycles.

---

## Context

User collections contain both user's own memories and ghost memories tagged with `ghost_owner:*`. Each ghost needs its own REM cycle with the correct ghostCompositeId for mood/perception isolation. Ghost composite IDs follow three patterns:

| Ghost Type | Composite ID Pattern | Firestore Path |
|---|---|---|
| Personal | `ghost_owner:{ownerId}` | `users/{userId}/ghost_owner:{ownerId}/core` |
| Space | `ghost_owner:space:{spaceId}` | `users/{userId}/ghost_owner:space:{spaceId}/core` |
| Group | `ghost_owner:group:{groupId}` | `users/{userId}/ghost_owner:group:{groupId}/core` |

Mood state is assumed to always be backfilled — if a ghost composite ID exists in Firestore, it has mood state.

---

## Steps

### 1. Create ghost discovery module

Create `src/ghost-discovery.ts` with a function to list ghost composite IDs from Firestore:

```typescript
export async function discoverGhostCompositeIds(userId: string, logger: Logger): Promise<string[]> {
  // List subcollections under users/{userId}/
  // Filter for names matching ghost_owner:*
  // Return array of ghost composite IDs
}
```

### 2. Extract userId from collection name

Add a utility to parse `Memory_{userId}` → `userId`:

```typescript
export function extractUserIdFromCollection(collectionName: string): string | null {
  // Memory_{userId} → userId
  // Space/group collections don't have ghost memories — return null for non-user collections
}
```

### 3. Determine collection type

Not all collections are user collections. Space and group collections have no ghost memories. The function should return `null` for non-user collections so the worker knows to run a single unfiltered cycle.

### 4. Handle Firestore subcollection listing

Use Firestore Admin SDK to list subcollections. The `listCollections()` method on a document reference returns all subcollections.

```typescript
// Firestore path: {BASE}.users/{userId}/
// List subcollections, filter for ghost_owner:* pattern
```

### 5. Write unit tests

Test cases:
- User with 2 personal ghosts → returns 2 composite IDs
- User with personal + space ghost → returns both
- User with no ghosts → returns empty array
- Non-user collection (space/group) → returns null from extractUserIdFromCollection
- Ghost composite ID format validation

---

## Verification

- [ ] `discoverGhostCompositeIds()` returns correct ghost composite IDs from Firestore
- [ ] `extractUserIdFromCollection()` correctly parses Memory_{userId}
- [ ] Non-user collections correctly identified (return null)
- [ ] All three ghost patterns recognized (personal, space, group)
- [ ] Unit tests pass
- [ ] `npm run typecheck` passes

---

## Notes

- Firestore Admin SDK's `listCollections()` is used to discover subcollections — no need to query Weaviate
- The BASE constant from remember-core/database/firestore/paths defines the Firestore prefix
- This module is consumed by the worker (T14) to determine REM cycle scope
