import type { ToolUseSimple } from '@/types/chat';

import { Terminal } from '@/components/ai-elements/terminal';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface BashOutputToolProps {
  tool: ToolUseSimple;
}

export default function BashOutputTool({ tool }: BashOutputToolProps) {
  return (
    <CollapsibleTool
      tool={tool}
      title="命令输出"
      input={tool.result === undefined ? getToolDisplayInput(tool) : undefined}
      inputLanguage="json"
    >
      {tool.result !== undefined && (
        <Terminal
          className="border-border/60"
          isStreaming={Boolean(tool.isLoading) && !tool.isError}
          output={tool.result}
        />
      )}
    </CollapsibleTool>
  );
}
