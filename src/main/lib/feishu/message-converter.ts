import { mkdir, stat, unlink } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import * as lark from '@larksuiteoapi/node-sdk';

import { ATTACHMENTS_DIR_NAME, MAX_ATTACHMENT_BYTES } from '../../../shared/constants';
import type { SavedAttachmentInfo } from '../../../shared/types/ipc';
import { sanitizeFileName } from '../../handlers/chat-helpers';
import type { RuntimeMessage } from '../agent-runtime';
import type { FeishuMessageEvent, FeishuMessageEventMention } from './types';

type JsonObject = Record<string, unknown>;

type MentionLike = {
  key: string;
  name: string;
  id?: string;
};

type MessageLike = {
  messageId?: string;
  parentId?: string;
  createTime?: string;
  deleted?: boolean;
  msgType: string;
  content: string;
  mentions: MentionLike[];
  senderName?: string;
  senderId?: string;
};

type ConvertedMessage = {
  text: string;
  attachments: SavedAttachmentInfo[];
};

type ConvertMessageOptions = {
  includeQuote: boolean;
};

type DownloadedResource = {
  attachment: SavedAttachmentInfo;
  originalName: string;
};

export async function convertFeishuMessage(
  data: FeishuMessageEvent,
  client: lark.Client,
  workspaceDir: string
): Promise<RuntimeMessage> {
  const converted = await convertMessage(feishuEventToMessageLike(data), client, workspaceDir, {
    includeQuote: true
  });

  return {
    text: converted.text,
    attachments: converted.attachments.length > 0 ? converted.attachments : undefined
  };
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeMarkdown(value: string): string {
  return value.replace(/([\\[\]()])/g, '\\$1');
}

async function convertMessage(
  message: MessageLike,
  client: lark.Client,
  workspaceDir: string,
  options: ConvertMessageOptions
): Promise<ConvertedMessage> {
  if (message.deleted) {
    return { text: '[消息已撤回]', attachments: [] };
  }

  const attachments: SavedAttachmentInfo[] = [];
  const parts: string[] = [];

  if (options.includeQuote && message.parentId) {
    const quoted = await fetchMessageById(client, message.parentId);
    const quotedConverted =
      quoted ?
        await convertMessage(quoted, client, workspaceDir, { includeQuote: false })
      : { text: '[引用消息获取失败]', attachments: [] };

    attachments.push(...quotedConverted.attachments);

    const sender = escapeXml(quoted?.senderName ?? quoted?.senderId ?? '未知发送者');
    const time = escapeXml(formatMessageTime(quoted?.createTime));
    const quotedText = escapeXml(quotedConverted.text || '[空消息]');

    parts.push(
      `<quoted_message sender="${sender}" time="${time}">\n${quotedText}\n</quoted_message>`
    );
  }

  const convertedBody = await convertMessageBody(message, client, workspaceDir);
  attachments.push(...convertedBody.attachments);

  if (convertedBody.text) {
    parts.push(convertedBody.text);
  }

  return {
    text: parts.join('\n\n'),
    attachments
  };
}

async function convertMessageBody(
  message: MessageLike,
  client: lark.Client,
  workspaceDir: string
): Promise<ConvertedMessage> {
  const parsedContent = parseMessageContent(message.content);

  switch (message.msgType) {
    case 'text':
      return {
        text: replaceMentions(resolveTextContent(parsedContent, message.content), message.mentions),
        attachments: []
      };
    case 'post':
      return convertPostMessage(message, parsedContent, client, workspaceDir);
    case 'image':
      return convertImageMessage(message, parsedContent, client, workspaceDir);
    case 'file':
      return convertFileMessage(message, parsedContent, client, workspaceDir);
    case 'media':
      return convertMediaMessage(message, parsedContent, client, workspaceDir);
    case 'share_chat':
      return {
        text: formatSharedChat(parsedContent),
        attachments: []
      };
    case 'share_user':
      return {
        text: formatSharedUser(parsedContent),
        attachments: []
      };
    case 'merge_forward':
      return convertMergeForwardMessage(message, parsedContent, client, workspaceDir);
    case 'location':
      return {
        text: formatLocation(parsedContent),
        attachments: []
      };
    case 'audio':
      return {
        text: '暂不支持语音消息，请发送文字',
        attachments: []
      };
    case 'sticker':
      return {
        text: '',
        attachments: []
      };
    default:
      return {
        text: fallbackTextFromParsedContent(parsedContent, message.content, message.msgType),
        attachments: []
      };
  }
}

async function convertPostMessage(
  message: MessageLike,
  parsedContent: unknown,
  client: lark.Client,
  workspaceDir: string
): Promise<ConvertedMessage> {
  const attachments: SavedAttachmentInfo[] = [];
  const localePayload = resolvePostLocalePayload(parsedContent);
  const title = getString(localePayload, 'title');
  const paragraphs = getArray(localePayload, 'content');
  const renderedParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    const tags = Array.isArray(paragraph) ? paragraph : [];
    const renderedTags: string[] = [];

    for (const tag of tags) {
      const rendered = await renderPostTag(message, tag, client, workspaceDir);
      if (rendered.text) {
        renderedTags.push(rendered.text);
      }
      attachments.push(...rendered.attachments);
    }

    const paragraphText = renderedTags.join('');
    if (paragraphText) {
      renderedParagraphs.push(paragraphText);
    }
  }

  const parts: string[] = [];
  if (title) {
    parts.push(escapeMarkdown(title));
  }
  if (renderedParagraphs.length > 0) {
    parts.push(renderedParagraphs.join('\n'));
  }

  return {
    text: parts.join('\n\n'),
    attachments
  };
}

