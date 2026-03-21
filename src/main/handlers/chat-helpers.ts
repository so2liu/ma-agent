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
