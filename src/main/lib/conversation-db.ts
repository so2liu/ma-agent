import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

export interface Conversation {
  id: string;
  title: string;
  messages: string; // JSON stringified Message[]
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
  sessionId?: string | null;
  projectId?: string | null;
}

/** Lightweight version returned by listConversations — no full messages payload */
export interface ConversationSummary extends Omit<Conversation, 'messages'> {
  preview: string;
}

interface ConversationFile {
  id: string;
  title: string;
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
  sessionId?: string | null;
  projectId?: string | null;
}

let conversationsDir: string | null = null;

function getConversationsDir(): string {
  if (!conversationsDir) {
    conversationsDir = join(app.getPath('userData'), 'conversations');
    // Ensure the conversations directory exists
    if (!existsSync(conversationsDir)) {
      mkdirSync(conversationsDir, { recursive: true });
    }
  }
  return conversationsDir;
}

function getConversationFilePath(id: string): string {
  return join(getConversationsDir(), `${id}.json`);
}

function readConversationFile(id: string): ConversationFile | null {
  const filePath = getConversationFilePath(id);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent) as ConversationFile;
  } catch (error) {
    console.error(`Error reading conversation file ${id}:`, error);
    return null;
  }
}

function writeConversationFile(conversation: ConversationFile): void {
  const filePath = getConversationFilePath(conversation.id);
  writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
}

export function initializeDatabase(): void {
  // Ensure conversations directory exists
  getConversationsDir();
}

export function closeDatabase(): void {
  // No cleanup needed for filesystem storage
  conversationsDir = null;
}

export function createConversation(
  title: string,
  messages: unknown[],
  sessionId?: string | null
): Conversation {
  const id = Date.now().toString();
  const now = Date.now();

  const conversationFile: ConversationFile = {
    id,
    title,
    messages,
    createdAt: now,
    updatedAt: now,
    sessionId
  };

  writeConversationFile(conversationFile);

  return {
    id,
    title,
    messages: JSON.stringify(messages),
    createdAt: now,
    updatedAt: now,
    sessionId
  };
}

export function updateConversation(
  id: string,
  title?: string,
  messages?: unknown[],
  sessionId?: string | null
): void {
  const existing = readConversationFile(id);
  if (!existing) {
    throw new Error(`Conversation ${id} not found`);
  }

  // Check if messages actually changed by comparing JSON strings
  const messagesChanged =
    messages !== undefined && JSON.stringify(existing.messages) !== JSON.stringify(messages);
  const titleChanged = title !== undefined && existing.title !== title;

  // Only update timestamp if something actually changed
  const now = Date.now();
  const sessionIdChanged = sessionId !== undefined && existing.sessionId !== sessionId;

  const updated: ConversationFile = {
    ...existing,
    ...(title !== undefined && { title }),
    ...(messages !== undefined && { messages }),
    ...(sessionId !== undefined && { sessionId }),
    ...((messagesChanged || titleChanged || sessionIdChanged) && { updatedAt: now })
  };

  writeConversationFile(updated);
}

export function getConversation(id: string): Conversation | null {
  const conversationFile = readConversationFile(id);
  if (!conversationFile) {
    return null;
  }

  return {
    id: conversationFile.id,
    title: conversationFile.title,
    messages: JSON.stringify(conversationFile.messages),
    createdAt: conversationFile.createdAt,
    updatedAt: conversationFile.updatedAt,
    sessionId: conversationFile.sessionId ?? null,
    projectId: conversationFile.projectId ?? null
  };
}

function truncatePreview(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength).trim() + '...' : text;
}

function extractTextFromContent(content: unknown, maxLength: number): string | null {
  if (typeof content === 'string') {
    return truncatePreview(content, maxLength);
  }
  if (Array.isArray(content)) {
    for (let j = content.length - 1; j >= 0; j--) {
      const block = content[j];
      if (
        typeof block === 'object' &&
        block !== null &&
        'type' in block &&
        block.type === 'text' &&
        'text' in block &&
        typeof block.text === 'string'
      ) {
        return truncatePreview(block.text as string, maxLength);
      }
    }
  }
  return null;
}

function extractPreview(messages: unknown[], maxLength: number = 90): string {
  // Try last assistant message first, then fall back to last user message
  for (const targetRole of ['assistant', 'user']) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (typeof msg !== 'object' || msg === null || !('role' in msg)) continue;
      if ((msg as { role: string }).role !== targetRole) continue;

      const text = extractTextFromContent((msg as { content?: unknown }).content, maxLength);
      if (text) return text;
    }
  }
  return '';
}

export function listConversations(limit: number = 100): ConversationSummary[] {
  const dir = getConversationsDir();
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const id = file.replace('.json', '');
      const filePath = join(dir, file);
      try {
        const fileContent = readFileSync(filePath, 'utf-8');
        const conversationFile = JSON.parse(fileContent) as ConversationFile;
        return { id, updatedAt: conversationFile.updatedAt, conversationFile };
      } catch (error) {
        console.error(`Error reading conversation file ${id}:`, error);
        return null;
      }
    })
    .filter(
      (item): item is { id: string; updatedAt: number; conversationFile: ConversationFile } =>
        item !== null
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);

  return files.map(({ conversationFile }) => ({
    id: conversationFile.id,
    title: conversationFile.title,
    preview: extractPreview(conversationFile.messages),
    createdAt: conversationFile.createdAt,
    updatedAt: conversationFile.updatedAt,
    sessionId: conversationFile.sessionId ?? null,
    projectId: conversationFile.projectId ?? null
  }));
}

export function deleteConversation(id: string): void {
  const filePath = getConversationFilePath(id);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function setConversationProject(id: string, projectId: string | null): void {
  const existing = readConversationFile(id);
  if (!existing) throw new Error(`Conversation ${id} not found`);
  existing.projectId = projectId;
  writeConversationFile(existing);
}

export function generateTitleFromMessages(messages: unknown[]): string {
  // Find the first user message and use it as the title (truncated)
  for (const msg of messages) {
    if (typeof msg === 'object' && msg !== null && 'role' in msg && msg.role === 'user') {
      let content = '';
      if ('content' in msg && typeof msg.content === 'string') {
        content = msg.content;
      }
      // Truncate to 60 characters
      return content.length > 60 ? content.substring(0, 60) + '...' : content || '新对话';
    }
  }
  return '新对话';
}