async function renderPostTag(
  message: MessageLike,
  tagValue: unknown,
  client: lark.Client,
  workspaceDir: string
): Promise<ConvertedMessage> {
  if (!isRecord(tagValue)) {
    return { text: '', attachments: [] };
  }

  const tag = getString(tagValue, 'tag');
  if (!tag) {
    return { text: '', attachments: [] };
  }

  switch (tag) {
    case 'text': {
      const rawText = replaceMentions(getString(tagValue, 'text'), message.mentions);
      return {
        text: applyTextStyles(rawText, getStyleValue(tagValue)),
        attachments: []
      };
    }
    case 'a': {
      const text = escapeMarkdown(
        getString(tagValue, 'text') || getString(tagValue, 'href') || '链接'
      );
      const href = escapeMarkdown(getString(tagValue, 'href') || '');
      return { text: href ? `[${text}](${href})` : text, attachments: [] };
    }
    case 'at': {
      const name = escapeMarkdown(
        getString(tagValue, 'text') || getString(tagValue, 'name') || '未知用户'
      );
      const userId =
        resolveUserIdentifier(getUnknown(tagValue, 'user_id')) ||
        resolveUserIdentifier(getUnknown(tagValue, 'userId')) ||
        getString(tagValue, 'open_id') ||
        getString(tagValue, 'user_id') ||
        getString(tagValue, 'id') ||
        'unknown';
      return {
        text: `[${name}](${userId})`,
        attachments: []
      };
    }
    case 'img': {
      const imageKey =
        getString(tagValue, 'image_key') ||
        getString(tagValue, 'file_key') ||
        getString(tagValue, 'imageKey');
      if (!imageKey || !message.messageId) {
        return { text: '[图片]', attachments: [] };
      }

      const downloaded = await downloadMessageResource(
        client,
        workspaceDir,
        message.messageId,
        imageKey,
        'image',
        getString(tagValue, 'image_name') || getString(tagValue, 'file_name') || 'image.png'
      );

      return {
        text: `[图片]`,
        attachments: [downloaded.attachment]
      };
    }
    case 'code_block': {
      const language =
        getString(tagValue, 'language') ||
        getString(tagValue, 'lang') ||
        getString(tagValue, 'code_language');
      const code =
        getString(tagValue, 'text') ||
        getString(tagValue, 'code') ||
        collectTextFromUnknown(getUnknown(tagValue, 'content')) ||
        '';
      const fence = language ? `\`\`\`${language}` : '```';
      return {
        text: `${fence}\n${code}\n\`\`\``,
        attachments: []
      };
    }
    case 'emotion': {
      const emotionName =
        getString(tagValue, 'emoji_type') ||
        getString(tagValue, 'emoji_name') ||
        getString(tagValue, 'text') ||
        'emotion';
      return {
        text: `:${escapeMarkdown(emotionName)}:`,
        attachments: []
      };
    }
    case 'hr':
      return {
        text: '\n---\n',
        attachments: []
      };
    default:
      return {
        text: collectTextFromUnknown(tagValue),
        attachments: []
      };
  }
}

