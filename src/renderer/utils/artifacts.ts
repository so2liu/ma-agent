import type { Artifact } from '@/components/ArtifactPanel';
import type { Message, WriteInput } from '@/types/chat';

import { getArtifactType, getFileExtension } from '../../shared/file-extensions';

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
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

      const ext = getFileExtension(input.file_path);
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
