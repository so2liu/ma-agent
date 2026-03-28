import { FolderOpen, Globe } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import { Group, Panel } from 'react-resizable-panels';

import AppPanel from '@/components/AppPanel';
import type { Artifact } from '@/components/ArtifactPanel';
import CanvasChangeAttachment from '@/components/CanvasChangeAttachment';
import ChatInput from '@/components/ChatInput';
import type { WorkspaceTab } from '@/components/TabBar';
import WorkspacePanel from '@/components/WorkspacePanel';
import DropZoneOverlay from '@/components/DropZoneOverlay';
import FileTree from '@/components/FileTree';
import BackgroundTaskIndicator from '@/components/BackgroundTaskIndicator';
import CodingTaskPanel from '@/components/CodingTaskPanel';
import FloatingTaskPanel from '@/components/FloatingTaskPanel';
import MessageList from '@/components/MessageList';
import ResizeHandle from '@/components/ResizeHandle';
import SkillCardGrid from '@/components/SkillCardGrid';
import DragRegion from '@/components/TitleBar';
import type { AppInfo } from '@/electron';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useCanvasChanges } from '@/hooks/useCanvasChanges';
import { useClaudeChat } from '@/hooks/useClaudeChat';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  getChatIdForConversation,
  registerConversationMapping,
  replaceChatState,
  serializeMessagesForStorage
} from '@/stores/chatStore';
import type { Message, MessageAttachment } from '@/types/chat';
import { extractArtifacts } from '@/utils/artifacts';
import { suggestPromptForFiles } from '@/utils/filePromptSuggestion';
import { classifyError } from '@/utils/friendlyError';

import { MAX_ATTACHMENT_BYTES } from '../../shared/constants';
import { getArtifactType, getFileExtension } from '../../shared/file-extensions';
import type {
  ChatModelPreference,
  CustomModelIds,
  SerializedAttachmentPayload
} from '../../shared/types/ipc';

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  previewIsBlobUrl?: boolean;
  isImage: boolean;
}

const MAX_ATTACHMENT_SIZE_MB = Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024));
const WORKSPACE_FALLBACK_LABEL = '已配置的 ma-agent 工作目录';
const IMAGE_FILE_EXTENSIONS = new Set([
  'png',
  'apng',
  'avif',
  'gif',
  'jpg',
  'jpeg',
  'jfif',
  'pjpeg',
  'pjp',
  'svg',
  'webp',
  'bmp',
  'ico',
  'cur',
  'heic',
  'heif',
  'tif',
  'tiff'
]);