async function convertImageMessage(
  message: MessageLike,
  parsedContent: unknown,
  client: lark.Client,
  workspaceDir: string
): Promise<ConvertedMessage> {
  const imageKey =
    getString(parsedContent, 'image_key') ||
    getString(parsedContent, 'file_key') ||
    getString(parsedContent, 'imageKey');

  if (!imageKey || !message.messageId) {
    return { text: '[图片]', attachments: [] };
  }

  const downloaded = await downloadMessageResource(
    client,
    workspaceDir,
    message.messageId,
    imageKey,
    'image',
    getString(parsedContent, 'image_name') || getString(parsedContent, 'file_name') || 'image.png'
  );

  return {
    text: '[图片]',
    attachments: [downloaded.attachment]
  };
}

async function convertFileMessage(
  message: MessageLike,
  parsedContent: unknown,
  client: lark.Client,
  workspaceDir: string
): Promise<ConvertedMessage> {
  const fileKey =
    getString(parsedContent, 'file_key') ||
    getString(parsedContent, 'fileKey') ||
    getString(parsedContent, 'key');
  const originalName =
    getString(parsedContent, 'file_name') || getString(parsedContent, 'name') || 'file';

  if (!fileKey || !message.messageId) {
    return { text: `[文件] ${escapeMarkdown(originalName)}`, attachments: [] };
  }

  const downloaded = await downloadMessageResource(
    client,
    workspaceDir,
    message.messageId,
    fileKey,
    'file',
    originalName
  );

  return {
    text: `[文件] ${escapeMarkdown(downloaded.originalName)}`,
    attachments: [downloaded.attachment]
  };
}

async function convertMediaMessage(
  message: MessageLike,
  parsedContent: unknown,
  client: lark.Client,
  workspaceDir: string
): Promise<ConvertedMessage> {
  const fileKey =
    getString(parsedContent, 'file_key') ||
    getString(parsedContent, 'media_key') ||
    getString(parsedContent, 'fileKey') ||
    getString(parsedContent, 'mediaKey');
  const originalName =
    getString(parsedContent, 'file_name') ||
    getString(parsedContent, 'media_name') ||
    getString(parsedContent, 'name') ||
    'media';

  if (!fileKey || !message.messageId) {
    return { text: `[视频] ${escapeMarkdown(originalName)}`, attachments: [] };
  }

  const downloaded = await downloadMessageResource(
    client,
    workspaceDir,
    message.messageId,
    fileKey,
    'media',
    originalName
  );

  return {
    text: `[视频] ${escapeMarkdown(downloaded.originalName)}`,
    attachments: [downloaded.attachment]
  };
}

async function convertMergeForwardMessage(
  message: MessageLike,
  parsedContent: unknown,
  client: lark.Client,
  workspaceDir: string
): Promise<ConvertedMessage> {
  const attachments: SavedAttachmentInfo[] = [];
  const children = await resolveMergeForwardChildren(message, parsedContent, client);
  if (children.length === 0) {
    return { text: '[合并转发消息]', attachments: [] };
  }

  const sortedChildren = [...children].sort((left, right) => {
    const leftTime = parseTimestamp(left.createTime);
    const rightTime = parseTimestamp(right.createTime);
    return leftTime - rightTime;
  });

  const blocks: string[] = [];

  for (const child of sortedChildren) {
    const converted = await convertMessage(child, client, workspaceDir, { includeQuote: false });
    attachments.push(...converted.attachments);

    const sender = escapeMarkdown(child.senderName ?? child.senderId ?? '未知发送者');
    const time = formatTimeOnly(child.createTime);
    const body =
      converted.text ||
      fallbackTextFromParsedContent(
        parseMessageContent(child.content),
        child.content,
        child.msgType
      );

    const lines = body.split('\n');
    blocks.push(`> **${sender}** (${time}):\n${lines.map((line) => `> ${line}`).join('\n')}`);
  }

  return {
    text: blocks.join('\n>\n'),
    attachments
  };
}

