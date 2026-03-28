import { useState, type ReactNode } from 'react';
import type { BundledLanguage } from 'shiki';

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput
} from '@/components/ai-elements/tool';
import { mapToolState } from '@/lib/ai-elements-adapters';
import type { ToolUseSimple } from '@/types/chat';

interface CollapsibleToolProps {
  tool: ToolUseSimple;
  title?: string;
  input?: unknown;
  inputLanguage?: BundledLanguage;
  output?: unknown;
  outputLanguage?: BundledLanguage;
  errorText?: string;
  children?: ReactNode;
  defaultExpanded?: boolean;
}

function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) {
    return false;
  }

  if (typeof value === 'string') {
    return value.length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

export function getToolDisplayInput(tool: ToolUseSimple): unknown {
  const state = mapToolState(tool);
  return state === 'input-streaming' ? tool.inputJson : (tool.parsedInput ?? tool.inputJson);
}

export function CollapsibleTool({
  tool,
  title,
  input,
  inputLanguage,
  output,
  outputLanguage,
  errorText,
  children,
  defaultExpanded = false
}: CollapsibleToolProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const state = mapToolState(tool);
  const hasExpandedContent =
    hasDisplayValue(input) ||
    hasDisplayValue(output) ||
    hasDisplayValue(errorText) ||
    hasDisplayValue(children);

  return (
    <Tool
      className="group my-0.5 overflow-hidden rounded-xl border-border/60 bg-background/70 shadow-none"
      onOpenChange={hasExpandedContent ? setIsExpanded : undefined}
      open={hasExpandedContent ? isExpanded : false}
    >
      <ToolHeader
        disabled={!hasExpandedContent}
        state={state}
        title={title ?? tool.name}
        type={tool.name}
      />
      {hasExpandedContent && (
        <ToolContent className="border-t border-border/60">
          <ToolInput input={input} language={inputLanguage} />
          {children && <div className="space-y-3 p-4">{children}</div>}
          <ToolOutput
            errorText={errorText}
            language={outputLanguage}
            output={output}
          />
        </ToolContent>
      )}
    </Tool>
  );
}
