import { describe, expect, mock, test } from 'bun:test';

// Mock electron and SDK before importing claude-session
mock.module('electron', () => ({
  app: {
    getPath: () => '/tmp/test-user-data'
  }
}));

mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query: () => ({
    [Symbol.asyncIterator]: async function* () {
      /* noop */
    }
  })
}));

const { MODEL_BY_PREFERENCE, SYSTEM_PROMPT_APPEND } = await import('./claude-session');
const { DEFAULT_MODEL_IDS } = await import('../../shared/types/ipc');

describe('claude-session', () => {
  describe('MODEL_BY_PREFERENCE', () => {
    test('exports the same default model IDs from shared types', () => {
      expect(MODEL_BY_PREFERENCE).toEqual(DEFAULT_MODEL_IDS);
    });

    test('has entries for all preference tiers', () => {
      expect(MODEL_BY_PREFERENCE).toHaveProperty('fast');
      expect(MODEL_BY_PREFERENCE).toHaveProperty('smart-sonnet');
      expect(MODEL_BY_PREFERENCE).toHaveProperty('smart-opus');
    });

    test('all model IDs are non-empty strings', () => {
      for (const [, modelId] of Object.entries(MODEL_BY_PREFERENCE)) {
        expect(typeof modelId).toBe('string');
        expect(modelId.length).toBeGreaterThan(0);
      }
    });
  });

  describe('SYSTEM_PROMPT_APPEND', () => {
    test('contains the brand name "小马快跑"', () => {
      expect(SYSTEM_PROMPT_APPEND).toContain('小马快跑');
    });

    test('instructs the assistant to use Chinese', () => {
      expect(SYSTEM_PROMPT_APPEND).toContain('中文');
    });

    test('mentions CLAUDE.md for persistent memory', () => {
      expect(SYSTEM_PROMPT_APPEND).toContain('CLAUDE.md');
    });

    test('does not reference Claude by name as identity', () => {
      expect(SYSTEM_PROMPT_APPEND).toContain('不要使用 "Claude"');
    });
  });
});