async function resolveMergeForwardChildren(
  message: MessageLike,
  parsedContent: unknown,
  client: lark.Client
): Promise<MessageLike[]> {
  const embeddedMessages = extractEmbeddedMessages(parsedContent);
  if (embeddedMessages.length > 0) {
    return embeddedMessages;
  }

  const messageIds = extractMergeForwardMessageIds(parsedContent);
  if (messageIds.length > 0) {
    const fetchedMessages = await Promise.all(
      messageIds.map(async (messageId) => fetchMessageById(client, messageId))
    );
    return fetchedMessages.filter((value): value is MessageLike => value !== null);
  }

  if (!message.messageId) {
    return [];
  }

  const fallbackMessages = await fetchMessageItems(client, message.messageId);
  return fallbackMessages.filter((item) => item.messageId && item.messageId !== message.messageId);
}

async function fetchMessageItems(client: lark.Client, messageId: string): Promise<MessageLike[]> {
  const response = await client.im.v1.message.get({
    path: { message_id: messageId },
    params: { user_id_type: 'open_id' }
  });

  const items = response.data?.items;
  if (!items) {
    return [];
  }

  return items
    .map((item) => apiMessageToMessageLike(item))
    .filter((value): value is MessageLike => value !== null);
}

async function fetchMessageById(
  client: lark.Client,
  messageId: string
): Promise<MessageLike | null> {
  const items = await fetchMessageItems(client, messageId);
  return items[0] ?? null;
}

async function downloadMessageResource(
  client: lark.Client,
  workspaceDir: string,
  messageId: string,
  resourceKey: string,
  resourceType: 'image' | 'file' | 'media',
  suggestedName: string
): Promise<DownloadedResource> {
  const attachmentsDir = join(workspaceDir, ATTACHMENTS_DIR_NAME);
  await mkdir(attachmentsDir, { recursive: true });

  const sanitizedDisplayName = sanitizeFileName(suggestedName);
  const fallbackName = ensureFileExtension(sanitizedDisplayName, resourceType, undefined);
  const savedPath = await allocateAttachmentPath(attachmentsDir, fallbackName);

  try {
    const resource = await getDownloadResponse(client, messageId, resourceKey, resourceType);
    await resource.writeFile(savedPath);

    const fileInfo = await stat(savedPath);
    if (fileInfo.size > MAX_ATTACHMENT_BYTES) {
      await unlink(savedPath).catch(() => {});
      throw new Error(
        `Attachment "${suggestedName}" exceeds the ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB limit.`
      );
    }

    const headers = resource.headers;
    const originalName =
      parseContentDispositionFileName(getHeaderValue(headers, 'content-disposition')) ||
      suggestedName ||
      basename(savedPath);
    const mimeType =
      getHeaderValue(headers, 'content-type') || inferMimeType(savedPath, resourceType);
    const relativePath = relative(workspaceDir, savedPath);

    const attachment: SavedAttachmentInfo = {
      name: originalName,
      mimeType,
      size: fileInfo.size,
      savedPath,
      relativePath: relativePath.startsWith('..') ? savedPath : relativePath
    };

    return { attachment, originalName };
  } catch (error) {
    await unlink(savedPath).catch(() => {});
    throw error;
  }
}

async function getDownloadResponse(
  client: lark.Client,
  messageId: string,
  resourceKey: string,
  resourceType: 'image' | 'file' | 'media'
): Promise<{
  writeFile: (filePath: string) => Promise<unknown>;
  headers: unknown;
}> {
  try {
    return await client.im.v1.messageResource.get({
      path: {
        message_id: messageId,
        file_key: resourceKey
      },
      params: {
        type: resourceType
      }
    });
  } catch {
    switch (resourceType) {
      case 'image':
        return client.im.v1.image.get({
          path: {
            image_key: resourceKey
          }
        });
      case 'file':
        try {
          return await client.im.v1.file.get({
            path: {
              file_key: resourceKey
            }
          });
        } catch {
          return client.drive.v1.file.download({
            path: {
              file_token: resourceKey
            }
          });
        }
      case 'media':
        return client.drive.v1.media.download({
          path: {
            file_token: resourceKey
          }
        });
    }
  }
}

