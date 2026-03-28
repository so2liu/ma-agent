import { Loader2, Paperclip, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AttachmentPreviewList from '@/components/AttachmentPreviewList';
import SlashCommandMenu from '@/components/SlashCommandMenu';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger
} from '@/components/ai-elements/model-selector';
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools
} from '@/components/ai-elements/prompt-input';
import { useSlashCommand } from '@/hooks/useSlashCommand';
import { mapModelPreference } from '@/lib/ai-elements-adapters';

import type { ChatModelPreference, CustomModelIds } from '../../shared/types/ipc';
import { DEFAULT_MODEL_NAMES, MODEL_LABELS, MODEL_TOOLTIPS } from '../../shared/types/ipc';

const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024;
const MODEL_OPTIONS: ChatModelPreference[] = ['fast', 'smart-sonnet', 'smart-opus'];

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  onStopStreaming?: () => void;
  autoFocus?: boolean;
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
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  onStopStreaming,
  autoFocus = false,
  attachments = [],
  onFilesSelected,
  onRemoveAttachment,
  canSend,
  attachmentError,
  modelPreference,
  onModelPreferenceChange,
  isModelPreferenceUpdating = false,
  customModelActive = false,
  customModelIds = {}
}: ChatInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const computedCanSend = canSend ?? (Boolean(value.trim()) || attachments.length > 0);
  const slash = useSlashCommand(value);
  const isDisabled = isModelPreferenceUpdating || customModelActive;
  const currentModel = useMemo(
    () => mapModelPreference(modelPreference, customModelIds),
    [customModelIds, modelPreference]
  );

  const queryTextarea = useCallback(
    () => containerRef.current?.querySelector<HTMLTextAreaElement>('textarea[name="message"]') ?? null,
    []
  );

  const handleModelPreferenceSelect = (preference: ChatModelPreference) => {
    if (preference === modelPreference) return;
    if (isDisabled) return;
    setIsModelSelectorOpen(false);
    onModelPreferenceChange(preference);
  };

  useEffect(() => {
    if (autoFocus) {
      queryTextarea()?.focus();
    }
  }, [autoFocus, queryTextarea]);

  const handleSlashSelect = useCallback(
    (item: Parameters<typeof SlashCommandMenu>[0]['items'][number]) => {
      onChange(`/${item.name} `);
      requestAnimationFrame(() => {
        const textarea = queryTextarea();
        if (!textarea) return;
        textarea.focus();
        const nextPosition = textarea.value.length;
        textarea.setSelectionRange(nextPosition, nextPosition);
      });
    },
    [onChange, queryTextarea]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Skip during IME composition (e.g. pinyin input)
    if (e.nativeEvent.isComposing) return;

    if (slash.isOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        slash.dismiss();
        return;
      }
      if (slash.items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          slash.moveSelection(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          slash.moveSelection(-1);
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          const selected = slash.getSelectedItem();
          if (selected) handleSlashSelect(selected);
          return;
        }
      }
    }

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
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'button, input, textarea, a, [role="dialog"], [role="option"], [cmdk-item], [data-slot="command-item"]'
      )
    ) {
      return;
    }
    queryTextarea()?.focus();
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

  return (
    <div ref={containerRef} className="px-4 pb-5 [-webkit-app-region:no-drag]">
      <div className="mx-auto max-w-3xl">
        <div
          className={`w-full min-w-0 rounded-3xl bg-card/95 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl ${
            isDragActive ? 'ring-2 ring-ring/60' : 'ring-1 ring-border'
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

          <PromptInput
            disableAttachments
            onSubmit={() => {
              if (!isLoading && computedCanSend) {
                onSend();
              }
            }}
            maxFileSize={MAX_ATTACHMENT_BYTES}
            multiple
            className="w-full min-w-0 rounded-[inherit] bg-transparent"
          >
            <PromptInputBody>
              <PromptInputHeader className="gap-2 px-1 pb-0">
                {attachments.length > 0 && (
                  <AttachmentPreviewList
                    attachments={attachments.map((attachment) => ({
                      id: attachment.id,
                      name: attachment.file.name,
                      size: attachment.file.size,
                      mimeType: attachment.file.type || 'application/octet-stream',
                      isImage: attachment.isImage,
                      previewUrl: attachment.previewUrl
                    }))}
                    onRemove={handleRemoveAttachmentClick}
                    className="w-full px-2 pt-1"
                  />
                )}

                {attachmentError && (
                  <p className="w-full px-2 text-xs text-destructive">
                    {attachmentError}
                  </p>
                )}

                {slash.isOpen && (
                  <div className="w-full px-1">
                    <SlashCommandMenu
                      items={slash.items}
                      selectedIndex={slash.selectedIndex}
                      onSelect={handleSlashSelect}
                      onHover={slash.setSelectedIndex}
                    />
                  </div>
                )}
              </PromptInputHeader>

              <PromptInputTextarea
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="输入你想让我做的事..."
                rows={1}
                className="min-h-[24px] max-h-[200px] basis-auto overflow-y-auto px-3 py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground [scrollbar-width:none] [&::-webkit-resizer]:hidden [&::-webkit-scrollbar]:hidden"
              />

              <PromptInputFooter className="w-full items-center justify-between gap-3 px-2 py-2">
                <PromptInputTools className="flex-wrap items-center gap-2">
                  <PromptInputButton
                    type="button"
                    onClick={handleAttachmentButtonClick}
                    className="rounded-full border border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    aria-label="添加附件"
                    title="添加附件"
                  >
                    <Paperclip className="h-4 w-4" />
                  </PromptInputButton>

                  <ModelSelector
                    open={slash.isOpen ? false : isModelSelectorOpen}
                    onOpenChange={(nextOpen) => {
                      if (slash.isOpen) return;
                      setIsModelSelectorOpen(nextOpen);
                    }}
                  >
                    <ModelSelectorTrigger asChild>
                      <PromptInputButton
                        type="button"
                        disabled={isDisabled}
                        className="h-8 rounded-full border border-border bg-muted px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        title={
                          customModelActive ? '已启用自定义模型，前往设置 > 开发者信息修改' : currentModel.id
                        }
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{customModelActive ? '自定义模型' : MODEL_LABELS[modelPreference]}</span>
                        {isModelPreferenceUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      </PromptInputButton>
                    </ModelSelectorTrigger>
                    <ModelSelectorContent
                      className="sm:max-w-md"
                      title="选择模型"
                    >
                      <ModelSelectorInput placeholder="搜索模型档位" />
                      <ModelSelectorList>
                        <ModelSelectorEmpty>没有匹配的模型</ModelSelectorEmpty>
                        <ModelSelectorGroup heading="模型档位">
                          {MODEL_OPTIONS.map((preference) => {
                            const mappedModel = mapModelPreference(preference, customModelIds);

                            return (
                              <ModelSelectorItem
                                key={preference}
                                value={`${preference} ${MODEL_LABELS[preference]} ${mappedModel.name} ${mappedModel.id}`}
                                onSelect={() => handleModelPreferenceSelect(preference)}
                                disabled={isDisabled}
                                className="items-start gap-3 py-3"
                              >
                                <ModelSelectorLogo provider={mappedModel.provider} className="mt-0.5" />
                                <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                    <ModelSelectorName className="text-sm font-medium text-foreground">
                                      {MODEL_LABELS[preference]}
                                    </ModelSelectorName>
                                    {modelPreference === preference && (
                                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                                        当前
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {MODEL_TOOLTIPS[preference].description}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground/70">
                                    {mappedModel.name}
                                    {' · '}
                                    {mappedModel.id || DEFAULT_MODEL_NAMES[preference]}
                                  </p>
                                </div>
                              </ModelSelectorItem>
                            );
                          })}
                        </ModelSelectorGroup>
                      </ModelSelectorList>
                    </ModelSelectorContent>
                  </ModelSelector>
                </PromptInputTools>

                <PromptInputSubmit
                  type={isLoading && onStopStreaming ? 'button' : 'submit'}
                  status={isLoading ? (onStopStreaming ? 'streaming' : 'submitted') : undefined}
                  onClick={isLoading && onStopStreaming ? onStopStreaming : undefined}
                  disabled={isLoading && onStopStreaming ? false : !computedCanSend || isLoading}
                  className={`rounded-lg ${
                    isLoading && onStopStreaming ?
                      'bg-secondary text-secondary-foreground hover:bg-accent'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                />
              </PromptInputFooter>
            </PromptInputBody>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
