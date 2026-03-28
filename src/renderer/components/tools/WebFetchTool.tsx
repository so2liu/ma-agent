import type { ToolUseSimple, WebFetchInput } from '@/types/chat';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface WebFetchToolProps {
  tool: ToolUseSimple;
}

export default function WebFetchTool({ tool }: WebFetchToolProps) {
  const input = tool.parsedInput as WebFetchInput | undefined;

  return (
    <CollapsibleTool
      tool={tool}
      title={input?.url ? `获取 ${input.url}` : '获取'}
      input={getToolDisplayInput(tool)}
      inputLanguage="json"
      errorText={tool.isError ? tool.result : undefined}
      output={tool.isError ? undefined : tool.result}
      outputLanguage="markdown"
    />
  );
}