async function allocateAttachmentPath(directory: string, fileName: string): Promise<string> {
  const parsedName = sanitizeFileName(fileName);
  const extension = extname(parsedName);
  const stem = extension ? parsedName.slice(0, -extension.length) : parsedName;

  let candidate = join(directory, parsedName);
  let index = 1;

  while (await pathExists(candidate)) {
    candidate = join(directory, `${stem} (${index})${extension}`);
    index += 1;
  }

  return candidate;
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue);
    return true;
  } catch {
    return false;
  }
}

function parseMessageContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function resolveTextContent(parsedContent: unknown, rawContent: string): string {
  const extractedText = getString(parsedContent, 'text');
  if (extractedText) {
    return extractedText;
  }
  if (typeof parsedContent === 'string') {
    return parsedContent;
  }
  return rawContent;
}

function replaceMentions(text: string | undefined, mentions: MentionLike[]): string {
  let next = text || '';
  for (const mention of mentions) {
    const id = mention.id || 'unknown';
    next = next.split(mention.key).join(`[${escapeMarkdown(mention.name)}](${id})`);
  }
  return next;
}

function formatSharedChat(parsedContent: unknown): string {
  const name = escapeMarkdown(
    getString(parsedContent, 'chat_name') ||
      getString(parsedContent, 'chatName') ||
      getString(parsedContent, 'name') ||
      '群聊'
  );
  const chatId =
    getString(parsedContent, 'chat_id') || getString(parsedContent, 'chatId') || 'unknown';
  return `[${name}](chat_id: ${chatId})`;
}

function formatSharedUser(parsedContent: unknown): string {
  const name = escapeMarkdown(
    getString(parsedContent, 'user_name') ||
      getString(parsedContent, 'userName') ||
      getString(parsedContent, 'name') ||
      '用户'
  );
  const userId =
    resolveUserIdentifier(getUnknown(parsedContent, 'user_id')) ||
    resolveUserIdentifier(getUnknown(parsedContent, 'userId')) ||
    getString(parsedContent, 'open_id') ||
    getString(parsedContent, 'user_id') ||
    getString(parsedContent, 'userId') ||
    'unknown';
  return `[${name}](user_id: ${userId})`;
}

function formatLocation(parsedContent: unknown): string {
  const locationName =
    getString(parsedContent, 'name') ||
    getString(parsedContent, 'title') ||
    getString(parsedContent, 'location_name') ||
    '未知地点';
  const longitude = getNumberString(parsedContent, 'longitude') || 'unknown';
  const latitude = getNumberString(parsedContent, 'latitude') || 'unknown';
  return `位置: ${locationName} (${longitude}, ${latitude})`;
}

function fallbackTextFromParsedContent(
  parsedContent: unknown,
  rawContent: string,
  msgType: string
): string {
  const text = collectTextFromUnknown(parsedContent);
  if (text) {
    return text;
  }
  if (rawContent) {
    return rawContent;
  }
  return `[${msgType}]`;
}

function resolvePostLocalePayload(parsedContent: unknown): JsonObject {
  if (isRecord(parsedContent)) {
    if (Array.isArray(parsedContent.content)) {
      return parsedContent;
    }

    const preferredKeys = ['zh_cn', 'en_us', 'ja_jp'];
    for (const key of preferredKeys) {
      const nested = getRecord(parsedContent, key);
      if (nested && Array.isArray(nested.content)) {
        return nested;
      }
    }

    for (const value of Object.values(parsedContent)) {
      if (isRecord(value) && Array.isArray(value.content)) {
        return value;
      }
    }
  }

  return {};
}

function applyTextStyles(text: string, styleValue: unknown): string {
  let next = escapeMarkdown(text);
  if (!next) {
    return next;
  }

  if (hasStyle(styleValue, 'bold')) {
    next = `**${next}**`;
  }
  if (hasStyle(styleValue, 'italic')) {
    next = `*${next}*`;
  }
  if (
    hasStyle(styleValue, 'lineThrough') ||
    hasStyle(styleValue, 'line_through') ||
    hasStyle(styleValue, 'strikethrough')
  ) {
    next = `~~${next}~~`;
  }
  return next;
}

