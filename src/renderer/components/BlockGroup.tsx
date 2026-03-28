import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger
} from '@/components/ai-elements/reasoning';
import {
  getThinkingBadgeConfig,
  getToolBadgeConfig,
  getToolLabel
} from '@/components/tools/toolBadgeConfig';
import ToolUse from '@/components/ToolUse';
import { Badge } from '@/components/ui/badge';
import { mapThinkingToReasoning } from '@/lib/ai-elements-adapters';
import { cn } from '@/lib/utils';
import type { ContentBlock, ToolUseSimple } from '@/types/chat';

interface BlockGroupProps {
  blocks: ContentBlock[];
  isLatestActiveSection?: boolean;
  isStreaming?: boolean;
  hasTextAfter?: boolean;
}

interface ThinkingBadgeProps {
  block: ContentBlock;
  isExpanded: boolean;
  onToggle: () => void;
}

function GroupBadgeButton({
  chevronClassName,
  disabled = false,
  icon,
  iconClassName,
  isExpanded,
  label,
  onToggle
}: {
  chevronClassName?: string;
  disabled?: boolean;
  icon: ReactNode;
  iconClassName?: string;
  isExpanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle()}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground shadow-xs transition-colors',
        disabled ? 'cursor-default opacity-65' : 'cursor-pointer hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <span className={cn('shrink-0', iconClassName)}>{icon}</span>
      <span className="font-medium">{label}</span>
      {!disabled && (
        <span className={cn('text-muted-foreground/80', chevronClassName)}>
          {isExpanded ?
            <ChevronUp className="size-3" />
          : <ChevronDown className="size-3" />}
        </span>
      )}
    </button>
  );
}

function getReasoningLabel(block: ContentBlock): string {
  const reasoning = mapThinkingToReasoning(block);

  if (reasoning.isStreaming) {
    return '思考中';
  }

  if (reasoning.duration) {
    return `${reasoning.duration}秒`;
  }

  return '思考完成';
}

function ThinkingBadge({
  block,
  isExpanded,
  onToggle
}: ThinkingBadgeProps) {
  const reasoning = mapThinkingToReasoning(block);
  const content = reasoning.content;
  const hasContent = content?.trim().length > 0;
  const config = getThinkingBadgeConfig();

  return (
    <GroupBadgeButton
      chevronClassName={config.colors.iconColor}
      disabled={!hasContent}
      icon={config.icon}
      iconClassName={config.colors.iconColor}
      isExpanded={isExpanded}
      label={getReasoningLabel(block)}
      onToggle={onToggle}
    />
  );
}

interface ToolBadgeProps {
  tool: ToolUseSimple | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}

function ToolBadge({ tool, isExpanded, onToggle }: ToolBadgeProps) {
  if (!tool) return null;

  const config = getToolBadgeConfig(tool.name);
  const label = getToolLabel(tool);
  const hasDetails = tool.result || tool.inputJson || tool.parsedInput;

  return (
    <GroupBadgeButton
      chevronClassName={config.colors.iconColor}
      disabled={!hasDetails}
      icon={config.icon}
      iconClassName={config.colors.iconColor}
      isExpanded={isExpanded}
      label={label}
      onToggle={onToggle}
    />
  );
}

export default function BlockGroup({
  blocks,
  isLatestActiveSection = false,
  isStreaming = false,
  hasTextAfter = false
}: BlockGroupProps) {
  const [manualExpandedState, setManualExpandedState] = useState<boolean | null>(null);
  const [wasManuallyToggled, setWasManuallyToggled] = useState(false);

  // Check if there's any expandable content
  const hasExpandableContent = blocks.some((block) => {
    if (block.type === 'thinking') {
      return block.thinking ? block.thinking.trim().length > 0 : false;
    }
    if (block.type === 'tool_use') {
      return block.tool?.result || block.tool?.inputJson || block.tool?.parsedInput || false;
    }
    return false;
  });

  // Compute auto-expanded state based on props
  const autoExpandedState =
    isLatestActiveSection && isStreaming && hasExpandableContent && !hasTextAfter;

  // Use manual state if user has toggled, otherwise use auto state
  const isExpanded = wasManuallyToggled ? (manualExpandedState ?? false) : autoExpandedState;

  const toggleGroup = () => {
    if (hasExpandableContent) {
      const newState = !isExpanded;
      setManualExpandedState(newState);
      setWasManuallyToggled(true);
    }
  };

  if (blocks.length === 0) return null;

  // Count tool calls and thinking blocks for the collapsed summary
  const toolCount = blocks.filter((b) => b.type === 'tool_use').length;
  const thinkingCount = blocks.filter((b) => b.type === 'thinking').length;

  // Show individual badges when expanded or when actively streaming this section
  const showIndividualBadges = isExpanded || (isLatestActiveSection && isStreaming);

  return (
    <div className="mt-1.5 mb-4">
      {showIndividualBadges ?
        <div className="flex flex-col items-start gap-1.5">
          {blocks.map((block, index) => {
            if (block.type === 'thinking') {
              return (
                <ThinkingBadge
                  key={`thinking-${index}`}
                  block={block}
                  isExpanded={isExpanded}
                  onToggle={toggleGroup}
                />
              );
            }
            if (block.type === 'tool_use' && block.tool) {
              return (
                <ToolBadge
                  key={`tool-${index}`}
                  tool={block.tool}
                  isExpanded={isExpanded}
                  onToggle={toggleGroup}
                />
              );
            }
            return null;
          })}
        </div>
      : <button
          type="button"
          onClick={toggleGroup}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ChevronDown className="size-3" />
          {thinkingCount > 0 && (
            <Badge variant="secondary" className="rounded-full bg-muted/70 text-[11px]">
              {thinkingCount} 次思考
            </Badge>
          )}
          {toolCount > 0 && (
            <Badge variant="secondary" className="rounded-full bg-muted/70 text-[11px]">
              {toolCount} 个操作
            </Badge>
          )}
        </button>
      }
      {isExpanded && hasExpandableContent && (
        <div className="expanded-block-section mt-3 space-y-3">
            {blocks.map((block, index) => {
              if (block.type === 'thinking') {
                const reasoning = mapThinkingToReasoning(block);
                return (
                  <Reasoning
                    key={`thinking-expanded-${index}`}
                    className="mb-0 w-full rounded-xl border border-border/60 bg-background/70 px-3 py-2 shadow-xs"
                    defaultOpen={false}
                    duration={reasoning.duration}
                    isStreaming={reasoning.isStreaming}
                    onOpenChange={(open) => {
                      if (open !== isExpanded) {
                        toggleGroup();
                      }
                    }}
                    open={isExpanded}
                  >
                    <ReasoningTrigger
                      className={cn(
                        'rounded-lg px-2 py-1.5',
                        reasoning.content.trim() ? 'hover:bg-muted/60' : 'cursor-default hover:bg-transparent'
                      )}
                      disabled={!reasoning.content.trim()}
                      getThinkingMessage={(streaming, duration) => {
                        if (streaming) {
                          return '思考中';
                        }
                        if (duration) {
                          return `思考了 ${duration} 秒`;
                        }
                        return '思考完成';
                      }}
                    />
                    {reasoning.content.trim() && (
                      <ReasoningContent className="px-2 pb-2">
                        {reasoning.content}
                      </ReasoningContent>
                    )}
                  </Reasoning>
                );
              }
              if (block.type === 'tool_use' && block.tool) {
                return (
                  <div key={`tool-expanded-${index}`}>
                    <ToolUse tool={block.tool} />
                  </div>
                );
              }
              return null;
            })}
        </div>
      )}
    </div>
  );
}
