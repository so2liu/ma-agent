import { ArrowUp, Loader2, Paperclip, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import AttachmentPreviewList from '@/components/AttachmentPreviewList';

import type { ChatModelPreference, CustomModelIds } from '../../shared/types/ipc';
import { DEFAULT_MODEL_NAMES, MODEL_LABELS, MODEL_TOOLTIPS } from '../../shared/types/ipc';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  onStopStreaming?: () => void;
  autoFocus?: boolean;
  onHeightChange?: (height: number) => void;
  attachments?: {
    id: string;
    file: File;
    previewUrl?: string;
    previewIsBlobUrl?: boolean;
    isImage: boolean;
  }[];
  onFilesSelected?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  canSend?: boolean;
  attachmentError?: string | null;
  modelPreference: ChatModelPreference;
  onModelPreferenceChange: (preference: ChatModelPreference) => void;
  isModelPreferenceUpdating?: boolean;
  customModelActive?: boolean;
  customModelIds?: CustomModelIds;
  floatingPanel?: ReactNode;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  onStopStreaming,
  autoFocus = false,
  onHeightChange,
  attachments = [],
  onFilesSelected,
  onRemoveAttachment,
  canSend,
  attachmentError,
  modelPreference,
  onModelPreferenceChange,
  isModelPreferenceUpdating = false,
  customModelActive = false,
  customModelIds = {},
  floatingPanel
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MIN_TEXTAREA_HEIGHT = 44;
  const MAX_TEXTAREA_HEIGHT = 200;
  const lastReportedHeightRef = useRef<number | null>(null);
  const dragCounterRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const computedCanSend = canSend ?? Boolean(value.trim());

  const MODEL_OPTIONS: ChatModelPreference[] = ['fast', 'smart-sonnet', 'smart-opus'];
  const [hoveredModel, setHoveredModel] = useState<ChatModelPreference | null>(null);

  const isDisabled = isModelPreferenceUpdating || customModelActive;

  const modelPillClass = (isActive: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-semibold transition ${
      isActive ?
        'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white'
    } ${isDisabled ? 'opacity-70' : ''}`;

  const handleModelPreferenceSelect = (preference: ChatModelPreference) => {
    if (preference === modelPreference) return;
    if (isDisabled) return;
    onModelPreferenceChange(preference);
  };

  const reportHeight = useCallback(
    (height: number) => {
      if (!onHeightChange) return;
      const roundedHeight = Math.round(height);
      if (lastReportedHeightRef.current === roundedHeight) return;
      lastReportedHeightRef.current = roundedHeight;
      onHeightChange(roundedHeight);
    },
    [onHeightChange]
  );

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const measuredHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    textarea.style.height = `${Math.max(measuredHeight, MIN_TEXTAREA_HEIGHT)}px`;
  };

  // Auto-focus when autoFocus is true
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && computedCanSend) {
        onSend();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = Array.from(clipboardData.items);
    const fileItems = items.filter((item) => item.kind === 'file');

    if (fileItems.length > 0) {
      e.preventDefault();
      const files: File[] = [];

      for (const item of fileItems) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }

      if (files.length > 0) {
        onFilesSelected?.(files);
      }
    }
  };

  const handleInputContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only focus if clicking on the container itself, not on interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON' && textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleTextareaInput = () => {
    adjustTextareaHeight();
  };

  const handleRemoveAttachmentClick = (attachmentId: string) => {
    onRemoveAttachment?.(attachmentId);
  };

  const handleAttachmentButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      onFilesSelected?.(event.target.files);
    }
    event.target.value = '';
  };

  const isFileDrag = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    if (event.dataTransfer?.files?.length) {
      onFilesSelected?.(event.dataTransfer.files);
      event.dataTransfer.clearData();
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [value]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    reportHeight(element.getBoundingClientRect().height);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      reportHeight(entry.contentRect.height);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [reportHeight]);

  return (
    <div
      ref={containerRef}
      className="px-4 pt-6 pb-5 [-webkit-app-region:no-drag]"
    >
      {floatingPanel && <div className="mb-2">{floatingPanel}</div>}
      <div className="mx-auto max-w-3xl">
        <div
          className={`rounded-3xl bg-white/95 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-neutral-900/90 dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] ${
            isDragActive ?
              'ring-2 ring-neutral-400/80 dark:ring-neutral-500/80'
            : 'ring-1 ring-neutral-200/80 dark:ring-neutral-700/70'
          }`}
          onClick={handleInputContainerClick}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          {attachments.length > 0 && (
            <AttachmentPreviewList
              attachments={attachments.map((attachment) => ({
                id: attachment.id,
                name: attachment.file.name,
                size: attachment.file.size,
                isImage: attachment.isImage,
                previewUrl: attachment.previewUrl
              }))}
              onRemove={handleRemoveAttachmentClick}
              className="mb-2 px-2"
            />
          )}

          {attachmentError && (
            <p className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{attachmentError}</p>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="输入你想让我做的事..."
            rows={1}
            className="w-full resize-none border-0 bg-transparent px-3 py-2 text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-neutral-100 dark:placeholder-neutral-500"
            style={{
              minHeight: `${MIN_TEXTAREA_HEIGHT}px`,
              maxHeight: `${MAX_TEXTAREA_HEIGHT}px`
            }}
            onInput={handleTextareaInput}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAttachmentButtonClick}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200/80 bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 focus:ring-2 focus:ring-neutral-400 focus:outline-none dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:ring-neutral-500"
                title="添加附件"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <div className="relative">
                <div
                  role="radiogroup"
                  aria-label="选择模型"
                  className="flex h-10 items-center gap-1 rounded-full border border-neutral-200/80 bg-neutral-100 px-1.5 py-1 transition dark:border-neutral-700/70 dark:bg-neutral-800"
                  title={customModelActive ? '已启用自定义模型，前往设置 > 开发者信息修改' : undefined}
                >
                  {customModelActive ?
                    <span className="px-2.5 py-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                      自定义模型
                    </span>
                  : MODEL_OPTIONS.map((pref) => (
                      <button
                        key={pref}
                        type="button"
                        aria-pressed={modelPreference === pref}
                        onClick={() => handleModelPreferenceSelect(pref)}
                        disabled={isDisabled}
                        className={modelPillClass(modelPreference === pref)}
                        onMouseEnter={() => setHoveredModel(pref)}
                        onMouseLeave={() => setHoveredModel(null)}
                      >
                        {MODEL_LABELS[pref]}
                      </button>
                    ))
                  }
                </div>
                {hoveredModel && !customModelActive && (
                  <div className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-neutral-200/80 bg-white/95 p-3 shadow-lg backdrop-blur-xl dark:border-neutral-700/70 dark:bg-neutral-800/95">
                    <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                      {MODEL_LABELS[hoveredModel]}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                      {MODEL_TOOLTIPS[hoveredModel].description}
                    </p>
                    <div className="mt-2 border-t border-neutral-100 pt-2 dark:border-neutral-700">
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        当前模型：{customModelIds[hoveredModel] || DEFAULT_MODEL_NAMES[hoveredModel]}
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                        推荐：{MODEL_TOOLTIPS[hoveredModel].suggestions.join('、')}
                      </p>
                    </div>
                    <p className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                      可在设置中更换模型
                    </p>
                  </div>
                )}
              </div>
              {isModelPreferenceUpdating && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400 dark:text-neutral-300" />
              )}
            </div>
            <button
              onClick={isLoading && onStopStreaming ? onStopStreaming : onSend}
              disabled={isLoading && onStopStreaming ? false : !computedCanSend || isLoading}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isLoading && onStopStreaming ?
                  'bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600'
                : 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200'
              }`}
            >
              {isLoading ?
                onStopStreaming ?
                  <Square className="h-5 w-5" />
                : <Loader2 className="h-5 w-5 animate-spin" />
              : <ArrowUp className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
