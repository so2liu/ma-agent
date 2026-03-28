import type { AgentInput, ToolUseSimple } from '@/types/chat';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface TaskToolProps {
  tool: ToolUseSimple;
}

export default function TaskTool({ tool }: TaskToolProps) {
  const input = tool.parsedInput as AgentInput | undefined;

  return (
    <CollapsibleTool
      tool={tool}
      title={input?.prompt || '子任务'}
      input={getToolDisplayInput(tool)}
      inputLanguage="json"
      errorText={tool.isError ? tool.result : undefined}
      output={tool.isError ? undefined : tool.result}
      outputLanguage="markdown"
    />
  );
}
