import type { ToolUseSimple, WebSearchInput } from '@/types/chat';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface WebSearchToolProps {
  tool: ToolUseSimple;
}

export default function WebSearchTool({ tool }: WebSearchToolProps) {
  const input = tool.parsedInput as WebSearchInput | undefined;

  return (
    <CollapsibleTool
      tool={tool}
      title={input?.query ? `搜索 ${input.query}` : '搜索'}
      input={getToolDisplayInput(tool)}
      inputLanguage="json"
      errorText={tool.isError ? tool.result : undefined}
      output={tool.isError ? undefined : tool.result}
      outputLanguage="markdown"
    />
  );
}
