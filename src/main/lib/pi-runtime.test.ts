import { describe, expect, mock, test } from 'bun:test';

mock.module('electron', () => ({
  app: {
    getPath: () => '/tmp/test-user-data'
  }
}));

const { SYSTEM_PROMPT_APPEND, getPiModelForPreference } = await import('./pi-runtime');
const { DEFAULT_MODEL_IDS } = await import('../../shared/types/ipc');

describe('pi-runtime', () => {
  describe('getPiModelForPreference', () => {
    test('defaults to shared model IDs', () => {
      expect(getPiModelForPreference('fast')).toBe(DEFAULT_MODEL_IDS.fast);
      expect(getPiModelForPreference('smart-sonnet')).toBe(DEFAULT_MODEL_IDS['smart-sonnet']);
      expect(getPiModelForPreference('smart-opus')).toBe(DEFAULT_MODEL_IDS['smart-opus']);
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
