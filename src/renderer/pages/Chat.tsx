import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';

import type { Artifact } from '@/components/ArtifactPanel';
import ArtifactPanel from '@/components/ArtifactPanel';
import AppPanel from '@/components/AppPanel';
import ChatInput from '@/components/ChatInput';
import FileTree from '@/components/FileTree';
import FloatingTaskPanel from '@/components/FloatingTaskPanel';
import MessageList from '@/components/MessageList';
import ResizeHandle from '@/components/ResizeHandle';
import SkillCardGrid from '@/components/SkillCardGrid';
import DragRegion from '@/components/TitleBar';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useClaudeChat } from '@/hooks/useClaudeChat';
import type { AppInfo } from '@/electron';
import type { Message, MessageAttachment } from '@/types/chat';
import { extractArtifacts } from '@/utils/artifacts';

import { friendlyError } from '@/utils/friendlyError';

import { MAX_ATTACHMENT_BYTES } from '../../shared/constants';
import { getArtifactType, getFileExtension } from '../../shared/file-extensions';
import type { ChatModelPreference, SerializedAttachmentPayload } from '../../shared/types/ipc';

import { FolderOpen, Globe } from 'lucide-react';

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

type PersistedMessage = Omit<Message, 'timestamp'> & { timestamp: string };

function serializeMessagesForStorage(messages: Message[]): PersistedMessage[] {
  return messages.map((msg) => ({
    ...msg,
    attachments: msg.attachments?.map(
      ({ previewUrl: _previewUrl, ...attachmentRest }) => attachmentRest
    ),
    timestamp: msg.timestamp.toISOString()
  }));
}

export interface ChatHandle {
  loadConversation: (id: string) => Promise<void>;
  newChat: () => Promise<void>;
  isLoading: () => boolean;
}

interface ChatProps {
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  onOpenDbViewer?: (appId: string, appName: string) => void;
}

