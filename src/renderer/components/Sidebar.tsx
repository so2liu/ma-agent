import { Clock, MessageSquare, Plus, Settings, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Conversation } from '@/electron';

import AppPanel from './AppPanel';
import FileTree from './FileTree';

const truncateText = (text: string, maxLength: number = 60) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
};

interface SidebarProps {
  onLoadConversation: (conversationId: string) => void;
  currentConversationId: string | null;
  onNewChat: () => void | Promise<void>;
  onFileSelect: (path: string) => void;
  selectedFilePath: string | null;
  onSettingsClick?: () => void;
  onSkillsClick?: () => void;
}

export default function Sidebar({
  onLoadConversation,
  currentConversationId,
  onNewChat,
  onFileSelect,
  selectedFilePath,
  onSettingsClick,
  onSkillsClick
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(undefined, { numeric: 'always' }),
    []
  );

  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await window.electron.conversation.list();
      if (response.success && response.conversations) {
        setConversations(response.conversations);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Reload conversations when currentConversationId changes (new conversation created)
  useEffect(() => {
    if (currentConversationId) {
      loadConversations();
    }
  }, [currentConversationId, loadConversations]);

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    try {
      const response = await window.electron.conversation.delete(conversationId);
      if (response.success) {
        await loadConversations();
        if (conversationId === currentConversationId) {
          await onNewChat();
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const conversationPreviews = useMemo(() => {
    return conversations.reduce<Record<string, string>>((acc, conversation) => {
      try {
        const parsed = JSON.parse(conversation.messages) as Array<{
          role: string;
          content: string | { type: string; text?: string }[];
        }>;
        let lastUserMessage: (typeof parsed)[0] | undefined;
        for (let i = parsed.length - 1; i >= 0; i--) {
          if (parsed[i].role === 'user') {
            lastUserMessage = parsed[i];
            break;
          }
        }
        if (lastUserMessage) {
          if (typeof lastUserMessage.content === 'string') {
            acc[conversation.id] = truncateText(lastUserMessage.content);
          } else if (Array.isArray(lastUserMessage.content)) {
            const textBlock = lastUserMessage.content.find(
              (block) => typeof block === 'object' && block !== null && 'text' in block
            );
            if (textBlock && typeof textBlock === 'object' && 'text' in textBlock) {
              acc[conversation.id] =
                typeof textBlock.text === 'string' ? truncateText(textBlock.text) : '';
            }
          }
        }
      } catch {
        acc[conversation.id] = '';
      }
      acc[conversation.id] = acc[conversation.id] || 'Continue this conversation...';
      return acc;
    }, {});
  }, [conversations]);

  const formatRelativeDate = useCallback(
    (timestamp: number) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return '';

      const diffMs = Date.now() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      if (diffMinutes < 60) {
        return relativeTimeFormatter.format(-Math.max(1, diffMinutes), 'minute');
      }
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        return relativeTimeFormatter.format(-diffHours, 'hour');
      }
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) {
        return relativeTimeFormatter.format(-diffDays, 'day');
      }
      if (diffDays < 30) {
        return relativeTimeFormatter.format(-Math.floor(diffDays / 7), 'week');
      }
      const months = Math.floor(diffDays / 30);
      if (months < 12) {
        return relativeTimeFormatter.format(-months, 'month');
      }
      return relativeTimeFormatter.format(-Math.floor(months / 12), 'year');
    },
    [relativeTimeFormatter]
  );

  return (
    <div className="flex h-full flex-col border-r border-neutral-200/70 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/50">
      {/* Drag region for macOS traffic lights */}
      <div className="h-7 shrink-0 [-webkit-app-region:drag]" />

      {/* Brand */}
      <div className="shrink-0 px-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xl" role="img" aria-label="horse">🐴</span>
          <span className="select-none text-base font-bold text-neutral-800 dark:text-neutral-100">
            小马快跑
          </span>
        </div>
      </div>

      {/* Conversation History */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pb-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
            Chats
          </span>
          <button
            onClick={() => onNewChat()}
            className="rounded p-0.5 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="New chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 pb-1">
          {isLoading ?
            <div className="px-2 py-4 text-center text-xs text-neutral-400">Loading...</div>
          : conversations.length === 0 ?
            <div className="flex flex-col items-center gap-1 px-2 py-6 text-center">
              <MessageSquare className="h-4 w-4 text-neutral-300 dark:text-neutral-600" />
              <p className="text-xs text-neutral-400 dark:text-neutral-500">No conversations</p>
            </div>
          : conversations.map((conversation) => {
              const isActive = conversation.id === currentConversationId;
              return (
                <div
                  key={conversation.id}
                  onClick={() => onLoadConversation(conversation.id)}
                  className={`group mb-0.5 cursor-pointer rounded-lg px-2 py-1.5 transition-colors ${
                    isActive ?
                      'bg-white shadow-sm dark:bg-neutral-800'
                    : 'hover:bg-white/60 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
                        {conversation.title}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                        {conversationPreviews[conversation.id]}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{formatRelativeDate(conversation.updatedAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, conversation.id)}
                      className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>

      {/* Apps Panel */}
      <div className="border-t border-neutral-200/70 dark:border-neutral-800">
        <AppPanel />
      </div>

      {/* File Tree - bottom section */}
      <div
        className="flex min-h-[200px] flex-col border-t border-neutral-200/70 dark:border-neutral-800"
        style={{ flex: '0 0 40%' }}
      >
        <FileTree onFileSelect={onFileSelect} selectedPath={selectedFilePath} />
      </div>

      {/* Bottom bar - Skills & Settings */}
      <div className="flex shrink-0 items-center justify-between border-t border-neutral-200/70 px-2 py-1.5 dark:border-neutral-800">
        <button
          onClick={onSkillsClick}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-500 transition hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          title="Skill 精选"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Skill 精选</span>
        </button>
        <button
          onClick={onSettingsClick}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          title="设置"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
