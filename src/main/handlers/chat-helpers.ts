import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import type { SavedAttachmentInfo } from '../../shared/types/ipc';

export function sanitizeFileName(name: string): string {
  const withoutIllegal = name.replace(/[<>:"/\\|?*]/g, '_');
  const withoutControlChars = Array.from(withoutIllegal)
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('');
  return withoutControlChars.replace(/\s+/g, ' ').trim() || 'attachment';
}

/** Resolve attachment relative path into a read target and display path. */
export function resolveAttachmentPath(attachment: SavedAttachmentInfo): {
  readTarget: string;
  displayPath: string;
} {
  const relativeSegment = attachment.relativePath;
  const relativeWithinWorkspace =
    relativeSegment && !relativeSegment.startsWith('..') ? relativeSegment : null;
  const readTarget =
    relativeWithinWorkspace ?
      relativeWithinWorkspace.startsWith('.') ?
        relativeWithinWorkspace
      : `./${relativeWithinWorkspace}`
    : attachment.savedPath;
  const displayPath = relativeWithinWorkspace ? readTarget : attachment.savedPath;
  return { readTarget, displayPath };
}

function formatAttachmentInstruction(attachment: SavedAttachmentInfo): string {
  const { readTarget, displayPath } = resolveAttachmentPath(attachment);
  return `Attachment "${attachment.name}" is available at ${displayPath}. Please run Read("${readTarget}") when you need to inspect it.`;
}

export function buildPlainTextWithAttachments(
  text: string,
  attachments: SavedAttachmentInfo[]
): string {
  const parts: string[] = [];
  if (text) parts.push(text);
  for (const attachment of attachments) {
    parts.push(formatAttachmentInstruction(attachment));
  }
  return parts.join('\n\n') || 'User uploaded files without additional context.';
}

export function buildUserMessage(
  text: string,
  attachments: SavedAttachmentInfo[]
): SDKUserMessage['message'] {
  const contentBlocks: { type: 'text'; text: string }[] = [];
  if (text) {
    contentBlocks.push({ type: 'text', text });
  }

  for (const attachment of attachments) {
    contentBlocks.push({ type: 'text', text: formatAttachmentInstruction(attachment) });
  }

  if (contentBlocks.length === 0) {
    contentBlocks.push({
      type: 'text',
      text: 'User uploaded files without additional context.'
    });
  }

  return {
    role: 'user',
    content: contentBlocks
  };
}
