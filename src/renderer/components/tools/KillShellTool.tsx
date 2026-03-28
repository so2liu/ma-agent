import type { ToolUseSimple } from '@/types/chat';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface KillShellToolProps {
  tool: ToolUseSimple;
}

export default function KillShellTool({ tool }: KillShellToolProps) {
  return (
    <CollapsibleTool
      tool={tool}
      title="停止终端"
      input={getToolDisplayInput(tool)}
      inputLanguage="json"
      errorText={tool.isError ? tool.result : undefined}
      output={tool.isError ? undefined : tool.result}
      outputLanguage="markdown"
    />
  );
}
