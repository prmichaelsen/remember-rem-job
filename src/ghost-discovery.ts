/**
 * Ghost discovery: find ghost composite IDs within a user's memory collection.
 *
 * User collections (Memory_{userId}) may contain ghost memories tagged with
 * ghost_owner:* tags. Each unique ghost_owner tag value is a ghost composite ID
 * that needs its own REM cycle.
 *
 * Patterns:
 *   ghost_owner:{ownerId}         — personal ghost
 *   ghost_owner:space:{spaceId}   — space ghost
 *   ghost_owner:group:{groupId}   — group ghost
 */

import type { WeaviateClient } from 'weaviate-client';
import type { Logger } from '@prmichaelsen/remember-core';

const GHOST_OWNER_PREFIX = 'ghost_owner:';

/**
 * Extract userId from a Weaviate collection name.
 * Returns null for non-user collections (spaces, groups, etc).
 *
 * User collections follow the pattern: Memory_{userId}
 * Space collections: Memory_space_{spaceId} (no ghost memories)
 * Group collections: Memory_group_{groupId} (no ghost memories)
 */
export function extractUserIdFromCollection(collectionName: string): string | null {
  if (!collectionName.startsWith('Memory_')) return null;

  const suffix = collectionName.slice('Memory_'.length);

  // Space and group collections don't contain ghost memories
  if (suffix.startsWith('space_') || suffix.startsWith('group_')) return null;

  return suffix || null;
}

/**
 * Discover ghost composite IDs within a user's memory collection
 * by aggregating tag occurrences in Weaviate.
 *
 * Returns an array of ghost_owner:* tag values found in the collection.
 * Returns empty array if no ghost memories exist.
 */
export async function discoverGhostCompositeIds(
  weaviateClient: WeaviateClient,
  collectionName: string,
  logger: Logger,
): Promise<string[]> {
  const userId = extractUserIdFromCollection(collectionName);
  if (!userId) {
    logger.debug('Non-user collection, no ghost discovery needed', { collectionName });
    return [];
  }

  try {
    const col = weaviateClient.collections.get(collectionName);

    // Use aggregate with text topOccurrences to find distinct ghost_owner:* tags.
    // Ghost tags are low-cardinality (a user typically has < 10 ghosts).
    const result = await col.aggregate.overAll({
      returnMetrics: col.metrics
        .aggregate('tags' as any)
        .text(['topOccurrencesValue'], 100),
    });

    const ghostIds: string[] = [];
    const props = result.properties as any;

    if (props?.tags?.topOccurrences) {
      for (const occ of props.tags.topOccurrences) {
        if (occ.value && occ.value.startsWith(GHOST_OWNER_PREFIX)) {
          ghostIds.push(occ.value);
        }
      }
    }

    logger.info('Ghost discovery complete', {
      collectionName,
      userId,
      ghostCompositeIds: ghostIds,
      count: ghostIds.length,
    });

    return ghostIds;
  } catch (err: any) {
    logger.error('Ghost discovery failed', {
      collectionName,
      error: err.message,
    });
    return [];
  }
}
