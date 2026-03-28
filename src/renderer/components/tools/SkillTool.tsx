import type { ToolUseSimple } from '@/types/chat';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface SkillToolProps {
  tool: ToolUseSimple;
}

export default function SkillTool({ tool }: SkillToolProps) {
  return (
    <CollapsibleTool
      tool={tool}
      title="技能"
      input={getToolDisplayInput(tool)}
      inputLanguage="json"
      errorText={tool.isError ? tool.result : undefined}
      output={tool.isError ? undefined : tool.result}
      outputLanguage="markdown"
    />
  );
}
