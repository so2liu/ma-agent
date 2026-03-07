import type { Artifact } from '@/components/ArtifactPanel';
import type { Message, WriteInput } from '@/types/chat';

const HTML_EXTENSIONS = new Set(['html', 'htm', 'svg']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico']);

function getExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || '';
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/**
 * Extract previewable artifacts from chat messages.
 * Looks at Write tool blocks with HTML/image file paths.
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
      let type: 'html' | 'image' | null = null;

      if (HTML_EXTENSIONS.has(ext)) {
        type = 'html';
      } else if (IMAGE_EXTENSIONS.has(ext)) {
        type = 'image';
      }

      if (!type) continue;

      // Use file path as dedup key; later writes overwrite earlier ones
      if (seen.has(input.file_path)) {
        // Replace existing artifact with updated content
        const existingIndex = artifacts.findIndex((a) => a.filePath === input.file_path);
        if (existingIndex !== -1) {
          artifacts[existingIndex] = {
            id: block.tool.id,
            filePath: input.file_path,
            fileName: getFileName(input.file_path),
            type,
            content: type === 'html' ? input.content : undefined
          };
        }
      } else {
        seen.add(input.file_path);
        artifacts.push({
          id: block.tool.id,
          filePath: input.file_path,
          fileName: getFileName(input.file_path),
          type,
          content: type === 'html' ? input.content : undefined
        });
      }
    }
  }

  return artifacts;
}
