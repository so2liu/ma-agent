import type { Artifact, ArtifactType } from '@/components/ArtifactPanel';
import type { Message, WriteInput } from '@/types/chat';

const HTML_EXTENSIONS = new Set(['html', 'htm', 'svg']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico']);
const MARKDOWN_EXTENSIONS = new Set(['md']);
const CODE_EXTENSIONS = new Set([
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
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'tsv']);

function getExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || '';
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

function getArtifactType(ext: string): ArtifactType | null {
  if (HTML_EXTENSIONS.has(ext)) return 'html';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

/**
 * Extract previewable artifacts from chat messages.
 * Looks at Write tool blocks with supported file paths.
 */
export function extractArtifacts(messages: Message[]): Artifact[] {
  const artifacts: Artifact[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'assistant' || typeof message.content === 'string') continue;

    for (const block of message.content) {
      if (block.type !== 'tool_use' || !block.tool) continue;
      if (block.tool.name !== 'Write' || block.tool.isError) continue;

      const input = block.tool.parsedInput as WriteInput | undefined;
      if (!input?.file_path) continue;

      const ext = getExtension(input.file_path);
      const type = getArtifactType(ext);

      if (!type) continue;

      // Only inline content for HTML types (rendered in iframe)
      const inlineContent = type === 'html' ? input.content : undefined;

      // Use file path as dedup key; later writes overwrite earlier ones
      if (seen.has(input.file_path)) {
        const existingIndex = artifacts.findIndex((a) => a.filePath === input.file_path);
        if (existingIndex !== -1) {
          artifacts[existingIndex] = {
            id: block.tool.id,
            filePath: input.file_path,
            fileName: getFileName(input.file_path),
            type,
            content: inlineContent
          };
        }
      } else {
        seen.add(input.file_path);
        artifacts.push({
          id: block.tool.id,
          filePath: input.file_path,
          fileName: getFileName(input.file_path),
          type,
          content: inlineContent
        });
      }
    }
  }

  return artifacts;
}
