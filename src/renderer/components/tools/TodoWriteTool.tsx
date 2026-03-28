import type { TodoWriteInput, ToolUseSimple } from '@/types/chat';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface TodoWriteToolProps {
  tool: ToolUseSimple;
}

export default function TodoWriteTool({ tool }: TodoWriteToolProps) {
  const input = tool.parsedInput as TodoWriteInput | undefined;
  const total = input?.todos?.length ?? 0;
  const completed = input?.todos?.filter((todo) => todo.status === 'completed').length ?? 0;
  const title = total > 0 ? `任务列表 ${completed}/${total}` : '任务列表';

  return (
    <CollapsibleTool
      tool={tool}
      title={title}
      input={getToolDisplayInput(tool)}
      inputLanguage="json"
      errorText={tool.isError ? tool.result : undefined}
      output={tool.isError ? undefined : tool.result}
      outputLanguage="markdown"
    />
  );
}
