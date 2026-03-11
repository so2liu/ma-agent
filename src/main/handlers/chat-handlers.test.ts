import { describe, expect, test } from 'bun:test';

import {
  buildPlainTextWithAttachments,
  buildUserMessage,
  resolveAttachmentPath,
  sanitizeFileName
} from './chat-helpers';

describe('chat-helpers', () => {
  describe('sanitizeFileName', () => {
    test('removes illegal characters', () => {
      expect(sanitizeFileName('file<>:"/\\|?*.txt')).toBe('file_________.txt');
    });

    test('removes control characters', () => {
      expect(sanitizeFileName('file\x00\x01name.txt')).toBe('file__name.txt');
    });

    test('collapses whitespace', () => {
      expect(sanitizeFileName('file   name   .txt')).toBe('file name .txt');
    });

    test('returns "attachment" for empty result', () => {
      expect(sanitizeFileName('')).toBe('attachment');
      expect(sanitizeFileName('***')).toBe('___');
    });
  });

  describe('resolveAttachmentPath', () => {
    test('prepends ./ to relative paths not starting with dot', () => {
      const result = resolveAttachmentPath({
        name: 'file.csv',
        mimeType: 'text/csv',
        size: 100,
        savedPath: '/workspace/attachments/file.csv',
        relativePath: 'attachments/file.csv'
      });
      expect(result.readTarget).toBe('./attachments/file.csv');
      expect(result.displayPath).toBe('./attachments/file.csv');
    });

    test('keeps paths already starting with dot', () => {
      const result = resolveAttachmentPath({
        name: 'file.csv',
        mimeType: 'text/csv',
        size: 100,
        savedPath: '/workspace/.hidden/file.csv',
        relativePath: '.hidden/file.csv'
      });
      expect(result.readTarget).toBe('.hidden/file.csv');
      expect(result.displayPath).toBe('.hidden/file.csv');
    });

    test('falls back to absolute savedPath for ../  relative paths', () => {
      const result = resolveAttachmentPath({
        name: 'file.csv',
        mimeType: 'text/csv',
        size: 100,
        savedPath: '/outside/file.csv',
        relativePath: '../outside/file.csv'
      });
      expect(result.readTarget).toBe('/outside/file.csv');
      expect(result.displayPath).toBe('/outside/file.csv');
    });

    test('falls back to absolute savedPath for empty relativePath', () => {
      const result = resolveAttachmentPath({
        name: 'file.csv',
        mimeType: 'text/csv',
        size: 100,
        savedPath: '/workspace/attachments/file.csv',
        relativePath: ''
      });
      expect(result.readTarget).toBe('/workspace/attachments/file.csv');
      expect(result.displayPath).toBe('/workspace/attachments/file.csv');
    });
  });

  describe('buildUserMessage', () => {
    test('creates message with text only', () => {
      const msg = buildUserMessage('hello world', []);
      expect(msg).toEqual({
        role: 'user',
        content: [{ type: 'text', text: 'hello world' }]
      });
    });

    test('creates message with attachments', () => {
      const msg = buildUserMessage('check this', [
        {
          name: 'data.csv',
          mimeType: 'text/csv',
          size: 100,
          savedPath: '/workspace/attachments/data.csv',
          relativePath: 'attachments/data.csv'
        }
      ]);
      const content = msg.content as { type: string; text: string }[];
      expect(content).toHaveLength(2);
      expect(content[1].text).toContain('data.csv');
      expect(content[1].text).toContain('Read("./attachments/data.csv")');
    });

    test('creates fallback message when no text and no attachments', () => {
      const msg = buildUserMessage('', []);
      const content = msg.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      expect(content[0].text).toContain('uploaded');
    });
  });

  describe('buildPlainTextWithAttachments', () => {
    test('returns text when no attachments', () => {
      expect(buildPlainTextWithAttachments('hello', [])).toBe('hello');
    });

    test('includes attachment instructions with correct path', () => {
      const result = buildPlainTextWithAttachments('analyze', [
        {
          name: 'report.xlsx',
          mimeType: 'application/vnd.ms-excel',
          size: 2048,
          savedPath: '/workspace/attachments/report.xlsx',
          relativePath: 'attachments/report.xlsx'
        }
      ]);
      expect(result).toContain('analyze');
      expect(result).toContain('report.xlsx');
      expect(result).toContain('Read("./attachments/report.xlsx")');
    });

    test('uses absolute path for outside-workspace attachments', () => {
      const result = buildPlainTextWithAttachments('check', [
        {
          name: 'ext.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          savedPath: '/tmp/ext.pdf',
          relativePath: '../../tmp/ext.pdf'
        }
      ]);
      expect(result).toContain('Read("/tmp/ext.pdf")');
    });

    test('returns fallback when no text and no attachments', () => {
      const result = buildPlainTextWithAttachments('', []);
      expect(result).toContain('uploaded');
    });
  });
});