function getStyleValue(tag: JsonObject): unknown {
  if ('style' in tag) {
    return tag.style;
  }
  if ('styles' in tag) {
    return tag.styles;
  }
  return undefined;
}

function hasStyle(styleValue: unknown, styleName: string): boolean {
  if (Array.isArray(styleValue)) {
    return styleValue.some(
      (value) =>
        typeof value === 'string' && normalizeStyleName(value) === normalizeStyleName(styleName)
    );
  }
  if (isRecord(styleValue)) {
    for (const [key, value] of Object.entries(styleValue)) {
      if (normalizeStyleName(key) === normalizeStyleName(styleName) && Boolean(value)) {
        return true;
      }
    }
  }
  return false;
}

function normalizeStyleName(value: string): string {
  return value.replace(/[_-]/g, '').toLowerCase();
}

function extractEmbeddedMessages(parsedContent: unknown): MessageLike[] {
  const container = isRecord(parsedContent) ? parsedContent : undefined;
  if (!container) {
    return [];
  }

  const candidateKeys = ['message_list', 'messageList', 'messages', 'items'];
  for (const key of candidateKeys) {
    const items = getArray(container, key);
    if (items.length > 0) {
      return items
        .map((item) => embeddedMessageToMessageLike(item))
        .filter((value): value is MessageLike => value !== null);
    }
  }

  return [];
}

function extractMergeForwardMessageIds(parsedContent: unknown): string[] {
  const container = isRecord(parsedContent) ? parsedContent : undefined;
  if (!container) {
    return [];
  }

  const candidateKeys = ['message_id_list', 'messageIdList', 'message_ids', 'messageIds'];
  for (const key of candidateKeys) {
    const values = getArray(container, key)
      .map((value) => (typeof value === 'string' ? value : undefined))
      .filter((value): value is string => Boolean(value));
    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function embeddedMessageToMessageLike(value: unknown): MessageLike | null {
  if (!isRecord(value)) {
    return null;
  }

  const sender = getRecord(value, 'sender');
  const senderName =
    getString(value, 'sender_name') ||
    getString(value, 'senderName') ||
    getString(sender, 'name') ||
    undefined;

  return {
    messageId: getString(value, 'message_id') || getString(value, 'messageId'),
    parentId: getString(value, 'parent_id') || getString(value, 'parentId'),
    createTime: getString(value, 'create_time') || getString(value, 'createTime'),
    deleted: getBoolean(value, 'deleted'),
    msgType:
      getString(value, 'msg_type') ||
      getString(value, 'message_type') ||
      getString(value, 'messageType') ||
      'text',
    content:
      getString(getRecord(value, 'body'), 'content') ||
      getString(value, 'content') ||
      JSON.stringify(value),
    mentions: normalizeApiMentions(getUnknown(value, 'mentions')),
    senderName,
    senderId:
      resolveUserIdentifier(getUnknown(sender, 'id')) ||
      getString(sender, 'id') ||
      resolveUserIdentifier(getUnknown(value, 'sender_id')) ||
      getString(value, 'sender_id') ||
      undefined
  };
}

function feishuEventToMessageLike(data: FeishuMessageEvent): MessageLike {
  return {
    messageId: data.message.message_id,
    parentId: data.message.parent_id,
    createTime: data.message.create_time,
    deleted: false,
    msgType: data.message.message_type,
    content: data.message.content,
    mentions: data.message.mentions?.map(mapEventMention) ?? [],
    senderId: resolveUserIdentifier(data.sender.sender_id),
    senderName: undefined
  };
}

function apiMessageToMessageLike(value: unknown): MessageLike | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    messageId: getString(value, 'message_id'),
    parentId: getString(value, 'parent_id'),
    createTime: getString(value, 'create_time'),
    deleted: getBoolean(value, 'deleted'),
    msgType: getString(value, 'msg_type') || 'text',
    content: getString(getRecord(value, 'body'), 'content') || '',
    mentions: normalizeApiMentions(getUnknown(value, 'mentions')),
    senderId: resolveUserIdentifier(getUnknown(getRecord(value, 'sender'), 'id')),
    senderName: undefined
  };
}

function mapEventMention(mention: FeishuMessageEventMention): MentionLike {
  return {
    key: mention.key,
    name: mention.name,
    id: resolveUserIdentifier(mention.id)
  };
}

