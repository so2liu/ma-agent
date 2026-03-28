import * as lark from '@larksuiteoapi/node-sdk';

const DEFAULT_EMPTY_REPLY = '（无回复内容）';
const DEFAULT_TYPING_EMOJI = 'OnIt';
const FEISHU_TEXT_LIMIT = 4000;

export class FeishuReplier {
  private readonly reactionIdsByMessageId = new Map<string, string>();

  constructor(private readonly client: lark.Client) {}

  async addTypingReaction(messageId: string): Promise<void> {
    try {
      const response = await this.client.im.v1.messageReaction.create({
        path: {
          message_id: messageId
        },
        data: {
          reaction_type: {
            emoji_type: DEFAULT_TYPING_EMOJI
          }
        }
      });

      const reactionId = response.data?.reaction_id;
      if (reactionId) {
        this.reactionIdsByMessageId.set(messageId, reactionId);
      }
    } catch {
      // Best-effort only.
    }
  }

  async removeTypingReaction(messageId: string): Promise<void> {
    const reactionId = this.reactionIdsByMessageId.get(messageId);
    if (!reactionId) {
      return;
    }

    try {
      await this.client.im.v1.messageReaction.delete({
        path: {
          message_id: messageId,
          reaction_id: reactionId
        }
      });
    } catch {
      return;
    } finally {
      this.reactionIdsByMessageId.delete(messageId);
    }
  }

  async reply(messageId: string, chatId: string, text: string): Promise<void> {
    const chunks = splitReplyText(normalizeReplyText(text));
    const [firstChunk, ...restChunks] = chunks;

    await this.client.im.v1.message.reply({
      path: {
        message_id: messageId
      },
      data: {
        msg_type: 'text',
        content: serializeTextContent(firstChunk)
      }
    });

    for (const chunk of restChunks) {
      await this.client.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id'
        },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: serializeTextContent(chunk)
        }
      });
    }
  }

  async sendError(chatId: string, error: string): Promise<void> {
    await this.client.im.v1.message.create({
      params: {
        receive_id_type: 'chat_id'
      },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: serializeTextContent(normalizeReplyText(error))
      }
    });
  }
}

function normalizeReplyText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n');
  return normalized.trim().length > 0 ? normalized : DEFAULT_EMPTY_REPLY;
}

function serializeTextContent(text: string): string {
  return JSON.stringify({ text });
}

function splitReplyText(text: string): string[] {
  if (text.length <= FEISHU_TEXT_LIMIT) {
    return [text];
  }

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      continue;
    }

    if (paragraph.length > FEISHU_TEXT_LIMIT) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      chunks.push(...splitLongParagraph(paragraph));
      continue;
    }

    const nextChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    if (nextChunk.length <= FEISHU_TEXT_LIMIT) {
      currentChunk = nextChunk;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }
    currentChunk = paragraph;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [DEFAULT_EMPTY_REPLY];
}

function splitLongParagraph(paragraph: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < paragraph.length) {
    chunks.push(paragraph.slice(start, start + FEISHU_TEXT_LIMIT));
    start += FEISHU_TEXT_LIMIT;
  }

  return chunks;
}