function TopBarDropdown({
  isOpen,
  onToggle,
  icon,
  title,
  children,
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
          isOpen
            ? 'bg-neutral-200/80 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
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

const Chat = forwardRef<ChatHandle, ChatProps>(function Chat({ currentConversationId, setCurrentConversationId, selectedProjectId, setSelectedProjectId, onOpenDbViewer }, ref) {
  const [inputValue, setInputValue] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [chatInputHeight, setChatInputHeight] = useState(0);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [modelPreference, setModelPreference] = useState<ChatModelPreference>('fast');
  const [isModelPreferenceUpdating, setIsModelPreferenceUpdating] = useState(false);
  const [customModelActive, setCustomModelActive] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [showFilesDropdown, setShowFilesDropdown] = useState(false);
  const [showAppsDropdown, setShowAppsDropdown] = useState(false);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const projectIdForNewChatRef = useRef<string | null>(null);
  const { messages, setMessages, isLoading, setIsLoading } = useClaudeChat();
  const messagesContainerRef = useAutoScroll(isLoading, messages);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);

  // Extract artifacts from messages
  const artifacts = useMemo(() => extractArtifacts(messages), [messages]);

  // Auto-select the latest artifact when new ones appear
  const prevArtifactCountRef = useRef(0);
  useEffect(() => {
    if (artifacts.length > prevArtifactCountRef.current && artifacts.length > 0) {
      setSelectedArtifact(artifacts[artifacts.length - 1]);
    }
    prevArtifactCountRef.current = artifacts.length;
  }, [artifacts]);

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

  const handleFilesSelected = (fileList: FileList | File[]) => {
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

      if (accepted.length > 0) setPendingAttachments((prev) => [...prev, ...accepted]);
      if (rejectionMessage) setAttachmentError(rejectionMessage);
      else if (accepted.length > 0) setAttachmentError(null);
    };

    void processFiles();
  };

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

  // Auto-save conversation when messages change
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    if (messages.length === 0) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const messagesToSave = serializeMessagesForStorage(messages);
        if (currentConversationId) {
          await window.electron.conversation.update(
            currentConversationId,
            undefined,
            messagesToSave,
            currentSessionId ?? undefined
          );
        } else {
          const response = await window.electron.conversation.create(
            messagesToSave,
            currentSessionId ?? undefined
          );
          if (response.success && response.conversation) {
            setCurrentConversationId(response.conversation.id);
            const projectId = projectIdForNewChatRef.current;
            if (projectId) {
              await window.electron.conversation.setProject(
                response.conversation.id,
                projectId
              );
            }
          }
        }
      } catch (error) {
        console.error('Error saving conversation:', error);
      }
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [messages, currentConversationId, currentSessionId, setCurrentConversationId]);

  useEffect(() => {
    const unsubscribe = window.electron.chat.onSessionUpdated(({ sessionId }) => {
      setCurrentSessionId((prev) => (prev === sessionId ? prev : sessionId));
    });
    return () => unsubscribe();
  }, []);

  const handleNewChat = async () => {
    if (isLoading) return;
    clearPendingAttachments();

    try {
      if (currentConversationId && messages.length > 0) {
        try {
          const messagesToSave = serializeMessagesForStorage(messages);
          await window.electron.conversation.update(
            currentConversationId,
            undefined,
            messagesToSave,
            currentSessionId ?? undefined
          );
        } catch (error) {
          console.error('Error saving conversation before new chat:', error);
        }
      }

      await window.electron.chat.resetSession();
      setMessages([]);
      setInputValue('');
      setCurrentConversationId(null);
      setCurrentSessionId(null);
      setSelectedArtifact(null);
      prevArtifactCountRef.current = 0;
      isInitialLoadRef.current = true;
      projectIdForNewChatRef.current = selectedProjectId;
    } catch (error) {
      console.error('Error starting new chat:', error);
    }
  };

  const handleLoadConversation = async (conversationId: string) => {
    if (isLoading) return;
    clearPendingAttachments();

    try {
      if (currentConversationId && messages.length > 0) {
        try {
          const messagesToSave = serializeMessagesForStorage(messages);
          await window.electron.conversation.update(
            currentConversationId,
            undefined,
            messagesToSave,
            currentSessionId ?? undefined
          );
        } catch (error) {
          console.error('Error saving conversation before switching:', error);
        }
      }

      const response = await window.electron.conversation.get(conversationId);
      if (response.success && response.conversation) {
        const parsedMessages: Message[] = JSON.parse(response.conversation.messages).map(
          (msg: Omit<Message, 'timestamp'> & { timestamp: string }) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })
        );

        await window.electron.chat.resetSession(response.conversation.sessionId ?? null);
        setMessages(parsedMessages);
        setCurrentConversationId(conversationId);
        setCurrentSessionId(response.conversation.sessionId ?? null);
        setSelectedArtifact(null);
        prevArtifactCountRef.current = 0;
        isInitialLoadRef.current = true;
        if (response.conversation.projectId) {
          setSelectedProjectId(response.conversation.projectId);
        }
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const handleSendMessage = async () => {
    const trimmedMessage = inputValue.trim();
    const hasSendableContent = trimmedMessage.length > 0 || pendingAttachments.length > 0;
    if (!hasSendableContent || isLoading) return;

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
      content: trimmedMessage,
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
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: friendlyError(error instanceof Error ? error.message : 'preparing attachments'),
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
      return;
    }

    releaseAttachmentPreviews(attachmentsToSend);

    try {
      const response = await window.electron.chat.sendMessage({
        text: trimmedMessage,
        attachments: serializedAttachments.length > 0 ? serializedAttachments : undefined
      });
      if (!response.success && response.error) {
        const errorMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant' as const,
          content: friendlyError(response.error),
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
      } else if (response.attachments?.length) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== userMessage.id || !msg.attachments?.length) return msg;
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
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: friendlyError(error instanceof Error ? error.message : 'Unknown error'),
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  const handleStopStreaming = async () => {
    if (!isLoading) return;
    try {
      const response = await window.electron.chat.stopMessage();
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
      setSelectedArtifact({
        id: `file-${filePath}`,
        filePath,
        fileName,
        type
      });
    }
  };

  const handleFileDeleted = (deletedPath: string, isDirectory: boolean) => {
    if (!selectedArtifact) return;
    if (isDirectory) {
      if (
        selectedArtifact.filePath === deletedPath ||
        selectedArtifact.filePath.startsWith(deletedPath + '/')
      ) {
        setSelectedArtifact(null);
      }
    } else if (selectedArtifact.filePath === deletedPath) {
      setSelectedArtifact(null);
    }
  };

  useImperativeHandle(ref, () => ({
    loadConversation: handleLoadConversation,
    newChat: handleNewChat,
    isLoading: () => isLoading,
  }));

  const INPUT_BOTTOM_OFFSET = 48;
  const DEFAULT_BOTTOM_PADDING = 160;
  const messageListBottomPadding = chatInputHeight > 0 ? chatInputHeight + INPUT_BOTTOM_OFFSET : DEFAULT_BOTTOM_PADDING;

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
      } else if (response.preference) {
        setModelPreference(response.preference);
      }
    } catch (error) {
      console.error('Error updating model preference:', error);
      setModelPreference(previousPreference);
    } finally {
      setIsModelPreferenceUpdating(false);
    }
  };

  return (
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
                    selectedPath={selectedArtifact?.filePath ?? null}
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
                      apps={apps}
                      onAppsChanged={refreshApps}
                    />
                  </div>
                </TopBarDropdown>
              )}
            </div>
          </div>

          {messages.length === 0 && !isLoading ? (
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
                  onStopStreaming={handleStopStreaming}
                  autoFocus
                  attachments={pendingAttachments}
                  onFilesSelected={handleFilesSelected}
                  onRemoveAttachment={handleRemoveAttachment}
                  canSend={Boolean(inputValue.trim()) || pendingAttachments.length > 0}
                  attachmentError={attachmentError}
                  modelPreference={modelPreference}
                  onModelPreferenceChange={handleModelPreferenceChange}
                  isModelPreferenceUpdating={isModelPreferenceUpdating}
                  customModelActive={customModelActive}
                />
              </div>
              <SkillCardGrid
                onSelectSkill={(prompt) => setInputValue(prompt)}
                onMoreClick={onSkillsClick}
                currentInput={inputValue}
              />
            </div>
          ) : (
            /* Chat layout: messages + bottom input */
            <>
              <MessageList
                messages={messages}
                isLoading={isLoading}
                containerRef={messagesContainerRef}
                bottomPadding={messageListBottomPadding}
                onDeliverablePreview={(d) =>
                  setSelectedArtifact({
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
                  onStopStreaming={handleStopStreaming}
                  autoFocus
                  onHeightChange={setChatInputHeight}
                  attachments={pendingAttachments}
                  onFilesSelected={handleFilesSelected}
                  onRemoveAttachment={handleRemoveAttachment}
                  canSend={Boolean(inputValue.trim()) || pendingAttachments.length > 0}
                  attachmentError={attachmentError}
                  modelPreference={modelPreference}
                  onModelPreferenceChange={handleModelPreferenceChange}
                  isModelPreferenceUpdating={isModelPreferenceUpdating}
                  floatingPanel={<FloatingTaskPanel messages={messages} />}
                />
              </div>
            </>
          )}
        </Panel>

        {/* Right: artifact preview panel */}
        {selectedArtifact && (
          <>
            <ResizeHandle />
            <Panel defaultSize="400px" minSize="280px" maxSize="700px">
              <ArtifactPanel
                artifact={selectedArtifact}
                onClose={() => setSelectedArtifact(null)}
              />
            </Panel>
          </>
        )}
    </Group>
  );
});

export default Chat;
