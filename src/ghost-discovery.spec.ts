import { describe, it, expect } from 'vitest';
import { extractUserIdFromCollection } from './ghost-discovery.js';

describe('extractUserIdFromCollection', () => {
  it('extracts userId from user collection', () => {
    expect(extractUserIdFromCollection('Memory_abc123')).toBe('abc123');
  });

  it('extracts userId with complex ID', () => {
    expect(extractUserIdFromCollection('Memory_user_with_underscores')).toBe('user_with_underscores');
  });

  it('returns null for non-Memory collections', () => {
    expect(extractUserIdFromCollection('SomeOtherCollection')).toBeNull();
  });

  it('returns null for space collections', () => {
    expect(extractUserIdFromCollection('Memory_space_myspace')).toBeNull();
  });

  it('returns null for group collections', () => {
    expect(extractUserIdFromCollection('Memory_group_mygroup')).toBeNull();
  });

  it('returns null for empty suffix', () => {
    expect(extractUserIdFromCollection('Memory_')).toBeNull();
  });
});
