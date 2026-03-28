import type { GrepInput, ToolUseSimple } from '@/types/chat';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface GrepToolProps {
  tool: ToolUseSimple;
}

export default function GrepTool({ tool }: GrepToolProps) {
  const input = tool.parsedInput as GrepInput | undefined;

  return (
    <CollapsibleTool
      tool={tool}
      title={input?.pattern ? `搜索 ${input.pattern}` : '搜索'}
      input={getToolDisplayInput(tool)}
      inputLanguage="json"
      errorText={tool.isError ? tool.result : undefined}
      output={tool.isError ? undefined : tool.result}
      outputLanguage="markdown"
    />
  );
}