function releaseAttachmentPreviews(attachments: PendingAttachment[]): void {
  attachments.forEach((attachment) => {
    if (attachment.previewUrl && attachment.previewIsBlobUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });
}

function isLikelyImageFile(file: File): boolean {
  if (file.type?.startsWith('image/')) return true;
  const extension = file.name?.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_FILE_EXTENSIONS.has(extension);
}

async function createImagePreview(file: File): Promise<{ url: string; isBlob: boolean } | null> {
  try {
    const dataUrl = await readFileAsDataUrl(file);
    return dataUrl ? { url: dataUrl, isBlob: false } : null;
  } catch {
    try {
      return { url: URL.createObjectURL(file), isBlob: true };
    } catch {
      return null;
    }
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Invalid preview data'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

export interface ChatHandle {
  loadConversation: (id: string) => Promise<void>;
  newChat: () => Promise<void>;
  isLoading: () => boolean;
  setInput: (text: string) => void;
}

interface ChatProps {
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  onOpenDbViewer?: (appId: string, appName: string) => void;
  onDebugApp?: (conversationId: string, errorMsg: string) => void;
  onSkillsClick?: () => void;
  onSettingsClick?: () => void;
}

interface LastSubmittedPayload {
  text: string;
  attachments: SerializedAttachmentPayload[];
  hasAttachments: boolean;
}

/** Strip binary ArrayBuffer data from attachments to avoid memory leaks. */
function clearPayloadBinaryData(payload: LastSubmittedPayload): LastSubmittedPayload {
  return {
    ...payload,
    attachments: payload.attachments.map((a) => ({
      ...a,
      data: new ArrayBuffer(0)
    }))
  };
}

function TopBarDropdown({
  isOpen,
  onToggle,
  icon,
  title,
  children
}: {
  isOpen: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  return (
    <div ref={ref} className="relative [-webkit-app-region:no-drag]">
      <button
        onClick={onToggle}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
          isOpen ?
            'bg-neutral-200/80 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
          : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300'
        }`}
        title={title}
      >
        {icon}
      </button>
      {isOpen && (
        <div className="absolute top-full right-0 z-50 mt-1 w-72 rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {children}
        </div>
      )}
    </div>
  );
}

const Chat = forwardRef<ChatHandle, ChatProps>(function Chat(
  {
    currentConversationId,
    setCurrentConversationId,
    selectedProjectId,
    setSelectedProjectId,
    onOpenDbViewer,
    onDebugApp,
    onSkillsClick,
    onSettingsClick
  },
  ref
) {
  const [inputValue, setInputValue] = useState('');
  const [activeChatId, setActiveChatId] = useState<string>(() => crypto.randomUUID());
  const [chatInputHeight, setChatInputHeight] = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false);
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [modelPreference, setModelPreference] = useState<ChatModelPreference>('fast');
  const [isModelPreferenceUpdating, setIsModelPreferenceUpdating] = useState(false);
  const [customModelActive, setCustomModelActive] = useState(false);
  const [customModelIds, setCustomModelIds] = useState<CustomModelIds>({});
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [artifactMap] = useState(() => new Map<string, Artifact>());
  const canvasChanges = useCanvasChanges();
  const [showFilesDropdown, setShowFilesDropdown] = useState(false);
  const [showAppsDropdown, setShowAppsDropdown] = useState(false);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const appsRef = useRef(apps);
  appsRef.current = apps;
  const projectIdForNewChatRef = useRef<string | null>(null);
  const { messages, setMessages, isLoading, setIsLoading, backgroundTasks, codingTasks, retryStatus, sessionId } =
    useClaudeChat(activeChatId);
  const { track } = useAnalytics();
  const isOnline = useOnlineStatus();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);
  const lastSubmittedPayloadRef = useRef<LastSubmittedPayload | null>(null);
  const globalDragCounterRef = useRef(0);

  // Extract artifacts from messages
  const artifacts = useMemo(() => extractArtifacts(messages), [messages]);

  // Helper: open artifact or excalidraw file as a tab
  const openTab = useCallback(
    (artifact: Artifact) => {
      const isExcalidraw = artifact.type === 'excalidraw';
      const tabId = `tab-${artifact.filePath}`;

      setOpenTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        if (existing) return prev;
        return [
          ...prev,
          {
            id: tabId,
            type: isExcalidraw ? 'excalidraw' : 'artifact',
            title: artifact.fileName,
            filePath: artifact.filePath
          }
        ];
      });

      if (!isExcalidraw) {
        artifactMap.set(tabId, artifact);
      }

      setActiveTabId(tabId);
    },
    [artifactMap]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      artifactMap.delete(tabId);
      setOpenTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActiveTabId((prev) => {
        if (prev !== tabId) return prev;
        // Switch to the last remaining tab
        const remaining = openTabs.filter((t) => t.id !== tabId);
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      });
    },
    [artifactMap, openTabs]
  );

  const handleTabDirtyChange = useCallback((tabId: string, isDirty: boolean) => {
    setOpenTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, isDirty } : t)));
  }, []);

  // Derived: is the right panel visible?
  const hasOpenTabs = openTabs.length > 0;

  // Auto-select the latest artifact when new ones appear
  const prevArtifactCountRef = useRef(0);
  useEffect(() => {
    if (artifacts.length > prevArtifactCountRef.current && artifacts.length > 0) {
      const latest = artifacts[artifacts.length - 1];
      openTab(latest);
    }
    prevArtifactCountRef.current = artifacts.length;
  }, [artifacts, openTab]);

  useEffect(() => {
    let isMounted = true;
    window.electron.config
      .getWorkspaceDir()
      .then(({ workspaceDir }) => {
        if (isMounted) setWorkspaceDir(workspaceDir);
      })
      .catch((error) => console.error('Error loading workspace directory:', error));
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    window.electron.chat
      .getModelPreference()
      .then(({ preference }) => {
        if (isMounted && preference) setModelPreference(preference);
      })
      .catch((error) => console.error('Error loading model preference:', error));
    window.electron.config
      .getCustomModelId()
      .then(({ customModelId }) => {
        if (isMounted) setCustomModelActive(Boolean(customModelId?.trim()));
      })
      .catch(() => {});
    window.electron.config
      .getCustomModelIds()
      .then(({ customModelIds: ids }) => {
        if (isMounted) setCustomModelIds(ids || {});
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => releaseAttachmentPreviews(pendingAttachmentsRef.current);
  }, []);

  // Poll apps for the top-right dropdown
  const refreshApps = useCallback(async () => {
    try {
      const response = await window.electron.app.scan();
      if (response.success) {
        setApps(response.apps);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshApps();
    const timer = setInterval(refreshApps, 3000);
    return () => clearInterval(timer);
  }, [refreshApps]);

  const handleFilesSelected = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;

      const processFiles = async () => {
        const accepted: PendingAttachment[] = [];
        let rejectionMessage: string | null = null;

        for (const file of files) {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            const workspaceLabel = workspaceDir ?? WORKSPACE_FALLBACK_LABEL;
            rejectionMessage =
              `"${file.name}" 超过 ${MAX_ATTACHMENT_SIZE_MB} MB 大小限制，` +
              `请将文件直接放到工作目录 ${workspaceLabel} 中。`;
            continue;
          }

          const isImage = isLikelyImageFile(file);
          let previewUrl: string | undefined;
          let previewIsBlobUrl = false;

          if (isImage) {
            const preview = await createImagePreview(file);
            if (preview?.url) {
              previewUrl = preview.url;
              previewIsBlobUrl = preview.isBlob;
            }
          }

          accepted.push({ id: crypto.randomUUID(), file, previewUrl, previewIsBlobUrl, isImage });
        }

        if (accepted.length > 0) {
          setPendingAttachments((prev) => [...prev, ...accepted]);
          track('attachment_added', { count: accepted.length });
        }
        if (rejectionMessage) setAttachmentError(rejectionMessage);
        else if (accepted.length > 0) setAttachmentError(null);
      };

      void processFiles();
    },
    [track, workspaceDir]
  );

  useEffect(() => {
    const isFileDrag = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const resetGlobalDragState = () => {
      globalDragCounterRef.current = 0;
      setIsGlobalDragActive(false);
    };

    const handleWindowDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      globalDragCounterRef.current += 1;
      setIsGlobalDragActive(true);
    };

    const handleWindowDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setIsGlobalDragActive(true);
    };

    const handleWindowDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      globalDragCounterRef.current = Math.max(0, globalDragCounterRef.current - 1);
      if (globalDragCounterRef.current === 0) {
        setIsGlobalDragActive(false);
      }
    };

    const handleWindowDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;

      resetGlobalDragState();

      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) {
        return;
      }

      const suggestedPrompt = suggestPromptForFiles(files);
      if (suggestedPrompt) {
        setInputValue((currentValue) =>
          currentValue.trim().length === 0 ? suggestedPrompt : currentValue
        );
      }

      if (!event.defaultPrevented) {
        event.preventDefault();
        handleFilesSelected(files);
      }

      event.dataTransfer?.clearData();
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleFilesSelected]);

  const handleRemoveAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.id === attachmentId);
      if (target?.previewUrl && target.previewIsBlobUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== attachmentId);
    });
  };

  const clearPendingAttachments = () => {
    setPendingAttachments((prev) => {
      releaseAttachmentPreviews(prev);
      return [];
    });
    setAttachmentError(null);
  };

  const appendAssistantErrorMessage = useCallback(
    (rawError: string) => {
      const classification = classifyError(rawError);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: classification.message,
          timestamp: new Date(),
          errorMeta: {
            rawError,
            actionType: classification.actionType
          }
        }
      ]);
      setIsLoading(false);
    },
    [setIsLoading, setMessages]
  );

  const submitMessagePayload = useCallback(
    async (
      payload: LastSubmittedPayload,
      options?: { trackEvent?: boolean; userMessageId?: string }
    ): Promise<void> => {
      setIsLoading(true);

      try {
        const response = await window.electron.chat.sendMessage({
          chatId: activeChatId,
          text: payload.text,
          attachments: payload.attachments.length > 0 ? payload.attachments : undefined
        });

        if (options?.trackEvent) {
          track('message_sent', { model: modelPreference, hasAttachments: payload.hasAttachments });
        }

        if (!response.success && response.error) {
          appendAssistantErrorMessage(response.error);
          return;
        }

        if (response.attachments?.length && options?.userMessageId) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== options.userMessageId || !msg.attachments?.length) return msg;
              const updatedAttachments = msg.attachments.map((attachment, index) => {
                const saved = response.attachments?.[index];
                if (!saved) return attachment;
                return {
                  ...attachment,
                  savedPath: saved.savedPath,
                  relativePath: saved.relativePath
                };
              });
              return { ...msg, attachments: updatedAttachments };
            })
          );
        }
      } catch (error) {
        appendAssistantErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      }
    },
    [activeChatId, appendAssistantErrorMessage, modelPreference, setIsLoading, setMessages, track]
  );

  const persistConversationSnapshot = useCallback(
    async (options?: {
      chatId?: string;
      conversationId?: string | null;
      messages?: Message[];
      sessionId?: string | null;
      projectId?: string | null;
      onCreated?: (conversationId: string) => void;
    }) => {
      const targetChatId = options?.chatId ?? activeChatId;
      const targetConversationId = options?.conversationId ?? currentConversationId;
      const targetMessages = options?.messages ?? messages;
      const targetSessionId = options?.sessionId ?? sessionId;

      if (targetMessages.length === 0) {
        return null;
      }

      try {
        const messagesToSave = serializeMessagesForStorage(targetMessages);
        if (targetConversationId) {
          await window.electron.conversation.update(
            targetConversationId,
            undefined,
            messagesToSave,
            targetSessionId ?? undefined
          );
          registerConversationMapping(targetConversationId, targetChatId);
          return targetConversationId;
        }

        const response = await window.electron.conversation.create(
          messagesToSave,
          targetSessionId ?? undefined
        );
        if (!response.success || !response.conversation) {
          return null;
        }

        const newConversationId = response.conversation.id;
        registerConversationMapping(newConversationId, targetChatId);
        options?.onCreated?.(newConversationId);
        track('conversation_created');

        let projectId = options?.projectId ?? projectIdForNewChatRef.current;
        if (!projectId) {
          const projResponse = await window.electron.project.list();
          if (projResponse.success && projResponse.projects) {
            projectId = projResponse.projects.find((p) => p.isDefault)?.id ?? null;
          }
        }
        if (projectId) {
          await window.electron.conversation.setProject(newConversationId, projectId);
        }

        for (const app of appsRef.current) {
          if (!app.conversationId) {
            window.electron.app.setConversationId(app.id, newConversationId).catch(() => {});
          }
        }

        return newConversationId;
      } catch (error) {
        console.error('Error saving conversation:', error);
        return null;
      }
    },
    [activeChatId, currentConversationId, messages, sessionId, track]
  );

  // Auto-create conversation when the active chat first gets content.
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    if (messages.length === 0 || currentConversationId) {
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    const scheduledChatId = activeChatId;
    const scheduledMessages = messages;
    const scheduledSessionId = sessionId;
    saveTimeoutRef.current = setTimeout(() => {
      void persistConversationSnapshot({
        chatId: scheduledChatId,
        conversationId: null,
        messages: scheduledMessages,
        sessionId: scheduledSessionId,
        projectId: projectIdForNewChatRef.current ?? selectedProjectId,
        onCreated: (newConversationId) => {
          if (scheduledChatId === activeChatId) {
            setCurrentConversationId(newConversationId);
          }
        }
      });
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    activeChatId,
    currentConversationId,
    messages,
    persistConversationSnapshot,
    selectedProjectId,
    sessionId,
    setCurrentConversationId
  ]);

  // Sync conversationId to workspace file so CLI tools (crud.ts) can read it
  useEffect(() => {
    window.electron.app.syncConversationId(currentConversationId).catch((err) => {
      console.error('Failed to sync conversation ID to workspace:', err);
    });
  }, [currentConversationId]);

  const handleNewChat = async () => {
    clearPendingAttachments();

    try {
      if (messages.length > 0) {
        void persistConversationSnapshot({
          chatId: activeChatId,
          conversationId: currentConversationId,
          messages,
          sessionId,
          projectId: selectedProjectId
        });
      }

      const newChatId = crypto.randomUUID();
      setActiveChatId(newChatId);
      setCurrentConversationId(null);
      setInputValue('');
      setOpenTabs([]);
      setActiveTabId(null);
      artifactMap.clear();
      canvasChanges.clearChanges();
      prevArtifactCountRef.current = 0;
      isInitialLoadRef.current = true;
      projectIdForNewChatRef.current = selectedProjectId;
    } catch (error) {
      console.error('Error starting new chat:', error);
    }
  };

  const handleLoadConversation = async (conversationId: string) => {
    clearPendingAttachments();

    try {
      if (messages.length > 0) {
        void persistConversationSnapshot({
          chatId: activeChatId,
          conversationId: currentConversationId,
          messages,
          sessionId,
          projectId: selectedProjectId
        });
      }

      const existingChatId = getChatIdForConversation(conversationId);
      if (existingChatId) {
        setActiveChatId(existingChatId);
        setCurrentConversationId(conversationId);
        setOpenTabs([]);
        setActiveTabId(null);
        artifactMap.clear();
        canvasChanges.clearChanges();
        prevArtifactCountRef.current = 0;
        isInitialLoadRef.current = true;
        return;
      }

      const response = await window.electron.conversation.get(conversationId);
      if (response.success && response.conversation) {
        const parsedMessages: Message[] = JSON.parse(response.conversation.messages).map(
          (msg: Omit<Message, 'timestamp'> & { timestamp: string }) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })
        );

        const loadedChatId = crypto.randomUUID();
        replaceChatState(loadedChatId, {
          messages: parsedMessages,
          isLoading: false,
          isStreaming: false,
          sessionId: response.conversation.sessionId ?? null,
          retryStatus: null,
          lastError: null
        });
        registerConversationMapping(conversationId, loadedChatId);
        await window.electron.chat.resetSession(
          loadedChatId,
          response.conversation.sessionId ?? null
        );
        setActiveChatId(loadedChatId);
        setCurrentConversationId(conversationId);
        setOpenTabs([]);
        setActiveTabId(null);
        artifactMap.clear();
        canvasChanges.clearChanges();
        prevArtifactCountRef.current = 0;
        isInitialLoadRef.current = true;
        if (response.conversation.projectId) {
          setSelectedProjectId(response.conversation.projectId);
        } else {
          // Legacy ungrouped conversation — select default project
          const projResponse = await window.electron.project.list();
          if (projResponse.success && projResponse.projects) {
            const defaultId = projResponse.projects.find((p) => p.isDefault)?.id ?? null;
            if (defaultId) setSelectedProjectId(defaultId);
          }
        }
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const handleSendMessage = async () => {
    const trimmedMessage = inputValue.trim();
    const hasCanvasChanges = canvasChanges.totalChanges > 0;
    const hasSendableContent =
      trimmedMessage.length > 0 || pendingAttachments.length > 0 || hasCanvasChanges;
    if (!hasSendableContent || isLoading) return;

    // Append canvas changes as context to the message text (per file)
    let messageText = trimmedMessage;
    if (hasCanvasChanges) {
      const sections: string[] = [];
      for (const [fp, changes] of canvasChanges.changesByFile) {
        const changeSummary = changes.map((c) => `- ${c.summary}`).join('\n');
        sections.push(`[画布变更: ${fp}]\n${changeSummary}`);
      }
      const canvasContext = '\n\n' + sections.join('\n\n');
      messageText = trimmedMessage ? trimmedMessage + canvasContext : canvasContext.trim();
      canvasChanges.clearChanges();
    }

    const hasAttachments = pendingAttachments.length > 0;
    const attachmentsToSend = pendingAttachments;
    if (attachmentsToSend.length > 0) setPendingAttachments([]);
    setAttachmentError(null);

    const messageAttachments: MessageAttachment[] = attachmentsToSend.map((attachment) => ({
      id: attachment.id,
      name: attachment.file.name,
      size: attachment.file.size,
      mimeType: attachment.file.type || 'application/octet-stream',
      previewUrl: attachment.previewIsBlobUrl ? undefined : attachment.previewUrl,
      isImage: attachment.isImage
    }));

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: messageText,
      timestamp: new Date(),
      attachments: messageAttachments.length > 0 ? messageAttachments : undefined
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    let serializedAttachments: SerializedAttachmentPayload[] = [];
    try {
      serializedAttachments = await Promise.all(
        attachmentsToSend.map(async (attachment) => ({
          name: attachment.file.name,
          mimeType: attachment.file.type || 'application/octet-stream',
          size: attachment.file.size,
          data: await attachment.file.arrayBuffer()
        }))
      );
    } catch (error) {
      releaseAttachmentPreviews(attachmentsToSend);
      appendAssistantErrorMessage(error instanceof Error ? error.message : 'preparing attachments');
      return;
    }

    releaseAttachmentPreviews(attachmentsToSend);
    const payload: LastSubmittedPayload = {
      text: messageText,
      attachments: serializedAttachments,
      hasAttachments
    };
    // Keep a lightweight copy for retry (strip binary data to avoid memory leak)
    lastSubmittedPayloadRef.current = clearPayloadBinaryData(payload);
    await submitMessagePayload(payload, { trackEvent: true, userMessageId: userMessage.id });
  };

  const handleRetryLastMessage = useCallback(async () => {
    const payload = lastSubmittedPayloadRef.current;
    if (!payload || isLoading || payload.hasAttachments) {
      return;
    }

    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage?.role === 'assistant' && lastMessage.errorMeta?.actionType === 'retry') {
        return prev.slice(0, -1);
      }
      return prev;
    });

    await submitMessagePayload(payload);
  }, [isLoading, setMessages, submitMessagePayload]);

  const handleStopStreaming = async () => {
    if (!isLoading) return;
    try {
      const response = await window.electron.chat.stopMessage(activeChatId);
      if (!response.success && response.error) {
        console.error('Error stopping response:', response.error);
      }
    } catch (error) {
      console.error('Error stopping response:', error);
    }
  };

  const handleFileSelect = (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    const ext = getFileExtension(filePath);
    const type = getArtifactType(ext);

    if (type) {
      openTab({
        id: `file-${filePath}`,
        filePath,
        fileName,
        type
      });
    }
  };

  const handleFileDeleted = (deletedPath: string, isDirectory: boolean) => {
    setOpenTabs((prev) =>
      prev.filter((tab) => {
        if (isDirectory) {
          return tab.filePath !== deletedPath && !tab.filePath.startsWith(deletedPath + '/');
        }
        return tab.filePath !== deletedPath;
      })
    );
  };

  useImperativeHandle(ref, () => ({
    loadConversation: handleLoadConversation,
    newChat: handleNewChat,
    isLoading: () => isLoading,
    setInput: (text: string) => setInputValue(text)
  }));

  const INPUT_BOTTOM_OFFSET = 48;
  const DEFAULT_BOTTOM_PADDING = 160;
  const messageListBottomPadding =
    chatInputHeight > 0 ? chatInputHeight + INPUT_BOTTOM_OFFSET : DEFAULT_BOTTOM_PADDING;
  const hasRunningTasks = Array.from(codingTasks.values()).some(
    (t) => t.status === 'running' || t.status === 'waiting'
  );
  const retryMessage =
    retryStatus ?
      retryStatus.secondsRemaining > 0 ?
        `AI 正忙，等待重试中（${retryStatus.secondsRemaining}s）…`
      : 'AI 正忙，正在重试…'
    : null;

  const handleModelPreferenceChange = async (preference: ChatModelPreference) => {
    if (preference === modelPreference) return;

    const previousPreference = modelPreference;
    setModelPreference(preference);
    setIsModelPreferenceUpdating(true);

    try {
      const response = await window.electron.chat.setModelPreference(preference);
      if (!response.success) {
        console.error('Error updating model preference:', response.error);
        setModelPreference(response.preference ?? previousPreference);
      } else {
        track('model_switched', { from: previousPreference, to: preference });
        if (response.preference) {
          setModelPreference(response.preference);
        }
      }
    } catch (error) {
      console.error('Error updating model preference:', error);
      setModelPreference(previousPreference);
    } finally {
      setIsModelPreferenceUpdating(false);
    }
  };

  return (
    <>
      {isGlobalDragActive && <DropZoneOverlay />}
      <Group className="flex h-full overflow-hidden">
      {/* Chat area */}
      <Panel minSize="300px" className="relative flex flex-col overflow-hidden">
        {/* Top bar with drag region and dropdown buttons */}
        <div className="relative shrink-0" style={{ height: 'var(--titlebar-height)' }}>
          <DragRegion />
          {/* Right-side dropdown buttons */}
          <div className="absolute top-1/2 right-3 z-10 flex -translate-y-1/2 items-center gap-1">
            <TopBarDropdown
              isOpen={showFilesDropdown}
              onToggle={() => {
                setShowFilesDropdown((p) => !p);
                setShowAppsDropdown(false);
              }}
              icon={<FolderOpen className="h-4 w-4" />}
              title="工作区"
            >
              <div className="max-h-80 overflow-y-auto">
                <FileTree
                  onFileSelect={(path) => {
                    handleFileSelect(path);
                    setShowFilesDropdown(false);
                  }}
                  selectedPath={openTabs.find((t) => t.id === activeTabId)?.filePath ?? null}
                  onFileDeleted={handleFileDeleted}
                />
              </div>
            </TopBarDropdown>
            {apps.length > 0 && (
              <TopBarDropdown
                isOpen={showAppsDropdown}
                onToggle={() => {
                  setShowAppsDropdown((p) => !p);
                  setShowFilesDropdown(false);
                }}
                icon={<Globe className="h-4 w-4" />}
                title="应用"
              >
                <div className="max-h-80 overflow-y-auto p-1">
                  <AppPanel
                    onOpenDbViewer={onOpenDbViewer}
                    onDebugApp={onDebugApp}
                    apps={apps}
                    onAppsChanged={refreshApps}
                  />
                </div>
              </TopBarDropdown>
            )}
          </div>
        </div>

        {(!isOnline || retryMessage) && (
          <div className="px-3 pt-3">
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              {!isOnline && (
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  当前网络可能已断开，恢复后可继续发送消息。
                </div>
              )}
              {retryMessage && (
                <div className="rounded-2xl border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                  {retryMessage}
                </div>
              )}
            </div>
          </div>
        )}

        {messages.length === 0 && !isLoading ?
          /* Welcome layout: centered input + skill cards */
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-3">
            <div className="text-center">
              <p className="mb-1 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                {(() => {
                  const hour = new Date().getHours();
                  if (hour < 6) return '夜深了，还在忙吗?';
                  if (hour < 12) return '早上好，今天想做什么?';
                  if (hour < 18) return '下午好，需要帮忙吗?';
                  return '晚上好，有什么可以帮你?';
                })()}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                选择下方场景快速开始，或直接输入你的需求
              </p>
            </div>
            <div className="w-full max-w-3xl">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSendMessage}
                isLoading={isLoading}
                hasRunningTasks={hasRunningTasks}
                onStopStreaming={handleStopStreaming}
                autoFocus
                attachments={pendingAttachments}
                onFilesSelected={handleFilesSelected}
                onRemoveAttachment={handleRemoveAttachment}
                canSend={
                  Boolean(inputValue.trim()) ||
                  pendingAttachments.length > 0 ||
                  canvasChanges.totalChanges > 0
                }
                attachmentError={attachmentError}
                modelPreference={modelPreference}
                onModelPreferenceChange={handleModelPreferenceChange}
                isModelPreferenceUpdating={isModelPreferenceUpdating}
                customModelActive={customModelActive}
                customModelIds={customModelIds}
              />
            </div>
            <SkillCardGrid
              onSelectSkill={(cmd) => {
                setInputValue(cmd);
                requestAnimationFrame(() => {
                  const textarea = document.querySelector<HTMLTextAreaElement>(
                    'textarea[placeholder]'
                  );
                  if (textarea) {
                    textarea.focus();
                    textarea.setSelectionRange(cmd.length, cmd.length);
                  }
                });
              }}
              onMoreClick={onSkillsClick}
              currentInput={inputValue}
            />
          </div>
        : /* Chat layout: messages + bottom input */
          <>
            <MessageList
              messages={messages}
              isLoading={isLoading}
              bottomPadding={messageListBottomPadding}
              conversationId={currentConversationId}
              onRetryMessage={
                lastSubmittedPayloadRef.current?.hasAttachments ? undefined : handleRetryLastMessage
              }
              onOpenSettings={onSettingsClick}
              onDeliverablePreview={(d) =>
                openTab({
                  id: d.id,
                  filePath: d.filePath,
                  fileName: d.fileName,
                  type: d.type,
                  content: d.content
                })
              }
            />
            <div className="absolute inset-x-0 bottom-0 z-10">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSendMessage}
                isLoading={isLoading}
                hasRunningTasks={hasRunningTasks}
                onStopStreaming={handleStopStreaming}
                autoFocus
                onHeightChange={setChatInputHeight}
                attachments={pendingAttachments}
                onFilesSelected={handleFilesSelected}
                onRemoveAttachment={handleRemoveAttachment}
                canSend={
                  Boolean(inputValue.trim()) ||
                  pendingAttachments.length > 0 ||
                  canvasChanges.totalChanges > 0
                }
                attachmentError={attachmentError}
                modelPreference={modelPreference}
                onModelPreferenceChange={handleModelPreferenceChange}
                isModelPreferenceUpdating={isModelPreferenceUpdating}
                customModelActive={customModelActive}
                customModelIds={customModelIds}
                floatingPanel={
                  <>
                    <CodingTaskPanel codingTasks={codingTasks} />
                    <BackgroundTaskIndicator backgroundTasks={backgroundTasks} />
                    <FloatingTaskPanel messages={messages} />
                    {canvasChanges.totalChanges > 0 && (
                      <CanvasChangeAttachment
                        changesByFile={canvasChanges.changesByFile}
                        onDismiss={canvasChanges.clearChanges}
                      />
                    )}
                  </>
                }
              />
            </div>
          </>
        }
      </Panel>

      {/* Right: workspace panel with tabs */}
      {hasOpenTabs && (
        <>
          <ResizeHandle />
          <Panel defaultSize="400px" minSize="280px" maxSize="700px">
            <WorkspacePanel
              tabs={openTabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
              onCloseTab={closeTab}
              onTabDirtyChange={handleTabDirtyChange}
              artifactMap={artifactMap}
              onCanvasElementsChange={canvasChanges.handleElementsChange}
            />
          </Panel>
        </>
      )}
      </Group>
    </>
  );
});

export default Chat;
