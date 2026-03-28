import type { ToolUseSimple, WriteInput } from '@/types/chat';

import { CodeBlock } from '@/components/ai-elements/code-block';
import { detectLanguage } from '@/lib/ai-elements-adapters';

import { CollapsibleTool, getToolDisplayInput } from './CollapsibleTool';

interface WriteToolProps {
  tool: ToolUseSimple;
}

export default function WriteTool({ tool }: WriteToolProps) {
  const input = tool.parsedInput as WriteInput | undefined;

  if (!input) {
    return (
      <CollapsibleTool tool={tool} title="写入" input={getToolDisplayInput(tool)} inputLanguage="json" />
    );
  }

  return (
    <CollapsibleTool tool={tool} title="写入">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
          {input.file_path}
        </code>
      </div>
      <CodeBlock
        code={input.content || ''}
        language={detectLanguage(input.file_path)}
        showLineNumbers
      />
    </CollapsibleTool>
  );
}
