import { useCallback, useEffect, useReducer } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { BackgroundTask } from '../../shared/types/background-task';
import type { Message } from '@/types/chat';
import {
  getChatStateSnapshot,
  getOrCreateState,
  type ActiveRetryStatus,
  setChatLoading,
  setChatMessages,
  subscribeToChat
} from '@/stores/chatStore';

export function useClaudeChat(chatId: string | null): {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  backgroundTasks: Map<string, BackgroundTask>;
  retryStatus: ActiveRetryStatus | null;
  sessionId: string | null;
} {
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (!chatId) {
      return;
    }

    getOrCreateState(chatId);
    return subscribeToChat(chatId, forceUpdate);
  }, [chatId]);

  const state = chatId ? getChatStateSnapshot(chatId) : null;

  const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>(
    (value) => {
      if (!chatId) {
        return;
      }

      setChatMessages(chatId, value);
    },
    [chatId]
  );

  const setIsLoading = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      if (!chatId) {
        return;
      }

      setChatLoading(chatId, value);
    },
    [chatId]
  );

  return {
    messages: state?.messages ?? [],
    setMessages,
    isLoading: state?.isLoading ?? false,
    setIsLoading,
    backgroundTasks: state?.backgroundTasks ?? new Map(),
    retryStatus: state?.retryStatus ?? null,
    sessionId: state?.sessionId ?? null
  };
}
