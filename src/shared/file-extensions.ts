/** Centralized file extension registry used by both main and renderer processes. */

export const HTML_EXTENSIONS = new Set(['html', 'htm', 'svg']);

export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif',
  'ico'
]);

export const MARKDOWN_EXTENSIONS = new Set(['md']);

export const CODE_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'sh',
  'bash',
  'css',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'sql',
  'graphql',
  'vue',
  'svelte'
]);

export const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'tsv']);

/** All extensions that can be read as UTF-8 text (superset used by main process). */
export const ALL_TEXT_EXTENSIONS = new Set([
  ...HTML_EXTENSIONS,
  ...MARKDOWN_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  'env',
  'gitignore',
  'dockerignore',
  'makefile',
  'cfg',
  'ini',
  'conf',
  'log'
]);

/** All extensions that can be previewed in the artifact panel. */
export const PREVIEWABLE_EXTENSIONS = new Set([
  ...HTML_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...MARKDOWN_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...TEXT_EXTENSIONS
]);

export type ArtifactType = 'html' | 'image' | 'markdown' | 'code' | 'text';

export function getArtifactType(ext: string): ArtifactType | null {
  if (HTML_EXTENSIONS.has(ext)) return 'html';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

export function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

/** Max file size in bytes for preview (1 MB). */
export const MAX_PREVIEW_FILE_SIZE = 1024 * 1024;