function normalizeApiMentions(value: unknown): MentionLike[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const mentions: MentionLike[] = [];

  for (const mention of value) {
    if (!isRecord(mention)) {
      continue;
    }

    const key = getString(mention, 'key');
    if (!key) {
      continue;
    }

    mentions.push({
      key,
      name: getString(mention, 'name') || '未知用户',
      id: resolveUserIdentifier(getUnknown(mention, 'id')) || getString(mention, 'id')
    });
  }

  return mentions;
}

function resolveUserIdentifier(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  return getString(value, 'open_id') || getString(value, 'user_id') || getString(value, 'union_id');
}

function formatMessageTime(value?: string): string {
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return value || '未知时间';
  }

  const date = new Date(timestamp);
  return (
    [date.getFullYear(), padNumber(date.getMonth() + 1), padNumber(date.getDate())].join('-') +
    ` ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
  );
}

function formatTimeOnly(value?: string): string {
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '--:--';
  }

  const date = new Date(timestamp);
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function parseTimestamp(value?: string): number {
  if (!value) {
    return Number.NaN;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return value.length <= 10 ? numeric * 1000 : numeric;
}

function padNumber(value: number): string {
  return value.toString().padStart(2, '0');
}

function ensureFileExtension(
  fileName: string,
  resourceType: 'image' | 'file' | 'media',
  mimeType: string | undefined
): string {
  if (extname(fileName)) {
    return fileName;
  }

  const extension =
    extensionFromMimeType(mimeType) ||
    (resourceType === 'image' ? '.png'
    : resourceType === 'media' ? '.mp4'
    : '');

  return `${fileName}${extension}`;
}

function extensionFromMimeType(mimeType: string | undefined): string | undefined {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/bmp':
      return '.bmp';
    case 'image/tiff':
      return '.tiff';
    case 'image/x-icon':
      return '.ico';
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    case 'application/pdf':
      return '.pdf';
    case 'text/plain':
      return '.txt';
    default:
      return undefined;
  }
}

function inferMimeType(savedPath: string, resourceType: 'image' | 'file' | 'media'): string {
  const extension = extname(savedPath).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.tiff':
      return 'image/tiff';
    case '.ico':
      return 'image/x-icon';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.pdf':
      return 'application/pdf';
    case '.txt':
      return 'text/plain';
    default:
      return (
        resourceType === 'image' ? 'image/png'
        : resourceType === 'media' ? 'video/mp4'
        : 'application/octet-stream'
      );
  }
}

function parseContentDispositionFileName(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(headerValue);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = /filename=([^;]+)/i.exec(headerValue);
  return plainMatch?.[1]?.trim();
}

function getHeaderValue(headers: unknown, name: string): string | undefined {
  if (!isRecord(headers)) {
    return undefined;
  }

  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  if (!entry) {
    return undefined;
  }

  const value = entry[1];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const stringValue = value.find((item) => typeof item === 'string');
    return typeof stringValue === 'string' ? stringValue : undefined;
  }
  return undefined;
}

function collectTextFromUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => collectTextFromUnknown(item))
      .filter(Boolean)
      .join(' ');
  }
  if (isRecord(value)) {
    const preferredKeys = ['text', 'name', 'title', 'content', 'code'];
    for (const key of preferredKeys) {
      const collected = collectTextFromUnknown(value[key]);
      if (collected) {
        return collected;
      }
    }
  }
  return '';
}

function getUnknown(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function getRecord(value: unknown, key: string): JsonObject | undefined {
  const next = getUnknown(value, key);
  return isRecord(next) ? next : undefined;
}

function getString(value: unknown, key: string): string | undefined {
  const next = getUnknown(value, key);
  return typeof next === 'string' ? next : undefined;
}

function getBoolean(value: unknown, key: string): boolean | undefined {
  const next = getUnknown(value, key);
  return typeof next === 'boolean' ? next : undefined;
}

function getNumberString(value: unknown, key: string): string | undefined {
  const next = getUnknown(value, key);
  if (typeof next === 'string' || typeof next === 'number') {
    return String(next);
  }
  return undefined;
}

function getArray(value: unknown, key: string): unknown[] {
  const next = getUnknown(value, key);
  return Array.isArray(next) ? next : [];
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
